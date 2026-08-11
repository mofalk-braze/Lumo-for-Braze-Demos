import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  androidSeedProperties,
  createRuntimeManifest,
  demoConfigHash,
  demoRuntimeHash,
  directoryFingerprint,
  generateRuntimeManifest,
  syncPackAppSurface,
  syncDemoAssets,
  writeTextIfChanged,
} from './demo-pack-utils.mjs'

function temporaryDirectory(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumo-demo-pack-utils-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

function demoPack(root) {
  const directory = path.join(root, 'pack')
  fs.mkdirSync(path.join(directory, 'assets'), { recursive: true })
  return {
    id: 'test-pack',
    name: 'Test Pack',
    description: 'Pack helper fixture',
    directory,
    android: { defaultExternalId: 'test-user' },
    brand: {
      colors: { primary: '#112233' },
      tabs: [],
      demoUser: { externalId: 'test-user' },
    },
    content: { hero: { title: 'Hello' }, categories: [], rails: [] },
  }
}

test('writeTextIfChanged preserves an identical file', (t) => {
  const root = temporaryDirectory(t)
  const file = path.join(root, 'nested', 'generated.txt')

  assert.equal(writeTextIfChanged(file, 'first\n'), true)
  const firstStat = fs.statSync(file, { bigint: true })

  assert.equal(writeTextIfChanged(file, 'first\n'), false)
  const secondStat = fs.statSync(file, { bigint: true })
  assert.equal(secondStat.ino, firstStat.ino)
  assert.equal(secondStat.mtimeNs, firstStat.mtimeNs)

  assert.equal(writeTextIfChanged(file, 'second\n'), true)
  assert.equal(fs.readFileSync(file, 'utf8'), 'second\n')
})

test('runtimeHash covers active asset and private app-surface bytes but ignores portable filesystem junk', (t) => {
  const root = temporaryDirectory(t)
  const pack = demoPack(root)
  const assets = path.join(pack.directory, 'assets')
  fs.writeFileSync(path.join(assets, 'hero.txt'), 'first asset\n')

  const configHash = demoConfigHash(pack)
  const assetFingerprint = directoryFingerprint(assets)
  const runtimeHash = demoRuntimeHash(pack)

  fs.writeFileSync(path.join(assets, '.DS_Store'), 'finder metadata\n')
  fs.writeFileSync(path.join(assets, 'Thumbs.db'), 'windows metadata\n')
  fs.mkdirSync(path.join(assets, '__MACOSX'), { recursive: true })
  fs.writeFileSync(path.join(assets, '__MACOSX', '._hero.txt'), 'archive metadata\n')

  assert.equal(demoConfigHash(pack), configHash)
  assert.equal(directoryFingerprint(assets), assetFingerprint)
  assert.equal(demoRuntimeHash(pack), runtimeHash)

  fs.writeFileSync(path.join(assets, 'hero.txt'), 'second asset\n')
  assert.equal(demoConfigHash(pack), configHash)
  assert.notEqual(demoRuntimeHash(pack), runtimeHash)

  const assetChangedRuntimeHash = demoRuntimeHash(pack)
  const appSurface = path.join(pack.directory, 'app-source/web-template/src/screens/local-pack')
  fs.mkdirSync(appSurface, { recursive: true })
  fs.writeFileSync(path.join(appSurface, 'pack-app.tsx'), 'export default function PackApp() {}\n')
  assert.notEqual(demoRuntimeHash(pack), assetChangedRuntimeHash)

  const appSurfaceRuntimeHash = demoRuntimeHash(pack)
  fs.writeFileSync(path.join(appSurface, 'pack-app.tsx'), 'export default function UpdatedPackApp() {}\n')
  assert.notEqual(demoRuntimeHash(pack), appSurfaceRuntimeHash)
})

test('runtime manifest keeps generatedAt stable for a semantic no-op', (t) => {
  const root = temporaryDirectory(t)
  const pack = demoPack(root)
  const asset = path.join(pack.directory, 'assets', 'hero.txt')
  const outputPath = path.join(root, 'generated', 'demo-runtime.json')
  fs.writeFileSync(asset, 'first asset\n')

  const first = generateRuntimeManifest(pack, {
    outputPath,
    generatedAt: '2026-01-01T00:00:00.000Z',
  })
  const firstStat = fs.statSync(outputPath, { bigint: true })
  assert.equal(first.changed, true)
  assert.equal(first.generatedAt, '2026-01-01T00:00:00.000Z')
  assert.equal(Object.keys(first).includes('changed'), false)
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(outputPath, 'utf8')), 'changed'), false)

  const second = generateRuntimeManifest(pack, {
    outputPath,
    generatedAt: '2026-02-02T00:00:00.000Z',
  })
  const secondStat = fs.statSync(outputPath, { bigint: true })
  assert.equal(second.changed, false)
  assert.equal(second.generatedAt, first.generatedAt)
  assert.equal(second.runtimeHash, first.runtimeHash)
  assert.equal(secondStat.ino, firstStat.ino)
  assert.equal(secondStat.mtimeNs, firstStat.mtimeNs)

  fs.writeFileSync(asset, 'second asset\n')
  const third = generateRuntimeManifest(pack, {
    outputPath,
    generatedAt: '2026-03-03T00:00:00.000Z',
  })
  assert.equal(third.changed, true)
  assert.equal(third.generatedAt, '2026-03-03T00:00:00.000Z')
  assert.notEqual(third.runtimeHash, first.runtimeHash)
})

