#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const jsonOutput = args.includes('--json')
const positional = args.filter((arg) => arg !== '--json')

if (positional.length !== 1) {
  console.error('Usage: node check-demo-scope.mjs <DEMO.md> [--json]')
  process.exit(2)
}

const inputPath = path.resolve(positional[0])
let source = ''
try {
  source = fs.readFileSync(inputPath, 'utf8')
} catch (error) {
  console.error(`Cannot read ${inputPath}: ${error.message}`)
  process.exit(2)
}

const errors = []
const warnings = []
const sourceLines = source.split(/\r?\n/)

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sectionLines(heading) {
  const headingPattern = new RegExp(`^(#{2,3})\\s+${escapeRegExp(heading)}\\s*$`)
  const start = sourceLines.findIndex((line) => headingPattern.test(line))
  if (start === -1) return []
  const level = sourceLines[start].match(/^#+/)[0].length
  const body = []
  for (let index = start + 1; index < sourceLines.length; index += 1) {
    const nextHeading = sourceLines[index].match(/^(#+)\s+/)
    if (nextHeading && nextHeading[1].length <= level) break
    body.push(sourceLines[index])
  }
  return body
}

function tableRows(heading) {
  return sectionLines(heading)
    .filter((line) => /^\s*\|/.test(line))
    .map((line) => line.trim().slice(1, -1).split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length && !cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
    .slice(1)
}

function labeledValue(heading, label) {
  const pattern = new RegExp(`^-\\s+${escapeRegExp(label)}:\\s*(.*)$`, 'i')
  const line = sectionLines(heading).find((candidate) => pattern.test(candidate.trim()))
  return line ? line.trim().match(pattern)[1].trim() : ''
}

function hasNonEmptyBullet(heading) {
  return sectionLines(heading).some((line) => /^\s*-\s+\S/.test(line))
}

function parseScalar(raw) {
  const value = raw.replace(/\s+#.*$/, '').trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  if (/^-?\d+$/.test(value)) return Number(value)
  return value
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return null
  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const field = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/)
    if (!field) {
      errors.push(`Unsupported frontmatter line: ${line}`)
      continue
    }
    data[field[1]] = parseScalar(field[2])
  }
  return data
}

const data = parseFrontmatter(source)
if (!data) errors.push('Missing YAML frontmatter delimited by --- lines.')

const requiredFields = [
  'demo_schema',
  'tier',
  'status',
  'meeting_minutes',
  'target_belief',
  'hero_journey',
  'protagonists',
  'guardrail_profiles',
  'narrative_beats',
  'explained_capabilities',
  'visible_surfaces',
  'presenter_controls',
]

if (data) {
  for (const field of requiredFields) {
    if (!(field in data)) errors.push(`Missing frontmatter field: ${field}`)
  }
  if (data.demo_schema !== 'braze-solcon-demo/v1') {
    errors.push('demo_schema must be braze-solcon-demo/v1')
  }
  if (!['standard', 'app-hybrid'].includes(data.tier)) {
    errors.push('tier must be one of: standard, app-hybrid')
  }
  if (!['draft', 'approved'].includes(data.status)) {
    errors.push('status must be one of: draft, approved')
  }

  const numericFields = [
    'meeting_minutes',
    'protagonists',
    'guardrail_profiles',
    'narrative_beats',
    'explained_capabilities',
    'visible_surfaces',
    'presenter_controls',
  ]
  for (const field of numericFields) {
    if (field in data && (!Number.isInteger(data[field]) || data[field] < 0)) {
      errors.push(`${field} must be a non-negative integer.`)
    }
  }

  if (data.status === 'approved') {
    if (!String(data.target_belief || '').trim()) errors.push('target_belief is required when approved.')
    if (!String(data.hero_journey || '').trim()) errors.push('hero_journey is required when approved.')
    if (!(data.meeting_minutes > 0)) errors.push('meeting_minutes must be positive when approved.')
    if (Number.isInteger(data.narrative_beats) && data.narrative_beats < 3) {
      warnings.push('Fewer than three beats may not show a complete evidence loop.')
    }

    for (const label of [
      'Customer decision',
      'Problem and impact',
      'Audience and meeting',
      'Target belief',
      'Hero journey',
    ]) {
      if (!labeledValue('Decision Frame', label)) {
        errors.push(`Decision Frame must complete: ${label}`)
      }
    }

    const experienceRows = tableRows('Experience Blueprint').filter(
      (cells) => /^\d+$/.test(cells[0] || '') && cells.slice(1).every(Boolean),
    )
    if (!experienceRows.length) {
      errors.push('Approved blueprint needs at least one complete Experience Blueprint row.')
    } else if (Number.isInteger(data.narrative_beats) && experienceRows.length !== data.narrative_beats) {
      warnings.push(
        `narrative_beats=${data.narrative_beats} but ${experienceRows.length} complete Experience Blueprint rows were found.`,
      )
    }

    if (data.tier === 'app-hybrid') {
      const dashboardRows = tableRows('Dashboard Contract').filter((cells) => cells.every(Boolean))
      if (!dashboardRows.length) {
        errors.push('Approved app-hybrid blueprint needs at least one complete Dashboard Contract row.')
      }
    }

    const scopedRows = tableRows('Scope Boundary').filter(
      (cells) => /^(LIVE|RESERVE|TALK|DROP)$/.test(cells[1] || ''),
    )
    if (!scopedRows.length) {
      errors.push('Approved blueprint needs at least one Scope Boundary row with LIVE, RESERVE, TALK, or DROP.')
    }
    if (!hasNonEmptyBullet('Do Not Build')) {
      errors.push('Approved blueprint needs an explicit Do Not Build item.')
    }
    for (const label of ['Real', 'Simulated', 'Must not be claimed']) {
      if (!labeledValue('Simulation Boundary', label)) {
        errors.push(`Simulation Boundary must state ${label}; use None when not applicable.`)
      }
    }
    for (const label of [
      'Weakest assumption',
      'Simplest credible alternative',
      'Approved external actions',
      'Unresolved ids, permissions, or workspace checks',
      'Acceptance proof',
      'Next implementation action',
    ]) {
      if (!labeledValue('Approval And Handoff', label)) {
        errors.push(`Approval And Handoff must complete: ${label}`)
      }
    }
  }

  const thresholds = [
    ['protagonists', 1, 'More than one protagonist can dilute the visible story.'],
    ['guardrail_profiles', 1, 'More than one guardrail profile usually adds rehearsal cost.'],
    ['narrative_beats', 7, 'More than seven beats increases explanation and timing risk.'],
    ['explained_capabilities', 3, 'More than three explained capabilities risks a feature tour.'],
    ['visible_surfaces', 2, 'More than two visible surfaces usually weakens the hero proof.'],
    ['presenter_controls', 7, 'More than seven presenter controls increases operator load.'],
  ]
  for (const [field, limit, message] of thresholds) {
    if (Number.isInteger(data[field]) && data[field] > limit) {
      warnings.push(`${field}=${data[field]} exceeds the ${limit} warning threshold. ${message}`)
    }
  }
}

for (const heading of [
  'Decision Frame',
  'Evidence And Unknowns',
  'Experience Blueprint',
  'Dashboard Contract',
  'Scope Boundary',
  'Do Not Build',
  'Simulation Boundary',
  'Approval And Handoff',
]) {
  const escaped = escapeRegExp(heading)
  if (!new RegExp(`^#{2,3} ${escaped}\\s*$`, 'm').test(source)) {
    errors.push(`Missing required heading: ${heading}`)
  }
}

for (const [pattern, label] of [
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, 'Possible API token'],
  [/Authorization:\s*Bearer\s+\S+/i, 'Possible bearer token'],
  [/\bapi[_ -]?key\s*[:=]\s*[^\s<{]{8,}/i, 'Possible API key value'],
]) {
  if (pattern.test(source)) errors.push(`${label} detected; keep secrets out of DEMO.md.`)
}

const result = {
  file: inputPath,
  ok: errors.length === 0,
  errors,
  warnings,
  notes: errors.length || warnings.length ? [] : ['Blueprint structure and scope thresholds look consistent.'],
}

if (jsonOutput) console.log(JSON.stringify(result, null, 2))
else {
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${inputPath}`)
  for (const message of errors) console.log(`ERROR: ${message}`)
  for (const message of warnings) console.log(`WARN: ${message}`)
  for (const message of result.notes) console.log(`NOTE: ${message}`)
}

process.exit(result.ok ? 0 : 1)
