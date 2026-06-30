#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  activePackMarkerPath,
  androidLocalPropertiesPath,
  demoConfigHash,
  generatedConfigPath,
  generatedRuntimeManifestPath,
  getActivePackId,
  getDemoPack,
  iosConfigPath,
  listDemoPacks,
  packWebDistDir,
  readProperties,
  repoRoot,
  webTemplateDir,
} from './demo-pack-utils.mjs'

const failures = []
const warnings = []
const androidGoogleServicesPath = path.join(repoRoot, 'android-shell/app/google-services.json')
const expectedFirebaseProjectId = 'braze-sc-demo-shell'
const expectedAndroidPackageName = 'com.braze.demoshell'

function fail(message) {
  failures.push(message)
}

function warn(message) {
  warnings.push(message)
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual || '(empty)'}`)
}

function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

function requirePattern(label, source, pattern) {
  if (!pattern.test(source)) fail(`${label}: missing ${pattern}`)
}

function validateBridgeSyncContract() {
  const syncPath = path.join(webTemplateDir, 'src/braze/sync.ts')
  const bridgePath = path.join(webTemplateDir, 'src/braze/bridge.ts')
  const providerPath = path.join(webTemplateDir, 'src/braze/BrazeBridgeProvider.tsx')
  const androidBridgePath = path.join(repoRoot, 'android-shell/app/src/main/java/com/braze/demoshell/BrazeDemoBridge.kt')
  const androidMainPath = path.join(repoRoot, 'android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt')
  const iosBridgePath = path.join(repoRoot, 'ios-shell/Sources/WebViewController.swift')
  const iosManagerPath = path.join(repoRoot, 'ios-shell/Sources/BrazeManager.swift')
  const iosAppDelegatePath = path.join(repoRoot, 'ios-shell/Sources/AppDelegate.swift')
  const controlRoomPath = path.join(repoRoot, 'tools/control-room-template.mjs')
  const launcherPath = path.join(repoRoot, 'tools/demo-launcher.mjs')
  const androidRunEmulatorPath = path.join(repoRoot, 'android-shell/tools/run-demo-emulator.sh')
  const androidInstallCaPath = path.join(repoRoot, 'android-shell/tools/install-zscaler-system-ca.sh')
  const androidProvisionAvdPath = path.join(repoRoot, 'android-shell/tools/provision-demo-avd.sh')
  const files = [syncPath, bridgePath, providerPath, androidBridgePath, androidMainPath, iosBridgePath, iosManagerPath, iosAppDelegatePath, controlRoomPath, launcherPath, androidRunEmulatorPath, androidInstallCaPath, androidProvisionAvdPath]

  for (const file of files) {
    if (!fs.existsSync(file)) {
      fail(`Bridge sync contract file missing: ${path.relative(repoRoot, file)}`)
      return
    }
  }

  const sync = readText(syncPath)
  const bridge = readText(bridgePath)
  const provider = readText(providerPath)
  const androidBridge = readText(androidBridgePath)
  const androidMain = readText(androidMainPath)
  const iosBridge = readText(iosBridgePath)
  const iosManager = readText(iosManagerPath)
  const iosAppDelegate = readText(iosAppDelegatePath)
  const controlRoom = readText(controlRoomPath)
  const launcher = readText(launcherPath)
  const androidRunEmulator = readText(androidRunEmulatorPath)
  const androidInstallCa = readText(androidInstallCaPath)
  const androidProvisionAvd = readText(androidProvisionAvdPath)

  requirePattern('Web sync protocol', sync, /SYNC_PROTOCOL\s*=\s*'braze-demo-sync\/v1'/)
  requirePattern('Web sync trims identity', sync, /String\(value \?\? ''\)\.trim\(\)/)
  requirePattern('Web sync dedupes identity', sync, /lastOutboundSig/)
  requirePattern('Web sync observes native identity', sync, /observeNativeIdentity/)
  requirePattern('Native bridge webReady sync envelope', bridge, /post\('webReady', \{ sync: identitySync\.envelope\('default'\) \}\)/)
  requirePattern('Native bridge changeUser sync payload', bridge, /post\('changeUser', \{ externalId, sync \}\)/)
  requirePattern('Harness bridge identity sync state', bridge, /createIdentitySyncState\(\)/)
  requirePattern('Provider remains bridge identity owner', provider, /bridge\.changeUser\(id\)/)

  const bridgeDir = path.join(webTemplateDir, 'src')
  const directBridgeIdentityHits = []
  for (const file of walkFiles(bridgeDir, ['.ts', '.tsx'])) {
    const rel = path.relative(repoRoot, file)
    if (file === providerPath) continue
    const source = readText(file)
    const lines = source.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (/bridge\.changeUser\s*\(/.test(line)) directBridgeIdentityHits.push(`${rel}:${index + 1}`)
    })
  }
  if (directBridgeIdentityHits.length) {
    fail(`Direct bridge.changeUser calls outside BrazeBridgeProvider: ${directBridgeIdentityHits.join(', ')}`)
  }

  for (const [label, source] of [
    ['web-template/src/braze/sync.ts', sync],
    ['web-template/src/braze/bridge.ts', bridge],
    ['web-template/src/braze/BrazeBridgeProvider.tsx', provider],
    ['android-shell bridge/main', `${androidBridge}\n${androidMain}`],
    ['ios-shell bridge/manager', `${iosBridge}\n${iosManager}`],
  ]) {
    if (/\.toLowerCase\s*\(|\.lowercased\s*\(/.test(source)) {
      fail(`${label}: identity sync path must not lowercase external IDs`)
    }
  }

  requirePattern('Android webReady sync handling', androidBridge, /handleWebReady\(payload\.optJSONObject\("sync"\)\)/)
  requirePattern('Android changeUser sync handling', androidBridge, /changeUser\(id, payload\.optJSONObject\("sync"\)\)/)
  requirePattern('Android sync envelope', androidMain, /private fun syncEnvelope\(authority: String, reason: String\): JSONObject/)
  requirePattern('Android command sync', androidMain, /val commandSync = syncEnvelope\(authority = "control_room", reason = "command"\)/)
  requirePattern('Android command avoids changeUser double write', androidMain, /if \(externalId\.isNotBlank\(\) && action != "changeUser"\)/)
  requirePattern('Android connection includes sync', androidMain, /\.put\("sync", sync \?: syncEnvelope\(authority = "native", reason = "default"\)\)/)
  requirePattern('Android runtime includes hash', androidMain, /\.put\("configHash", BuildConfig\.DEMO_CONFIG_HASH\)/)
  requirePattern('Android launch notification prompt', androidMain, /maybeRequestNotificationsOnLaunch\(\)/)
  requirePattern('Android IAM manager registration', androidMain, /BrazeInAppMessageManager\.getInstance\(\)\.registerInAppMessageManager\(this\)/)
  requirePattern('Android FCM failure telemetry', androidMain, /label = if \(retry\) "FCM token retry scheduled" else "FCM token failed"/)
  requirePattern('Android FCM retry backoff', androidMain, /FCM_TOKEN_RETRY_DELAYS_MS/)
  requirePattern('Android push readiness command', androidMain, /"requestPushReadiness" -> refreshPushReadiness/)
  requirePattern('Android trust diagnostics command', androidMain, /"requestTrustDiagnostics" -> refreshTrustDiagnostics/)
  requirePattern('Android HTTPS trust diagnostics telemetry', androidMain, /type = "trust_diagnostics"/)
  requirePattern('Android runtime push token presence', androidMain, /\.put\("pushTokenPresent", !currentFcmToken\.isNullOrBlank\(\)\)/)
  requirePattern('Android runtime trust readiness', androidMain, /\.put\("trustReady", lastTrustDiagnostics\?\.optBoolean\("ready"\) \?: false\)/)
  requirePattern('Android runtime Content Card count', androidMain, /\.put\("contentCardCount", lastContentCardCount\)/)
  requirePattern('Android CA installer root preflight', androidInstallCa, /require_adb_root\(\) \{/)
  requirePattern('Android CA installer system verification', androidInstallCa, /verify_remote_cert "\$REMOTE" "system CA install"/)
  requirePattern('Android CA installer Conscrypt verification', androidInstallCa, /verify_remote_cert "\$APEX_CERT_DIR\/\$HASH\.0" "Conscrypt APEX CA bind mount"/)
  requirePattern('Android CA installer host-side HTTPS proof', androidInstallCa, /run_https_smoke_checks/)
  requirePattern('Android CA installer app_process probe', androidInstallCa, /app_process \/system\/bin TrustSmoke/)
  requirePattern('Android demo AVD provisioner default', androidProvisionAvd, /Braze_Demo_API_36/)
  requirePattern('Android demo AVD Pixel 10 Pro profile', androidProvisionAvd, /DEVICE="\$\{DEVICE:-pixel_10_pro\}"/)
  requirePattern('Android demo AVD Android 36.1 image', androidProvisionAvd, /API_LEVEL="\$\{API_LEVEL:-36\.1\}"/)
  requirePattern('Android demo AVD explicit recreation guard', androidProvisionAvd, /RECREATE_AVD/)
  requirePattern('Android demo AVD uses Google APIs image', androidProvisionAvd, /system-images;android-\$API_LEVEL;google_apis;\$ABI/)
  requirePattern('Android demo AVD rejects Play Store images', androidProvisionAvd, /Refusing Google Play image/)
  requirePattern('Android emulator wrapper default AVD', androidRunEmulator, /BRAZE_DEMO_ANDROID_AVD:-Braze_Demo_API_36/)
  requirePattern('Android emulator trust fail-fast remediation', androidRunEmulator, /print_trust_remediation\(\)/)
  requirePattern('Android emulator trust fail-fast exit', androidRunEmulator, /install-zscaler-system-ca\.sh"; then[\s\S]*exit 1/)
  if (/continuing without emulator system trust/.test(androidRunEmulator)) {
    fail('Android emulator wrapper must not continue after Zscaler CA install failure')
  }

  requirePattern('iOS sync envelope', iosManager, /func syncEnvelope\(authority: String, reason: String\) -> \[String: Any\]/)
  requirePattern('iOS identity dedupe', iosManager, /lastIdentitySyncSignature/)
  requirePattern('iOS command sync', iosBridge, /let commandSync = BrazeManager\.shared\.syncEnvelope\(authority: "control_room", reason: "command"\)/)
  requirePattern('iOS command avoids changeUser double write', iosBridge, /if !externalId\.isEmpty && action != "changeUser"/)
  requirePattern('iOS connection includes sync', iosBridge, /"sync": braze\.syncEnvelope\(authority: "native", reason: "default"\)/)
  requirePattern('iOS runtime includes hash', iosManager, /"configHash": Config\.demoConfigHash/)
  requirePattern('iOS launch notification prompt', iosAppDelegate, /requestNotificationsOnLaunch\(application\)/)
  requirePattern('iOS APNs token telemetry', iosAppDelegate, /type: "apns_token"/)
  requirePattern('iOS runtime push token presence', iosManager, /"pushTokenPresent": UserDefaults\.standard\.bool\(forKey: "braze\.demo\.ios\.apnsTokenRegistered"\)/)
  requirePattern('iOS push permission bridge telemetry', iosBridge, /reportPushStatus\(reason: "webReady"\)/)
  requirePattern('iOS push readiness command', iosBridge, /case "requestPushReadiness":/)
  requirePattern('iOS APNs readiness telemetry', iosBridge, /APNs token registration requested/)

  requirePattern('Control Room REST cockpit', controlRoom, /Custom REST Control/)
  requirePattern('Control Room Lucide initialization', controlRoom, /lucide@0\.460\.0\/dist\/umd\/lucide\.min\.js/)
  requirePattern('Control Room shared button helper', controlRoom, /function buttonHtml\(\{ id = '', kind = 'ghost', size = '', icon = '', label = '', attrs = '' \} = \{\}\)/)
  requirePattern('Control Room icon refresh helper', controlRoom, /function refreshIcons\(\)/)
  requirePattern('Control Room launch button label', controlRoom, /label: 'Launch'/)
  requirePattern('Control Room runtime blocker', controlRoom, /const runtimeBlockReason = \(\) =>/)
  requirePattern('Control Room push blocker', controlRoom, /const pushReadinessReason = \(\) =>/)
  requirePattern('Control Room trust blocker', controlRoom, /const trustDiagnosticsReason = \(\) =>/)
  requirePattern('Control Room push metadata', controlRoom, /builderRequiresPushToken/)
  requirePattern('Launcher push readiness state', launcher, /pushReadinessKey\(platform, deviceId, externalId\)/)
  requirePattern('Launcher trust diagnostics state', launcher, /trustDiagnosticsKey\(platform, deviceId, externalId\)/)
  requirePattern('Launcher applies push readiness after identity', launcher, /requestPushReadiness', externalId, payload: \{ reason: 'identity_apply' \}/)
  requirePattern('Launcher applies trust diagnostics after identity', launcher, /requestTrustDiagnostics', externalId, payload: \{ reason: 'identity_apply' \}/)
  requirePattern('Launcher default Android AVD', launcher, /defaultAndroidAvd = process\.env\.BRAZE_DEMO_ANDROID_AVD \|\| 'Braze_Demo_API_36'/)
  requirePattern('Launcher waits for Android trust telemetry', launcher, /waitForAndroidTrustDiagnostics/)
  if (/Pixel_10_Pro_v36/.test(controlRoom)) {
    fail('Control Room must not hardcode Pixel_10_Pro_v36 as the Android launch target')
  }
  requirePattern('Control Room stage button label', controlRoom, /label: 'Stage'/)
  requirePattern('Control Room present button label', controlRoom, /label: 'Present'/)
  requirePattern('Control Room save config button label', controlRoom, /label: 'Save config'/)
  requirePattern('Control Room cockpit REST stage button', controlRoom, /id: 'cockpitRestStage'/)
  requirePattern('Control Room custom REST shared payload helper', controlRoom, /function customRestPayload\(prefix = 'customRest'\)/)
  requirePattern('Control Room custom REST execution', controlRoom, /actionType: 'braze_rest_request'/)
  requirePattern('Control Room custom REST staging', controlRoom, /type: 'braze_rest_request'/)
  requirePattern('Control Room full-height Activity Feed', controlRoom, /#view-feed #feedActivity \{ flex: 1; max-height: none; min-height: 0; \}/)
}

function walkFiles(dir, extensions) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(file, extensions))
    else if (extensions.includes(path.extname(entry.name))) out.push(file)
  }
  return out
}

function validatePacks() {
  const packs = listDemoPacks()
  if (!packs.length) fail('No demo packs found.')
  const ids = new Set()
  for (const pack of packs) {
    if (ids.has(pack.id)) fail(`Duplicate demo pack id: ${pack.id}`)
    ids.add(pack.id)
    for (const key of ['id', 'name', 'description', 'brand', 'content']) {
      if (!pack[key]) fail(`${pack.id} is missing required field: ${key}`)
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pack.id)) fail(`${pack.id} must be kebab-case`)
  }
}

function validateFirebaseConfig() {
  if (!fs.existsSync(androidGoogleServicesPath)) {
    fail('Missing android-shell/app/google-services.json. Commit the dedicated SolCon Firebase client config.')
    return
  }

  let config
  try {
    config = readJson(androidGoogleServicesPath)
  } catch (error) {
    fail(`android-shell/app/google-services.json is not valid JSON: ${error.message}`)
    return
  }

  const projectId = config.project_info?.project_id || ''
  if (projectId && projectId !== expectedFirebaseProjectId) {
    warn(`android-shell/app/google-services.json uses Firebase project ${projectId}; expected ${expectedFirebaseProjectId}.`)
  }

  const packageNames = (config.client || [])
    .map((client) => client.client_info?.android_client_info?.package_name)
    .filter(Boolean)
  if (!packageNames.includes(expectedAndroidPackageName)) {
    fail(`android-shell/app/google-services.json must contain Android package ${expectedAndroidPackageName}. Found: ${packageNames.join(', ') || '(none)'}`)
  }

  const serviceAccountKeys = JSON.stringify(config).match(/private_key|client_email|service_account/gi)
  if (serviceAccountKeys) {
    fail('android-shell/app/google-services.json appears to contain service-account material. Commit only Firebase client config.')
  }
}

function validateGeneratedRuntime() {
  const activePackId = getActivePackId()
  const activePack = getDemoPack(activePackId)
  const expectedHash = demoConfigHash(activePack)

  if (!fs.existsSync(activePackMarkerPath)) fail('Missing android-shell/.active-demo-pack marker.')
  if (!fs.existsSync(generatedConfigPath)) fail('Missing generated web config. Apply a demo pack first.')
  if (!fs.existsSync(generatedRuntimeManifestPath)) fail('Missing public/demo-runtime.json. Apply a demo pack first.')
  if (failures.length) return

  const generatedConfig = fs.readFileSync(generatedConfigPath, 'utf8')
  const configId = generatedConfig.match(/activeDemoPackId: string = "([^"]+)"/)?.[1]
  const configHash = generatedConfig.match(/"configHash": "([^"]+)"/)?.[1]
  assertEqual('Generated config activeDemoPackId', configId, activePack.id)
  assertEqual('Generated config configHash', configHash, expectedHash)

  const manifest = readJson(generatedRuntimeManifestPath)
  assertEqual('Runtime manifest id', manifest.id, activePack.id)
  assertEqual('Runtime manifest name', manifest.name, activePack.name)
  assertEqual('Runtime manifest configHash', manifest.configHash, expectedHash)
  assertEqual('Runtime manifest browser source', manifest.expectedSources?.browser, 'http://localhost:5173')
  assertEqual('Runtime manifest Android source', manifest.expectedSources?.android, 'file:///android_asset/demo/index.html')
  assertEqual('Runtime manifest iOS source', manifest.expectedSources?.ios, 'http://localhost:5173')

  const localProperties = readProperties(androidLocalPropertiesPath)
  if (Object.keys(localProperties).length) {
    assertEqual('Android seed demo.packId', localProperties['demo.packId'], activePack.id)
    assertEqual('Android seed demo.configHash', localProperties['demo.configHash'], expectedHash)
    assertEqual('Android seed demo.androidUrl', localProperties['demo.androidUrl'], 'file:///android_asset/demo/index.html')
    assertEqual('Android seed demo.webDist', localProperties['demo.webDist'], packWebDistDir(activePack))
  }

  if (fs.existsSync(iosConfigPath)) {
    const iosConfig = fs.readFileSync(iosConfigPath, 'utf8')
    if (iosConfig.includes('http://localhost:5174')) fail('iOS Config.swift still references localhost:5174.')
    if (!iosConfig.includes(`static let demoPackId = "${activePack.id}"`)) {
      fail('iOS Config.swift demoPackId does not match the active pack.')
    }
    if (!iosConfig.includes(`static let demoConfigHash = "${expectedHash}"`)) {
      fail('iOS Config.swift demoConfigHash does not match the active pack.')
    }
  }
}

function validateBuiltOutputs() {
  const runtime = fs.existsSync(generatedRuntimeManifestPath) ? readJson(generatedRuntimeManifestPath) : null
  if (!runtime) return
  const activePack = getDemoPack(runtime.id)
  const activeDistDir = packWebDistDir(activePack)
  if (!fs.existsSync(path.join(activeDistDir, 'index.html'))) {
    fail(`Active web dist is missing index.html: ${activeDistDir}`)
  }

  const distRuntime = path.join(webTemplateDir, 'dist/demo-runtime.json')
  if (!activePack.web?.distDir && fs.existsSync(distRuntime)) {
    const dist = readJson(distRuntime)
    assertEqual('web-template/dist runtime id', dist.id, runtime.id)
    assertEqual('web-template/dist runtime configHash', dist.configHash, runtime.configHash)
  }

  const androidRuntime = path.join(repoRoot, 'android-shell/app/build/generated/assets/demoWeb/demo/demo-runtime.json')
  if (fs.existsSync(androidRuntime)) {
    const android = readJson(androidRuntime)
    assertEqual('Android packaged runtime id', android.id, runtime.id)
    assertEqual('Android packaged runtime configHash', android.configHash, runtime.configHash)
  }

  const oldAndroidIndex = path.join(repoRoot, 'android-shell/app/build/generated/assets/lumoWeb/lumo/index.html')
  if (fs.existsSync(oldAndroidIndex)) {
    warn('Old generated Android lumoWeb assets still exist; they are no longer used and will be ignored.')
  }
}

try {
  validatePacks()
  validateFirebaseConfig()
  validateGeneratedRuntime()
  validateBuiltOutputs()
  validateBridgeSyncContract()
} catch (error) {
  fail(error.stack || String(error))
}

for (const message of warnings) console.warn(`warning: ${message}`)

if (failures.length) {
  for (const message of failures) console.error(`error: ${message}`)
  process.exit(1)
}

console.log('Demo runtime validation passed.')
