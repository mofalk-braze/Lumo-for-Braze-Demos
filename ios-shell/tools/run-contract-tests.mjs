#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') {
  console.error('iOS contract tests require macOS with the Xcode command-line tools.')
  process.exit(1)
}

const iosRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lumo-ios-contracts-'))

function run(label, sources) {
  const executable = path.join(tempRoot, label)
  const compile = spawnSync(
    'xcrun',
    ['swiftc', ...sources.map((source) => path.join(iosRoot, source)), '-o', executable],
    { cwd: iosRoot, encoding: 'utf8' },
  )
  if (compile.error) throw compile.error
  if (compile.status !== 0) {
    process.stderr.write(compile.stderr || compile.stdout || '')
    throw new Error(`${label} did not compile.`)
  }
  const result = spawnSync(executable, [], { cwd: iosRoot, encoding: 'utf8' })
  if (result.error) throw result.error
  process.stdout.write(result.stdout || '')
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '')
    throw new Error(`${label} failed.`)
  }
}

try {
  run('credential-store-tests', [
    'Sources/CredentialStore.swift',
    'tests/CredentialStoreTests.swift',
  ])
  run('web-ready-identity-tests', [
    'Sources/WebReadyIdentity.swift',
    'tests/WebReadyIdentityTests.swift',
  ])
} finally {
  if (tempRoot.startsWith(`${os.tmpdir()}${path.sep}lumo-ios-contracts-`)) {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}
