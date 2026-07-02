#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function run(command, args, label) {
  console.log(`\n== ${label} ==`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
  })
  if (result.status !== 0) failures.push(`${label} failed`)
}

function git(args, options = {}) {
  return spawnSync('git', args, {
    cwd: repoRoot,
    encoding: options.encoding || 'utf8',
    stdio: options.stdio || 'pipe',
    shell: false,
  })
}

function trackedFiles() {
  const result = git(['ls-files', '-z'])
  if (result.status !== 0) {
    failures.push('Could not list tracked files')
    return []
  }
  return result.stdout.split('\0').filter(Boolean)
}

function statusFiles() {
  const result = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  if (result.status !== 0) {
    failures.push('Could not read git status')
    return []
  }
  const entries = result.stdout.split('\0').filter(Boolean)
  return entries.map((entry) => {
    const status = entry.slice(0, 2)
    const file = entry.slice(3)
    return { status, file }
  })
}

function isAllowedTrackedFile(file) {
  return [
    'android-shell/app/google-services.json',
    'android-shell/local.properties.example',
    'ios-shell/Config.example.swift',
  ].includes(file)
}

function isSensitivePath(file) {
  return [
    /(^|\/)\.env(?:\..*)?$/,
    /(^|\/)secrets\.properties$/,
    /(^|\/)Config\.swift$/,
    /(^|\/)local\.properties$/,
    /(^|\/)firebase-service-account.*\.json$/i,
    /(^|\/)service-account.*\.json$/i,
    /(^|\/)braze-secrets.*\.json$/i,
    /\.(p8|p12|mobileprovision|jks|keystore)$/i,
    /^Braze Design System \(Collaborative\)\//,
    /^\.demo-packs\//,
  ].some((pattern) => pattern.test(file))
}

function checkTrackedPaths(files) {
  for (const file of files) {
    if (isAllowedTrackedFile(file)) continue
    if (isSensitivePath(file)) failures.push(`Sensitive tracked path: ${file}`)
  }
}

function checkTrackedContent(files) {
  const scannerImplementationFiles = new Set([
    'tools/secret-scan.mjs',
    'tools/public-readiness-check.mjs',
  ])
  const privateKeyMarker = 'PRIVATE ' + 'KEY'
  const detectors = [
    { name: 'private key material', pattern: new RegExp(`-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?${privateKeyMarker}-----`) },
    { name: 'Google service account key', pattern: new RegExp(`"private_key"\\s*:\\s*"-----BEGIN ${privateKeyMarker}-----`) },
    { name: 'Braze REST API key assignment', pattern: /\b(?:braze\.restApiKey|BRAZE_REST_API_KEY(?:_[A-Z0-9_]+)?)\s*[:=]\s*["']?[A-Za-z0-9._-]{20,}/ },
    { name: 'Braze SDK key assignment', pattern: /\bbraze\.apiKey\s*[:=]\s*["']?[A-Za-z0-9._:-]{20,}/i },
  ]
  for (const file of files) {
    if (scannerImplementationFiles.has(file)) continue
    const absolute = path.join(repoRoot, file)
    let text = ''
    try {
      text = fs.readFileSync(absolute, 'utf8')
    } catch {
      continue
    }
    for (const detector of detectors) {
      if (detector.pattern.test(text)) failures.push(`${detector.name} in tracked file: ${file}`)
    }
  }
}

function checkVisibleUntracked(entries) {
  for (const entry of entries) {
    if (entry.status !== '??') continue
    if (isSensitivePath(entry.file)) failures.push(`Sensitive untracked path is visible to git: ${entry.file}`)
  }
}

function checkIgnoredLocalPackWorkspace() {
  const result = git(['check-ignore', '-q', '.demo-packs'])
  if (result.status !== 0) failures.push('.demo-packs/ is not ignored by git')
}

run('npm', ['run', 'validate:demo-runtime'], 'Demo runtime validation')
run('npm', ['run', 'security:scan'], 'Secret scan')

const files = trackedFiles()
checkTrackedPaths(files)
checkTrackedContent(files)
checkVisibleUntracked(statusFiles())
checkIgnoredLocalPackWorkspace()

if (failures.length) {
  console.error('\nPublic readiness check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('\nPublic readiness check passed.')
