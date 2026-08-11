import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const toolsDir = path.dirname(fileURLToPath(import.meta.url))
const runner = path.join(toolsDir, 'run-demo-emulator.sh')
const timeGuardRunner = path.join(toolsDir, 'ensure-time-sync-guard.sh')
const detachedEmulatorStarter = path.join(toolsDir, 'start-demo-emulator.mjs')

function writeExecutable(file, body) {
  fs.writeFileSync(file, body, { mode: 0o755 })
}

function createHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumo-emulator-runner-'))
  const adb = path.join(root, 'adb')
  const emulator = path.join(root, 'emulator')
  const log = path.join(root, 'adb.log')
  const trustLog = path.join(root, 'trust.log')
  const timeGuardLog = path.join(root, 'time-guard.log')
  const settingsFile = path.join(root, 'settings.state')
  const apk = path.join(root, 'app-debug.apk')
  const security = path.join(root, 'security')
  const trustInstaller = path.join(root, 'trust-installer')
  const timeGuard = path.join(root, 'time-guard')
  fs.writeFileSync(apk, 'fake apk')
  writeExecutable(adb, `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "-s" ]]; then shift 2; fi
printf '%s\\n' "$*" >>"$FAKE_ADB_LOG"
case "\${1:-} \${2:-} \${3:-}" in
  "start-server  ") exit 0 ;;
  "devices  ") printf 'List of devices attached\\n%b' "$FAKE_ADB_DEVICES" ;;
  "emu avd name") printf '%s\\nOK\\n' "$FAKE_AVD_NAME" ;;
  "wait-for-device  ") exit 0 ;;
  "shell getprop sys.boot_completed") printf '1\\n' ;;
  "shell dumpsys lock_settings") printf 'Current lock settings service state:\\n  CredentialType: %s\\n' "$FAKE_CREDENTIAL_TYPE" ;;
  "shell locksettings get-disabled") printf '%s\\n' "$FAKE_LOCKSCREEN_DISABLED" ;;
  "shell locksettings set-disabled") printf 'false\\n' ;;
  "shell settings put")
    namespace="\${4:-}"
    key="\${5:-}"
    value="\${6:-}"
    if [[ "\${FAKE_NOTIFICATION_SETTINGS_VERIFY:-ok}" == "fail" && "$key" == "lock_screen_show_silent_notifications" ]]; then
      value="0"
    fi
    if [[ "\${FAKE_TAP_SETTING_MODE:-expected}" == "fail" && "$namespace/$key" == "secure/double_tap_to_wake" ]]; then
      value="0"
    fi
    printf '%s=%s\\n' "$namespace/$key" "$value" >>"$FAKE_SETTINGS_FILE"
    ;;
  "shell settings get")
    namespace="\${4:-}"
    key="\${5:-}"
    value="$(awk -F= -v wanted="$namespace/$key" '$1 == wanted { value=$2 } END { print value }' "$FAKE_SETTINGS_FILE" 2>/dev/null || true)"
    printf '%s\\n' "\${value:-null}"
    ;;
  "shell dumpsys user") printf 'UserInfo{0:Owner:13} running\\n  State: RUNNING_UNLOCKED\\n' ;;
  "shell pm path") printf 'package:/data/app/fake/base.apk\\n' ;;
  "shell input keyevent"|"shell input swipe"|"shell wm dismiss-keyguard"|"shell am force-stop") exit 0 ;;
  "uninstall com.braze.demoshell ") printf 'Success\\n' ;;
  "install -r "*) printf 'Success\\n' ;;
  *) exit 0 ;;
esac
`)
  writeExecutable(emulator, '#!/usr/bin/env bash\nexit 0\n')
  writeExecutable(security, '#!/usr/bin/env bash\nexit 0\n')
  writeExecutable(trustInstaller, `#!/usr/bin/env bash
set -euo pipefail
printf 'repair=%s args=%s\\n' "\${TRUST_REPAIR:-0}" "$*" >>"$FAKE_TRUST_LOG"
if [[ "\${1:-}" == "--probe-only" ]]; then
  case "$FAKE_TRUST_STATE" in
    healthy) exit 0 ;;
    conscrypt_missing)
      echo 'Error: Android trust is not ready (system=1 conscrypt=0).' >&2
      exit 1
      ;;
    system_missing)
      echo 'Error: Android trust is not ready (system=0 conscrypt=0).' >&2
      exit 1
      ;;
    smoke_failure)
      echo 'Error: Trust files are present but HTTPS proof failed.' >&2
      exit 1
      ;;
  esac
fi
exit 0
`)
  writeExecutable(timeGuard, `#!/usr/bin/env bash
set -euo pipefail
printf 'serial=%s args=%s\n' "\${ANDROID_SERIAL:-}" "$*" >>"$FAKE_TIME_GUARD_LOG"
`)
  return { root, adb, emulator, log, trustLog, timeGuardLog, settingsFile, trustInstaller, timeGuard, apk }
}