test('Android seed keeps machine and callback settings but never inherits another pack workspace', (t) => {
  const root = temporaryDirectory(t)
  const pack = demoPack(root)
  const manifest = createRuntimeManifest(pack, { generatedAt: '2026-01-01T00:00:00.000Z' })
  const existing = {
    'sdk.dir': '/opt/android-sdk',
    'braze.apiKey': 'prior-workspace-key',
    'braze.endpoint': 'sdk.prior.invalid',
    'firebase.senderId': '111111111111',
    'launcher.callbackUrl': 'http://10.0.2.2:4177/api/device-events',
  }

  const withoutPackSecrets = androidSeedProperties(pack, manifest, existing)
  assert.equal(withoutPackSecrets['sdk.dir'], existing['sdk.dir'])
  assert.equal(withoutPackSecrets['launcher.callbackUrl'], existing['launcher.callbackUrl'])
  assert.equal(withoutPackSecrets['braze.apiKey'], '')
  assert.equal(withoutPackSecrets['braze.endpoint'], '')
  assert.equal(withoutPackSecrets['firebase.senderId'], '')

  pack.secrets = {
    'braze.apiKey': 'selected-pack-key',
    'braze.endpoint': 'sdk.selected.invalid',
    'firebase.senderId': '222222222222',
  }
  const withPackSecrets = androidSeedProperties(pack, manifest, existing, {
    launcherCallbackUrl: 'http://10.0.2.2:4188/api/device-events',
  })
  assert.equal(withPackSecrets['braze.apiKey'], pack.secrets['braze.apiKey'])
  assert.equal(withPackSecrets['braze.endpoint'], pack.secrets['braze.endpoint'])
  assert.equal(withPackSecrets['firebase.senderId'], pack.secrets['firebase.senderId'])
  assert.equal(withPackSecrets['launcher.callbackUrl'], 'http://10.0.2.2:4188/api/device-events')
})

