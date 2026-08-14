#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const androidHome = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk')
const expectedFirebaseProjectId = 'braze-sc-demo-shell'
const expectedAndroidPackageName = 'com.braze.demoshell'
const defaultAvd = process.env.BRAZE_DEMO_ANDROID_AVD || 'Braze_Demo_API_36'
const allowMissingAvd = process.env.BRAZE_DEMO_DOCTOR_ALLOW_MISSING_AVD === '1'
const doctorTargets = new Set(['all', 'android', 'ios', 'web'])

const checks = []

export function parseDoctorArgs(argv = []) {
  let target = 'all'
  let help = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '-h' || arg === '--help') {
      help = true
    } else if (arg === '--target') {
      const value = argv[++index]
      if (!value) throw new Error('--target requires all, android, ios, or web.')
      target = value
    } else if (arg.startsWith('--target=')) {
      target = arg.slice('--target='.length)
    } else {
      throw new Error(`Unknown doctor option: ${arg}`)
    }
  }
  if (!doctorTargets.has(target)) {
    throw new Error(`Unsupported doctor target '${target}'. Use all, android, ios, or web.`)
  }
  return { target, help }
}

export function targetIncludes(target, capability) {
  return target === 'all' || target === capability
}

function printUsage() {
  console.log(`Usage: node tools/doctor-solcon.mjs [--target all|android|ios|web]\n\n` +
    'Use --target android for an Android-first readiness result that does not require Xcode or iOS tooling.')
}

function run(command, args = [], options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: 'utf8',
    shell: false,
    timeout: options.timeout || 15_000,
  })
}

function commandPath(command) {
  const result = run('/bin/zsh', ['-lc', `command -v ${command}`])
  return result.status === 0 ? result.stdout.trim() : ''
}

function add(status, label, detail = '', remediation = '') {
  checks.push({ status, label, detail, remediation })
}

function pass(label, detail = '') {
  add('pass', label, detail)
}

function warn(label, detail = '', remediation = '') {
  add('warn', label, detail, remediation)
}

function fail(label, detail = '', remediation = '') {
  add('fail', label, detail, remediation)
}

function firstExecutable(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate) && fs.statSync(candidate).mode & 0o111) || ''
}

function findAndroidTool(toolName) {
  return firstExecutable([
    path.join(androidHome, 'cmdline-tools/latest/bin', toolName),
    ...safeGlob(path.join(androidHome, 'cmdline-tools'), toolName),
    `/Applications/Android Studio.app/Contents/plugins/android/resources/commandlinetools/bin/${toolName}`,
  ])
}

function safeGlob(parent, toolName) {
  if (!fs.existsSync(parent)) return []
  return fs.readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parent, entry.name, 'bin', toolName))
}

function parseJavaMajor(text) {
  const version = text.match(/version "([^"]+)"/)?.[1] || ''
  if (!version) return 0
  if (version.startsWith('1.')) return Number(version.split('.')[1] || 0)
  return Number(version.split('.')[0] || 0)
}

function validateFirebaseConfig() {
  const file = path.join(repoRoot, 'android-shell/app/google-services.json')
  if (!fs.existsSync(file)) {
    fail(
      'Firebase client config',
      'android-shell/app/google-services.json is missing.',
      'Commit the dedicated SolCon Firebase client config before sharing the repo.',
    )
    return false
  }
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'))
    const projectId = config.project_info?.project_id || ''
    const packageNames = (config.client || [])
      .map((client) => client.client_info?.android_client_info?.package_name)
      .filter(Boolean)
    if (!packageNames.includes(expectedAndroidPackageName)) {
      fail(
        'Firebase client config',
        `Found packages: ${packageNames.join(', ') || '(none)'}.`,
        `Download google-services.json for Android package ${expectedAndroidPackageName}.`,
      )
      return false
    }
    if (projectId !== expectedFirebaseProjectId) {
      warn(
        'Firebase client config',
        `Project is ${projectId || '(missing)'}, expected ${expectedFirebaseProjectId}.`,
        'Use the dedicated SolCon Firebase project unless this is an intentional fork.',
      )
    } else {
      pass('Firebase client config', `${projectId} / ${expectedAndroidPackageName}`)
    }
    return true
  } catch (error) {
    fail('Firebase client config', error.message, 'Replace android-shell/app/google-services.json with valid Firebase client JSON.')
    return false
  }
}

