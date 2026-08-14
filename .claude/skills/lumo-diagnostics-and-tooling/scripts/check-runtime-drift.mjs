#!/usr/bin/env node
// check-runtime-drift.mjs — READ-ONLY runtime drift detector for the Lumo demo shell repo.
//
// Compares the demo pack id + configHash + runtimeHash recorded in generated/derived
// location and prints a table plus an OK / DRIFT verdict. Never writes anything.
// Never prints values of braze.* or firebase.* keys (it only reads the
// demo.packId / demo.configHash / demo.runtimeHash lines from local.properties).
//
// Usage:
//   node .claude/skills/lumo-diagnostics-and-tooling/scripts/check-runtime-drift.mjs
//
// Exit codes: 0 = all present locations agree, 1 = drift or missing required
// generated files, 2 = could not locate the repo root.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function findRepoRoot() {
  if (process.env.LUMO_REPO_ROOT) return process.env.LUMO_REPO_ROOT
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 10; i += 1) {
    if (fs.existsSync(path.join(dir, 'web-template')) && fs.existsSync(path.join(dir, 'android-shell'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return ''
}

const repoRoot = findRepoRoot()
if (!repoRoot) {
  console.error('error: could not locate repo root (expected web-template/ and android-shell/ side by side).')
  console.error('Set LUMO_REPO_ROOT=/path/to/repo and re-run.')
  process.exit(2)
}

function readTextIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function readJsonRuntime(file) {
  const text = readTextIfExists(file)
  if (text === null) return { present: false }
  try {
    const json = JSON.parse(text)
    return {
      present: true,
      packId: json.id || '',
      configHash: json.configHash || '',
      runtimeHash: json.runtimeHash || '',
    }
  } catch (error) {
    return { present: true, error: `invalid JSON: ${error.message}` }
  }
}

function readGeneratedConfig(file) {
  const text = readTextIfExists(file)
  if (text === null) return { present: false }
  const packId = text.match(/activeDemoPackId: string = "([^"]+)"/)?.[1] || ''
  const configHash = text.match(/"configHash": "([^"]+)"/)?.[1] || ''
  const runtimeHash = text.match(/"runtimeHash": "([^"]+)"/)?.[1] || ''
  return { present: true, packId, configHash, runtimeHash }
}

function readActivePackMarker(file) {
  const text = readTextIfExists(file)
  if (text === null) return { present: false }
  return { present: true, packId: text.trim(), configHash: '', runtimeHash: '' }
}

// Reads ONLY demo.packId, demo.configHash, and demo.runtimeHash. Every other key (including any
// braze.* or firebase.* credential line) is skipped and never surfaced.
function readLocalPropertiesSeed(file) {
  const text = readTextIfExists(file)
  if (text === null) return { present: false }
  const allowed = new Set(['demo.packId', 'demo.configHash', 'demo.runtimeHash'])
  const values = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (!allowed.has(key)) continue
    values[key] = trimmed.slice(eq + 1).trim()
  }
  return {
    present: true,
    packId: values['demo.packId'] || '',
    configHash: values['demo.configHash'] || '',
    runtimeHash: values['demo.runtimeHash'] || '',
  }
}

const locations = [
  {
    label: 'web-template/public/demo-runtime.json',
    required: true,
    hasConfigHash: true,
    hasRuntimeHash: true,
    result: readJsonRuntime(path.join(repoRoot, 'web-template/public/demo-runtime.json')),
  },
  {
    label: 'web-template/src/brand/activeDemoConfig.generated.ts',
    required: true,
    hasConfigHash: true,
    hasRuntimeHash: true,
    result: readGeneratedConfig(path.join(repoRoot, 'web-template/src/brand/activeDemoConfig.generated.ts')),
  },
  {
    label: 'android-shell/.active-demo-pack',
    required: true,
    hasConfigHash: false,
    hasRuntimeHash: false,
    result: readActivePackMarker(path.join(repoRoot, 'android-shell/.active-demo-pack')),
  },
  {
    label: 'android-shell/local.properties (demo.* seed)',
    required: false,
    hasConfigHash: true,
    hasRuntimeHash: true,
    result: readLocalPropertiesSeed(path.join(repoRoot, 'android-shell/local.properties')),
  },
  {
    label: 'web-template/dist/demo-runtime.json (built web)',
    required: false,
    hasConfigHash: true,
    hasRuntimeHash: true,
    result: readJsonRuntime(path.join(repoRoot, 'web-template/dist/demo-runtime.json')),
  },
  {
    label: 'android packaged asset (build/generated/.../demo-runtime.json)',
    required: false,
    hasConfigHash: true,
    hasRuntimeHash: true,
    result: readJsonRuntime(path.join(repoRoot, 'android-shell/app/build/generated/assets/demoWeb/demo/demo-runtime.json')),
  },
]

