#!/usr/bin/env node

import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  createDemoPack,
  demoConfigHash,
  demoRuntimeHash,
  duplicateDemoPack,
  ensureDemoPackNotes,
  getDemoPack,
  listDemoPacks,
  localDemoPacksDir,
  validateDemoPackForAuthoring,
} from './demo-pack-utils.mjs'

export const packCommandUsage = `Usage:
  lumo pack new <id> [--name <name>] [--description <text>] [--json]
  lumo pack duplicate <source-id> <new-id> [--name <name>] [--description <text>] [--json]
  lumo pack validate [<id> | --all] [--json]
  lumo pack open <id> [--config | --notes] [--print] [--json]

New and duplicated packs always go to the ignored .demo-packs/ workspace.
Duplicate deliberately omits credentials and regenerates notes.md.`

const VALUE_FLAGS = new Set(['name', 'description'])
const BOOLEAN_FLAGS = new Set(['all', 'config', 'help', 'json', 'notes', 'print'])

function parseArguments(argv) {
  const positionals = []
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      positionals.push(argument)
      continue
    }
    const [rawKey, inlineValue] = argument.slice(2).split(/=(.*)/s, 2)
    if (VALUE_FLAGS.has(rawKey)) {
      const value = inlineValue === undefined ? argv[index + 1] : inlineValue
      if (value === undefined || (!inlineValue && value.startsWith('--'))) {
        throw new Error(`--${rawKey} requires a value`)
      }
      options[rawKey] = value
      if (inlineValue === undefined) index += 1
      continue
    }
    if (!BOOLEAN_FLAGS.has(rawKey)) throw new Error(`Unknown option: --${rawKey}`)
    if (inlineValue !== undefined) throw new Error(`--${rawKey} does not accept a value`)
    options[rawKey] = true
  }
  return { positionals, options }
}

function humanizePackId(id) {
  return String(id || '')
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function assertAllowedOptions(options, allowed) {
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw new Error(`--${key} is not supported by this command`)
  }
}

function safePackResult(pack, extra = {}) {
  return {
    id: pack.id,
    name: pack.name,
    source: pack.source || 'local',
    directory: pack.directory,
    configPath: path.join(pack.directory, 'demo-pack.json'),
    notesPath: path.join(pack.directory, 'notes.md'),
    configHash: demoConfigHash(pack),
    runtimeHash: demoRuntimeHash(pack),
    ...extra,
  }
}

function writeJson(stdout, value) {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function writeCreated(stdout, action, result) {
  stdout.write(`${action} ${result.id} (${result.name})\n`)
  stdout.write(`Pack: ${result.directory}\n`)
  stdout.write(`Handoff: ${result.notesPath}\n`)
  stdout.write('Next: edit demo-pack.json and notes.md, then run `lumo pack validate ' + result.id + '`.\n')
}

function openCommandForPlatform(target, platform) {
  if (platform === 'darwin') return { command: 'open', args: [target] }
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', target] }
  return { command: 'xdg-open', args: [target] }
}

export function openDemoPack(packOrId, options = {}, { platform = process.platform, spawn = spawnSync } = {}) {
  const pack = typeof packOrId === 'string' ? getDemoPack(packOrId) : packOrId
  if (options.config && options.notes) throw new Error('Choose only one of --config or --notes')
  if (options.notes && !fs.existsSync(path.join(pack.directory, 'notes.md'))) {
    if (pack.source !== 'local') throw new Error(`notes.md is missing for committed pack: ${pack.id}`)
    ensureDemoPackNotes(pack)
  }
  const target = options.config
    ? path.join(pack.directory, 'demo-pack.json')
    : options.notes
      ? path.join(pack.directory, 'notes.md')
      : pack.directory
  if (options.print) return { target, opened: false }
  const opener = openCommandForPlatform(target, platform)
  const result = spawn(opener.command, opener.args, { stdio: 'ignore' })
  if (result.error) throw result.error
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`${opener.command} exited with status ${result.status}`)
  }
  return { target, opened: true }
}

