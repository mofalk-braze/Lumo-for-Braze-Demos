import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  androidSeedProperties,
  createDemoPack,
  createRuntimeManifest,
  createStarterDemoPackConfig,
  demoConfigHash,
  demoRuntimeHash,
  directoryFingerprint,
  duplicateDemoPack,
  generateRuntimeManifest,
  generateDemoPackNotes,
  syncPackAppSurface,
  syncDemoAssets,
  validateDemoPackForAuthoring,
  validatePack,
  writeTextIfChanged,
} from './demo-pack-utils.mjs'
import { openDemoPack, runPackCommand } from './lumo-pack-cli.mjs'

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

test('pack validation closes the Content Card rail gap and validates Banner authoring surfaces', () => {
  const pack = createStarterDemoPackConfig({ id: 'schema-fixture', name: 'Schema Fixture' })

  assert.equal(validatePack(pack, 'fixture/demo-pack.json'), pack)

  const withoutLegacyRail = structuredClone(pack)
  delete withoutLegacyRail.content.contentCardRail
  assert.throws(
    () => validatePack(withoutLegacyRail, 'fixture/demo-pack.json'),
    /content\.contentCardRail requires non-empty title and placement strings/,
  )

  const invalidBanner = structuredClone(pack)
  invalidBanner.content.bannerSurfaces.push({
    id: 'first-banner',
    placement: 'home_banner',
    screen: 'home',
    height: 96,
  }, {
    id: 'second-banner',
    placement: 'home_banner',
    screen: 'account',
    height: 64,
  })
  assert.throws(
    () => validatePack(invalidBanner, 'fixture/demo-pack.json'),
    /content\.bannerSurfaces\[1\] has duplicate placement: home_banner/,
  )

  invalidBanner.content.bannerSurfaces[1].placement = 'account_banner'
  invalidBanner.content.bannerSurfaces[1].height = 0
  assert.throws(
    () => validatePack(invalidBanner, 'fixture/demo-pack.json'),
    /content\.bannerSurfaces\[1\] height must be a positive integer/,
  )
})

test('notes template maps Content Cards, Banners, IAM, and push without credential values', () => {
  const pack = createStarterDemoPackConfig({ id: 'notes-fixture', name: 'Notes Fixture' })
  pack.content.contentCardSurfaces.push({
    id: 'home-feed',
    placement: 'home_feed',
    surface: 'carousel',
    screen: 'home',
    title: 'Personalized updates',
    variant: 'carousel',
    emptyBehavior: 'hide',
  })
  pack.content.bannerSurfaces.push({
    id: 'home-banner',
    placement: 'home_banner',
    screen: 'home',
    height: 96,
  })
  pack.brand.flavorEvents.push({
    name: 'demo_iam_trigger',
    label: 'IAM trigger',
    anchor: 'content_engaged',
    emitAnchor: true,
    sample: { source: 'app' },
  })
  const notes = generateDemoPackNotes(pack)

  assert.match(notes, /extras\.placement=home_feed/)
  assert.match(notes, /Braze placement ID/)
  assert.match(notes, /`home_banner`/)
  assert.match(notes, /demo_iam_trigger/)
  assert.match(notes, /PUSH_CAMPAIGN_OR_CANVAS/)
  assert.match(notes, /Native SDK method/)
  assert.match(notes, /Typed properties and sample payload/)
  assert.match(notes, /BRAZE_REST_API_KEY_<PACK_ID>/)
  assert.doesNotMatch(notes, /braze\.apiKey\s*=/)
  assert.doesNotMatch(notes, /firebase\.senderId\s*=/)
})

test('new pack starter is identity-clean and style-clean', () => {
  const pack = createStarterDemoPackConfig({ id: 'neutral-fixture', name: 'Neutral Fixture' })

  assert.deepEqual(pack.brand.tabs, [{ id: 'home', label: 'Home', icon: 'Home' }])
  assert.deepEqual(pack.brand.flavorEvents, [])
  assert.deepEqual(pack.launcher.presets, [])
  assert.deepEqual(pack.content.categories, [])
  assert.deepEqual(pack.content.rails, [])
  assert.deepEqual(pack.content.contentCardSurfaces, [])
  assert.deepEqual(pack.content.bannerSurfaces, [])
  assert.notEqual(pack.brand.colors.brand, '#0F766E')
  assert.notEqual(pack.brand.colors.accent, '#F97316')
  const notes = generateDemoPackNotes(pack)
  assert.match(notes, /No IAM trigger declared/)
  assert.doesNotMatch(notes, /Default IAM test/)
  assert.doesNotMatch(notes, /extras\.placement=home_feed/)
})

test('new pack creation is local-ready and warns that its handoff is unfinished', (t) => {
  const destinationRoot = temporaryDirectory(t)
  const pack = createDemoPack(
    { id: 'fresh-solcon-pack', name: 'Fresh SolCon Pack' },
    { destinationRoot, knownPacks: [] },
  )

  assert.equal(pack.directory, path.join(destinationRoot, 'fresh-solcon-pack'))
  assert.equal(fs.existsSync(path.join(pack.directory, 'demo-pack.json')), true)
  assert.equal(fs.existsSync(path.join(pack.directory, 'notes.md')), true)
  assert.equal(fs.existsSync(path.join(pack.directory, 'secrets.properties')), false)
  assert.deepEqual(fs.readdirSync(path.join(pack.directory, 'assets')), [])

  const report = validateDemoPackForAuthoring(pack, { knownPacks: [pack] })
  assert.equal(report.valid, true)
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.warnings, ['notes.md handoff contains unresolved placeholders'])
})