test('asset sync keeps only the active pack and is an exact semantic no-op', (t) => {
  const root = temporaryDirectory(t)
  const pack = demoPack(root)
  const assets = path.join(pack.directory, 'assets')
  const destinationRoot = path.join(root, 'generated-assets')
  const activeDestination = path.join(destinationRoot, pack.id)

  fs.mkdirSync(path.join(assets, 'nested'), { recursive: true })
  fs.writeFileSync(path.join(assets, 'logo.txt'), 'active logo\n')
  fs.writeFileSync(path.join(assets, 'nested', 'data.json'), '{"version":1}\n')
  fs.writeFileSync(path.join(assets, '.DS_Store'), 'source junk\n')
  fs.mkdirSync(path.join(assets, '__MACOSX'), { recursive: true })
  fs.writeFileSync(path.join(assets, '__MACOSX', '._logo.txt'), 'source junk\n')

  fs.mkdirSync(path.join(destinationRoot, 'inactive-pack'), { recursive: true })
  fs.writeFileSync(path.join(destinationRoot, 'inactive-pack', 'old.txt'), 'inactive\n')
  fs.mkdirSync(activeDestination, { recursive: true })
  fs.writeFileSync(path.join(activeDestination, 'stale.txt'), 'stale\n')
  fs.writeFileSync(path.join(destinationRoot, 'loose-file.txt'), 'stale\n')

  assert.equal(syncDemoAssets(pack, { destinationRoot }), true)
  assert.deepEqual(fs.readdirSync(destinationRoot), [pack.id])
  assert.equal(fs.readFileSync(path.join(activeDestination, 'logo.txt'), 'utf8'), 'active logo\n')
  assert.equal(fs.existsSync(path.join(activeDestination, 'stale.txt')), false)
  assert.equal(fs.existsSync(path.join(activeDestination, '.DS_Store')), false)
  assert.equal(fs.existsSync(path.join(activeDestination, '__MACOSX')), false)
  assert.equal(directoryFingerprint(activeDestination), directoryFingerprint(assets))

  const logoStat = fs.statSync(path.join(activeDestination, 'logo.txt'), { bigint: true })
  assert.equal(syncDemoAssets(pack, { destinationRoot }), false)
  const unchangedLogoStat = fs.statSync(path.join(activeDestination, 'logo.txt'), { bigint: true })
  assert.equal(unchangedLogoStat.ino, logoStat.ino)
  assert.equal(unchangedLogoStat.mtimeNs, logoStat.mtimeNs)

  fs.writeFileSync(path.join(activeDestination, '.DS_Store'), 'destination junk\n')
  fs.mkdirSync(path.join(activeDestination, '__MACOSX'), { recursive: true })
  fs.writeFileSync(path.join(activeDestination, '__MACOSX', '._logo.txt'), 'destination junk\n')
  assert.equal(syncDemoAssets(pack, { destinationRoot }), true)
  const cleanedLogoStat = fs.statSync(path.join(activeDestination, 'logo.txt'), { bigint: true })
  assert.equal(cleanedLogoStat.ino, logoStat.ino)
  assert.equal(cleanedLogoStat.mtimeNs, logoStat.mtimeNs)
  assert.equal(fs.existsSync(path.join(activeDestination, '.DS_Store')), false)
  assert.equal(fs.existsSync(path.join(activeDestination, '__MACOSX')), false)

  fs.rmSync(path.join(assets, 'logo.txt'))
  fs.writeFileSync(path.join(assets, 'nested', 'data.json'), '{"version":2}\n')
  assert.equal(syncDemoAssets(pack, { destinationRoot }), true)
  assert.equal(fs.existsSync(path.join(activeDestination, 'logo.txt')), false)
  assert.equal(fs.readFileSync(path.join(activeDestination, 'nested', 'data.json'), 'utf8'), '{"version":2}\n')
  assert.equal(directoryFingerprint(activeDestination), directoryFingerprint(assets))
})

test('pack app surface mirrors one fixed ignored container and removes stale private code', (t) => {
  const root = temporaryDirectory(t)
  const pack = demoPack(root)
  const source = path.join(pack.directory, 'app-source/web-template/src/screens/local-pack')
  const destinationRoot = path.join(root, 'working', 'screens', 'local-pack')

  fs.mkdirSync(source, { recursive: true })
  fs.writeFileSync(path.join(source, 'pack-app.tsx'), 'export default function PackApp() {}\n')
  fs.writeFileSync(path.join(source, 'surface.tsx'), 'export const surface = true\n')
  fs.mkdirSync(destinationRoot, { recursive: true })
  fs.writeFileSync(path.join(destinationRoot, 'stale.tsx'), 'stale\n')

  assert.equal(syncPackAppSurface(pack, { destinationRoot }), true)
  assert.deepEqual(fs.readdirSync(destinationRoot).sort(), ['pack-app.tsx', 'surface.tsx'])
  assert.equal(syncPackAppSurface(pack, { destinationRoot }), false)

  fs.writeFileSync(path.join(source, 'surface.tsx'), 'export const surface = false\n')
  assert.equal(syncPackAppSurface(pack, { destinationRoot }), true)
  assert.equal(fs.readFileSync(path.join(destinationRoot, 'surface.tsx'), 'utf8'), 'export const surface = false\n')

  fs.rmSync(path.join(pack.directory, 'app-source'), { recursive: true, force: true })
  assert.equal(syncPackAppSurface(pack, { destinationRoot }), true)
  assert.equal(fs.existsSync(destinationRoot), false)
  assert.equal(syncPackAppSurface(pack, { destinationRoot }), false)
})