function runHarness(harness, overrides = {}) {
  return spawnSync('bash', [runner], {
    cwd: path.dirname(toolsDir),
    encoding: 'utf8',
    env: {
      ...process.env,
      ADB: harness.adb,
      EMULATOR: harness.emulator,
      PATH: `${harness.root}:${process.env.PATH}`,
      AVD: 'Braze_Demo_API_36',
      APP_ID: 'com.braze.demoshell',
      ANDROID_USER: '0',
      INSTALL_APP: '0',
      APK_PATH: harness.apk,
      LAUNCH_APP: '0',
      RESET_APP_DATA: '0',
      TRUST_MODE: 'skip',
      TIME_SYNC_GUARD: '0',
      BRAZE_DEMO_ANDROID_BOOT_TIMEOUT_SECONDS: '2',
      FAKE_ADB_LOG: harness.log,
      FAKE_TRUST_LOG: harness.trustLog,
      FAKE_TRUST_STATE: 'healthy',
      FAKE_CREDENTIAL_TYPE: 'NONE',
      FAKE_LOCKSCREEN_DISABLED: 'false',
      FAKE_ADB_DEVICES: 'emulator-5554\\tdevice\\n',
      FAKE_AVD_NAME: 'Braze_Demo_API_36',
      TRUST_INSTALLER: harness.trustInstaller,
      TIME_SYNC_GUARD_SCRIPT: harness.timeGuard,
      FAKE_TIME_GUARD_LOG: harness.timeGuardLog,
      FAKE_SETTINGS_FILE: harness.settingsFile,
      ...overrides,
    },
  })
}

function adbLog(harness) {
  return fs.existsSync(harness.log) ? fs.readFileSync(harness.log, 'utf8') : ''
}

function trustLog(harness) {
  return fs.existsSync(harness.trustLog) ? fs.readFileSync(harness.trustLog, 'utf8') : ''
}

function timeGuardLog(harness) {
  return fs.existsSync(harness.timeGuardLog) ? fs.readFileSync(harness.timeGuardLog, 'utf8') : ''
}

function unlockValidationCount(harness) {
  return (adbLog(harness).match(/^shell dumpsys lock_settings$/gm) || []).length
}

