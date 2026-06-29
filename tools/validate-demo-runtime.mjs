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
  const files = [syncPath, bridgePath, providerPath, androidBridgePath, androidMainPath, iosBridgePath, iosManagerPath, iosAppDelegatePath, controlRoomPath]

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
  requirePattern('Android FCM failure telemetry', androidMain, /label = "FCM token failed"/)
  requirePattern('Android runtime push token presence', androidMain, /\.put\("pushTokenPresent", !currentFcmToken\.isNullOrBlank\(\)\)/)
  requirePattern('Android runtime Content Card count', androidMain, /\.put\("contentCardCount", lastContentCardCount\)/)

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

  requirePattern('Control Room custom REST label', controlRoom, /Custom REST Control/)
  requirePattern('Control Room Lucide initialization', controlRoom, /lucide@0\.460\.0\/dist\/umd\/lucide\.min\.js/)
  requirePattern('Control Room shared button helper', controlRoom, /function buttonHtml\(\{ id = '', kind = 'ghost', size = '', icon = '', label = '', attrs = '' \} = \{\}\)/)
  requirePattern('Control Room icon refresh helper', controlRoom, /function refreshIcons\(\)/)
  requirePattern('Control Room launch button label', controlRoom, /label: 'Launch'/)
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