export function main(argv = process.argv.slice(2)) {
  checks.length = 0
  let options
  try {
    options = parseDoctorArgs(argv)
  } catch (error) {
    console.error(`Error: ${error.message}`)
    printUsage()
    return 2
  }
  if (options.help) {
    printUsage()
    return 0
  }
  const wantsAndroid = targetIncludes(options.target, 'android')
  const wantsIos = targetIncludes(options.target, 'ios')

  const isMac = process.platform === 'darwin'
  const isAppleSilicon = os.arch() === 'arm64'
  if (isMac && isAppleSilicon) pass('Host platform', 'Apple Silicon macOS')
  else fail('Host platform', `${process.platform} ${os.arch()}`, 'The first SolCon bootstrap path supports Apple Silicon macOS.')

  const brew = commandPath('brew')
  if (brew) pass('Homebrew', brew)
  else warn('Homebrew', 'Not found.', 'Install from https://brew.sh, then rerun ./bootstrap-solcon.sh --install.')

  const node = commandPath('node')
  const npm = commandPath('npm')
  if (node && npm) {
    const nodeVersion = run(node, ['--version']).stdout.trim()
    const npmVersion = run(npm, ['--version']).stdout.trim()
    pass('Node/npm', `${nodeVersion}, npm ${npmVersion}`)
  } else {
    fail('Node/npm', 'Missing node or npm.', 'Run ./bootstrap-solcon.sh --install after Homebrew is available.')
  }

  let java = ''
  let javaReady = !wantsAndroid
  if (wantsAndroid) {
    java = commandPath('java')
    if (java) {
      const result = run(java, ['-version'])
      const major = parseJavaMajor(`${result.stdout}\n${result.stderr}`)
      if (major >= 17) {
        javaReady = true
        pass('Java', `Java ${major}`)
      } else {
        fail('Java', `Found Java ${major || 'unknown'}.`, 'Install Java 17: brew install openjdk@17.')
      }
    } else {
      fail('Java', 'Missing java.', 'Install Java 17: brew install openjdk@17.')
    }
  }

  let xcodebuild = ''
  let xcodegen = ''
  let xcrun = ''
  if (wantsIos) {
    const xcodeSelect = run('xcode-select', ['-p'])
    if (xcodeSelect.status === 0) pass('Xcode command line tools', xcodeSelect.stdout.trim())
    else fail('Xcode command line tools', 'Not selected.', 'Run xcode-select --install, then open Xcode once.')

    xcodebuild = commandPath('xcodebuild')
    if (xcodebuild) {
      const firstLaunch = run(xcodebuild, ['-checkFirstLaunchStatus'])
      if (firstLaunch.status === 0) pass('Xcode first launch/license', 'Accepted')
      else warn('Xcode first launch/license', 'Needs attention.', 'Open Xcode once and accept prompts, or run sudo xcodebuild -license accept.')
    } else {
      warn('Xcode', 'xcodebuild not found.', 'Install Xcode from the App Store for iOS shell builds.')
    }

    xcodegen = commandPath('xcodegen')
    if (xcodegen) pass('xcodegen', xcodegen)
    else fail('xcodegen', 'Missing.', 'Run ./bootstrap-solcon.sh --install.')

    xcrun = commandPath('xcrun')
    if (xcrun) {
      const sims = run(xcrun, ['simctl', 'list', 'devices', 'available'], { timeout: 20_000 })
      if (sims.status === 0 && /iPhone/.test(sims.stdout)) pass('iOS simulator runtime', 'Available iPhone simulator found')
      else warn('iOS simulator runtime', 'No available iPhone simulator found.', 'Install an iOS simulator runtime from Xcode Settings > Platforms.')
    }
  }

  let sdkmanager = ''
  let avdmanager = ''
  let adb = ''
  let emulator = ''
  let androidAvdReady = false
  let firebaseReady = true
  if (wantsAndroid) {
    if (fs.existsSync(androidHome)) pass('Android SDK directory', androidHome)
    else fail('Android SDK directory', `${androidHome} not found.`, 'Install Android Studio or set ANDROID_HOME.')

    sdkmanager = findAndroidTool('sdkmanager')
    avdmanager = findAndroidTool('avdmanager')
    adb = firstExecutable([process.env.ADB, path.join(androidHome, 'platform-tools/adb')])
    emulator = firstExecutable([process.env.EMULATOR, path.join(androidHome, 'emulator/emulator')])
    sdkmanager ? pass('sdkmanager', sdkmanager) : fail('sdkmanager', 'Missing.', 'Install Android SDK Command-line Tools in Android Studio.')
    avdmanager ? pass('avdmanager', avdmanager) : fail('avdmanager', 'Missing.', 'Install Android SDK Command-line Tools in Android Studio.')
    adb ? pass('adb', adb) : fail('adb', 'Missing.', 'Install Android SDK Platform Tools.')
    emulator ? pass('Android emulator', emulator) : fail('Android emulator', 'Missing.', 'Install the Android Emulator SDK package.')

    if (emulator) {
      const avds = run(emulator, ['-list-avds'])
      if (avds.status === 0 && avds.stdout.split(/\r?\n/).includes(defaultAvd)) {
        androidAvdReady = true
        pass('Dedicated Android AVD', defaultAvd)
      } else if (options.target === 'android' && !allowMissingAvd) {
        fail('Dedicated Android AVD', `${defaultAvd} not found.`, './bootstrap-solcon.sh --android-avd --target android')
      } else {
        warn('Dedicated Android AVD', `${defaultAvd} not found.`, './bootstrap-solcon.sh --android-avd')
      }
    }

    const zscaler = run('security', ['find-certificate', '-a', '-c', 'Zscaler Root CA', '/Library/Keychains/System.keychain'])
    if (zscaler.status === 0) pass('Zscaler root CA', 'Found in macOS System keychain')
    else warn('Zscaler root CA', 'Not found.', 'Android launch can continue, but corporate TLS interception may break IAM media or FCM.')

    firebaseReady = validateFirebaseConfig()
  }

  const webDeps = fs.existsSync(path.join(repoRoot, 'web-template/node_modules'))
  webDeps ? pass('Web dependencies', 'web-template/node_modules exists') : warn('Web dependencies', 'Not installed yet.', 'Run npm install in web-template, or launch through Control Room after bootstrap.')

  const runtimeGenerated =
    fs.existsSync(path.join(repoRoot, 'web-template/src/brand/activeDemoConfig.generated.ts')) &&
    fs.existsSync(path.join(repoRoot, 'web-template/public/demo-runtime.json'))
  runtimeGenerated ? pass('Generated demo runtime', 'Present') : warn('Generated demo runtime', 'Not present.', 'Run npm run lumo:apply or use the Control Room Apply button.')

  const webReady = Boolean(node && npm)
  const androidReady = Boolean(
    isMac && isAppleSilicon && node && npm && javaReady &&
    sdkmanager && avdmanager && adb && emulator && firebaseReady &&
    (options.target !== 'android' || androidAvdReady)
  )
  const androidPushReady = androidReady
  const iosReady = Boolean(xcodebuild && xcodegen && xcrun)

  console.log(`\nSolCon capability status${options.target === 'all' ? '' : ` (target: ${options.target})`}`)
  console.log(`- Web shell: ${webReady ? 'ready' : 'blocked'}`)
  if (wantsAndroid) {
    console.log(`- Android shell: ${androidReady ? 'ready after pack apply/build' : 'blocked'}`)
    console.log(`- Android push: ${androidPushReady ? 'client config ready; requires local Braze SDK credentials and Braze-side Firebase setup' : 'blocked'}`)
  }
  if (wantsIos) {
    console.log(`- iOS shell: ${iosReady ? 'ready for unsigned simulator builds' : 'blocked'}`)
    console.log('- iOS push: pending Apple Developer team signing / APNs setup')
  }

  console.log('\nChecks')
  for (const check of checks) {
    const mark = check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : 'FAIL'
    console.log(`[${mark}] ${check.label}${check.detail ? ` - ${check.detail}` : ''}`)
    if (check.remediation) console.log(`      ${check.remediation}`)
  }

  return checks.some((check) => check.status === 'fail') ? 1 : 0
}

const isMainModule = Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
if (isMainModule) process.exitCode = main()