test('pack validation warns when declared dashboard mappings drift from notes', (t) => {
  const destinationRoot = temporaryDirectory(t)
  const pack = createDemoPack(
    { id: 'handoff-drift', name: 'Handoff Drift' },
    { destinationRoot, knownPacks: [] },
  )
  pack.content.contentCardSurfaces.push({
    id: 'offers',
    placement: 'offers_feed',
    surface: 'feed',
    screen: 'home',
    title: 'Offers',
    variant: 'feed',
    emptyBehavior: 'hide',
  })
  pack.content.bannerSurfaces.push({ id: 'status', placement: 'status_banner', screen: 'home' })
  pack.brand.flavorEvents.push({
    name: 'offer_opened',
    label: 'Offer opened',
    anchor: 'content_engaged',
    emitAnchor: true,
  })

  const report = validateDemoPackForAuthoring(pack, { knownPacks: [pack] })
  assert.equal(report.valid, true)
  assert.match(report.warnings.join('\n'), /unresolved placeholders/)
  assert.match(report.warnings.join('\n'), /Content Card placement: offers_feed/)
  assert.match(report.warnings.join('\n'), /Banner placement: status_banner/)
  assert.match(report.warnings.join('\n'), /IAM trigger mapping: content_engaged/)
})

test('pack duplication rewrites identity and excludes credential carriers', (t) => {
  const root = temporaryDirectory(t)
  const sourceDirectory = path.join(root, 'source')
  const destinationRoot = path.join(root, 'local-packs')
  const sourcePack = {
    ...createStarterDemoPackConfig({ id: 'source-pack', name: 'Source Pack' }),
    directory: sourceDirectory,
    source: 'local',
  }
  const adapter = path.join(sourceDirectory, 'app-source/web-template/src/screens/local-pack/pack-app.tsx')
  fs.mkdirSync(path.dirname(adapter), { recursive: true })
  fs.mkdirSync(path.join(sourceDirectory, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(sourceDirectory, 'demo-pack.json'), `${JSON.stringify(sourcePack, null, 2)}\n`)
  fs.writeFileSync(path.join(sourceDirectory, 'assets', 'hero.txt'), 'safe asset\n')
  fs.writeFileSync(path.join(sourceDirectory, 'secrets.properties'), 'braze.apiKey=<LOCAL_ONLY>\n')
  fs.writeFileSync(path.join(sourceDirectory, '.env.local'), 'BRAZE_REST_API_KEY=<LOCAL_ONLY>\n')
  fs.writeFileSync(path.join(sourceDirectory, 'service_account.json'), '{"private_key":"<LOCAL_ONLY>"}\n')
  fs.writeFileSync(path.join(sourceDirectory, 'signing-key.pem'), '<LOCAL_ONLY>\n')
  fs.writeFileSync(path.join(sourceDirectory, 'client.certSigningRequest'), '<LOCAL_ONLY>\n')
  fs.writeFileSync(path.join(sourceDirectory, 'notes.md'), 'stale source notes\n')
  fs.writeFileSync(adapter, "export const demoPackId = 'source-pack'\nexport default function Surface() { return null }\n")

  const duplicate = duplicateDemoPack(sourcePack, {
    id: 'target-pack',
    name: 'Target Pack',
    destinationRoot,
    knownPacks: [sourcePack],
  })

  assert.equal(duplicate.id, 'target-pack')
  assert.equal(duplicate.brand.demoUser.externalId, 'target-pack-demo-user')
  assert.equal(duplicate.android.defaultExternalId, 'target-pack-demo-user')
  assert.equal(fs.existsSync(path.join(duplicate.directory, 'secrets.properties')), false)
  assert.equal(fs.existsSync(path.join(duplicate.directory, '.env.local')), false)
  assert.equal(fs.existsSync(path.join(duplicate.directory, 'service_account.json')), false)
  assert.equal(fs.existsSync(path.join(duplicate.directory, 'signing-key.pem')), false)
  assert.equal(fs.existsSync(path.join(duplicate.directory, 'client.certSigningRequest')), false)
  assert.equal(fs.readFileSync(path.join(duplicate.directory, 'assets', 'hero.txt'), 'utf8'), 'safe asset\n')
  assert.match(fs.readFileSync(path.join(duplicate.directory, 'notes.md'), 'utf8'), /Pack id: `target-pack`/)
  assert.match(fs.readFileSync(path.join(duplicate.directory, 'app-source/web-template/src/screens/local-pack/pack-app.tsx'), 'utf8'), /demoPackId = "target-pack"/)
})

test('lumo pack new supports machine-readable agent output', (t) => {
  const destinationRoot = temporaryDirectory(t)
  let output = ''
  const exitCode = runPackCommand(
    ['new', 'agent-guided-pack', '--name', 'Agent Guided Pack', '--json'],
    {
      destinationRoot,
      stdout: { write: (value) => { output += value } },
    },
  )
  const result = JSON.parse(output)

  assert.equal(exitCode, 0)
  assert.equal(result.action, 'created')
  assert.equal(result.id, 'agent-guided-pack')
  assert.equal(result.directory, path.join(destinationRoot, 'agent-guided-pack'))
  assert.equal(fs.existsSync(result.notesPath), true)
})

test('lumo pack open can print or prepare a missing local notes template without launching a GUI', (t) => {
  const root = temporaryDirectory(t)
  const pack = {
    ...createStarterDemoPackConfig({ id: 'open-fixture', name: 'Open Fixture' }),
    directory: path.join(root, 'open-fixture'),
    source: 'local',
  }
  fs.mkdirSync(pack.directory, { recursive: true })
  const result = openDemoPack(pack, { notes: true, print: true }, {
    spawn: () => { throw new Error('GUI opener must not run for --print') },
  })

  assert.equal(result.opened, false)
  assert.equal(result.target, path.join(pack.directory, 'notes.md'))
  assert.equal(fs.existsSync(result.target), true)
})
