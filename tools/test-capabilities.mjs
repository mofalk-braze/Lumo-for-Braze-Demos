#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from './demo-pack-utils.mjs'

const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/runtime-capabilities.json'), 'utf8'))
assert.equal(registry.schemaVersion, 1)
assert.equal(registry.platforms.android.version, '42.3.1')
assert.equal(registry.platforms.ios.version, '11.9.0')
const banners = registry.capabilities['messaging.banners']
assert.equal(banners.android, 'implemented')
assert.equal(banners.ios, 'implemented')
const android = fs.readFileSync(path.join(repoRoot, 'android-shell/app/src/main/java/com/braze/demoshell/MainActivity.kt'), 'utf8')
const ios = fs.readFileSync(path.join(repoRoot, 'ios-shell/Sources/WebViewController.swift'), 'utf8')
const iosManager = fs.readFileSync(path.join(repoRoot, 'ios-shell/Sources/BrazeManager.swift'), 'utf8')
const web = fs.readFileSync(path.join(repoRoot, 'web-template/src/components/NativeBannerSlot.tsx'), 'utf8')
const webSync = fs.readFileSync(path.join(repoRoot, 'web-template/src/braze/sync.ts'), 'utf8')
assert.match(android, /BannerView\(this, placementId\)/)
assert.match(android, /requestBannersRefresh/)
assert.match(android, /BrazeNotificationUtils\.activeNotificationFactory\.createNotification\(payload\)/)
assert.match(ios, /BrazeBannerUI\.BannerUIView/)
assert.match(ios, /requestBannersRefresh/)
assert.match(iosManager, /setCustomAttribute\(key: key, array: nested\)/)
assert.match(iosManager, /setCustomAttribute\(key: key, dictionary: nested\)/)
assert.match(iosManager, /configuration\.sessionTimeout/)
assert.match(web, /mountBanner/)
assert.doesNotMatch(web, /ContentCard/)
assert.match(webSync, /runtimeHash: string/)
assert.match(webSync, /runtimeHash: activeRuntimeManifest\.runtimeHash/)

const trustInstaller = path.join(repoRoot, 'android-shell/tools/install-zscaler-system-ca.sh')
const trustProbe = spawnSync(trustInstaller, ['--compile-smoke-only'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
assert.equal(
  trustProbe.status,
  0,
  `Android HTTPS trust probe must compile before it can gate app installation.\n${trustProbe.stderr || trustProbe.stdout}`,
)
assert.match(trustProbe.stdout, /Android HTTPS trust probe compilation passed/)

const emulatorRunner = fs.readFileSync(path.join(repoRoot, 'android-shell/tools/run-demo-emulator.sh'), 'utf8')
assert.match(emulatorRunner, /quiesce_previous_app/)
const launcher = fs.readFileSync(path.join(repoRoot, 'tools/demo-launcher.mjs'), 'utf8')
assert.match(launcher, /const failedStep = job\.step/)
assert.match(launcher, /waitForDeviceRuntime/)
assert.match(launcher, /function broadcastJob\(job, appendedLogs = \[\]\)/)
assert.match(launcher, /appendJobLogs\(job, text\.split/)
assert.doesNotMatch(
  launcher,
  /hasMeaningfulPushState\s*=\s*[\s\S]*?Object\.hasOwn\(push, 'sdkDeviceId'\)/,
  'Trust telemetry may carry sdkDeviceId; device identity alone must not overwrite push readiness.',
)
assert.match(launcher, /Broadcast sends are blocked/)
assert.match(launcher, /Campaign and Canvas REST triggers must include explicit recipients/)
const controlRoom = fs.readFileSync(path.join(repoRoot, 'tools/control-room-template.mjs'), 'utf8')
assert.match(controlRoom, /events\.addEventListener\('job'/)
assert.match(controlRoom, /stopLivePolling\(\)/)
assert.doesNotMatch(controlRoom, /connectLiveUpdates\(\) \{\s+startLivePolling\(\)/)
assert.doesNotMatch(controlRoom, /job\.status === 'running'\) setTimeout\(load/)
const appSurface = fs.readFileSync(path.join(repoRoot, 'web-template/src/App.tsx'), 'utf8')
const packSurfaceRegistry = fs.readFileSync(path.join(repoRoot, 'web-template/src/screens/packSurfaceRegistry.ts'), 'utf8')
const localPackSurface = path.join(repoRoot, 'web-template/src/screens/local-pack/pack-app.tsx')
assert.match(appSurface, /lastNavigationRouteId/)
assert.match(appSurface, /resolvePackAppSurface\(activeDemoPackId\)/)
assert.doesNotMatch(appSurface, /screens\/local-pack/)
assert.match(
  packSurfaceRegistry,
  /import\.meta\.glob<PackSurfaceModule>\('\.\/local-pack\/pack-app\.tsx'/,
)
assert.doesNotMatch(packSurfaceRegistry, /module\.demoPackId\s*===\s*['"]/)
const ignoredLocalPackSurface = spawnSync('git', ['check-ignore', '--no-index', '--quiet', localPackSurface], {
  cwd: repoRoot,
})
assert.equal(
  ignoredLocalPackSurface.status,
  0,
  'The fixed local-pack app-surface container must remain ignored by Git.',
)
console.log('Runtime capability matrix and Banner adapter tests passed.')
