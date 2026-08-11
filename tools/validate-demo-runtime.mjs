#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  activePackMarkerPath,
  androidLocalPropertiesPath,
  directoryFingerprint,
  demoConfigHash,
  demoRuntimeHash,
  generatedConfigPath,
  generatedRuntimeManifestPath,
  getActivePackId,
  getDemoPack,
  iosConfigPath,
  isPortableAssetEntry,
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

function assertRuntimeManifest(label, manifest, expected) {
  assertEqual(`${label} schemaVersion`, manifest.schemaVersion, 2)
  assertEqual(`${label} runtimeHashVersion`, manifest.runtimeHashVersion, 2)
  assertEqual(`${label} id`, manifest.id, expected.id)
  assertEqual(`${label} configHash`, manifest.configHash, expected.configHash)
  assertEqual(`${label} runtimeHash`, manifest.runtimeHash, expected.runtimeHash)
  assertEqual(`${label} browser source`, manifest.expectedSources?.browser, 'http://localhost:5173')
  assertEqual(`${label} Android source`, manifest.expectedSources?.android, 'file:///android_asset/demo/index.html')
  assertEqual(`${label} iOS source`, manifest.expectedSources?.ios, 'http://localhost:5173')
}

function childDirectories(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function assetTreeShape(root) {
  if (!fs.existsSync(root)) return null
  if (!fs.lstatSync(root).isDirectory()) return ['unsupported-root']
  const entries = []
  const walk = (dir, prefix = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })
      .filter((item) => isPortableAssetEntry(item.name))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        entries.push(`directory:${relative}`)
        walk(absolute, relative)
      } else if (entry.isFile()) {
        entries.push(`file:${relative}`)
      } else {
        entries.push(`unsupported:${relative}`)
      }
    }
  }
  walk(root)
  return entries
}

