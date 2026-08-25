#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectSkillsDir = path.join(repoRoot, '.claude', 'skills')
const routingManifestPath = path.join(repoRoot, 'tools', 'agent-skill-routing.json')
const failures = []

let routingManifest = { entrySkills: [], specialistSkills: [], routingCases: [] }
try {
  routingManifest = JSON.parse(fs.readFileSync(routingManifestPath, 'utf8'))
} catch (error) {
  failures.push(`tools/agent-skill-routing.json could not be read: ${error.message}`)
}

const entrySkills = (routingManifest.entrySkills || []).map((entry) => entry.name)
const specialistSkills = (routingManifest.specialistSkills || []).map((entry) => entry.name)
const requiredSkills = [...new Set([...entrySkills, ...specialistSkills])].sort()
const staleSkillFactPatterns = [
  /\bno unit test suite\b/i,
  /\bthere are no unit tests\b/i,
  /\b\d+\s+(?:capability\/unit\/HTTP\s+)?tests? pass\b/i,
]

const requiredSupportFiles = [
  'braze-demo-app-builder/agents/openai.yaml',
  'braze-demo-app-builder/references/braze-story-patterns.md',
  'braze-demo-app-builder/references/design-from-screenshots.md',
  'braze-demo-app-builder/references/launch-links.md',
  'braze-demo-app-builder/references/qa-checklist.md',
  'braze-demo-app-builder/references/runtime-architecture.md',
  'braze-integration-reference/references/bridge-actions.md',
  'braze-solution-demo-campaign/agents/openai.yaml',
  'braze-solution-demo-campaign/assets/DEMO.md',
  'braze-solution-demo-campaign/references/solcon-operating-model.md',
  'braze-solution-demo-campaign/scripts/check-demo-scope.mjs',
  'lumo-start-here/agents/openai.yaml',
  'lumo-debugging-playbook/references/error-messages.md',
  'lumo-demo-pack-authoring/references/pack-schema.md',
  'lumo-diagnostics-and-tooling/scripts/check-runtime-drift.mjs',
  'lumo-push-readiness-campaign/references/zscaler-trust-mechanics.md',
  'lumo-run-and-operate/references/control-room-reference.md',
]

const contractTokens = new Map([
  [
    'braze-demo-app-builder',
    ['AGENTS.md', '.demo-packs/', 'runtimeHash', 'Content Card', 'Banner', 'Control Room', 'REST', 'Android', 'iOS'],
  ],
  [
    'lumo-build-and-env',
    ['Apple Silicon', 'Braze_Demo_API_36', 'RESET_APP_DATA=1', 'npm run lumo:cockpit'],
  ],
  [
    'lumo-start-here',
    ['one primary', 'Has this worked', 'lumo-new-demo-campaign', 'agent-skill-routing.json'],
  ],
  [
    'lumo-new-demo-campaign',
    ['approved', 'Focused implementation', 'End-to-end campaign', 'braze-demo-app-builder'],
  ],
  [
    'braze-solution-demo-campaign',
    [
      'target belief',
      'hero journey',
      'customer fact',
      'Braze fact',
      'assets/DEMO.md',
      'scripts/check-demo-scope.mjs',
      'lumo-new-demo-campaign',
    ],
  ],
  [
    'lumo-push-readiness-campaign',
    ['service account', 'FCM', 'Zscaler', 'Braze_Demo_API_36'],
  ],
  [
    'lumo-secrets-and-sanitization',
    ['.claude/skills/', 'security:scan', 'public:check', '.demo-packs/'],
  ],
  [
    'lumo-plugin-workflow',
    ['canonical', '.claude/skills/', 'tools/check-agent-skills.mjs'],
  ],
])

function relative(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/')
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (error) {
    failures.push(`${relative(file)} could not be read: ${error.message}`)
    return ''
  }
}

function frontmatter(text) {
  return text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || ''
}