const problems = []
const present = locations.filter((entry) => entry.result.present && !entry.result.error)

for (const entry of locations) {
  if (entry.required && !entry.result.present) {
    problems.push(`${entry.label} is missing — run: npm run lumo:apply`)
  }
  if (entry.result.error) {
    problems.push(`${entry.label}: ${entry.result.error}`)
  }
}

const referencePackIds = new Set(present.map((entry) => entry.result.packId).filter(Boolean))
const referenceHashes = new Set(
  present.filter((entry) => entry.hasConfigHash).map((entry) => entry.result.configHash).filter(Boolean),
)
const referenceRuntimeHashes = new Set(
  present.filter((entry) => entry.hasRuntimeHash).map((entry) => entry.result.runtimeHash).filter(Boolean),
)

if (referencePackIds.size > 1) problems.push(`pack id disagreement: ${[...referencePackIds].join(' vs ')}`)
if (referenceHashes.size > 1) problems.push(`configHash disagreement: ${[...referenceHashes].join(' vs ')}`)
if (referenceRuntimeHashes.size > 1) problems.push(`runtimeHash disagreement: ${[...referenceRuntimeHashes].join(' vs ')}`)
for (const entry of present) {
  if (!entry.result.packId) problems.push(`${entry.label}: pack id is empty`)
  if (entry.hasConfigHash && !entry.result.configHash) problems.push(`${entry.label}: configHash is empty`)
  if (entry.hasRuntimeHash && !entry.result.runtimeHash) problems.push(`${entry.label}: runtimeHash is empty`)
}

const widthLabel = Math.max(...locations.map((entry) => entry.label.length), 'Location'.length)
const widthPack = Math.max(
  ...locations.map((entry) => (entry.result.packId || '').length),
  'Pack id'.length,
  '(not built yet — skipped)'.length,
)
const pad = (text, width) => String(text).padEnd(width)

console.log(`Repo root: ${repoRoot}\n`)
console.log(`${pad('Location', widthLabel)}  ${pad('Pack id', widthPack)}  configHash        runtimeHash`)
console.log(`${'-'.repeat(widthLabel)}  ${'-'.repeat(widthPack)}  ${'-'.repeat(16)}  ${'-'.repeat(24)}`)
for (const entry of locations) {
  let packId = '(missing)'
  let configHash = entry.hasConfigHash ? '(missing)' : 'n/a'
  let runtimeHash = entry.hasRuntimeHash ? '(missing)' : 'n/a'
  if (entry.result.error) {
    packId = '(unreadable)'
    configHash = '(unreadable)'
    runtimeHash = '(unreadable)'
  } else if (entry.result.present) {
    packId = entry.result.packId || '(empty)'
    configHash = entry.hasConfigHash ? entry.result.configHash || '(empty)' : 'n/a'
    runtimeHash = entry.hasRuntimeHash ? entry.result.runtimeHash || '(empty)' : 'n/a'
  } else if (!entry.required) {
    packId = '(not built yet — skipped)'
    configHash = ''
    runtimeHash = ''
  }
  console.log(`${pad(entry.label, widthLabel)}  ${pad(packId, widthPack)}  ${pad(configHash, 16)}  ${runtimeHash}`)
}

console.log('')
if (problems.length) {
  console.log('Verdict: DRIFT')
  for (const problem of problems) console.log(`- ${problem}`)
  console.log('\nNext: npm run lumo:apply, then rebuild/reinstall the affected shell,')
  console.log('then re-run this script and: npm run validate:demo-runtime')
  process.exit(1)
}

console.log('Verdict: OK — every present location agrees on pack id, configHash, and runtimeHash.')
console.log('(Locations marked "not built yet" are optional build outputs and were skipped.)')
