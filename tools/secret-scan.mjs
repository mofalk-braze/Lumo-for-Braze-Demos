#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const excludedDirs = new Set([
  '.git',
  '.gradle',
  '.idea',
  '.demo-launcher',
  'build',
  'DerivedData',
  'dist',
  'node_modules',
  'Braze Design System (Collaborative)',
])
const excludedFiles = new Set([
  'package-lock.json',
  'web-template/package-lock.json',
])
const allowedSecretTemplates = new Set([
  'android-shell/local.properties.example',
  'ios-shell/Config.example.swift',
])
const allowedClientConfigFiles = new Set([
  'android-shell/app/google-services.json',
])
const ignoredCredentialPatterns = [
  /^android-shell\/local\.properties$/,
  /^android-shell\/local\.properties\.backup\./,
  /^demo-packs\/[^/]+\/secrets\.properties$/,
  /^ios-shell\/Sources\/Config\.swift$/,
  /^\.env(?:\..*)?$/,
]

const detectors = [
  {
    name: 'Private key material',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/,
  },
  {
    name: 'Google service account private key',
    pattern: /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/,
  },
  {
    name: 'Bearer token',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/,
  },
  {
    name: 'Braze REST API key assignment',
    pattern: /\b(?:braze\.restApiKey|BRAZE_REST_API_KEY(?:_[A-Z0-9_]+)?)\s*[:=]\s*["']?[A-Za-z0-9._-]{20,}/,
  },
  {
    name: 'SDK/API key assignment',
    pattern: /\b(?:apiKey|api_key|braze\.apiKey|firebase\.senderId)\s*[:=]\s*["']?[A-Za-z0-9._:-]{20,}/i,
  },
  {
    name: 'Committed credential file',
    pattern: /\b(?:google-services\.json|secrets\.properties|Config\.swift|\.mobileprovision|\.p8|\.p12|\.jks|\.keystore)\b/,
    fileNameOnly: true,
  },
]

function commandExists(command) {
  return spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' }).status === 0
}

function runExternalScanner() {
  if (commandExists('gitleaks')) {
    const result = spawnSync('gitleaks', ['detect', '--source', repoRoot, '--no-banner', '--redact'], {
      stdio: 'inherit',
    })
    return result.status || 0
  }
  if (commandExists('trufflehog')) {
    const result = spawnSync('trufflehog', ['filesystem', repoRoot, '--no-update'], {
      stdio: 'inherit',
    })
    return result.status || 0
  }
  console.warn('No gitleaks or trufflehog found; running built-in lightweight secret scan.')
  return 0
}

function relative(file) {
  return path.relative(repoRoot, file)
}

function shouldSkipDir(dir) {
  const base = path.basename(dir)
  if (excludedDirs.has(base)) return true
  return relative(dir).split(path.sep).some((part) => excludedDirs.has(part))
}

function shouldScanFile(file) {
  const rel = relative(file)
  if (rel === 'tools/secret-scan.mjs') return false
  if (ignoredCredentialPatterns.some((pattern) => pattern.test(rel))) return false
  if (excludedFiles.has(rel)) return false
  if (allowedClientConfigFiles.has(rel)) return true
  if (allowedSecretTemplates.has(rel)) return true
  if (rel.endsWith('.png') || rel.endsWith('.jpg') || rel.endsWith('.jpeg') || rel.endsWith('.webp')) return false
  if (rel.endsWith('.gif') || rel.endsWith('.pdf') || rel.endsWith('.zip') || rel.endsWith('.jar')) return false
  return true
}

function walk(dir, out = []) {
  if (shouldSkipDir(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file, out)
    else if (entry.isFile() && shouldScanFile(file)) out.push(file)
  }
  return out
}

function scanFiles() {
  const findings = []
  for (const file of walk(repoRoot)) {
    const rel = relative(file)
    if (!allowedSecretTemplates.has(rel) && !allowedClientConfigFiles.has(rel)) {
      for (const detector of detectors.filter((item) => item.fileNameOnly)) {
        if (detector.pattern.test(rel)) {
          findings.push({ file: rel, detector: detector.name, line: 1 })
        }
      }
    }
    let text = ''
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const lines = text.split(/\r?\n/)
    lines.forEach((line, index) => {
      for (const detector of detectors.filter((item) => !item.fileNameOnly)) {
        if (allowedClientConfigFiles.has(rel) && detector.name === 'SDK/API key assignment') continue
        if (detector.pattern.test(line)) {
          if (/BuildConfig\.|process\.env|secrets\[|placeholder/i.test(line)) continue
          if (allowedSecretTemplates.has(rel) && /=$|=""|=''|YOUR_|REPLACE_|example|placeholder/i.test(line)) continue
          findings.push({ file: rel, detector: detector.name, line: index + 1 })
        }
      }
    })
  }
  return findings
}

const externalStatus = runExternalScanner()
if (externalStatus !== 0) process.exit(externalStatus)

const findings = scanFiles()
if (findings.length) {
  console.error('Potential secrets found:')
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.detector}`)
  }
  process.exit(1)
}

console.log('Secret scan passed.')