function validateActivePackAssets(label, assetsDir, activePack, { required = false } = {}) {
  if (!fs.existsSync(assetsDir)) {
    if (required) fail(`${label}: missing ${path.relative(repoRoot, assetsDir)}`)
    return
  }
  const directories = childDirectories(assetsDir)
  const inactive = directories.filter((name) => name !== activePack.id)
  if (inactive.length) fail(`${label}: inactive demo pack directories are present: ${inactive.join(', ')}`)

  const sourceAssets = path.join(activePack.directory, 'assets')
  const outputAssets = path.join(assetsDir, activePack.id)
  const sourceExists = fs.existsSync(sourceAssets)
  const outputExists = fs.existsSync(outputAssets)
  if (sourceExists && !outputExists) {
    fail(`${label}: active demo pack asset directory is missing: ${activePack.id}`)
    return
  }
  if (!sourceExists && outputExists) {
    fail(`${label}: unexpected active demo pack asset directory is present: ${activePack.id}`)
    return
  }
  if (!sourceExists) return

  const sourceShape = assetTreeShape(sourceAssets)
  const outputShape = assetTreeShape(outputAssets)
  if (JSON.stringify(sourceShape) !== JSON.stringify(outputShape)) {
    fail(`${label}: asset tree shape differs from the active pack: ${activePack.id}`)
  }
  if (directoryFingerprint(sourceAssets) !== directoryFingerprint(outputAssets)) {
    fail(`${label}: asset bytes differ from the active pack: ${activePack.id}`)
  }
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
  const androidCredentialStorePath = path.join(repoRoot, 'android-shell/app/src/main/java/com/braze/demoshell/CredentialStore.kt')
  const androidManifestContractPath = path.join(repoRoot, 'android-shell/app/src/main/java/com/braze/demoshell/BundledRuntimeManifestContract.kt')
  const androidBuildPath = path.join(repoRoot, 'android-shell/app/build.gradle.kts')
  const androidRenderTrackerPath = path.join(repoRoot, 'android-shell/app/src/main/java/com/braze/demoshell/WebRenderTracker.kt')
  const androidWebReadyIdentityPath = path.join(repoRoot, 'android-shell/app/src/main/java/com/braze/demoshell/WebReadyIdentity.kt')
  const iosBridgePath = path.join(repoRoot, 'ios-shell/Sources/WebViewController.swift')
  const iosManagerPath = path.join(repoRoot, 'ios-shell/Sources/BrazeManager.swift')
  const iosWebReadyIdentityPath = path.join(repoRoot, 'ios-shell/Sources/WebReadyIdentity.swift')
  const iosCredentialStorePath = path.join(repoRoot, 'ios-shell/Sources/CredentialStore.swift')
  const iosAppDelegatePath = path.join(repoRoot, 'ios-shell/Sources/AppDelegate.swift')
  const controlRoomPath = path.join(repoRoot, 'tools/control-room-template.mjs')
  const presenterRemotePath = path.join(repoRoot, 'tools/presenter-remote-template.mjs')
  const launcherPath = path.join(repoRoot, 'tools/demo-launcher.mjs')
  const androidRunEmulatorPath = path.join(repoRoot, 'android-shell/tools/run-demo-emulator.sh')
  const androidStartEmulatorPath = path.join(repoRoot, 'android-shell/tools/start-demo-emulator.mjs')
  const androidInstallCaPath = path.join(repoRoot, 'android-shell/tools/install-zscaler-system-ca.sh')
  const androidProvisionAvdPath = path.join(repoRoot, 'android-shell/tools/provision-demo-avd.sh')
  const files = [syncPath, bridgePath, providerPath, androidBridgePath, androidMainPath, androidCredentialStorePath, androidManifestContractPath, androidBuildPath, androidRenderTrackerPath, androidWebReadyIdentityPath, iosBridgePath, iosManagerPath, iosWebReadyIdentityPath, iosCredentialStorePath, iosAppDelegatePath, controlRoomPath, presenterRemotePath, launcherPath, androidRunEmulatorPath, androidStartEmulatorPath, androidInstallCaPath, androidProvisionAvdPath]

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
  const androidCredentialStore = readText(androidCredentialStorePath)
  const androidManifestContract = readText(androidManifestContractPath)
  const androidBuild = readText(androidBuildPath)
  const androidRenderTracker = readText(androidRenderTrackerPath)
  const androidWebReadyIdentity = readText(androidWebReadyIdentityPath)
  const iosBridge = readText(iosBridgePath)
  const iosManager = readText(iosManagerPath)
  const iosWebReadyIdentity = readText(iosWebReadyIdentityPath)
  const iosCredentialStore = readText(iosCredentialStorePath)
  const iosAppDelegate = readText(iosAppDelegatePath)
  const controlRoom = readText(controlRoomPath)
  const presenterRemote = readText(presenterRemotePath)
  const launcher = readText(launcherPath)
  const androidRunEmulator = readText(androidRunEmulatorPath)
  const androidStartEmulator = readText(androidStartEmulatorPath)
  const androidInstallCa = readText(androidInstallCaPath)
  const androidProvisionAvd = readText(androidProvisionAvdPath)

  requirePattern('Web sync protocol', sync, /SYNC_PROTOCOL\s*=\s*'braze-demo-sync\/v1'/)
  requirePattern('Web sync envelope requires runtime hash', sync, /interface SyncEnvelope \{[\s\S]*?runtimeHash: string/)
  requirePattern('Web sync envelope sends runtime hash', sync, /runtimeHash: activeRuntimeManifest\.runtimeHash/)
  requirePattern('Web sync trims identity', sync, /String\(value \?\? ''\)\.trim\(\)/)
  requirePattern('Web sync dedupes identity', sync, /lastOutboundSig/)
  requirePattern('Web sync observes native identity', sync, /observeNativeIdentity/)
  requirePattern('Native bridge webReady sync envelope', bridge, /sync: identitySync\.envelope\('default'\)/)
  requirePattern('Native bridge webReady source evidence', bridge, /sourceUrl: window\.location\.href/)
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

  requirePattern('Android webReady sync handling', androidBridge, /sync = payload\.optJSONObject\("sync"\)/)
  requirePattern('Android webReady source handling', androidBridge, /sourceUrl = payload\.optString\("sourceUrl"\)/)
  requirePattern('Android changeUser sync handling', androidBridge, /changeUser\(id, payload\.optJSONObject\("sync"\)\)/)
  requirePattern('Android sync envelope', androidMain, /private fun syncEnvelope\(authority: String, reason: String\): JSONObject/)
  requirePattern('Android command sync', androidMain, /val commandSync = syncEnvelope\(authority = "control_room", reason = "command"\)/)
  requirePattern('Android command avoids changeUser double write', androidMain, /if \(externalId\.isNotBlank\(\) && action != "changeUser"\)/)
  requirePattern('Android connection includes sync', androidMain, /\.put\("sync", sync \?: syncEnvelope\(authority = "native", reason = "default"\)\)/)
  requirePattern('Android runtime includes hash', androidMain, /\.put\("configHash", BuildConfig\.DEMO_CONFIG_HASH\)/)
  requirePattern('Android runtime includes runtime hash', androidMain, /\.put\("runtimeHash", BuildConfig\.DEMO_RUNTIME_HASH\)/)
  requirePattern('Android bundled manifest validity state', androidMain, /bundledRuntimeManifestValid/)
  requirePattern('Android bundled manifest requires every expected source', androidManifestContract, /for \(platform in listOf\("browser", "android", "ios"\)\)/)
  requirePattern('Android bundled manifest requires canonical Android URL', androidManifestContract, /expectedSources\.android must be \$CANONICAL_ANDROID_SOURCE/)
  requirePattern('Android Gradle parses packaged runtime JSON', androidBuild, /JsonSlurper\(\)\.parse\(runtimeFile\)/)
  requirePattern('Android Gradle requires every expected source', androidBuild, /for \(platform in listOf\("browser", "android", "ios"\)\)/)
  requirePattern('Android Gradle requires canonical bundled URL', androidBuild, /expectedSources\.android must be file:\/\/\/android_asset\/demo\/index\.html/)
  requirePattern('Android invalid manifest clears canonical identity', androidMain, /if \(bundledRuntimeManifestValid\) bundledRuntimeManifest\.optString\(key\) else ""/)
  requirePattern('Android runtime exposes manifest validity', androidMain, /\.put\("manifestValid", bundledRuntimeManifestValid\)/)
  requirePattern('Android BuildConfig is diagnostic context only', androidMain, /\.put\("buildContext", buildConfigRuntimeContext\(\)\)/)
  requirePattern('Android launch notification prompt', androidMain, /maybeRequestNotificationsOnLaunch\(\)/)
  requirePattern('Android IAM manager registration', androidMain, /BrazeInAppMessageManager\.getInstance\(\)\.registerInAppMessageManager\(this\)/)
  requirePattern('Android FCM failure telemetry', androidMain, /label = if \(retry\) "FCM token retry scheduled" else "FCM token failed"/)
  requirePattern('Android FCM retry backoff', androidMain, /FCM_TOKEN_RETRY_DELAYS_MS/)
  requirePattern('Android push readiness command', androidMain, /"requestPushReadiness" -> \{[\s\S]*?refreshPushReadiness/)
  requirePattern('Android trust diagnostics command', androidMain, /"requestTrustDiagnostics" -> \{[\s\S]*?refreshTrustDiagnostics/)
  requirePattern('Android async readiness terminal command', androidMain, /private fun postAsyncReadinessCommand/)
  requirePattern('Android prepare readiness separates base and push', androidMain, /\.put\("ready", trustReady\)[\s\S]*?\.put\("pushReady", pushReady\)/)
  requirePattern('Android correlated source-ready telemetry', androidMain, /type = "demo_source_ready"/)
  requirePattern('Android live-web mode has a visible warning', androidMain, /text = "DEV OVERRIDE"/)
  requirePattern('Android ordinary runtime waits for render proof', androidMain, /webRenderTracker\.onBridgeReady/)
  requirePattern('Android rejects mismatched webReady identity', androidMain, /webReadyIdentityRejection\([\s\S]*?webRenderTracker\.onBridgeRejected/)
  requirePattern('Android webReady validates full deployment identity', androidWebReadyIdentity, /"protocol" to expected\.protocol,[\s\S]*?"runtimeId" to expected\.runtimeId,[\s\S]*?"configHash" to expected\.configHash,[\s\S]*?"runtimeHash" to expected\.runtimeHash/)
  requirePattern('Android rejected webReady fails the render generation', androidRenderTracker, /fun onBridgeRejected\([\s\S]*?failCurrentGeneration/)
  requirePattern('Android render proof requires page finish', androidRenderTracker, /val finished = pageFinished \?: return null/)
  requirePattern('Android render proof requires bridge readiness', androidRenderTracker, /val bridged = bridgeReady \?: return null/)
  requirePattern('Android render proof URL agreement', androidRenderTracker, /finished\.sourceUrl != bridged\.sourceUrl/)
  requirePattern('Android render mismatch fails closed', androidRenderTracker, /Rendered source did not match the requested source URL/)
  requirePattern('Android HTTPS trust diagnostics telemetry', androidMain, /type = "trust_diagnostics"/)
  requirePattern('Android runtime push token presence', androidMain, /\.put\("pushTokenPresent", !currentFcmToken\.isNullOrBlank\(\)\)/)
  requirePattern('Android runtime trust readiness', androidMain, /\.put\("trustReady", lastTrustDiagnostics\?\.optBoolean\("ready"\) \?: false\)/)
  requirePattern('Android runtime Content Card count', androidMain, /\.put\("contentCardCount", lastContentCardCount\)/)
  requirePattern('Android active profile never implicitly falls back', androidCredentialStore, /val id = activeProfileId \?: return null/)
  requirePattern('Android generated seed stores one-way fingerprint', androidCredentialStore, /MessageDigest\.getInstance\("SHA-256"\)/)
  requirePattern('Android incomplete changed seed clears active workspace', androidCredentialStore, /contextChanged -> generatedProfile\?\.id/)
  requirePattern('Android seed context change survives application initialization', androidCredentialStore, /SEED_CONTEXT_CHANGE_PENDING_KEY/)
  requirePattern('Android activity consumes changed seed context', androidMain, /consumeGeneratedSeedContextChange\(\)/)
  requirePattern('Android runtime exposes safe SDK credential context', androidMain, /\.put\("sdkCredentialContextFingerprint", store\.activeSdkCredentialContextFingerprint\(\)\)/)
  requirePattern('Launcher gates selected-pack SDK credentials', launcher, /sdk_credentials_missing/)
  requirePattern('Launcher computes platform SDK credential context', launcher, /`\$\{platform\}-sdk-credential-context\/v1`/)
  requirePattern('Launcher gates native SDK credential context', launcher, /if \(sdkCredentialsComplete\)[\s\S]*?sdk_credential_context_mismatch/)
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
  requirePattern('Android emulator Swipe credential fail close', androidRunEmulator, /credential type[\s\S]*non-secure Swipe/)
  requirePattern('Android emulator secure credential rejection', androidRunEmulator, /!= "NONE"[\s\S]*print_secure_lock_remediation/)
  requirePattern('Android emulator reset/install coupling', androidRunEmulator, /RESET_APP_DATA" == "1" && "\$INSTALL_APP" != "1"/)
  requirePattern('Android emulator trust fail-fast remediation', androidRunEmulator, /print_trust_remediation\(\)/)
  requirePattern('Android emulator auto trust probe', androidRunEmulator, /TRUST_INSTALLER" --probe-only/)
  requirePattern('Android emulator auto restores only volatile trust', androidRunEmulator, /system=1 conscrypt=0[\s\S]*restoring only the volatile Conscrypt trust mount/)
  requirePattern('Android emulator persistent trust requires repair', androidRunEmulator, /Missing or broken persistent system trust is a repair operation[\s\S]*print_trust_remediation[\s\S]*exit 1/)
  requirePattern('Android emulator revalidates after trust framework restart', androidRunEmulator, /TRUST_FRAMEWORK_RESTARTED" == "1"[\s\S]*wait_for_boot_and_unlock/)
  requirePattern('Android emulator quiesces before boot and trust validation', androidRunEmulator, /quiesce_previous_app[\s\S]*wait_for_boot_and_unlock[\s\S]*prepare_trust/)
  requirePattern('Android emulator enforces lock-screen notification settings', androidRunEmulator, /lock_screen_show_notifications[\s\S]*lock_screen_allow_private_notifications[\s\S]*lock_screen_show_silent_notifications[\s\S]*lock_screen_notification_minimalism/)
  requirePattern('Android emulator verifies controllable tap-to-wake settings', androidRunEmulator, /for key in double_tap_to_wake doze_pulse_on_double_tap doze_tap_gesture[\s\S]*settings put secure[\s\S]*settings get system double_tap_to_wake/)
  requirePattern('Android emulator clock check is foreground-only', androidRunEmulator, /TIME_SYNC_GUARD_SCRIPT" --once/)
  requirePattern('Android emulator start uses detached starter', androidRunEmulator, /DETACHED_EMULATOR_STARTER/)
  requirePattern('Android emulator survives one-shot launcher exit', androidStartEmulator, /detached: true/)
  if (/continuing without emulator system trust/.test(androidRunEmulator)) {
    fail('Android emulator wrapper must not continue after Zscaler CA install failure')
  }

  requirePattern('iOS sync envelope', iosManager, /func syncEnvelope\(authority: String, reason: String\) -> \[String: Any\]/)
  requirePattern('iOS identity dedupe', iosManager, /lastIdentitySyncSignature/)
  requirePattern('iOS generated seed uses deterministic profile id', iosCredentialStore, /"generated:\\\(normalizedPackId\)"/)
  requirePattern('iOS generated seed stores one-way fingerprint', iosCredentialStore, /SHA256\.hash\(data:/)
  requirePattern('iOS generated seed reconciles on every launch', iosManager, /CredentialStore\.shared\.reconcileGeneratedSeed\(\)/)
  requirePattern('iOS changed generated seed takes over active workspace', iosCredentialStore, /if generatedContextChanged \{[\s\S]*?activeProfileId = generatedProfile\?\.id/)
  requirePattern('iOS missing generated seed fails active workspace closed', iosCredentialStore, /activeProfileId = generatedProfile\?\.id/)
  requirePattern('iOS active profile does not silently fall back', iosCredentialStore, /guard let id = activeProfileId else \{ return nil \}/)
  requirePattern('iOS configured state is bound to active profile', iosManager, /return configuredProfileId == activeProfileId/)
  requirePattern('iOS invalid workspace clears prior SDK instance', iosManager, /braze = nil[\s\S]*?configuredProfileId = nil[\s\S]*?guard !profile\.apiKey\.isEmpty, !profile\.endpoint\.isEmpty else \{ return \}/)
  requirePattern('iOS command sync', iosBridge, /var commandSync = BrazeManager\.shared\.syncEnvelope\(authority: "control_room", reason: "command"\)/)
  requirePattern('iOS command avoids changeUser double write', iosBridge, /if !externalId\.isEmpty && !\["changeUser", "prepareRuntime", "prepare_runtime"\]\.contains\(action\)/)
  requirePattern('iOS connection includes sync', iosBridge, /"sync": braze\.syncEnvelope\(authority: "native", reason: "default"\)/)
  requirePattern('iOS runtime includes hash', iosManager, /"configHash": Config\.demoConfigHash/)
  requirePattern('iOS runtime includes runtime hash', iosManager, /"runtimeHash": Config\.demoRuntimeHash/)
  requirePattern('iOS generated seed computes safe SDK credential context', iosCredentialStore, /ios-sdk-credential-context\/v1/)
  requirePattern('iOS runtime exposes configured SDK state', iosManager, /"sdkConfigured": isConfigured/)
  requirePattern('iOS runtime exposes safe SDK credential context', iosManager, /"sdkCredentialContextFingerprint": CredentialStore\.shared\.activeSdkCredentialContextFingerprint/)
  requirePattern('iOS combined runtime preparation command', iosBridge, /case "prepareRuntime", "prepare_runtime":/)
  requirePattern('iOS render proof requires navigation finish', iosBridge, /func webView\(_ webView: WKWebView, didFinish navigation:/)
  requirePattern('iOS render proof requires bridge readiness', iosBridge, /let bridged = webBridgeRendered/)
  requirePattern('iOS render proof URL agreement', iosBridge, /finished\.sourceURL == bridged\.sourceURL/)
  requirePattern('iOS render proof matches configured source', iosBridge, /finished\.sourceURL == expectedSourceURL/)
  requirePattern('iOS rejects mismatched webReady identity', iosBridge, /webReadyIdentityRejection\([\s\S]*?reportWebReadyIdentityFailure/)
  requirePattern('iOS webReady validates full deployment identity', iosWebReadyIdentity, /\("protocol", expected\.protocolName\),[\s\S]*?\("runtimeId", expected\.runtimeId\),[\s\S]*?\("configHash", expected\.configHash\),[\s\S]*?\("runtimeHash", expected\.runtimeHash\)/)
  requirePattern('iOS rejected webReady fails the render generation', iosBridge, /reportWebReadyIdentityFailure\([\s\S]*?failedWebNavigationGeneration = webNavigationGeneration[\s\S]*?"renderConfirmed": false/)
  requirePattern('iOS runtime readiness confirms rendering', iosBridge, /"renderConfirmed": true/)
  requirePattern('iOS preparation binds render correlation before reload', iosBridge, /pendingRenderTransition\.begin\(renderCorrelation\)[\s\S]*?reloadWeb\(\)/)
  requirePattern('iOS terminal render consumes generation-bound correlation', iosBridge, /pendingRenderTransition\.finish\(generation: webNavigationGeneration\)/)
  requirePattern('iOS terminal render sends launcher correlation', iosBridge, /launcherInstanceId: correlation\?\.launcherInstanceId \?\? ""/)
  requirePattern('iOS terminal render sends execution correlation', iosBridge, /executionId: correlation\?\.executionId \?\? ""/)
  requirePattern('iOS terminal telemetry includes launcher correlation', iosBridge, /body\["launcherInstanceId"\] = resolvedLauncherInstanceId/)
  requirePattern('iOS terminal telemetry includes execution correlation', iosBridge, /body\["executionId"\] = resolvedExecutionId/)
  requirePattern('iOS launch notification prompt', iosAppDelegate, /requestNotificationsOnLaunch\(application\)/)
  requirePattern('iOS APNs token telemetry', iosAppDelegate, /type: "apns_token"/)
  requirePattern('iOS runtime push token presence', iosManager, /"pushTokenPresent": UserDefaults\.standard\.bool\(forKey: "braze\.demo\.ios\.apnsTokenRegistered"\)/)
  requirePattern('iOS push permission bridge telemetry', iosBridge, /reportPushStatus\(reason: "webReady"\)/)
  requirePattern('iOS push readiness command', iosBridge, /case "requestPushReadiness":/)
  requirePattern('iOS APNs readiness telemetry', iosBridge, /APNs token registration requested/)

  requirePattern('Launcher preserves render sync identity', launcher, /function extractRenderSyncIdentity\(body = \{\}\)/)
  requirePattern('Launcher validates render sync identity against native runtime', launcher, /function renderSyncIdentityMatchesRuntime\(sync, runtime\)/)

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
  requirePattern('Launcher sends one combined runtime preparation command', launcher, /action: 'prepareRuntime'[\s\S]*?clearWebSourceOverride:/)
  requirePattern('Launcher prepares runtime before readiness waits', launcher, /await applyRuntimeIdentity\([\s\S]*?await waitForDeviceRuntime\([\s\S]*?await waitForAndroidSource\(/)
  requirePattern('Launcher correlates bundled source preparation', launcher, /beginAndroidSourceTransition\(\{[\s\S]*?executionId: job\.id[\s\S]*?expectedRuntimeHash:/)
  requirePattern('Launcher extracts real iOS runtime render proof', launcher, /function extractIosRenderReadiness\(platform, body = \{\}\)/)
  requirePattern('Launcher orders iOS render evidence monotonically', launcher, /function shouldReplaceIosRenderEvidence\(existing, incoming\)/)
  requirePattern('Launcher applies iOS render ordering before persistence', launcher, /shouldReplaceIosRenderEvidence\([\s\S]*?stateBeforeTelemetry\.deviceSourceReadiness[\s\S]*?iosRenderCandidate/)
  requirePattern('Launcher waits for correlated iOS runtime and render proof', launcher, /await waitForCorrelatedIosRuntimeAndRender\(job, \{[\s\S]*?executionId: job\.id/)
  requirePattern('Launcher iOS render matcher requires launcher correlation', launcher, /function iosRenderReadinessMatchesExpectation\(render, expectation\) \{[\s\S]*?render\.launcherInstanceId === expectation\.launcherInstanceId/)
  requirePattern('Launcher iOS render matcher requires execution correlation', launcher, /function iosRenderReadinessMatchesExpectation\(render, expectation\) \{[\s\S]*?render\.executionId === expectation\.executionId/)
  requirePattern('Launcher iOS wait ignores uncorrelated render events', launcher, /render\.launcherInstanceId === expected\.launcherInstanceId[\s\S]*?render\.executionId === expected\.executionId/)
  requirePattern('Launcher preserves live-web hazard after host stop', launcher, /function liveWebStateAfterHostStop\([\s\S]*?bundledSourceConfirmed[\s\S]*?overrideMayBeActive: preserveHazard/)
  requirePattern('Launcher shutdown does not claim bundled-source proof', launcher, /const shutdown = async \(signal\) => \{[\s\S]*?stopLiveWebProcess\(\)/)
  requirePattern('Launcher clears live-web hazard only with bundled-source proof', launcher, /stopLiveWebProcess\(\{ bundledSourceConfirmed: true \}\)/)
  requirePattern('Launcher computes the current pack runtime before generated selection', launcher, /function runtimeForPack\(pack\) \{[\s\S]*?const computed = createRuntimeManifest\(pack\)/)
  requirePattern('Launcher accepts generated runtime only on full identity agreement', launcher, /function selectFreshRuntimeManifest\(generated, computed\) \{[\s\S]*?generated\?\.id === computed\?\.id[\s\S]*?generated\?\.configHash === computed\?\.configHash[\s\S]*?generated\?\.runtimeHash === computed\?\.runtimeHash/)
  requirePattern('Launcher owns one Android time guard', launcher, /const androidTimeGuard = createOwnedChildSingleton/)
  requirePattern('Launcher starts only owned time guard mode', launcher, /\['--watch-owned', serial\]/)
  requirePattern('Launcher stops owned time guard with its authority', launcher, /androidTimeGuard\.stop\(\)/)
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
  requirePattern('Presenter Remote narrow API contract', presenterRemote, /PRESENTER_REMOTE_API_CONTRACT/)
  requirePattern('Presenter Remote operator API version', presenterRemote, /version: 'operator\/v1'/)
  requirePattern('Presenter Remote pairing endpoint', presenterRemote, /pairPath: '\/api\/operator\/v1\/pair'/)
  requirePattern('Presenter Remote snapshot endpoint', presenterRemote, /snapshotPath: '\/api\/operator\/v1\/snapshot'/)
  requirePattern('Presenter Remote delta events', presenterRemote, /addEventListener\('delta'/)
  requirePattern('Presenter Remote stale-state fail close', presenterRemote, /if \(isStale\(\)\)/)
  requirePattern('Presenter Remote connected-state gate', presenterRemote, /state\.connection === 'connected'/)
  requirePattern('Presenter Remote execution context filter', presenterRemote, /function executionMatchesSnapshot\(execution, snapshot\)/)
  if (/\/api\/state|\/api\/presets\/execute|<textarea/i.test(presenterRemote)) {
    fail('Presenter Remote must use only the narrow operator API and must not expose arbitrary payload authoring.')
  }
  requirePattern('Launcher request boundary enforcement', launcher, /assertRequestBoundary\(req, url\)/)
  requirePattern('Launcher operator session enforcement', launcher, /requireOperatorSession\(req\)/)
  requirePattern('Launcher operator snapshot', launcher, /function operatorSnapshot\(\)/)
  requirePattern('Launcher Presenter Remote route', launcher, /url\.pathname === '\/presenter'/)
  requirePattern('Launcher operator control route', launcher, /api\\\/operator\\\/v1\\\/controls/)
  requirePattern('Launcher operator persona route', launcher, /api\\\/operator\\\/v1\\\/personas/)
  requirePattern('Launcher execution correlation', launcher, /\{ launcherInstanceId, executionId \}/)
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
    fail('Missing android-shell/app/google-services.json. Commit the shared Lumo Firebase client config.')
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
  const expectedRuntimeHash = demoRuntimeHash(activePack)

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
  assertRuntimeManifest('Runtime manifest', manifest, {
    id: activePack.id,
    configHash: expectedHash,
    runtimeHash: expectedRuntimeHash,
  })
  assertEqual('Runtime manifest name', manifest.name, activePack.name)
  assertEqual('Runtime manifest browser source', manifest.expectedSources?.browser, 'http://localhost:5173')
  assertEqual('Runtime manifest Android source', manifest.expectedSources?.android, 'file:///android_asset/demo/index.html')
  assertEqual('Runtime manifest iOS source', manifest.expectedSources?.ios, 'http://localhost:5173')

  const localProperties = readProperties(androidLocalPropertiesPath)
  if (Object.keys(localProperties).length) {
    assertEqual('Android seed demo.packId', localProperties['demo.packId'], activePack.id)
    assertEqual('Android seed demo.configHash', localProperties['demo.configHash'], expectedHash)
    assertEqual('Android seed demo.runtimeHash', localProperties['demo.runtimeHash'], expectedRuntimeHash)
    assertEqual('Android seed demo.androidUrl', localProperties['demo.androidUrl'], 'file:///android_asset/demo/index.html')
    assertEqual('Android seed demo.webDist', localProperties['demo.webDist'], packWebDistDir(activePack))
    for (const key of ['braze.apiKey', 'braze.endpoint', 'firebase.senderId']) {
      if ((localProperties[key] || '') !== (activePack.secrets?.[key] || '')) {
        fail(`Android seed ${key} does not match the current selected-pack value.`)
      }
    }
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
    if (!iosConfig.includes(`static let demoRuntimeHash = "${expectedRuntimeHash}"`)) {
      fail('iOS Config.swift demoRuntimeHash does not match the active pack.')
    }
  }

  validateActivePackAssets(
    'Generated web demo assets',
    path.join(webTemplateDir, 'public/demo-assets'),
    activePack,
    { required: true },
  )
}

function validateBuiltOutputs() {
  const runtime = fs.existsSync(generatedRuntimeManifestPath) ? readJson(generatedRuntimeManifestPath) : null
  if (!runtime) return
  const activePack = getDemoPack(getActivePackId())
  const expectedRuntime = {
    id: activePack.id,
    configHash: demoConfigHash(activePack),
    runtimeHash: demoRuntimeHash(activePack),
  }
  const activeDistDir = packWebDistDir(activePack)
  const distIndex = path.join(activeDistDir, 'index.html')
  if (!fs.existsSync(distIndex)) {
    fail(`Active web dist is missing index.html: ${activeDistDir}`)
  }

  const distRuntime = path.join(activeDistDir, 'demo-runtime.json')
  if (fs.existsSync(distIndex) && !fs.existsSync(distRuntime)) {
    fail(`Active web dist is missing demo-runtime.json: ${activeDistDir}`)
  } else if (fs.existsSync(distRuntime)) {
    const dist = readJson(distRuntime)
    assertRuntimeManifest('Active web dist runtime', dist, expectedRuntime)
    validateActivePackAssets(
      'Active web dist demo assets',
      path.join(activeDistDir, 'demo-assets'),
      activePack,
    )
  }

  const androidDemoDir = path.join(repoRoot, 'android-shell/app/build/generated/assets/demoWeb/demo')
  const androidRuntime = path.join(androidDemoDir, 'demo-runtime.json')
  if (fs.existsSync(androidDemoDir) && !fs.existsSync(androidRuntime)) {
    fail(`Android packaged assets are missing demo-runtime.json: ${androidDemoDir}`)
  } else if (fs.existsSync(androidRuntime)) {
    const android = readJson(androidRuntime)
    assertRuntimeManifest('Android packaged runtime', android, expectedRuntime)
    validateActivePackAssets(
      'Android packaged demo assets',
      path.join(androidDemoDir, 'demo-assets'),
      activePack,
    )
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