export function runPackCommand(
  argv,
  {
    stdout = process.stdout,
    platform = process.platform,
    spawn = spawnSync,
    destinationRoot = localDemoPacksDir,
  } = {},
) {
  const [command, ...rawArguments] = argv
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    stdout.write(`${packCommandUsage}\n`)
    return 0
  }

  const { positionals, options } = parseArguments(rawArguments)
  if (options.help) {
    stdout.write(`${packCommandUsage}\n`)
    return 0
  }

  if (command === 'new') {
    assertAllowedOptions(options, new Set(['description', 'json', 'name']))
    if (positionals.length !== 1) throw new Error('Usage: lumo pack new <id> [--name <name>]')
    const id = positionals[0]
    const pack = createDemoPack(
      {
        id,
        name: options.name || humanizePackId(id),
        description: options.description || '',
      },
      { destinationRoot },
    )
    const result = safePackResult(pack, { action: 'created' })
    if (options.json) writeJson(stdout, result)
    else writeCreated(stdout, 'Created', result)
    return 0
  }

  if (command === 'duplicate') {
    assertAllowedOptions(options, new Set(['description', 'json', 'name']))
    if (positionals.length !== 2) {
      throw new Error('Usage: lumo pack duplicate <source-id> <new-id> [--name <name>]')
    }
    const [sourceId, id] = positionals
    const sourcePack = getDemoPack(sourceId)
    const pack = duplicateDemoPack(sourcePack, {
      id,
      name: options.name || '',
      description: options.description || '',
      destinationRoot,
    })
    const result = safePackResult(pack, {
      action: 'duplicated',
      duplicatedFrom: sourcePack.id,
      credentialsCopied: false,
    })
    if (options.json) writeJson(stdout, result)
    else {
      writeCreated(stdout, `Duplicated ${sourcePack.id} as`, result)
      stdout.write('Credentials were not copied. Add local values through the documented setup flow.\n')
    }
    return 0
  }

  if (command === 'validate') {
    assertAllowedOptions(options, new Set(['all', 'json']))
    if (positionals.length > 1 || (options.all && positionals.length)) {
      throw new Error('Usage: lumo pack validate [<id> | --all]')
    }
    const packs = options.all || positionals.length === 0 ? listDemoPacks() : [getDemoPack(positionals[0])]
    const knownPacks = listDemoPacks()
    const reports = packs.map((pack) => validateDemoPackForAuthoring(pack, { knownPacks }))
    const valid = reports.every((report) => report.valid)
    const result = { valid, reports }
    if (options.json) writeJson(stdout, result)
    else {
      for (const report of reports) {
        stdout.write(`${report.valid ? 'PASS' : 'FAIL'} ${report.id}  config=${report.configHash} runtime=${report.runtimeHash}\n`)
        for (const warning of report.warnings) stdout.write(`  warning: ${warning}\n`)
        for (const error of report.errors) stdout.write(`  error: ${error}\n`)
      }
    }
    return valid ? 0 : 1
  }

  if (command === 'open') {
    assertAllowedOptions(options, new Set(['config', 'json', 'notes', 'print']))
    if (positionals.length !== 1) throw new Error('Usage: lumo pack open <id> [--config | --notes] [--print]')
    const pack = getDemoPack(positionals[0])
    const opened = openDemoPack(pack, options, { platform, spawn })
    const result = { id: pack.id, ...opened }
    if (options.json) writeJson(stdout, result)
    else stdout.write(`${opened.opened ? 'Opened' : 'Pack path'}: ${opened.target}\n`)
    return 0
  }

  throw new Error(`Unknown lumo pack command: ${command}\n\n${packCommandUsage}`)
}

const isMainModule = Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
if (isMainModule) {
  try {
    process.exitCode = runPackCommand(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`lumo pack: ${error.message}\n`)
    process.exitCode = 1
  }
}