test('rejects RESET_APP_DATA when installation is disabled before touching adb', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, { RESET_APP_DATA: '1', INSTALL_APP: '0' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /RESET_APP_DATA=1 requires INSTALL_APP=1/)
    assert.equal(adbLog(harness), '')
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('fails closed before quiesce for multiple connected Android devices', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, {
      FAKE_ADB_DEVICES: 'emulator-5554\\tdevice\\nemulator-5556\\tdevice\\n',
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Expected exactly one Android device/)
    assert.doesNotMatch(adbLog(harness), /shell am force-stop|^install |^uninstall /m)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('fails closed before quiesce for an offline Android transport', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, { FAKE_ADB_DEVICES: 'emulator-5554\\toffline\\n' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /is offline, not ready/)
    assert.doesNotMatch(adbLog(harness), /shell am force-stop|^install |^uninstall /m)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('fails closed before quiesce when the connected emulator runs the wrong AVD', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, { FAKE_AVD_NAME: 'Wrong_Demo_AVD' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /runs AVD 'Wrong_Demo_AVD'/)
    assert.doesNotMatch(adbLog(harness), /shell am force-stop|^install |^uninstall /m)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('fails closed for a secure credential even when the Android user is unlocked', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, { FAKE_CREDENTIAL_TYPE: 'PASSWORD' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /secure screen credential \(PASSWORD\)/)
    const log = adbLog(harness)
    assert.doesNotMatch(log, /^install |^uninstall |shell am start|input text/m)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('accepts CredentialType NONE with keyguard enabled for Swipe', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness)
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.match(result.stdout, /Ready\. launchMode=warm/)
    assert.doesNotMatch(adbLog(harness), /^install |^uninstall /m)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('migrates and verifies lock-screen notifications as shown private silent and nonminimal', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness)
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const log = adbLog(harness)
    for (const [key, value] of [
      ['lock_screen_show_notifications', '1'],
      ['lock_screen_allow_private_notifications', '1'],
      ['lock_screen_show_silent_notifications', '1'],
      ['lock_screen_notification_minimalism', '0'],
    ]) {
      assert.match(log, new RegExp(`^shell settings put secure ${key} ${value}$`, 'm'))
      assert.match(log, new RegExp(`^shell settings get secure ${key}$`, 'm'))
    }
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('fails closed when a lock-screen notification setting cannot be verified', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, { FAKE_NOTIFICATION_SETTINGS_VERIFY: 'fail' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /lock_screen_show_silent_notifications remained '0'/)
    assert.doesNotMatch(adbLog(harness), /^install |shell am start/m)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('migrates unset expected-AVD secure tap-to-wake settings and verifies stored state', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness)
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const log = adbLog(harness)
    assert.match(log, /^shell settings get secure double_tap_to_wake$/m)
    assert.match(log, /^shell settings put secure double_tap_to_wake 1$/m)
    assert.ok(
      log.indexOf('shell settings get secure double_tap_to_wake') <
        log.indexOf('shell settings put secure double_tap_to_wake 1'),
    )
    assert.match(log, /^shell settings get secure doze_pulse_on_double_tap$/m)
    assert.match(log, /^shell settings put secure doze_pulse_on_double_tap 1$/m)
    assert.match(log, /^shell settings put secure doze_tap_gesture 1$/m)
    assert.match(log, /^shell settings get system double_tap_to_wake$/m)
    assert.doesNotMatch(log, /^shell settings put system double_tap_to_wake/m)
    assert.match(result.stdout, /system\/double_tap_to_wake compatibility key is unset/)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('fails closed when an exposed tap-to-wake setting cannot be enabled', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, { FAKE_TAP_SETTING_MODE: 'fail' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /tap-to-wake setting secure\/double_tap_to_wake remained '0'/)
    assert.doesNotMatch(adbLog(harness), /^install |shell am start/m)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('emulator wrapper performs one foreground clock check and never starts a detached watcher', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, { TIME_SYNC_GUARD: '1' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(timeGuardLog(harness), 'serial=emulator-5554 args=--once emulator-5554\n')
    assert.match(result.stdout, /Continuous Android clock coverage is launcher-owned and is not detached/)
    assert.doesNotMatch(timeGuardLog(harness), /--watch/)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('time guard helper keeps one-shot foreground and reserves watch mode for its launcher parent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumo-time-guard-'))
  const fakeSync = path.join(root, 'sync-time')
  const log = path.join(root, 'sync.log')
  writeExecutable(fakeSync, `#!/usr/bin/env bash
set -euo pipefail
printf 'serial=%s args=%s\n' "\${ANDROID_SERIAL:-}" "$*" >>"$FAKE_SYNC_LOG"
`)
  const baseEnv = {
    ...process.env,
    TIME_SYNC_SCRIPT: fakeSync,
    FAKE_SYNC_LOG: log,
    ADB: '/fake/adb',
  }
  try {
    const once = spawnSync('bash', [timeGuardRunner, '--once', 'emulator-5554'], {
      encoding: 'utf8',
      env: baseEnv,
    })
    assert.equal(once.status, 0, once.stderr || once.stdout)

    const unowned = spawnSync('bash', [timeGuardRunner, '--watch-owned', 'emulator-5554'], {
      encoding: 'utf8',
      env: baseEnv,
    })
    assert.notEqual(unowned.status, 0)
    assert.match(unowned.stderr, /must be spawned and owned by the launcher authority/)

    const owned = spawnSync('bash', [timeGuardRunner, '--watch-owned', 'emulator-5554'], {
      encoding: 'utf8',
      env: {
        ...baseEnv,
        BRAZE_DEMO_LAUNCHER_OWNER_PID: String(process.pid),
        BRAZE_DEMO_LAUNCHER_INSTANCE_ID: 'launcher-test',
      },
    })
    assert.equal(owned.status, 0, owned.stderr || owned.stdout)
    assert.equal(
      fs.readFileSync(log, 'utf8'),
      'serial=emulator-5554 args=\nserial=emulator-5554 args=--watch\n',
    )
    const helperSource = fs.readFileSync(timeGuardRunner, 'utf8')
    assert.doesNotMatch(helperSource, /\bnohup\b|PID_FILE|pgrep/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('detached emulator starter leaves the emulator alive after the starter exits', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumo-detached-emulator-'))
  const childScript = path.join(root, 'fake-emulator.mjs')
  const marker = path.join(root, 'started')
  const log = path.join(root, 'emulator.log')
  const pidFile = path.join(root, 'emulator.pid')
  fs.writeFileSync(childScript, `
import fs from 'node:fs'
fs.writeFileSync(process.argv[2], String(process.pid))
console.log('fake emulator ready')
setInterval(() => {}, 1_000)
`)
  let childPid = null
  try {
    const starter = spawnSync(process.execPath, [
      detachedEmulatorStarter,
      '--log', log,
      '--pid-file', pidFile,
      '--', process.execPath, childScript, marker,
    ], { encoding: 'utf8' })
    assert.equal(starter.status, 0, starter.stderr || starter.stdout)
    childPid = Number(fs.readFileSync(pidFile, 'utf8').trim())
    assert.equal(Number(starter.stdout.trim()), childPid)

    const deadline = Date.now() + 2_000
    while (!fs.existsSync(marker) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.equal(Number(fs.readFileSync(marker, 'utf8')), childPid)
    assert.doesNotThrow(() => process.kill(childPid, 0))
    assert.match(fs.readFileSync(log, 'utf8'), /fake emulator ready/)
  } finally {
    if (childPid) {
      try { process.kill(-childPid, 'SIGTERM') } catch {}
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('explicit reset performs one uninstall and one install', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, { RESET_APP_DATA: '1', INSTALL_APP: '1' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const log = adbLog(harness)
    assert.equal((log.match(/^uninstall com\.braze\.demoshell$/gm) || []).length, 1)
    assert.equal((log.match(/^install -r /gm) || []).length, 1)
    assert.doesNotMatch(result.stdout, /while preserving app data/)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('normal APK refresh installs once without uninstalling app data', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, { RESET_APP_DATA: '0', INSTALL_APP: '1' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const log = adbLog(harness)
    assert.equal((log.match(/^install -r /gm) || []).length, 1)
    assert.doesNotMatch(log, /^uninstall /m)
    assert.match(result.stdout, /while preserving app data/)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('auto trust fails closed when the persistent system CA is missing', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, {
      TRUST_MODE: 'auto',
      FAKE_TRUST_STATE: 'system_missing',
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /TRUST_MODE=repair/)
    assert.equal(trustLog(harness), 'repair=0 args=--probe-only\n')
    assert.equal(unlockValidationCount(harness), 1)
    const log = adbLog(harness)
    const forceStopIndex = log.indexOf('shell am force-stop --user 0 com.braze.demoshell')
    const bootValidationIndex = log.indexOf('shell dumpsys lock_settings')
    assert.ok(forceStopIndex >= 0)
    assert.ok(forceStopIndex < bootValidationIndex)
    assert.doesNotMatch(log, /shell am start|\bremount\b|disable-verity/)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('healthy auto trust uses one boot and unlock validation pass', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, {
      TRUST_MODE: 'auto',
      FAKE_TRUST_STATE: 'healthy',
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(trustLog(harness), 'repair=0 args=--probe-only\n')
    assert.equal(unlockValidationCount(harness), 1)
    assert.doesNotMatch(result.stdout, /revalidating boot and Swipe unlock state/)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('auto trust restores only a missing volatile Conscrypt mount', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, {
      TRUST_MODE: 'auto',
      FAKE_TRUST_STATE: 'conscrypt_missing',
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.match(result.stdout, /restoring only the volatile Conscrypt trust mount/)
    assert.match(result.stdout, /revalidating boot and Swipe unlock state/)
    assert.equal(trustLog(harness), 'repair=0 args=--probe-only\nrepair=0 args=\n')
    assert.equal(unlockValidationCount(harness), 2)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})

test('explicit trust repair bypasses auto probing and opts into repair', () => {
  const harness = createHarness()
  try {
    const result = runHarness(harness, { TRUST_MODE: 'repair' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(trustLog(harness), 'repair=1 args=\n')
    assert.match(result.stdout, /revalidating boot and Swipe unlock state/)
    assert.equal(unlockValidationCount(harness), 2)
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true })
  }
})