function metadataValue(block, key) {
  return block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() || ''
}

function metadataText(block, key) {
  const lines = block.split(/\r?\n/)
  const index = lines.findIndex((line) => line.startsWith(`${key}:`))
  if (index < 0) return ''
  const inline = lines[index].slice(key.length + 1).trim()
  if (!['>', '>-', '|', '|-'].includes(inline)) return inline
  const value = []
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    if (!/^\s+/.test(lines[cursor])) break
    value.push(lines[cursor].trim())
  }
  return value.join(' ').trim()
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file, out)
    else if (entry.isFile()) out.push(file)
  }
  return out
}

function gitStatus(args) {
  return spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' })
}

function checkIgnore(pathname, shouldBeIgnored) {
  const result = gitStatus(['check-ignore', '-q', pathname])
  const ignored = result.status === 0
  if (ignored !== shouldBeIgnored) {
    failures.push(
      `${pathname} must ${shouldBeIgnored ? 'remain machine-local and ignored' : 'be source-distributed, not ignored'}`,
    )
  }
}

function checkRelativeLinks(skillFile, text) {
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g
  for (const match of text.matchAll(linkPattern)) {
    const target = match[1].trim().split('#')[0]
    if (!target || /^(?:https?:|mailto:|#)/.test(target)) continue
    const resolved = path.resolve(path.dirname(skillFile), target)
    if (
      (resolved !== repoRoot && !resolved.startsWith(repoRoot + path.sep)) ||
      !fs.existsSync(resolved)
    ) {
      failures.push(`${relative(skillFile)} has a missing or out-of-repository link: ${match[1]}`)
    }
  }
}

if (routingManifest.schemaVersion !== 1) {
  failures.push('tools/agent-skill-routing.json schemaVersion must be 1')
}
if (entrySkills.length < 6 || entrySkills.length > 10) {
  failures.push(`routing manifest must declare 6-10 entry skills, found ${entrySkills.length}`)
}
if (new Set([...entrySkills, ...specialistSkills]).size !== entrySkills.length + specialistSkills.length) {
  failures.push('routing manifest contains duplicate or overlapping entry/specialist skill names')
}
for (const specialist of routingManifest.specialistSkills || []) {
  if (!entrySkills.includes(specialist.owner)) {
    failures.push(`specialist ${specialist.name} has unknown lifecycle owner ${specialist.owner}`)
  }
}
for (const entry of routingManifest.entrySkills || []) {
  if (!String(entry.phase || '').trim()) failures.push(`entry ${entry.name} has no lifecycle phase`)
  if (!String(entry.primaryFor || '').trim()) failures.push(`entry ${entry.name} has no primaryFor contract`)
  if (!String(entry.notFor || '').trim()) failures.push(`entry ${entry.name} has no notFor boundary`)
  if (!Array.isArray(entry.next)) failures.push(`entry ${entry.name} next must be an array`)
  for (const next of entry.next || []) {
    if (!entrySkills.includes(next)) failures.push(`entry ${entry.name} has unknown next lifecycle ${next}`)
  }
}
if ((routingManifest.routingCases || []).length < 20) {
  failures.push('routing manifest must include at least 20 realistic routing cases')
}
for (const [index, routeCase] of (routingManifest.routingCases || []).entries()) {
  if (!String(routeCase.prompt || '').trim()) failures.push(`routing case ${index + 1} has no prompt`)
  if (!entrySkills.includes(routeCase.expectedPrimary)) {
    failures.push(`routing case ${index + 1} has non-entry primary ${routeCase.expectedPrimary}`)
  }
}

if (!fs.existsSync(projectSkillsDir)) {
  failures.push('.claude/skills/ is missing')
}

const discoveredSkills = fs.existsSync(projectSkillsDir)
  ? fs
      .readdirSync(projectSkillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(projectSkillsDir, entry.name, 'SKILL.md')))
      .map((entry) => entry.name)
      .sort()
  : []

for (const name of requiredSkills) {
  const skillFile = path.join(projectSkillsDir, name, 'SKILL.md')
  if (!fs.existsSync(skillFile)) {
    failures.push(`required project skill is missing: ${name}`)
    continue
  }
  const text = readText(skillFile)
  const metadata = frontmatter(text)
  if (!metadata) failures.push(`${relative(skillFile)} has no YAML frontmatter`)
  if (metadataValue(metadata, 'name') !== name) {
    failures.push(`${relative(skillFile)} frontmatter name must be ${name}`)
  }
  const description = metadataText(metadata, 'description')
  if (!description) {
    failures.push(`${relative(skillFile)} frontmatter description is missing`)
  }
  if (description.length > 1536) {
    failures.push(`${relative(skillFile)} description exceeds Claude's 1,536-character listing limit`)
  }
  const modelInvocationDisabled = metadataValue(metadata, 'disable-model-invocation') === 'true'
  if (entrySkills.includes(name) && modelInvocationDisabled) {
    failures.push(`${relative(skillFile)} is a lifecycle entry and must remain model-invocable`)
  }
  if (specialistSkills.includes(name) && !modelInvocationDisabled) {
    failures.push(`${relative(skillFile)} is a specialist and must set disable-model-invocation: true`)
  }
  if (entrySkills.includes(name) && text.split(/\r?\n/).length > 200) {
    failures.push(`${relative(skillFile)} lifecycle entry exceeds the 200-line progressive-disclosure budget`)
  }
  for (const pattern of [
    /before ANY/i,
    /before any demo/i,
    /finishes ANY change/i,
    /before creating any/i,
  ]) {
    if (pattern.test(description)) {
      failures.push(`${relative(skillFile)} description contains a blanket automatic trigger: ${pattern}`)
    }
  }
  for (const token of contractTokens.get(name) || []) {
    if (!text.includes(token)) failures.push(`${relative(skillFile)} is missing contract token: ${token}`)
  }
  checkRelativeLinks(skillFile, text)
}

for (const name of discoveredSkills) {
  if (!requiredSkills.includes(name)) {
    failures.push(`project skill is not declared in the distribution inventory: ${name}`)
  }
}

for (const supportFile of requiredSupportFiles) {
  if (!fs.existsSync(path.join(projectSkillsDir, supportFile))) {
    failures.push(`required skill support file is missing: ${supportFile}`)
  }
}

const demoScopeScript = path.join(
  projectSkillsDir,
  'braze-solution-demo-campaign/scripts/check-demo-scope.mjs',
)
const demoBlueprint = path.join(projectSkillsDir, 'braze-solution-demo-campaign/assets/DEMO.md')
if (fs.existsSync(demoScopeScript) && fs.existsSync(demoBlueprint)) {
  const result = spawnSync(process.execPath, [demoScopeScript, demoBlueprint, '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  if (result.status !== 0) {
    failures.push(
      `solution campaign DEMO.md contract is invalid: ${(result.stderr || result.stdout || 'unknown error').trim()}`,
    )
  }
}

const unsafeContentPatterns = [
  { label: 'absolute macOS home path', pattern: /\/Users\/[^/\s]+\// },
  { label: 'absolute Linux home path', pattern: /\/home\/[^/\s]+\// },
  { label: 'absolute Windows home path', pattern: /[A-Za-z]:\\Users\\[^\\\s]+\\/ },
  { label: 'obsolete ignored-bundle claim', pattern: /Everything under `?\.claude\/?`?.*(?:ignored|this machine only)/i },
  { label: 'obsolete distribution claim', pattern: /not part of distribution/i },
]

for (const file of walk(projectSkillsDir)) {
  const rel = relative(file)
  if (path.basename(file) === '.DS_Store' || file.endsWith('.zip')) continue
  if (!/\.(?:md|mjs|ya?ml|json)$/.test(file)) continue
  const text = readText(file)
  for (const check of unsafeContentPatterns) {
    if (check.pattern.test(text)) failures.push(`${rel} contains ${check.label}`)
  }
  for (const pattern of staleSkillFactPatterns) {
    if (pattern.test(text)) failures.push(`${rel} hardcodes dynamic or obsolete test-suite facts: ${pattern}`)
  }
  if (file.endsWith('.md')) checkRelativeLinks(file, text)
}

const trackedSkillArtifacts = gitStatus(['ls-files', '-z', '.claude/skills'])
if (trackedSkillArtifacts.status === 0) {
  for (const file of trackedSkillArtifacts.stdout.split('\0').filter(Boolean)) {
    if (path.basename(file) === '.DS_Store' || file.endsWith('.zip')) {
      failures.push(`tracked skill bundle contains a local artifact: ${file}`)
    }
  }
}

checkIgnore('.claude/skills/braze-demo-app-builder/SKILL.md', false)
checkIgnore('.claude/skills/braze-solution-demo-campaign/SKILL.md', false)
checkIgnore('.claude/settings.local.json', true)
checkIgnore('.claude/launch.json', true)
checkIgnore('.claude/skills.zip', true)

const claudeManifestPath = path.join(repoRoot, 'plugins/braze-demo-builder/.claude-plugin/plugin.json')
const codexManifestPath = path.join(repoRoot, 'plugins/braze-demo-builder/.codex-plugin/plugin.json')
let claudeManifest = {}
let codexManifest = {}
try {
  claudeManifest = JSON.parse(readText(claudeManifestPath))
  codexManifest = JSON.parse(readText(codexManifestPath))
} catch (error) {
  failures.push(`plugin manifest JSON is invalid: ${error.message}`)
}
if (claudeManifest.name !== 'braze-demo-builder' || codexManifest.name !== 'braze-demo-builder') {
  failures.push('both plugin manifests must use name braze-demo-builder')
}
if (!claudeManifest.version || claudeManifest.version !== codexManifest.version) {
  failures.push('Claude and Codex plugin manifest versions must match')
}
if (!String(claudeManifest.commands || '').startsWith('./commands')) {
  failures.push('Claude plugin manifest must expose ./commands')
}
if (!String(claudeManifest.skills || '').startsWith('./skills')) {
  failures.push('Claude plugin manifest must expose ./skills')
}
if (!String(codexManifest.skills || '').startsWith('./skills')) {
  failures.push('Codex plugin manifest must expose ./skills')
}

const pluginSkill = readText(
  path.join(repoRoot, 'plugins/braze-demo-builder/skills/braze-demo-app-builder/SKILL.md'),
)
const pluginCommand = readText(path.join(repoRoot, 'plugins/braze-demo-builder/commands/demo-build.md'))
for (const [label, text] of [
  ['plugin builder skill', pluginSkill],
  ['plugin demo-build command', pluginCommand],
]) {
  if (!text.includes('.claude/skills/braze-demo-app-builder/SKILL.md')) {
    failures.push(`${label} must route to the canonical project builder skill`)
  }
  if (!text.includes('.claude/skills/braze-solution-demo-campaign/SKILL.md')) {
    failures.push(`${label} must route unapproved story work to the canonical solution campaign skill`)
  }
  for (const token of ['Content Card', 'Banner', 'Android', 'iOS', '.demo-packs/']) {
    if (!text.includes(token)) failures.push(`${label} is missing shared builder contract token: ${token}`)
  }
  if (text.split(/\r?\n/).length > 50) {
    failures.push(`${label} must remain a thin compatibility pointer of at most 50 lines`)
  }
}

if (failures.length) {
  console.error('Agent skill distribution check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `Agent skill distribution check passed (${entrySkills.length} entry skills, ${specialistSkills.length} specialists, ${(routingManifest.routingCases || []).length} routing cases, ${requiredSupportFiles.length} required support files, plugin ${claudeManifest.version}).`,
)
