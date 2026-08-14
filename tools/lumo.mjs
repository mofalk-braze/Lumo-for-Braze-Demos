#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { runAndroidCommand } from './lumo-android-cli.mjs'

function usageText() {
  return `Lumo command line

Usage:
  node tools/lumo.mjs android <doctor|setup|start|status|stop> [options]
  node tools/lumo.mjs pack <new|duplicate|validate|open> [options]

Run either command group without a subcommand for focused guidance.`
}

export async function runLumo(argv = [], io = {}) {
  const output = {
    stdout: io.stdout || ((line) => console.log(line)),
    stderr: io.stderr || ((line) => console.error(line)),
  }
  const group = argv[0] || 'help'
  if (group === '-h' || group === '--help' || group === 'help') {
    output.stdout(usageText())
    return 0
  }
  if (group === 'android') return runAndroidCommand(argv.slice(1), output)
  if (group === 'pack') {
    try {
      const { runPackCommand } = await import('./lumo-pack-cli.mjs')
      return runPackCommand(argv.slice(1), {
        stdout: {
          write: (chunk) => output.stdout(String(chunk).replace(/\n$/, '')),
        },
      })
    } catch (error) {
      output.stderr(`lumo pack: ${error.message || String(error)}`)
      return 1
    }
  }
  output.stderr(`Unknown Lumo command group: ${group}`)
  output.stderr(usageText())
  return 2
}

const isMainModule = Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
if (isMainModule) {
  runLumo(process.argv.slice(2)).then((status) => {
    process.exitCode = Number.isInteger(status) ? status : 0
  }).catch((error) => {
    console.error(error.stack || String(error))
    process.exitCode = 1
  })
}
