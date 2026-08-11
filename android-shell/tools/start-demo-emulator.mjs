#!/usr/bin/env node

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function parseArgs(argv) {
  const separator = argv.indexOf('--')
  if (separator === -1 || separator === argv.length - 1) {
    throw new Error('Usage: start-demo-emulator.mjs --log <path> --pid-file <path> -- <emulator> [args...]')
  }

  const options = argv.slice(0, separator)
  const command = argv[separator + 1]
  const args = argv.slice(separator + 2)
  let logPath = ''
  let pidPath = ''

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index]
    const value = options[index + 1]
    if ((option === '--log' || option === '--pid-file') && value) {
      if (option === '--log') logPath = value
      else pidPath = value
      index += 1
      continue
    }
    throw new Error(`Unknown or incomplete option: ${option}`)
  }

  if (!logPath || !pidPath) {
    throw new Error('Both --log and --pid-file are required.')
  }
  return { command, args, logPath, pidPath }
}

export async function startDetachedProcess({ command, args = [], logPath, pidPath }) {
  if (!command || !logPath || !pidPath) {
    throw new Error('A command, log path, and PID-file path are required.')
  }

  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  fs.mkdirSync(path.dirname(pidPath), { recursive: true })
  const logFd = fs.openSync(logPath, 'w')
  let child
  try {
    child = spawn(command, args, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
    })
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', reject)
    })
  } finally {
    fs.closeSync(logFd)
  }

  child.unref()
  fs.writeFileSync(pidPath, `${child.pid}\n`, { mode: 0o600 })
  return child.pid
}

const isMainModule = Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))

if (isMainModule) {
  startDetachedProcess(parseArgs(process.argv.slice(2)))
    .then((pid) => {
      process.stdout.write(`${pid}\n`)
    })
    .catch((error) => {
      console.error(`Error: ${error.message}`)
      process.exitCode = 1
    })
}
