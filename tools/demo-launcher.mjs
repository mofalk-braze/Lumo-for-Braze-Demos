#!/usr/bin/env node
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { launcherHtml as controlRoomHtml } from './control-room-template.mjs'
import { presenterRemoteHtml } from './presenter-remote-template.mjs'
import { openDemoPack } from './lumo-pack-cli.mjs'
import {
  androidShellDir,
  applyDemoPack,
  createDemoPack,
  createRuntimeManifest,
  duplicateDemoPack,
  generatedRuntimeManifestPath,
  getActivePackId,
  getDemoPack,
  launcherStateDir,
  listDemoPacks,
  localDemoPacksDir,
  packWebBuildCommand,
  packWebDistDir,
  readProperties,
  repoRoot,
  validateDemoPackForAuthoring,
  writeDemoPackSecrets,
  webTemplateDir,
} from './demo-pack-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const designSystemDir =
  process.env.BRAZE_DESIGN_SYSTEM_DIR ||
  path.join(repoRoot, 'Braze Design System (Collaborative)')
const jobs = new Map()
const statePath = path.join(launcherStateDir, 'state.json')
const serverInfoPath = path.join(launcherStateDir, 'server.json')
const authorityLockPath = path.join(launcherStateDir, 'owner.lock')
const buildCachePath = path.join(launcherStateDir, 'build-cache.json')
const activityArchiveDir = path.join(launcherStateDir, 'activity-archives')
const sseClients = new Set()
const operatorSseClients = new Set()
const operatorExecutions = new Map()
const operatorRequests = new Map()
const operatorExecutionSequences = new Map()
const operatorChildExecutions = new Map()
let operatorExecutionCreationOrder = 0
const launcherInstanceId = randomUUID()
const operatorSessionAuthority = createOperatorSessionAuthority({ instanceId: launcherInstanceId })
const androidSourceEvidenceByExecution = new Map()
const iosRuntimeEvidenceByExecution = new Map()
let activeAndroidSourceTransition = null
let lastOperatorSnapshot = null
let liveWebProcess = null
let liveWebStartedAt = ''
let liveWebStopping = null
let liveWebTransition = null
let launcherAuthority = null
const sessionRestApiKeys = new Map()
const stateBroadcastIntervalMs = 200
let stateBroadcastTimer = null
let lastStateBroadcastAt = 0
let serverPort = Number(process.env.PORT || 4177)
const requestBodyLimitBytes = Number(process.env.BRAZE_CONTROL_ROOM_BODY_LIMIT || 256 * 1024)
const activityLedgerLimit = 240
const activityDedupeWindowMs = 2_500
const defaultAndroidAvd = process.env.BRAZE_DEMO_ANDROID_AVD || 'Braze_Demo_API_36'
const trustDiagnosticsTimeoutMs = Number(process.env.BRAZE_DEMO_TRUST_DIAGNOSTICS_TIMEOUT_MS || 15_000)
const liveWebPort = 5173
const liveWebHostUrl = `http://127.0.0.1:${liveWebPort}`
const liveWebDeviceUrl = `http://10.0.2.2:${liveWebPort}`
const androidTimeSyncGuardScript = path.join(androidShellDir, 'tools/ensure-time-sync-guard.sh')
const androidTimeSyncScript = path.join(androidShellDir, 'tools/sync-emulator-network-time.mjs')
const androidTimeSyncLog = process.env.BRAZE_DEMO_TIME_SYNC_LOG || '/tmp/lumo-demo-time-sync.log'
const androidTimeGuard = createOwnedChildSingleton({
  onUnexpectedExit: ({ key, code, signal, error }) => {
    try {
      addLedger({
        source: 'launcher',
        platform: 'android',
        type: 'time_guard',
        label: 'Android network clock guard stopped unexpectedly',
        status: 'error',
        result: { serial: key, code, signal, error: error?.message || '' },
      })
    } catch {
      // Shutdown or early-start failures may make the state ledger unavailable.
    }
  },
})

const builtInPresets = [
  {
    id: 'sdk_change_user_template',
    label: 'Change user',
    description: 'Changes the selected app SDK user to the active external ID.',
    type: 'change_user',
    payload: {},
  },
  {
    id: 'sdk_iam_trigger',
    label: 'Trigger IAM event',
    description: 'Logs demo_iam_trigger through the selected app SDK.',
    type: 'sdk_event',
    payload: { name: 'demo_iam_trigger', properties: { source: 'launcher' } },
  },
  {
    id: 'sdk_refresh_cards',
    label: 'Refresh Content Cards',
    description: 'Requests a native SDK Content Cards refresh.',
    type: 'content_cards_refresh',
    payload: {},
  },
  {
    id: 'sdk_push_permission',
    label: 'Request push permission',
    description: 'Opens the selected app notification permission prompt when needed.',
    type: 'push_permission',
    payload: {},
  },
  {
    id: 'sdk_push_readiness',
    label: 'Verify push readiness',
    description: 'Refreshes native push-token registration for the active user.',
    type: 'push_readiness',
    payload: { reason: 'control_room' },
  },
  {
    id: 'android_trust_diagnostics',
    label: 'Verify Android HTTPS trust',
    description: 'Runs native Android HTTPS diagnostics for Braze image media and Firebase endpoints.',
    type: 'trust_diagnostics',
    platform: 'android',
    payload: { reason: 'control_room' },
  },
  {
    id: 'sdk_foreground_push',
    label: 'Diagnostics: native notification preview',
    description: 'Displays a local native notification for layout/routing diagnostics only. This is not a Braze push send.',
    type: 'foreground_push',
    payload: {
      title: 'Demo notification',
      body: 'A message is ready for this user.',
      uri: '/notifications',
    },
  },
  {
    id: 'sdk_navigate_home',
    label: 'Open app home',
    description: 'Navigates the selected app render surface to the app home screen.',
    type: 'navigate',
    payload: { route: '/' },
  },
  {
    id: 'sdk_log_event_template',
    label: 'Log custom event',
    description: 'Template for a brand-agnostic SDK custom event.',
    type: 'sdk_event',
    payload: { name: 'demo_action', properties: { source: 'control_room' } },
  },
  {
    id: 'sdk_update_attribute_template',
    label: 'Update user attribute',
    description: 'Template for setting profile attributes through the Android SDK.',
    type: 'sdk_attribute',
    payload: { attributes: { demo_stage: 'interested' } },
  },
  {
    id: 'sdk_purchase_template',
    label: 'Log purchase',
    description: 'Template for logging a purchase through the selected app SDK.',
    type: 'sdk_purchase',
    payload: {
      productId: 'demo_product',
      price: 19,
      currency: 'EUR',
      quantity: 1,
      properties: { source: 'control_room' },
    },
  },
  {
    id: 'rest_event_template',
    label: 'Track REST event',
    description: 'Template for sending a /users/track event through Braze REST.',
    type: 'rest_event',
    payload: { name: 'demo_action', properties: { source: 'control_room' } },
    transport: 'braze_rest',
    platform: 'host',
  },
  {
    id: 'rest_attribute_template',
    label: 'Track REST attribute',
    description: 'Template for updating profile attributes through Braze /users/track.',
    type: 'rest_attribute',
    payload: { attributes: { demo_stage: 'interested' } },
    transport: 'braze_rest',
    platform: 'host',
  },
  {
    id: 'rest_purchase_template',
    label: 'Track REST purchase',
    description: 'Template for sending a purchase through Braze /users/track.',
    type: 'rest_purchase',
    payload: {
      productId: 'demo_product',
      price: 19,
      currency: 'EUR',
      quantity: 1,
      properties: { source: 'control_room' },
    },
    transport: 'braze_rest',
    platform: 'host',
  },
  {
    id: 'rest_campaign_trigger_template',
    label: 'Trigger campaign',
    description: 'Template for an API-triggered campaign send.',
    type: 'campaign_trigger',
    payload: { campaignId: '', triggerProperties: { source: 'control_room' } },
    transport: 'braze_rest',
    platform: 'host',
  },
  {
    id: 'rest_canvas_trigger_template',
    label: 'Trigger Canvas',
    description: 'Template for an API-triggered Canvas send.',
    type: 'canvas_trigger',
    payload: { canvasId: '', triggerProperties: { source: 'control_room' } },
    transport: 'braze_rest',
    platform: 'host',
  },
  {
    id: 'rest_export_user_template',
    label: 'Verify user profile',
    description: 'Exports the active user profile through /users/export/ids.',
    type: 'profile_export',
    payload: {},
    transport: 'braze_rest',
    platform: 'host',
  },
  {
    id: 'rest_custom_request_template',
    label: 'Custom REST request',
    description: 'Advanced host-only Braze REST request. Path must be relative and safe.',
    type: 'braze_rest_request',
    payload: { method: 'POST', path: '/users/track', body: {}, query: {} },
    transport: 'braze_rest',
    platform: 'host',
  },
]

function demoSeedAttributesPreset(pack) {
  const attributes =
    pack?.brand?.demoUser?.attributes && typeof pack.brand.demoUser.attributes === 'object'
      ? pack.brand.demoUser.attributes
      : {}
  const attributeCount = Object.keys(attributes).length
  return {
    id: 'sdk_sync_demo_seed_attributes',
    label: 'Sync demo seed attributes',
    description: attributeCount
      ? `Applies ${attributeCount} active pack demo-user attributes through the native SDK. This can overwrite matching Braze profile fields.`
      : 'No demo-user attributes are defined for the active pack.',
    type: 'sdk_attribute',
    seedSync: true,
    payload: { attributes },
  }
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseArgs(argv) {
  const args = { command: 'server', port: Number(process.env.PORT || 4177), explicitPort: Boolean(process.env.PORT) }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--list') args.command = 'list'
    else if (arg === '--pack') args.pack = argv[++index]
    else if (arg === '--run') args.run = true
    else if (arg === '--apply-only') args.applyOnly = true
    else if (arg === '--port') {
      args.port = Number(argv[++index])
      args.explicitPort = true
    }
    else if (arg === '--avd') args.avd = argv[++index]
  }
  if (args.pack) args.command = 'apply'
  return args
}

function resolvedAndroidAvd(options = {}) {
  return String(options.avd || process.env.BRAZE_DEMO_ANDROID_AVD || defaultAndroidAvd).trim() || defaultAndroidAvd
}

function ensureStateDir() {
  fs.mkdirSync(launcherStateDir, { recursive: true })
}

function defaultState() {
  const activePackId = getActivePackId()
  const pack = getDemoPack(activePackId)
  return {
    activePackId,
    activePlatform: 'android',
    activeExternalId: pack.android?.defaultExternalId || pack.brand.demoUser.externalId,
    activeDisplayName: pack.brand.demoUser.firstName || '',
    customPresets: [],
    controlsByPack: {},
    pushReadiness: {},
    trustDiagnostics: {},
    deviceSourceReadiness: null,
    development: {
      liveWeb: {
        enabled: false,
        overrideMayBeActive: false,
        status: 'stopped',
        hostUrl: liveWebHostUrl,
        deviceUrl: liveWebDeviceUrl,
      },
    },
    activitySession: {
      id: '',
      startedAt: '',
      reason: '',
    },
    activityArchives: [],
    ledger: [],
    restResponses: [],
  }
}

function cleanPresetForStorage(preset) {
  return {
    id: preset.id,
    label: preset.label,
    description: preset.description || '',
    type: preset.type,
    payload: preset.payload || {},
    transport: preset.transport,
    platform: preset.platform,
    requiresPushToken: Boolean(preset.requiresPushToken),
    presenterVariants: Array.isArray(preset.presenterVariants) ? preset.presenterVariants : undefined,
    custom: Boolean(preset.custom),
  }
}

function ensureControlState(state, packId = state.activePackId || getActivePackId()) {
  if (!state.controlsByPack || typeof state.controlsByPack !== 'object') state.controlsByPack = {}
  if (!state.controlsByPack[packId]) {
    state.controlsByPack[packId] = {
      staged: [],
      hidden: [],
      pinned: [],
      locked: [],
    }
  }
  const controlState = state.controlsByPack[packId]
  controlState.staged = Array.isArray(controlState.staged) ? controlState.staged : []
  controlState.hidden = Array.isArray(controlState.hidden) ? controlState.hidden : []
  controlState.pinned = Array.isArray(controlState.pinned) ? controlState.pinned : []
  controlState.locked = Array.isArray(controlState.locked) ? controlState.locked : []

  if (Array.isArray(state.customPresets) && state.customPresets.length) {
    const existingIds = new Set(controlState.staged.map((preset) => preset.id))
    for (const customPreset of state.customPresets) {
      const migrated = {
        ...cleanPresetForStorage(customPreset),
        id: customPreset.id || `staged_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        custom: true,
        origin: 'legacy_custom',
      }
      if (!existingIds.has(migrated.id)) {
        controlState.staged.push(migrated)
        existingIds.add(migrated.id)
      }
    }
    state.customPresets = []
  }

  return controlState
}

function controlStateForPack(state, packId) {
  return ensureControlState(state, packId)
}

function findControlById(pack, state, controlId) {
  return packPresets(pack, state).find((preset) => preset.id === controlId)
}

function safeGetDemoPack(packId) {
  if (packId) {
    try {
      return getDemoPack(packId)
    } catch {
      // Fall through to the active marker or first pack. This keeps folder/name
      // edits from blanking the launcher when persisted state is stale.
    }
  }

  const activePackId = getActivePackId()
  if (activePackId && activePackId !== packId) {
    try {
      return getDemoPack(activePackId)
    } catch {
      // Fall through.
    }
  }

  const firstPack = listDemoPacks()[0]
  if (!firstPack) throw new Error('No demo packs found in demo-packs/ or .demo-packs/.')
  return getDemoPack(firstPack.id)
}

function readState() {
  ensureStateDir()
  if (!fs.existsSync(statePath)) {
    const initial = defaultState()
    ensureControlState(initial, initial.activePackId)
    writeState(initial)
    return initial
  }
  try {
    const state = { ...defaultState(), ...JSON.parse(fs.readFileSync(statePath, 'utf8')) }
    const persistedLiveWeb = state.development?.liveWeb
    if (persistedLiveWeb?.ownerInstanceId && persistedLiveWeb.ownerInstanceId !== launcherInstanceId) {
      const overrideMayBeActive = Boolean(
        persistedLiveWeb.overrideMayBeActive ||
        persistedLiveWeb.enabled ||
        ['switching', 'active', 'clearing', 'error'].includes(persistedLiveWeb.status),
      )
      state.development = {
        ...(state.development || {}),
        liveWeb: {
          ...persistedLiveWeb,
          enabled: false,
          overrideMayBeActive,
          status: 'error',
          pid: null,
          ownerInstanceId: '',
          error: 'The launcher that owned this development server is no longer connected.',
        },
      }
    }
    const hadLegacyCustomPresets = Array.isArray(state.customPresets) && state.customPresets.length > 0
    ensureControlState(state, state.activePackId)
    if (hadLegacyCustomPresets) writeState(state)
    return state
  } catch {
    const initial = defaultState()
    ensureControlState(initial, initial.activePackId)
    writeState(initial)
    return initial
  }
}

function processIsAlive(pid) {
  const value = Number(pid)
  if (!Number.isInteger(value) || value < 1) return false
  try {
    process.kill(value, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

export function createOwnedChildSingleton({
  startupDelayMs = 250,
  stopTimeoutMs = 2_000,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onUnexpectedExit = () => {},
} = {}) {
  let current = null
  let stopping = null

  const running = (record = current) => Boolean(record?.child && record.child.exitCode === null && !record.error)

  async function stop() {
    if (stopping) return stopping
    const record = current
    if (!running(record)) {
      if (current === record) current = null
      return
    }
    record.intentionalStop = true
    stopping = new Promise((resolve) => {
      let settled = false
      let timer = null
      const finish = () => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        if (current === record) current = null
        resolve()
      }
      record.child.once('exit', finish)
      try {
        record.child.kill('SIGTERM')
      } catch {
        finish()
        return
      }
      timer = setTimeout(() => {
        try {
          if (record.child.exitCode === null) record.child.kill('SIGKILL')
        } catch {}
        finish()
      }, stopTimeoutMs)
      timer.unref?.()
    })
    try {
      await stopping
    } finally {
      stopping = null
    }
  }

  async function ensure(key, spawnChild) {
    if (!key) throw new Error('Owned singleton processes require a stable key.')
    if (running() && current.key === key) {
      return { child: current.child, key, reused: true }
    }
    await stop()
    const child = spawnChild()
    const record = { child, key, error: null, intentionalStop: false }
    current = record
    child.once('error', (error) => { record.error = error })
    child.once('exit', (code, signal) => {
      if (current === record) current = null
      if (!record.intentionalStop) onUnexpectedExit({ key, child, code, signal, error: record.error })
    })
    await delay(startupDelayMs)
    if (!running(record) || current !== record) {
      const detail = record.error?.message || `exit ${child.exitCode ?? 'before readiness'}`
      if (current === record) current = null
      throw new Error(`Owned singleton process exited during startup (${detail}).`)
    }
    return { child, key, reused: false }
  }

  function terminateNow() {
    const record = current
    if (!running(record)) return
    record.intentionalStop = true
    try { record.child.kill('SIGTERM') } catch {}
  }

  return {
    ensure,
    stop,
    terminateNow,
    status: () => ({
      key: current?.key || '',
      pid: running() ? current.child.pid || null : null,
      running: running(),
    }),
  }
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function authorityOwnerIsValid(owner) {
  return Boolean(
    owner &&
    typeof owner.instanceId === 'string' &&
    owner.instanceId &&
    Number.isInteger(Number(owner.pid)) &&
    Number(owner.pid) > 0,
  )
}

function authorityOwnerMatches(left, right) {
  return Boolean(
    authorityOwnerIsValid(left) &&
    authorityOwnerIsValid(right) &&
    left.instanceId === right.instanceId &&
    Number(left.pid) === Number(right.pid),
  )
}

function authorityConflict(message) {
  const error = new Error(message)
  error.statusCode = 409
  return error
}

function writeAuthorityOwner(fd, { instanceId, pid }) {
  fs.writeFileSync(fd, `${JSON.stringify({
    schemaVersion: 1,
    instanceId,
    pid,
    acquiredAt: new Date().toISOString(),
  }, null, 2)}\n`)
  fs.fsyncSync(fd)
}

function openAuthorityLock(lockPath, { instanceId, pid }) {
  const fd = fs.openSync(lockPath, 'wx', 0o600)
  try {
    writeAuthorityOwner(fd, { instanceId, pid })
    return fd
  } catch (error) {
    try { fs.closeSync(fd) } catch {}
    // Leave an incomplete lock in place. A later contender will fail closed
    // instead of risking removal of a path that may no longer name this file.
    throw error
  }
}

function acquireAuthorityReclaimLease(lockPath, { instanceId, pid }) {
  const reclaimPath = `${lockPath}.reclaim`
  const token = randomUUID()
  let fd = null
  try {
    fd = fs.openSync(reclaimPath, 'wx', 0o600)
    fs.writeFileSync(fd, `${JSON.stringify({
      schemaVersion: 1,
      token,
      instanceId,
      pid,
      acquiredAt: new Date().toISOString(),
    }, null, 2)}\n`)
    fs.fsyncSync(fd)
    return { fd, reclaimPath, token }
  } catch (error) {
    if (fd !== null) {
      try { fs.closeSync(fd) } catch {}
      // As with the owner lock, an incomplete lease is safer than unlinking a
      // path after an I/O failure. It requires explicit operator recovery.
    }
    if (error?.code === 'EEXIST') {
      throw authorityConflict(
        'Launcher authority reclamation is already in progress. Refusing to modify the owner lock.',
      )
    }
    throw error
  }
}

function releaseAuthorityReclaimLease(lease) {
  if (!lease) return
  try { fs.closeSync(lease.fd) } catch {}
  const claim = readJsonFile(lease.reclaimPath)
  if (claim?.token === lease.token) {
    try { fs.rmSync(lease.reclaimPath, { force: true }) } catch {}
  }
}

export function acquireAuthorityLock({
  lockPath = authorityLockPath,
  legacyServerInfoPath = serverInfoPath,
  instanceId = launcherInstanceId,
  pid = process.pid,
  isAlive = processIsAlive,
} = {}) {
  if (lockPath === authorityLockPath && launcherAuthority) return launcherAuthority

  const legacy = readJsonFile(legacyServerInfoPath)
  if (legacy?.instanceId && legacy.instanceId !== instanceId && isAlive(legacy.pid)) {
    const error = new Error(
      `Launcher authority ${legacy.instanceId} (pid ${legacy.pid}) is already active on port ${legacy.port || 'unknown'}.`,
    )
    error.statusCode = 409
    throw error
  }

  fs.mkdirSync(path.dirname(lockPath), { recursive: true })
  let fd = null
  try {
    fd = openAuthorityLock(lockPath, { instanceId, pid })
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    const observedOwner = readJsonFile(lockPath)
    if (authorityOwnerMatches(observedOwner, { instanceId, pid })) {
      return { fd: null, lockPath, instanceId, pid, borrowed: true }
    }
    if (!authorityOwnerIsValid(observedOwner)) {
      throw authorityConflict(
        'Launcher authority lock is unreadable or malformed. Refusing automatic reclamation.',
      )
    }
    if (isAlive(observedOwner.pid)) {
      throw authorityConflict(
        `Launcher authority ${observedOwner.instanceId} (pid ${observedOwner.pid}) already owns demo state.`,
      )
    }

    const reclaimLease = acquireAuthorityReclaimLease(lockPath, { instanceId, pid })
    let quarantinePath = ''
    try {
      const currentOwner = readJsonFile(lockPath)
      if (!authorityOwnerMatches(currentOwner, observedOwner)) {
        throw authorityConflict(
          'Launcher authority changed during stale-lock reclamation. Refusing to modify the current owner lock.',
        )
      }
      if (isAlive(currentOwner.pid)) {
        throw authorityConflict(
          `Launcher authority ${currentOwner.instanceId} (pid ${currentOwner.pid}) became active during reclamation.`,
        )
      }

      quarantinePath = `${lockPath}.stale.${reclaimLease.token}`
      try {
        fs.renameSync(lockPath, quarantinePath)
      } catch (renameError) {
        if (renameError?.code === 'ENOENT') {
          throw authorityConflict(
            'Launcher authority changed during stale-lock reclamation. Refusing an unverified takeover.',
          )
        }
        throw renameError
      }

      try {
        fd = openAuthorityLock(lockPath, { instanceId, pid })
      } catch (openError) {
        if (openError?.code !== 'EEXIST') throw openError
        const replacement = readJsonFile(lockPath)
        const detail = authorityOwnerIsValid(replacement)
          ? `${replacement.instanceId} (pid ${replacement.pid})`
          : 'an unreadable replacement owner'
        throw authorityConflict(
          `Launcher authority ${detail} claimed demo state during stale-lock reclamation.`,
        )
      }
    } finally {
      if (quarantinePath) {
        try { fs.rmSync(quarantinePath, { force: true }) } catch {}
      }
      releaseAuthorityReclaimLease(reclaimLease)
    }
  }
  if (fd === null) throw new Error('Unable to acquire launcher state authority.')
  const handle = { fd, lockPath, instanceId, pid, borrowed: false }
  if (lockPath === authorityLockPath) launcherAuthority = handle
  return handle
}

export function releaseAuthorityLock(handle = launcherAuthority) {
  if (!handle) return
  if (handle.borrowed) return
  if (handle.fd !== null && handle.fd !== undefined) {
    try { fs.closeSync(handle.fd) } catch {}
  }
  const owner = readJsonFile(handle.lockPath)
  if (owner?.instanceId === handle.instanceId && Number(owner.pid) === Number(handle.pid)) {
    try { fs.rmSync(handle.lockPath, { force: true }) } catch {}
  }
  if (handle === launcherAuthority) launcherAuthority = null
}

function writeState(state) {
  ensureStateDir()
  const body = `${JSON.stringify(state, null, 2)}\n`
  const temporary = `${statePath}.${process.pid}.${randomUUID()}.tmp`
  fs.writeFileSync(temporary, body, { mode: 0o600 })
  fs.renameSync(temporary, statePath)
}

function writeServerInfo() {
  ensureStateDir()
  const temporary = `${serverInfoPath}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify({
    schemaVersion: 1,
    instanceId: launcherInstanceId,
    pid: process.pid,
    port: serverPort,
    startedAt: new Date().toISOString(),
  }, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, serverInfoPath)
}

function removeServerInfo() {
  try {
    if (!fs.existsSync(serverInfoPath)) return
    const info = JSON.parse(fs.readFileSync(serverInfoPath, 'utf8'))
    if (info.instanceId === launcherInstanceId) fs.rmSync(serverInfoPath, { force: true })
  } catch {
    // Stale server discovery files are harmless and will be replaced on next start.
  }
}

function readBuildCache() {
  try {
    return JSON.parse(fs.readFileSync(buildCachePath, 'utf8'))
  } catch {
    return { schemaVersion: 1, web: {} }
  }
}

function writeBuildCache(cache) {
  ensureStateDir()
  const temporary = `${buildCachePath}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, buildCachePath)
}

function hashDirectoryTree(root, hash, relative = '') {
  if (!fs.existsSync(root)) return
  const excluded = new Set(['.git', 'node_modules', 'dist', 'build', 'DerivedData'])
  const excludedFiles = new Set(['.DS_Store', 'npm-debug.log', 'yarn-error.log', 'pnpm-debug.log'])
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && excluded.has(entry.name)) continue
    if (entry.isFile() && (excludedFiles.has(entry.name) || entry.name.endsWith('.tsbuildinfo'))) continue
    const absolute = path.join(root, entry.name)
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) hashDirectoryTree(absolute, hash, childRelative)
    else if (entry.isFile()) {
      hash.update(childRelative)
      hash.update('\0')
      hash.update(fs.readFileSync(absolute))
      hash.update('\0')
    }
  }
}

export function webBuildInputHash(pack, webBuild) {
  const hash = createHash('sha256')
  hash.update('braze-demo-web-build/v1\0')
  hash.update(pack.runtimeManifest?.runtimeHash || '')
  hash.update('\0')
  hash.update(JSON.stringify({ command: webBuild.command, args: webBuild.args }))
  hash.update('\0')
  hashDirectoryTree(webBuild.cwd, hash)
  return hash.digest('hex')
}

function reusableWebBuild(pack, inputHash) {
  const cache = readBuildCache()
  const cached = cache.web?.[pack.id]
  const distDir = packWebDistDir(pack)
  const runtimePath = path.join(distDir, 'demo-runtime.json')
  if (cached?.inputHash !== inputHash || !fs.existsSync(path.join(distDir, 'index.html')) || !fs.existsSync(runtimePath)) return false
  try {
    const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'))
    return runtime.id === pack.id && runtime.runtimeHash === pack.runtimeManifest?.runtimeHash
  } catch {
    return false
  }
}

function rememberWebBuild(pack, inputHash) {
  const cache = readBuildCache()
  cache.schemaVersion = 1
  cache.web = cache.web && typeof cache.web === 'object' ? cache.web : {}
  cache.web[pack.id] = { inputHash, runtimeHash: pack.runtimeManifest?.runtimeHash || '', builtAt: new Date().toISOString() }
  writeBuildCache(cache)
}

function updateState(mutator) {
  const state = readState()
  ensureControlState(state, state.activePackId)
  mutator(state)
  ensureControlState(state, state.activePackId)
  state.ledger = (state.ledger || []).slice(0, activityLedgerLimit)
  state.activityArchives = (state.activityArchives || []).slice(0, 20)
  state.restResponses = (state.restResponses || []).slice(0, 40)
  writeState(state)
  broadcastState()
  broadcastOperatorState()
  return state
}

function writeSse(res, event, payload) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function flushStateBroadcast() {
  stateBroadcastTimer = null
  if (!sseClients.size) return
  let payload
  try {
    payload = publicState()
  } catch {
    return
  }
  for (const client of sseClients) {
    try {
      writeSse(client, 'state', payload)
    } catch {
      sseClients.delete(client)
    }
  }
  lastStateBroadcastAt = Date.now()
}

function broadcastState() {
  if (!sseClients.size || stateBroadcastTimer) return
  const delay = Math.max(0, stateBroadcastIntervalMs - (Date.now() - lastStateBroadcastAt))
  if (delay === 0) {
    flushStateBroadcast()
    return
  }
  stateBroadcastTimer = setTimeout(flushStateBroadcast, delay)
}

function broadcastOperatorState() {
  if (!operatorSseClients.size) return
  let snapshot
  try {
    snapshot = operatorSnapshot()
  } catch {
    return
  }
  if (lastOperatorSnapshot?.snapshotVersion === snapshot.snapshotVersion) return
  const previous = lastOperatorSnapshot
  lastOperatorSnapshot = snapshot
  for (const client of operatorSseClients) {
    try {
      if (!previous) {
        writeSse(client, 'snapshot', snapshot)
      } else {
        writeSse(client, 'delta', {
          launcherInstanceId,
          baseVersion: previous.snapshotVersion,
          snapshotVersion: snapshot.snapshotVersion,
          patch: {
            active: snapshot.active,
            readiness: snapshot.readiness,
            personas: snapshot.personas,
            controls: snapshot.controls,
            latestExecution: snapshot.latestExecution,
          },
        })
      }
    } catch {
      operatorSseClients.delete(client)
    }
  }
}

function broadcastOperatorExecution(execution) {
  for (const client of operatorSseClients) {
    try {
      writeSse(client, 'execution', execution)
    } catch {
      operatorSseClients.delete(client)
    }
  }
  broadcastOperatorState()
}

function publicJobUpdate(job) {
  const { logs: _logs, ...metadata } = job
  return { ...metadata, logCount: job.logs.length }
}

function broadcastJob(job, appendedLogs = []) {
  if (!job || !sseClients.size) return
  const payload = {
    job: publicJobUpdate(job),
    logOffset: Math.max(0, job.logs.length - appendedLogs.length),
    logs: appendedLogs,
  }
  for (const client of sseClients) {
    try {
      writeSse(client, 'job', payload)
    } catch {
      sseClients.delete(client)
    }
  }
}

function appendJobLogs(job, lines) {
  if (!job) return
  const appendedLogs = lines.filter((line) => line && line.trim())
  if (!appendedLogs.length) return
  job.logs.push(...appendedLogs)
  broadcastJob(job, appendedLogs)
}

function streamState(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.write(': connected\n\n')
  sseClients.add(res)
  writeSse(res, 'state', publicState())
  const keepAlive = setInterval(() => {
    try {
      res.write(': keep-alive\n\n')
    } catch {
      clearInterval(keepAlive)
      sseClients.delete(res)
    }
  }, 25_000)
  req.on('close', () => {
    clearInterval(keepAlive)
    sseClients.delete(res)
  })
}

function streamOperatorState(req, res) {
  requireOperatorSession(req)
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.write(': connected\n\n')
  operatorSseClients.add(res)
  const snapshot = operatorSnapshot()
  lastOperatorSnapshot = snapshot
  writeSse(res, 'snapshot', snapshot)
  const keepAlive = setInterval(() => {
    try {
      const current = operatorSnapshot()
      writeSse(res, 'heartbeat', {
        launcherInstanceId,
        snapshotVersion: current.snapshotVersion,
        ts: new Date().toISOString(),
      })
    } catch {
      clearInterval(keepAlive)
      operatorSseClients.delete(res)
    }
  }, 5_000)
  req.on('close', () => {
    clearInterval(keepAlive)
    operatorSseClients.delete(res)
  })
}

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  })
  res.end(payload)
}

function sendText(res, status, body, contentType = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'content-type': contentType, ...headers })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    let bytes = 0
    let rejected = false
    req.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk)
      if (bytes > requestBodyLimitBytes) {
        rejected = true
        const error = new Error(`Request body too large. Limit is ${requestBodyLimitBytes} bytes.`)
        error.statusCode = 413
        reject(error)
        req.destroy()
        return
      }
      body += chunk
    })
    req.on('end', () => {
      if (rejected) return
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        const error = new Error('Request body must be valid JSON.')
        error.statusCode = 400
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function allowedBrowserOrigins(port = serverPort) {
  return new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ])
}

export function assertRequestBoundary(req, url, port = serverPort) {
  const host = String(req.headers.host || '').toLowerCase()
  const allowedHosts = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
  ])
  if (url.pathname === '/api/device-events') allowedHosts.add(`10.0.2.2:${port}`)
  if (!allowedHosts.has(host)) {
    const error = new Error('Invalid launcher Host header.')
    error.statusCode = 403
    throw error
  }
  const origin = String(req.headers.origin || '')
  if (origin && !allowedBrowserOrigins(port).has(origin)) {
    const error = new Error('Cross-origin launcher request blocked.')
    error.statusCode = 403
    throw error
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method || '') && url.pathname !== '/api/device-events') {
    const contentType = String(req.headers['content-type'] || '')
    if (!contentType.toLowerCase().startsWith('application/json')) {
      const error = new Error('Launcher mutations require application/json.')
      error.statusCode = 415
      throw error
    }
  }
}

function cookieValue(req, name) {
  const raw = String(req.headers.cookie || '')
  for (const pair of raw.split(';')) {
    const [key, ...parts] = pair.trim().split('=')
    if (key === name) return decodeURIComponent(parts.join('='))
  }
  return ''
}

export function createOperatorSessionAuthority({
  pairingToken = randomUUID(),
  instanceId = launcherInstanceId,
  createSessionId = randomUUID,
} = {}) {
  let currentPairingToken = String(pairingToken)
  const sessions = new Set()
  return {
    pairingToken: () => currentPairingToken,
    require(req) {
      const session = cookieValue(req, 'braze_demo_operator')
      if (!session || !sessions.has(session)) {
        const error = new Error('Presenter Remote session is not paired with this launcher.')
        error.statusCode = 401
        throw error
      }
      return session
    },
    pair(body, req) {
      const existingSession = cookieValue(req, 'braze_demo_operator')
      if (existingSession && sessions.has(existingSession)) {
        return {
          headers: { 'cache-control': 'no-store' },
          body: { paired: true, launcherInstanceId: instanceId, reused: true },
        }
      }
      const token = String(body?.token || '')
      if (token.length !== currentPairingToken.length || token !== currentPairingToken) {
        const error = new Error('Presenter Remote pairing token is invalid or has already been used.')
        error.statusCode = 401
        throw error
      }
      currentPairingToken = randomUUID()
      const session = String(createSessionId())
      sessions.add(session)
      return {
        headers: {
          'set-cookie': `braze_demo_operator=${encodeURIComponent(session)}; HttpOnly; SameSite=Strict; Path=/api/operator/v1; Max-Age=14400`,
          'cache-control': 'no-store',
        },
        body: { paired: true, launcherInstanceId: instanceId },
      }
    },
  }
}

function requireOperatorSession(req) {
  return operatorSessionAuthority.require(req)
}

function pairOperatorSession(body, req) {
  return operatorSessionAuthority.pair(body, req)
}

function canListen(port) {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => {
      probe.close(() => resolve(true))
    })
    probe.listen(port, '127.0.0.1')
  })
}

async function findAvailablePort(startPort, { strict = false, attempts = 20 } = {}) {
  if (strict) {
    if (await canListen(startPort)) return startPort
    throw new Error(`Port ${startPort} is already in use. Stop the existing process or choose --port <port>.`)
  }

  for (let offset = 0; offset <= attempts; offset += 1) {
    const port = startPort + offset
    if (await canListen(port)) {
      if (offset > 0) console.log(`Port ${startPort} is in use; using ${port}.`)
      return port
    }
  }
  throw new Error(`No available launcher port found from ${startPort} to ${startPort + attempts}.`)
}

function readLauncherServerInfo() {
  try {
    const info = JSON.parse(fs.readFileSync(serverInfoPath, 'utf8'))
    return info && Number.isInteger(Number(info.port)) ? info : null
  } catch {
    return null
  }
}

function launcherJsonRequest(port, requestPath, { method = 'GET', body = null, timeout = 2_000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? '' : JSON.stringify(body)
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: requestPath,
      method,
      timeout,
      headers: {
        accept: 'application/json',
        ...(body === null ? {} : {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        }),
      },
    }, (response) => {
      let raw = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { raw += chunk })
      response.on('end', () => {
        let parsed = {}
        try { parsed = raw ? JSON.parse(raw) : {} } catch {}
        if ((response.statusCode || 500) >= 400) {
          const error = new Error(parsed.error || `Launcher returned HTTP ${response.statusCode}.`)
          error.statusCode = response.statusCode
          error.details = parsed.details
          reject(error)
        } else resolve(parsed)
      })
    })
    request.once('timeout', () => request.destroy(new Error('Launcher request timed out.')))
    request.once('error', reject)
    if (payload) request.write(payload)
    request.end()
  })
}

async function launcherHealth(port) {
  if (!Number.isInteger(Number(port)) || Number(port) < 1) return null
  try {
    const health = await launcherJsonRequest(Number(port), '/api/health', { timeout: 900 })
    return health?.ok ? health : null
  } catch {
    return null
  }
}

async function waitForDelegatedJob(port, jobId) {
  if (!jobId) throw new Error('Existing launcher did not return a job id.')
  while (true) {
    const job = await launcherJsonRequest(port, `/api/jobs/${encodeURIComponent(jobId)}`, { timeout: 5_000 })
    if (job.status !== 'running') return job
    await sleep(500)
  }
}

function listenControlRoomServer(port, { announce = false } = {}) {
  return new Promise((resolve, reject) => {
    let authority
    try {
      authority = acquireAuthorityLock()
    } catch (error) {
      reject(error)
      return
    }
    const server = http.createServer((req, res) => {
      handleRequest(req, res)
    })
    server.launcherAuthority = authority
    const onListenError = (error) => {
      releaseAuthorityLock(authority)
      reject(error)
    }
    server.once('error', onListenError)
    server.listen(port, '127.0.0.1', async () => {
      server.removeListener('error', onListenError)
      try {
        await stopLegacyAndroidTimeGuards(null, androidTimeGuard.status().pid)
        beginActivitySession('launcher_started')
        writeServerInfo()
      } catch (error) {
        server.close()
        releaseAuthorityLock(authority)
        reject(error)
        return
      }
      if (announce) {
        const serverUrl = `http://127.0.0.1:${port}`
        console.log(`Braze Demo Control Room running at ${serverUrl}`)
        console.log(`Presenter Remote: ${serverUrl}/presenter#pair=${operatorSessionAuthority.pairingToken()}`)
        console.log(`Android telemetry callback: ${launcherCallbackUrl()}`)
        console.log('Press Ctrl+C to stop.')
      }
      resolve(server)
    })
  })
}

async function closeServer(server) {
  await Promise.all([
    stopLiveWebProcess(),
    androidTimeGuard.stop(),
  ])
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      removeServerInfo()
      releaseAuthorityLock(server.launcherAuthority)
      if (error) reject(error)
      else resolve()
    }
    server.close(finish)
    server.closeIdleConnections?.()
    setTimeout(() => {
      server.closeAllConnections?.()
      finish()
    }, 1_000).unref()
  })
}

async function runCommand(command, args, options, job) {
  const line = `$ ${[command, ...args].join(' ')}`
  appendJobLogs(job, [line])
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      shell: false,
    })
    child.stdout.on('data', (data) => pushLog(job, data.toString()))
    child.stderr.on('data', (data) => pushLog(job, data.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}`))
    })
  })
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      env: { ...process.env, ...(options.env || {}) },
      shell: false,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${command} exited with code ${code}\n${stderr || stdout}`))
    })
  })
}

function setLiveWebState(patch) {
  updateState((state) => {
    state.development = state.development && typeof state.development === 'object' ? state.development : {}
    const current = state.development.liveWeb && typeof state.development.liveWeb === 'object'
      ? state.development.liveWeb
      : {}
    state.development.liveWeb = {
      hostUrl: liveWebHostUrl,
      deviceUrl: liveWebDeviceUrl,
      ...current,
      ...patch,
      ownerInstanceId: patch.ownerInstanceId === undefined ? launcherInstanceId : patch.ownerInstanceId,
    }
  })
}

function probeHttp(url, timeoutMs = 750) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      response.resume()
      resolve((response.statusCode || 500) < 500)
    })
    request.once('timeout', () => {
      request.destroy()
      resolve(false)
    })
    request.once('error', () => resolve(false))
  })
}

async function waitForLiveWebServer(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!liveWebProcess || liveWebProcess.exitCode !== null) break
    if (await probeHttp(liveWebHostUrl)) return
    await sleep(150)
  }
  throw new Error('Vite did not become ready on the fixed development port 5173.')
}

async function startLiveWebProcess() {
  if (liveWebProcess && liveWebProcess.exitCode === null) {
    await waitForLiveWebServer()
    return liveWebProcess
  }
  if (!(await canListen(liveWebPort))) {
    throw new Error('Port 5173 is already in use by a process this launcher does not own. Stop it before enabling Android live-web mode.')
  }
  const viteEntry = path.join(webTemplateDir, 'node_modules/vite/bin/vite.js')
  if (!fs.existsSync(viteEntry)) {
    throw new Error('Vite is not installed in web-template. Run the repository bootstrap before enabling live-web mode.')
  }

  liveWebStartedAt = new Date().toISOString()
  setLiveWebState({
    enabled: false,
    overrideMayBeActive: false,
    status: 'starting',
    startedAt: liveWebStartedAt,
    confirmedAt: '',
    error: '',
    pid: null,
  })
  const child = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', String(liveWebPort), '--strictPort'], {
    cwd: webTemplateDir,
    env: { ...process.env },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  liveWebProcess = child
  let logTail = ''
  const capture = (data) => {
    logTail = `${logTail}${data.toString()}`.slice(-4_000)
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  child.once('error', (error) => {
    if (liveWebProcess !== child || liveWebStopping) return
    liveWebProcess = null
    const hazard = currentLiveWebHazard()
    setLiveWebState({
      enabled: false,
      overrideMayBeActive: hazard.mayBeActive,
      status: 'error',
      pid: null,
      error: error.message || String(error),
      logTail,
    })
  })
  child.once('exit', (code, signal) => {
    if (liveWebProcess !== child) return
    liveWebProcess = null
    if (liveWebStopping) return
    setLiveWebState({
      enabled: false,
      overrideMayBeActive: currentLiveWebHazard().mayBeActive,
      status: 'error',
      pid: null,
      error: `Owned Vite process stopped unexpectedly (${signal || `exit ${code}`}).`,
      logTail,
    })
  })
  try {
    await waitForLiveWebServer()
    setLiveWebState({ status: 'server_ready', pid: child.pid, error: '', logTail })
    return child
  } catch (error) {
    await stopLiveWebProcess({ preserveStatus: true })
    setLiveWebState({
      enabled: false,
      overrideMayBeActive: currentLiveWebHazard().mayBeActive,
      status: 'error',
      pid: null,
      error: `${error.message}${logTail ? `\n${logTail}` : ''}`,
    })
    throw error
  }
}

export function liveWebStateAfterHostStop(
  current = {},
  { hazardMayBeActive = false, bundledSourceConfirmed = false } = {},
) {
  const preserveHazard = !bundledSourceConfirmed && Boolean(
    hazardMayBeActive ||
    current.overrideMayBeActive ||
    current.enabled ||
    ['starting', 'server_ready', 'switching', 'active', 'clearing', 'error'].includes(current.status),
  )
  return {
    ...current,
    enabled: false,
    overrideMayBeActive: preserveHazard,
    status: preserveHazard ? 'error' : 'stopped',
    pid: null,
    ownerInstanceId: '',
    error: preserveHazard
      ? (current.error || 'The development server stopped before correlated bundled-source proof cleared the native override hazard.')
      : '',
  }
}

async function stopLiveWebProcess({ preserveStatus = false, bundledSourceConfirmed = false } = {}) {
  if (liveWebStopping) return liveWebStopping
  const stateBeforeStop = readState()
  const liveWebBeforeStop = stateBeforeStop.development?.liveWeb || {}
  const hazardBeforeStop = currentLiveWebHazard(stateBeforeStop)
  const persistStoppedState = () => {
    if (preserveStatus) return
    setLiveWebState(liveWebStateAfterHostStop(liveWebBeforeStop, {
      hazardMayBeActive: hazardBeforeStop.mayBeActive,
      bundledSourceConfirmed,
    }))
  }
  const child = liveWebProcess
  if (!child || child.exitCode !== null) {
    liveWebProcess = null
    liveWebStartedAt = ''
    persistStoppedState()
    return
  }
  liveWebStopping = new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      if (liveWebProcess === child) liveWebProcess = null
      liveWebStartedAt = ''
      resolve()
    }
    child.once('exit', finish)
    child.kill('SIGTERM')
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
      finish()
    }, 2_000).unref()
  })
  try {
    await liveWebStopping
  } finally {
    liveWebStopping = null
  }
  persistStoppedState()
}

function pushLog(job, text) {
  if (!job) return
  appendJobLogs(job, text.split(/\r?\n/))
}

function setJobStep(job, step) {
  const now = Date.now()
  if (job.currentStageStartedAt && job.step) {
    job.timings[job.step] = (job.timings[job.step] || 0) + (now - job.currentStageStartedAt)
  }
  job.step = step
  job.currentStageStartedAt = now
  broadcastJob(job)
}

function finishJob(job, status, step) {
  const now = Date.now()
  if (job.currentStageStartedAt && job.step) {
    job.timings[job.step] = (job.timings[job.step] || 0) + (now - job.currentStageStartedAt)
  }
  job.status = status
  job.step = step
  job.finishedAt = new Date().toISOString()
  job.durationMs = now - new Date(job.startedAt).getTime()
  delete job.currentStageStartedAt
  const stages = Object.entries(job.timings)
    .map(([name, durationMs]) => `${name}=${(durationMs / 1000).toFixed(1)}s`)
    .join(', ')
  job.logs.push(
    `Timing: total=${(job.durationMs / 1000).toFixed(1)}s; launchMode=${job.launchMode}; ${stages}`,
  )
  broadcastJob(job)
}

function jobEvidence(job) {
  return {
    jobId: job.id,
    packId: job.packId,
    platform: job.platform,
    target: job.target,
    status: job.status,
    step: job.step,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    durationMs: job.durationMs,
    timings: { ...job.timings },
    skipped: [...job.skipped],
    launchMode: job.launchMode,
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mask(value) {
  if (!value) return ''
  if (value.length <= 8) return '••••'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

function normalizeRestEndpoint(endpoint) {
  const trimmed = endpoint.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
}

function restEnvKeyName(packId) {
  const suffix = String(packId || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return suffix ? `BRAZE_REST_API_KEY_${suffix}` : ''
}

function restCredentialStatus(pack, secrets = pack.secrets || {}) {
  const packEnv = restEnvKeyName(pack.id)
  const sessionKey = sessionRestApiKeys.get(pack.id) || ''
  const packEnvKey = packEnv ? process.env[packEnv] || '' : ''
  const globalEnvKey = process.env.BRAZE_REST_API_KEY || ''
  const legacyAllowed = process.env.BRAZE_CONTROL_ROOM_ALLOW_LEGACY_REST_KEY === '1'
  const legacyKey = legacyAllowed ? secrets['braze.restApiKey'] || '' : ''
  const key = sessionKey || packEnvKey || globalEnvKey || legacyKey
  const source = sessionKey
    ? 'session'
    : packEnvKey
      ? packEnv
      : globalEnvKey
        ? 'BRAZE_REST_API_KEY'
        : legacyKey
          ? 'legacy secrets.properties'
          : ''
  return {
    configured: Boolean(key),
    key,
    source,
    envName: packEnv,
    legacyAvailable: Boolean(secrets['braze.restApiKey']),
    legacyAllowed,
  }
}

function restCredentialLabel(status) {
  if (!status.configured) {
    if (status.legacyAvailable && !status.legacyAllowed) return 'legacy ignored'
    return 'none'
  }
  if (status.source === 'session') return 'session'
  if (status.source === 'BRAZE_REST_API_KEY') return 'global env'
  if (status.source === 'legacy secrets.properties') return 'legacy file'
  return 'pack env'
}

function activePackAndSecrets(state = readState()) {
  const pack = safeGetDemoPack(state.activePackId || getActivePackId())
  if (state.activePackId !== pack.id) {
    updateState((nextState) => {
      nextState.activePackId = pack.id
    })
  }
  return { pack, secrets: pack.secrets || {} }
}

function packProfile(pack, secrets, state = readState()) {
  const android = pack.android || {}
  const sdkEndpoint = secrets['braze.endpoint'] || ''
  const restEndpoint = normalizeRestEndpoint(secrets['braze.restEndpoint'] || '')
  const restStatus = restCredentialStatus(pack, secrets)
  const externalId =
    state.activeExternalId ||
    secrets['demo.externalId'] ||
    android.defaultExternalId ||
    pack.brand.demoUser.externalId
  return {
    packId: pack.id,
    packName: pack.name,
    externalId,
    displayName: state.activeDisplayName || secrets['demo.displayName'] || pack.brand.demoUser.firstName || '',
    sdkEndpoint,
    sdkConfigured: Boolean(secrets['braze.apiKey'] && sdkEndpoint),
    sdkApiKeyPreview: mask(secrets['braze.apiKey'] || ''),
    restEndpoint,
    restConfigured: Boolean(restEndpoint && restStatus.configured),
    restApiKeyPreview: restCredentialLabel(restStatus),
    restCredentialSource: restCredentialLabel(restStatus),
    restCredentialEnvName: restStatus.envName,
    restLegacyKeyIgnored: Boolean(restStatus.legacyAvailable && !restStatus.legacyAllowed),
  }
}

export function sdkCredentialContextFingerprint(pack, runtime, platform) {
  const apiKey = String(pack.secrets?.['braze.apiKey'] || '').trim()
  const endpoint = String(pack.secrets?.['braze.endpoint'] || '').trim()
  if (!apiKey || !endpoint) return ''
  if (platform !== 'android' && platform !== 'ios') return ''
  return createHash('sha256')
    .update([
      `${platform}-sdk-credential-context/v1`,
      String(pack.id || '').trim() || 'default',
      String(runtime?.configHash || '').trim(),
      apiKey,
      endpoint,
    ].join('\0'))
    .digest('hex')
}

export function androidSdkCredentialContextFingerprint(pack, runtime) {
  return sdkCredentialContextFingerprint(pack, runtime, 'android')
}

export function iosSdkCredentialContextFingerprint(pack, runtime) {
  return sdkCredentialContextFingerprint(pack, runtime, 'ios')
}

function credentialPayload(packId) {
  const pack = getDemoPack(packId)
  const secrets = pack.secrets || {}
  const restStatus = restCredentialStatus(pack, secrets)
  return {
    packId: pack.id,
    packName: pack.name,
    hasSecrets: Object.keys(secrets).length > 0,
    fields: {
      brazeApiKey: mask(secrets['braze.apiKey'] || ''),
      brazeEndpoint: secrets['braze.endpoint'] || '',
      brazeRestEndpoint: normalizeRestEndpoint(secrets['braze.restEndpoint'] || ''),
      brazeRestApiKey: '',
      brazeRestCredentialSource: restCredentialLabel(restStatus),
      brazeRestEnvName: restStatus.envName,
      firebaseSenderId: mask(secrets['firebase.senderId'] || ''),
      demoExternalId: secrets['demo.externalId'] || pack.android?.defaultExternalId || pack.brand.demoUser.externalId || '',
      demoProfileName: secrets['demo.profileName'] || pack.android?.defaultProfileName || pack.name || '',
      demoDisplayName: secrets['demo.displayName'] || pack.brand.demoUser.firstName || '',
    },
    configured: {
      sdk: Boolean(secrets['braze.apiKey'] && secrets['braze.endpoint']),
      rest: Boolean(secrets['braze.restEndpoint'] && restStatus.configured),
      firebase: Boolean(secrets['firebase.senderId']),
    },
    security: {
      restKeySource: restCredentialLabel(restStatus),
      restEnvName: restStatus.envName,
      legacyRestKeyIgnored: Boolean(restStatus.legacyAvailable && !restStatus.legacyAllowed),
    },
  }
}

function saveCredentials(body = {}) {
  if (!body.packId) throw new Error('packId is required')
  const pack = getDemoPack(body.packId)
  const sessionKey = String(body.sessionRestApiKey || body.brazeRestApiKey || '').trim()
  if (sessionKey) sessionRestApiKeys.set(pack.id, sessionKey)
  const values = {
    'braze.apiKey': body.brazeApiKey,
    'braze.endpoint': body.brazeEndpoint,
    'braze.restEndpoint': body.brazeRestEndpoint,
    'firebase.senderId': body.firebaseSenderId,
    'demo.externalId': body.demoExternalId,
    'demo.profileName': body.demoProfileName,
    'demo.displayName': body.demoDisplayName,
  }
  writeDemoPackSecrets(pack, values)
  const refreshedPack = applyDemoPack(pack.id, {
    launcherCallbackUrl: launcherCallbackUrl(),
    iosLauncherCallbackUrl: iosLauncherCallbackUrl(),
  })
  updateState((state) => {
    state.activePackId = refreshedPack.id
    if (body.demoExternalId) state.activeExternalId = body.demoExternalId
    if (body.demoDisplayName) state.activeDisplayName = body.demoDisplayName
  })
  return credentialPayload(pack.id)
}

function packPresets(pack, state = readState()) {
  const controlState = controlStateForPack(state, pack.id)
  return [
    {
      ...demoSeedAttributesPreset(pack),
      origin: 'standard',
    },
    ...builtInPresets.map((preset) => ({
      ...preset,
      origin: preset.type === 'change_user' ? 'internal' : 'standard',
    })),
    ...(pack.launcher?.presets || []).map((preset) => ({ ...preset, origin: 'pack_library' })),
    ...controlState.staged.map((preset) => ({ ...preset, origin: preset.origin || 'staged', staged: true })),
  ]
}

function publicPack(pack) {
  const { secrets, ...rest } = pack
  return rest
}

export function selectFreshRuntimeManifest(generated, computed) {
  if (
    generated?.id === computed?.id &&
    generated?.configHash === computed?.configHash &&
    generated?.runtimeHash === computed?.runtimeHash
  ) return generated
  return computed
}

function runtimeForPack(pack) {
  const computed = createRuntimeManifest(pack)
  if (fs.existsSync(generatedRuntimeManifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(generatedRuntimeManifestPath, 'utf8'))
      return selectFreshRuntimeManifest(manifest, computed)
    } catch {
      // Fall through to a computed manifest for display.
    }
  }
  return computed
}

function runtimeWarnings(manifest, state = readState()) {
  const warnings = []
  if (manifest.expectedSources?.android !== 'file:///android_asset/demo/index.html') {
    warnings.push('Android expected source is not the canonical bundled demo asset.')
  }
  if (manifest.expectedSources?.ios !== 'http://localhost:5173') {
    warnings.push('iOS expected source is not the Vite 5173 dev server.')
  }
  const deviceRuntime = state.deviceRuntime
  if (deviceRuntime && deviceRuntime.id && deviceRuntime.id !== manifest.id) {
    warnings.push(`${deviceRuntime.platform} reported pack ${deviceRuntime.id}, expected ${manifest.id}.`)
  }
  const expectedHash = manifest.runtimeHash || manifest.configHash
  const reportedHash = deviceRuntime?.runtimeHash || deviceRuntime?.configHash
  if (deviceRuntime && reportedHash && reportedHash !== expectedHash) {
    warnings.push(`${deviceRuntime.platform} reported runtime hash ${reportedHash}, expected ${expectedHash}.`)
  }
  if (deviceRuntime && deviceRuntime.externalId && state.activeExternalId && deviceRuntime.externalId !== state.activeExternalId) {
    warnings.push(`${deviceRuntime.platform} reported user ${deviceRuntime.externalId}, expected ${state.activeExternalId}.`)
  }
  return warnings
}

export function operatorPersonas(pack, state = readState()) {
  const seen = new Set()
  const defaultExternalId = String(pack.android?.defaultExternalId || pack.brand?.demoUser?.externalId || '')
  const defaultDisplayName = String(pack.brand?.demoUser?.firstName || pack.brand?.demoUser?.displayName || '')
  const defaultPersona = defaultExternalId
    ? [{
        id: `pack_default_${createHash('sha256').update(`${pack.id}:${defaultExternalId}`).digest('hex').slice(0, 12)}`,
        label: defaultDisplayName || 'Default persona',
        description: 'Default named persona for this demo pack.',
        type: 'change_user',
        payload: { externalId: defaultExternalId, displayName: defaultDisplayName },
      }]
    : []
  return [
    ...defaultPersona,
    ...(Array.isArray(pack.launcher?.presets) ? pack.launcher.presets : [])
      .filter((preset) => preset.type === 'change_user'),
  ]
    .map((preset) => ({
      id: String(preset.id || ''),
      label: String(preset.label || preset.payload?.displayName || preset.payload?.externalId || ''),
      description: String(preset.description || ''),
      externalId: String(preset.payload?.externalId || ''),
      displayName: String(preset.payload?.displayName || ''),
    }))
    .filter((persona) => persona.id && persona.externalId)
    .filter((persona) => {
      if (seen.has(persona.externalId)) return false
      seen.add(persona.externalId)
      return true
    })
}

export function activeOperatorPersona(pack, state, personas = operatorPersonas(pack, state)) {
  const externalId = state.activeExternalId || pack.android?.defaultExternalId || pack.brand.demoUser.externalId
  const matched = personas.find((persona) => persona.externalId === externalId)
  if (matched) return { id: matched.id, label: matched.label, description: matched.description, approved: true }
  return {
    id: `active:${createHash('sha256').update(externalId).digest('hex').slice(0, 12)}`,
    label: 'Unapproved active user',
    description: 'Select one of the named demo personas before presenting.',
    approved: false,
  }
}

export function isCurrentLauncherEvidence(evidence, instanceId = launcherInstanceId) {
  return Boolean(evidence && evidence.observedByLauncherInstanceId === instanceId)
}

export function withLauncherObservation(evidence, instanceId = launcherInstanceId, observedAt = new Date().toISOString()) {
  if (!evidence) return null
  return {
    ...evidence,
    observedByLauncherInstanceId: instanceId,
    observedAt,
  }
}

export function runtimeEvidenceIsComplete(evidence) {
  return Boolean(
    evidence?.id &&
    (evidence.runtimeHash || evidence.configHash) &&
    evidence.sourceUrl &&
    evidence.deviceId &&
    evidence.externalId,
  )
}

export function liveWebHazard(state, { ownedProcessRunning = false } = {}) {
  const liveWeb = state?.development?.liveWeb || {}
  const nativeOverride = Boolean(state?.deviceRuntime?.platform === 'android' && state.deviceRuntime.sourceOverride)
  const transitional = ['starting', 'server_ready', 'switching', 'clearing'].includes(liveWeb.status)
  const recordedMayBeActive = Boolean(liveWeb.overrideMayBeActive || liveWeb.enabled)
  const mayBeActive = Boolean(nativeOverride || recordedMayBeActive || transitional || ownedProcessRunning)
  const confirmedActive = Boolean(
    liveWeb.enabled &&
    liveWeb.status === 'active' &&
    ownedProcessRunning &&
    nativeOverride,
  )
  const uncertain = Boolean(
    (mayBeActive && !confirmedActive) ||
    (liveWeb.status === 'error' && liveWeb.overrideMayBeActive !== false),
  )
  return {
    mayBeActive,
    confirmedActive,
    uncertain,
    nativeOverride,
    transitional,
    status: String(liveWeb.status || 'stopped'),
  }
}

function currentLiveWebHazard(state = readState()) {
  return liveWebHazard(state, {
    ownedProcessRunning: Boolean(liveWebProcess && liveWebProcess.exitCode === null),
  })
}

export function operatorBaseBlockers(pack, runtime, state = readState(), instanceId = launcherInstanceId) {
  const blockers = []
  const platform = state.activePlatform === 'ios' ? 'ios' : 'android'
  const device = state.deviceRuntime
  const personas = operatorPersonas(pack, state)
  const activeExternalId = state.activeExternalId || pack.android?.defaultExternalId || pack.brand?.demoUser?.externalId || ''
  const expectedHash = runtime.runtimeHash || runtime.configHash
  const reportedHash = device?.runtimeHash || device?.configHash
  const liveWeb = state.development?.liveWeb
  const ownedProcessRunning = instanceId === launcherInstanceId && Boolean(liveWebProcess && liveWebProcess.exitCode === null)
  const liveHazard = liveWebHazard(state, { ownedProcessRunning })
  const expectedSource = liveHazard.confirmedActive && platform === 'android'
    ? liveWeb.deviceUrl
    : runtime.expectedSources?.[platform]
  const add = (code, label, detail) => blockers.push({ code, label, detail })
  const sdkCredentialsComplete = Boolean(
    String(pack.secrets?.['braze.apiKey'] || '').trim() &&
    String(pack.secrets?.['braze.endpoint'] || '').trim(),
  )

  const activeJob = Array.from(jobs.values()).find((job) => job.status === 'running')
  if (activeJob) add('launcher_busy', 'Launcher is working', activeJob.step || 'Preparing the selected runtime.')
  if (!sdkCredentialsComplete) {
    add(
      'sdk_credentials_missing',
      'Selected-pack SDK credentials missing',
      'Configure a Braze SDK API key and endpoint for the active demo pack before presenting.',
    )
  }
  if (!personas.some((persona) => persona.externalId === activeExternalId)) {
    add('persona_unapproved', 'Unapproved active user', 'Select one of the named demo personas before presenting.')
  }
  if (!device) add('device_missing', 'No runtime evidence', 'Launch the selected app and wait for native runtime telemetry.')
  else {
    if (!isCurrentLauncherEvidence(device, instanceId)) {
      add('device_evidence_stale', 'Runtime evidence is stale', 'Wait for native runtime telemetry observed by this launcher instance.')
    }
    if (device.platform !== platform) add('platform_mismatch', 'Wrong platform', `Device reported ${device.platform || 'unknown'}, expected ${platform}.`)
    if (device.id !== runtime.id) add('pack_mismatch', 'Wrong pack', `Device reported ${device.id || 'none'}, expected ${runtime.id}.`)
    if (!reportedHash || reportedHash !== expectedHash) {
      add('runtime_hash_mismatch', 'Stale runtime', `Device runtime hash ${reportedHash || 'missing'} does not match ${expectedHash}.`)
    }
    if (expectedSource && device.sourceUrl !== expectedSource) {
      add('source_mismatch', 'Wrong render source', `Device reported ${device.sourceUrl || 'none'}, expected ${expectedSource}.`)
    }
    if (activeExternalId && device.externalId !== activeExternalId) {
      add('identity_mismatch', 'Wrong persona', 'The native app has not applied the selected named persona.')
    }
    if (sdkCredentialsComplete) {
      const expectedCredentialContext = sdkCredentialContextFingerprint(pack, runtime, platform)
      const platformLabel = platform === 'android' ? 'Android' : 'iOS'
      if (device.sdkConfigured !== true || !device.sdkCredentialContextFingerprint) {
        add(
          'sdk_credential_context_missing',
          `${platformLabel} SDK workspace is not confirmed`,
          'Relaunch the selected pack and wait for its current SDK credential context telemetry.',
        )
      } else if (device.sdkCredentialContextFingerprint !== expectedCredentialContext) {
        add(
          'sdk_credential_context_mismatch',
          `${platformLabel} SDK workspace mismatch`,
          'The running app is configured for a different SDK workspace context. Re-apply and relaunch the selected pack.',
        )
      }
    }
  }
  if (platform === 'android') {
    if (liveHazard.uncertain) {
      add('live_web_uncertain', 'Development source is uncertain', 'Restore and confirm the bundled Android source before continuing.')
    }
  }
  if (platform === 'android' || platform === 'ios') {
    const source = state.deviceSourceReadiness
    const sourceHash = source?.runtimeHash || source?.configHash
    const expectedOverride = platform === 'android' ? liveHazard.confirmedActive : false
    if (
      !isCurrentLauncherEvidence(source, instanceId) ||
      source?.platform !== platform ||
      source?.renderConfirmed !== true ||
      source?.id !== runtime.id ||
      sourceHash !== expectedHash ||
      source?.sourceUrl !== expectedSource ||
      source?.sourceOverride !== expectedOverride
    ) {
      add('source_not_confirmed', 'Render source is not confirmed', `Wait for ${platform === 'android' ? 'Android' : 'iOS'} to render and confirm ${expectedSource || 'the expected source'}.`)
    }
  }
  if (platform === 'android') {
    const trust = latestActiveTrustDiagnostics(state, instanceId)
    if (!trust?.ready) add('trust_not_ready', 'HTTPS trust not ready', trust?.error || 'Run Android trust preparation and diagnostics.')
  }
  return blockers
}

function operatorVariants(preset) {
  const variants = Array.isArray(preset.presenterVariants) ? preset.presenterVariants : []
  return variants.slice(0, 12).map((variant) => ({
    id: String(variant.id || ''),
    label: String(variant.label || variant.name || variant.id || 'Variant'),
    description: String(variant.description || ''),
    isDefault: Boolean(variant.isDefault || variant.default),
  })).filter((variant) => variant.id)
}

function controlBlockReason(preset, state, baseBlockers) {
  if (baseBlockers.length) return baseBlockers[0].detail
  if (preset.validation && preset.validation.ok === false) return preset.validation.errors?.join(' ') || 'Control validation failed.'
  const platform = state.activePlatform === 'ios' ? 'ios' : 'android'
  if (preset.platform && preset.platform !== 'host' && preset.platform !== platform) {
    return `This control is approved for ${preset.platform}, not ${platform}.`
  }
  const { pack, secrets } = activePackAndSecrets(state)
  if (sourceForPreset(preset) === 'braze_rest' && !restCredentialStatus(pack, secrets).configured) {
    return 'Braze REST credentials are not available in this launcher session.'
  }
  if (preset.requiresPushToken) {
    return pushReadinessBlockReason(latestActivePushReadiness(state), {
      platform,
      externalId: state.activeExternalId || '',
    }) || ''
  }
  return ''
}

export function presenterControlPresets(pack, state) {
  const controlState = controlStateForPack(state, pack.id)
  return controlState.pinned
    .map((id) => findControlById(pack, state, id))
    .filter(Boolean)
    .filter((preset) => preset.type !== 'change_user' && !controlState.hidden.includes(preset.id))
    .slice(0, 7)
}

const controlRoomRestStoryTypes = new Set([
  'rest_event',
  'rest_attribute',
  'rest_purchase',
  'campaign_trigger',
  'canvas_trigger',
  'profile_export',
  'braze_rest_request',
])

const controlRoomPushStoryTypes = new Set(['push_permission', 'push_readiness'])

function isPackOwnedStoryControl(control) {
  return Boolean(
    control &&
    control.type !== 'change_user' &&
    !control.hidden &&
    (control.staged || ['pack_library', 'pack_story', 'staged'].includes(control.origin)),
  )
}

/**
 * Resolve the controls that define the Control Room story. Generic built-ins are
 * intentionally excluded even when pinned: they remain authoring/fallback tools,
 * not evidence that a demo story has been configured.
 */
export function controlRoomStoryControls(controls = [], { limit = 7 } = {}) {
  const configured = Array.from(controls || []).filter(isPackOwnedStoryControl)
  const pinned = configured.filter((control) => control.pinned)
  return (pinned.length ? pinned : configured).slice(0, limit)
}

/** Derive channel requirements from the selected story controls, never the template library. */
export function controlRoomStoryRequirements(controls = []) {
  const storyControls = controlRoomStoryControls(controls, { limit: Number.MAX_SAFE_INTEGER })
  return {
    configured: storyControls.length > 0,
    controlIds: storyControls.map((control) => control.id),
    needsRest: storyControls.some(
      (control) => control.transport === 'braze_rest' || controlRoomRestStoryTypes.has(control.type),
    ),
    needsPush: storyControls.some(
      (control) => Boolean(control.requiresPushToken) || controlRoomPushStoryTypes.has(control.type),
    ),
  }
}

function operatorControls(pack, state, baseBlockers) {
  return presenterControlPresets(pack, state)
    .map((preset) => {
      const resolved = withPresetMeta(preset, state)
      const blockReason = controlBlockReason(resolved, state, baseBlockers)
      return {
        id: resolved.id,
        label: resolved.label,
        description: resolved.description || '',
        disabled: Boolean(blockReason),
        blockReason,
        variants: operatorVariants(resolved),
      }
    })
}

export function operatorExecutionMatchesContext(execution, context) {
  return Boolean(
    execution &&
    execution.packId === context.packId &&
    execution.runtimeHash === context.runtimeHash &&
    execution.platform === context.platform &&
    execution.personaId === context.personaId,
  )
}

export function selectLatestOperatorExecution(executions, context) {
  return Array.from(executions || [])
    .filter((execution) => operatorExecutionMatchesContext(execution, context))
    .sort((a, b) => {
      const orderDifference = Number(b.createdOrder || 0) - Number(a.createdOrder || 0)
      if (orderDifference) return orderDifference
      const createdDifference = String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      if (createdDifference) return createdDifference
      return String(b.executionId || '').localeCompare(String(a.executionId || ''))
    })[0] || null
}

function latestOperatorExecution(context) {
  return selectLatestOperatorExecution(operatorExecutions.values(), context)
}

function operatorSnapshot() {
  const state = readState()
  const { pack } = activePackAndSecrets(state)
  const runtime = runtimeForPack(pack)
  const personas = operatorPersonas(pack, state)
  const blockers = operatorBaseBlockers(pack, runtime, state)
  const activePersona = activeOperatorPersona(pack, state, personas)
  const executionContext = {
    packId: pack.id,
    runtimeHash: runtime.runtimeHash || runtime.configHash,
    platform: state.activePlatform === 'ios' ? 'ios' : 'android',
    personaId: activePersona.id,
  }
  const content = {
    apiVersion: 'operator/v1',
    launcherInstanceId,
    staleAfterMs: 12_000,
    active: {
      pack: { id: pack.id, name: pack.name },
      platform: state.activePlatform === 'ios' ? 'ios' : 'android',
      runtime: { configHash: runtime.configHash, runtimeHash: runtime.runtimeHash || runtime.configHash },
      persona: activePersona,
    },
    readiness: {
      status: blockers.length ? 'blocked' : 'ready',
      summary: blockers.length ? blockers[0].detail : 'Pack, credentials, runtime, source, identity, and trust are verified.',
      blockers: blockers.slice(0, 5),
    },
    personas: personas.map(({ id, label, description }) => ({ id, label, description })),
    controls: operatorControls(pack, state, blockers),
    latestExecution: latestOperatorExecution(executionContext),
  }
  return {
    ...content,
    snapshotVersion: createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 20),
  }
}

function pushReadinessKey(platform, deviceId, externalId) {
  return [platform || 'unknown', deviceId || 'unknown-device', externalId || 'unknown-user'].join('|')
}

function trustDiagnosticsKey(platform, deviceId, externalId) {
  return [platform || 'unknown', deviceId || 'unknown-device', externalId || 'unknown-user'].join('|')
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstObject(...values) {
  return values.map(objectValue).find((value) => Object.keys(value).length) || {}
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '')
}

export function extractRuntimeTelemetry(platform, body = {}, current = {}) {
  const payload = objectValue(body.payload)
  const result = objectValue(body.result)
  const runtime = firstObject(body.runtime, payload.runtime, result.runtime)
  const sync = firstObject(body.sync, payload.sync, result.sync)
  const sourceUrl = String(firstPresent(
    body.sourceUrl,
    payload.sourceUrl,
    result.sourceUrl,
    runtime.sourceUrl,
    current.sourceUrl,
    '',
  ))
  const sourceMode = String(firstPresent(
    body.sourceMode,
    payload.sourceMode,
    result.sourceMode,
    runtime.sourceMode,
    current.sourceMode,
    '',
  ))
  const sourceOverride = firstPresent(
    body.sourceOverride,
    payload.sourceOverride,
    result.sourceOverride,
    runtime.sourceOverride,
    current.sourceOverride,
  )
  const evidence = {
    ...current,
    platform,
    id: String(firstPresent(runtime.id, body.id, payload.id, result.id, current.id, '')),
    configHash: String(firstPresent(runtime.configHash, body.configHash, payload.configHash, result.configHash, current.configHash, '')),
    runtimeHash: String(firstPresent(runtime.runtimeHash, body.runtimeHash, payload.runtimeHash, result.runtimeHash, current.runtimeHash, '')),
    deviceId: String(firstPresent(runtime.deviceId, body.deviceId, payload.deviceId, result.deviceId, current.deviceId, '')),
    externalId: String(firstPresent(runtime.externalId, body.externalId, payload.externalId, result.externalId, current.externalId, '')),
    sdkConfigured: firstPresent(
      runtime.sdkConfigured,
      body.sdkConfigured,
      payload.sdkConfigured,
      result.sdkConfigured,
      current.sdkConfigured,
      false,
    ) === true,
    sdkCredentialContextFingerprint: String(firstPresent(
      runtime.sdkCredentialContextFingerprint,
      body.sdkCredentialContextFingerprint,
      payload.sdkCredentialContextFingerprint,
      result.sdkCredentialContextFingerprint,
      current.sdkCredentialContextFingerprint,
      '',
    )),
    sourceUrl,
    sourceMode,
    launcherInstanceId: String(firstPresent(
      body.launcherInstanceId,
      payload.launcherInstanceId,
      result.launcherInstanceId,
      sync.launcherInstanceId,
      current.launcherInstanceId,
      '',
    )),
    executionId: String(firstPresent(
      body.executionId,
      payload.executionId,
      result.executionId,
      sync.executionId,
      current.executionId,
      '',
    )),
  }
  if (sourceOverride !== undefined) evidence.sourceOverride = Boolean(sourceOverride)
  return evidence
}

export function extractPushTelemetry(platform, body = {}) {
  const payload = objectValue(body.payload)
  const result = objectValue(body.result)
  const runtime = firstObject(body.runtime, payload.runtime, result.runtime)
  const diagnostics = firstObject(payload.diagnostics, result.diagnostics)
  const readiness = objectValue(result.readiness)
  const nestedPush = firstObject(
    payload.push,
    objectValue(payload.diagnostics).push,
    readiness.push,
    objectValue(result.diagnostics).push,
    result.push,
  )
  const hasNestedPush = Object.keys(nestedPush).length > 0
  const push = hasNestedPush ? nestedPush : payload
  const type = body.type || body.action || ''
  const pushType = ['fcm_token', 'apns_token', 'push_permission', 'push_readiness', 'runtime_ready'].includes(type)
  const hasMeaningfulPushState =
    Object.hasOwn(push, 'tokenPresent') ||
    Object.hasOwn(push, 'permission') ||
    Object.hasOwn(push, 'notificationsEnabled') ||
    Object.hasOwn(push, 'defaultChannelId') ||
    Object.hasOwn(push, 'highVisibilityChannelId') ||
    Object.hasOwn(push, 'lastPush')
  if (!pushType && !hasNestedPush && !hasMeaningfulPushState) return null
  if (pushType && !hasNestedPush && !hasMeaningfulPushState) return null

  const externalId = String(body.externalId || push.externalId || runtime?.externalId || diagnostics.externalId || '').trim()
  const deviceId = String(push.sdkDeviceId || runtime?.deviceId || diagnostics.sdkDeviceId || body.deviceId || payload.deviceId || '').trim()
  const status = normalizeSeverity(
    hasNestedPush && Object.hasOwn(push, 'ready')
      ? (push.ready ? 'success' : 'error')
      : (body.status || (push.tokenPresent ? 'success' : 'info')),
  )
  const tokenPresent = Boolean(push.tokenPresent)
  const permission = push.permission || payload.permission || ''
  const notificationsEnabled = Object.hasOwn(push, 'notificationsEnabled') ? push.notificationsEnabled : null
  const notificationChannelsSupported = push.notificationChannelsSupported === true
  const channelBlocked = Boolean(push.channelBlocked)
  const channelImportance = Number(push.channelImportance || 0)
  const preferredChannelBlocked = Boolean(push.preferredChannelBlocked)
  const preferredChannelImportance = Number(push.preferredChannelImportance || 0)
  const activeChannelId = push.activeChannelId || push.defaultChannelId || ''
  const displayPossible = platform !== 'android' || (
    permission === 'granted' &&
    notificationsEnabled !== false &&
    (!notificationChannelsSupported || (
      !channelBlocked &&
      channelImportance !== 0 &&
      !preferredChannelBlocked &&
      preferredChannelImportance !== 0
    ))
  )
  const ready = status === 'success' && tokenPresent && displayPossible
  return {
    platform,
    deviceId,
    externalId,
    permission,
    notificationsEnabled,
    notificationChannelsSupported,
    defaultChannelId: push.defaultChannelId || '',
    highVisibilityChannelId: push.highVisibilityChannelId || '',
    brazeDefaultChannelId: push.brazeDefaultChannelId || '',
    activeChannelId,
    channelName: push.channelName || '',
    channelImportance: push.channelImportance || '',
    channelBlocked,
    preferredChannelImportance: push.preferredChannelImportance || '',
    preferredChannelBlocked,
    lastPushUsesHighVisibilityChannel: push.lastPushUsesHighVisibilityChannel !== false,
    lastPushChannelWarning: push.lastPushChannelWarning || '',
    channels: Array.isArray(push.channels) ? push.channels : [],
    lastPush: push.lastPush && typeof push.lastPush === 'object' ? push.lastPush : null,
    lifecycleState: push.lifecycleState || '',
    tokenPresent,
    ready,
    status,
    type,
    label: body.label || '',
    reason: push.reason || payload.reason || '',
    tokenPreview: push.tokenPreview || push.preview || payload.preview || '',
    tokenLength: push.tokenLength || payload.tokenLength || 0,
    retryScheduled: Boolean(push.retryScheduled),
    registrationError: push.registrationError || push.error || result.error || '',
    ts: new Date().toISOString(),
  }
}

function latestActivePushReadiness(state = readState(), instanceId = launcherInstanceId) {
  const all = state.pushReadiness && typeof state.pushReadiness === 'object'
    ? Object.values(state.pushReadiness)
    : []
  const platform = state.activePlatform || 'android'
  const externalId = state.activeExternalId || ''
  const deviceId = state.deviceRuntime?.platform === platform ? state.deviceRuntime?.deviceId || '' : ''
  const matching = all
    .filter((entry) => entry && entry.platform === platform)
    .filter((entry) => isCurrentLauncherEvidence(entry, instanceId))
    .filter((entry) => !externalId || entry.externalId === externalId)
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))
  if (!deviceId) return matching[0] || null
  return matching.find((entry) => entry.deviceId === deviceId) ||
    matching.find((entry) => !entry.deviceId) ||
    null
}

function triggerSendEndpoint(endpoint = '') {
  const normalized = String(endpoint || '').trim().toLowerCase()
  return normalized === '/campaigns/trigger/send' || normalized === '/canvas/trigger/send'
}

function pushReadinessBlockReason(push, { platform = 'android', externalId = '' } = {}) {
  if (!push) return 'Waiting for native push notification telemetry.'
  if (push.platform && push.platform !== platform) return `Waiting for native push telemetry from ${platform}.`
  if (push.externalId && externalId && push.externalId !== externalId) {
    return `Native push telemetry was reported for ${push.externalId}, expected ${externalId}.`
  }
  if (platform === 'android') {
    if (push.permission !== 'granted') return 'Android notification permission is not granted.'
    if (push.notificationsEnabled === false) return 'Android app notifications are disabled in system settings.'
    if (push.notificationChannelsSupported) {
      const activeChannel = push.activeChannelId || push.defaultChannelId || '(default)'
      const demoChannel = push.highVisibilityChannelId || 'braze_demo_high_v1'
      if (push.channelBlocked) return `Android notification channel ${activeChannel} is blocked.`
      if (Number(push.channelImportance || 0) === 0) return `Android notification channel ${activeChannel} has no display importance.`
      if (push.preferredChannelBlocked) return `Android high-visibility demo channel ${demoChannel} is blocked.`
      if (Number(push.preferredChannelImportance || 0) === 0) return `Android high-visibility demo channel ${demoChannel} has no display importance.`
    }
  }
  if (!push.tokenPresent || !push.ready) {
    if (push.retryScheduled) return 'Native push token is not ready yet; retry is scheduled.'
    return push.registrationError || 'Native push notifications are not ready for this user.'
  }
  return ''
}

export function extractTrustTelemetry(platform, body = {}) {
  const payload = objectValue(body.payload)
  const result = objectValue(body.result)
  const runtime = firstObject(body.runtime, payload.runtime, result.runtime)
  const diagnostics = firstObject(payload.diagnostics, result.diagnostics)
  const readiness = objectValue(result.readiness)
  const nestedTrust = firstObject(
    payload.trust,
    objectValue(payload.diagnostics).trust,
    readiness.trust,
    objectValue(result.diagnostics).trust,
    result.trust,
  )
  const hasNestedTrust = Object.keys(nestedTrust).length > 0
  const type = body.type || body.action || ''
  const trust = hasNestedTrust ? nestedTrust : (type === 'trust_diagnostics' ? payload : null)
  if (!trust || !Object.hasOwn(trust, 'ready')) return null

  const checks = Array.isArray(trust.checks) ? trust.checks : []
  const failed = checks.find((check) => check && check.ok === false) || null
  const status = normalizeSeverity(
    type === 'trust_diagnostics' ? (body.status || (trust.ready ? 'success' : 'error')) : (trust.ready ? 'success' : 'error'),
  )
  const externalId = String(body.externalId || trust.externalId || runtime?.externalId || diagnostics.externalId || '').trim()
  const deviceId = String(trust.sdkDeviceId || runtime?.deviceId || diagnostics.sdkDeviceId || body.deviceId || payload.deviceId || '').trim()
  return {
    platform,
    deviceId,
    externalId,
    ready: status === 'success' && Boolean(trust.ready),
    status,
    type: 'trust_diagnostics',
    label: body.label || '',
    reason: trust.reason || payload.reason || '',
    checks,
    failingCheck: failed?.name || failed?.url || '',
    errorType: failed?.errorType || '',
    error: failed?.error || '',
    ts: new Date().toISOString(),
  }
}

function latestActiveTrustDiagnostics(state = readState(), instanceId = launcherInstanceId) {
  const all = state.trustDiagnostics && typeof state.trustDiagnostics === 'object'
    ? Object.values(state.trustDiagnostics)
    : []
  const platform = state.activePlatform || 'android'
  const externalId = state.activeExternalId || ''
  const deviceId = state.deviceRuntime?.platform === platform ? state.deviceRuntime?.deviceId || '' : ''
  return all
    .filter((entry) => entry && entry.platform === platform)
    .filter((entry) => isCurrentLauncherEvidence(entry, instanceId))
    .filter((entry) => !externalId || entry.externalId === externalId)
    .filter((entry) => !deviceId || !entry.deviceId || entry.deviceId === deviceId)
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))[0] || null
}

export function extractRenderSyncIdentity(body = {}) {
  const payload = objectValue(body.payload)
  const result = objectValue(body.result)
  const sync = firstObject(body.sync, payload.sync, result.sync)
  const timestamp = Number(sync.timestamp)
  return {
    protocol: String(sync.protocol || ''),
    sessionId: String(sync.sessionId || ''),
    runtimeId: String(sync.runtimeId || ''),
    configHash: String(sync.configHash || ''),
    runtimeHash: String(sync.runtimeHash || ''),
    timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null,
  }
}

export function renderSyncIdentityMatchesRuntime(sync, runtime) {
  return Boolean(
    sync?.protocol === 'braze-demo-sync/v1' &&
    sync?.runtimeId && sync.runtimeId === runtime?.id &&
    sync?.configHash && sync.configHash === runtime?.configHash &&
    sync?.runtimeHash && sync.runtimeHash === runtime?.runtimeHash
  )
}

export function extractAndroidSourceReadiness(platform, body = {}) {
  if (platform !== 'android' || body.type !== 'demo_source_ready') return null
  const payload = objectValue(body.payload)
  const result = objectValue(body.result)
  const runtime = extractRuntimeTelemetry(platform, body, {})
  if (!runtimeEvidenceIsComplete(runtime)) return null
  const status = normalizeSeverity(body.status || (result.renderConfirmed === true ? 'success' : 'error'))
  const syncIdentity = extractRenderSyncIdentity(body)
  const syncIdentityValid = renderSyncIdentityMatchesRuntime(syncIdentity, runtime)
  const effectiveStatus = status === 'success' && !syncIdentityValid ? 'error' : status
  const renderGeneration = Number(firstPresent(result.renderGeneration, payload.renderGeneration, body.renderGeneration))
  return {
    ...runtime,
    syncIdentity,
    syncIdentityValid,
    renderConfirmed: effectiveStatus === 'success' && result.renderConfirmed === true,
    renderGeneration: Number.isFinite(renderGeneration) ? renderGeneration : null,
    status: effectiveStatus,
    error: String(result.error || payload.error || (!syncIdentityValid ? 'Render sync identity did not match the reported native runtime.' : '')),
    ts: new Date().toISOString(),
  }
}

export function extractIosRenderReadiness(platform, body = {}) {
  if (platform !== 'ios' || body.type !== 'runtime_ready') return null
  const payload = objectValue(body.payload)
  const result = objectValue(body.result)
  const runtime = extractRuntimeTelemetry(platform, body, {})
  if (!runtimeEvidenceIsComplete(runtime)) return null
  const renderConfirmed = firstPresent(result.renderConfirmed, payload.renderConfirmed, body.renderConfirmed) === true
  const status = normalizeSeverity(body.status || (renderConfirmed ? 'success' : 'error'))
  const syncIdentity = extractRenderSyncIdentity(body)
  const syncIdentityValid = renderSyncIdentityMatchesRuntime(syncIdentity, runtime)
  const effectiveStatus = status === 'success' && !syncIdentityValid ? 'error' : status
  const renderGeneration = Number(firstPresent(result.renderGeneration, payload.renderGeneration, body.renderGeneration))
  return {
    ...runtime,
    syncIdentity,
    syncIdentityValid,
    renderConfirmed: effectiveStatus === 'success' && renderConfirmed,
    renderGeneration: Number.isFinite(renderGeneration) ? renderGeneration : null,
    status: effectiveStatus,
    error: String(result.error || payload.error || (!syncIdentityValid ? 'Render sync identity did not match the reported native runtime.' : '')),
    ts: new Date().toISOString(),
  }
}

export function iosRuntimeEvidenceMatchesExpectation(runtime, expectation) {
  if (!runtime || !expectation) return false
  const runtimeHash = runtime.runtimeHash || runtime.configHash
  return Boolean(
    runtime.platform === 'ios' &&
    runtime.launcherInstanceId === expectation.launcherInstanceId &&
    runtime.executionId === expectation.executionId &&
    runtime.id === expectation.expectedPackId &&
    runtimeHash === expectation.expectedRuntimeHash &&
    runtime.sourceUrl === expectation.expectedSource &&
    runtime.sourceOverride === false &&
    runtime.externalId === expectation.expectedExternalId
  )
}

export function iosRenderReadinessMatchesExpectation(render, expectation) {
  if (!render || !expectation) return false
  const runtimeHash = render.runtimeHash || render.configHash
  return Boolean(
    render.platform === 'ios' &&
    render.launcherInstanceId === expectation.launcherInstanceId &&
    render.executionId === expectation.executionId &&
    render.renderConfirmed === true &&
    render.status === 'success' &&
    render.id === expectation.expectedPackId &&
    runtimeHash === expectation.expectedRuntimeHash &&
    render.sourceUrl === expectation.expectedSource &&
    render.sourceOverride === false
  )
}

export function androidSourceReadinessMatchesExpectation(source, expectation) {
  if (!source || !expectation) return false
  const sourceHash = source.runtimeHash || source.configHash
  return Boolean(
    source.platform === 'android' &&
    source.launcherInstanceId === expectation.launcherInstanceId &&
    source.executionId === expectation.executionId &&
    source.id === expectation.expectedPackId &&
    sourceHash === expectation.expectedRuntimeHash &&
    source.sourceUrl === expectation.expectedSource &&
    source.sourceOverride === expectation.expectedOverride
  )
}

export function shouldReplaceAndroidSourceEvidence(existing, incoming) {
  if (!existing) return true
  if (!incoming) return false
  const previousGeneration = Number(existing.renderGeneration)
  const incomingGeneration = Number(incoming.renderGeneration)
  if (Number.isFinite(previousGeneration) && Number.isFinite(incomingGeneration)) {
    if (incomingGeneration < previousGeneration) return false
    if (incomingGeneration === previousGeneration && existing.renderConfirmed === true && incoming.renderConfirmed !== true) return false
  }
  return true
}

export function shouldReplaceIosRenderEvidence(existing, incoming) {
  if (!existing) return true
  if (!incoming || incoming.platform !== 'ios') return false
  if (existing.platform !== 'ios') return true
  if (
    existing.launcherInstanceId &&
    incoming.launcherInstanceId &&
    existing.launcherInstanceId !== incoming.launcherInstanceId
  ) return true

  const previousHash = existing.runtimeHash || existing.configHash
  const incomingHash = incoming.runtimeHash || incoming.configHash
  if (
    existing.id !== incoming.id ||
    previousHash !== incomingHash ||
    existing.deviceId !== incoming.deviceId ||
    existing.sourceUrl !== incoming.sourceUrl
  ) return true

  const previousEpoch = Number(existing.syncIdentity?.timestamp)
  const incomingEpoch = Number(incoming.syncIdentity?.timestamp)
  const epochsAreOrdered = Number.isFinite(previousEpoch) && previousEpoch > 0 &&
    Number.isFinite(incomingEpoch) && incomingEpoch > 0
  if (epochsAreOrdered) {
    if (incomingEpoch < previousEpoch) return false
    if (incomingEpoch > previousEpoch) return true
  } else {
    const previousSession = String(existing.syncIdentity?.sessionId || '')
    const incomingSession = String(incoming.syncIdentity?.sessionId || '')
    if (previousSession && incomingSession && previousSession !== incomingSession) {
      // Without an ordered webReady timestamp, prefer a known failure over an
      // ambiguously ordered success. A failure may always replace success.
      if (existing.renderConfirmed !== true && incoming.renderConfirmed === true) return false
      return true
    }
  }

  const previousGeneration = Number(existing.renderGeneration)
  const incomingGeneration = Number(incoming.renderGeneration)
  if (Number.isFinite(previousGeneration) && Number.isFinite(incomingGeneration)) {
    if (incomingGeneration < previousGeneration) return false
    if (incomingGeneration === previousGeneration && existing.renderConfirmed === true && incoming.renderConfirmed !== true) return false
  }
  return true
}

function beginAndroidSourceTransition({
  executionId,
  expectedSource,
  expectedOverride,
  expectedPackId,
  expectedRuntimeHash,
  since = Date.now(),
}) {
  if (!executionId) throw new Error('Android source transitions require an execution id.')
  if (activeAndroidSourceTransition && activeAndroidSourceTransition.executionId !== executionId) {
    throw liveWebConflict(`Wait for Android source transition ${activeAndroidSourceTransition.executionId} to finish.`)
  }
  const expectation = {
    launcherInstanceId,
    executionId,
    expectedSource,
    expectedOverride: Boolean(expectedOverride),
    expectedPackId,
    expectedRuntimeHash,
    since,
  }
  activeAndroidSourceTransition = expectation
  androidSourceEvidenceByExecution.delete(executionId)
  updateState((state) => { state.deviceSourceReadiness = null })
  return expectation
}

function finishAndroidSourceTransition(executionId) {
  if (activeAndroidSourceTransition?.executionId === executionId) activeAndroidSourceTransition = null
  while (androidSourceEvidenceByExecution.size > 20) {
    androidSourceEvidenceByExecution.delete(androidSourceEvidenceByExecution.keys().next().value)
  }
}

function observeAndroidSourceReadiness(candidate, observedAt) {
  const expectation = activeAndroidSourceTransition
  if (
    !candidate ||
    !expectation ||
    candidate.launcherInstanceId !== launcherInstanceId ||
    candidate.executionId !== expectation.executionId
  ) return null
  const observed = withLauncherObservation(candidate, launcherInstanceId, observedAt)
  const existing = androidSourceEvidenceByExecution.get(candidate.executionId)
  if (!shouldReplaceAndroidSourceEvidence(existing, observed)) return null
  androidSourceEvidenceByExecution.set(candidate.executionId, observed)
  return {
    evidence: observed,
    promote: observed.status === 'success' &&
      observed.renderConfirmed === true &&
      androidSourceReadinessMatchesExpectation(observed, expectation),
  }
}

function recordAndroidTrustTimeout(externalId, reason) {
  const state = readState()
  const platform = 'android'
  const deviceId = state.deviceRuntime?.platform === platform ? state.deviceRuntime?.deviceId || '' : ''
  const telemetry = {
    platform,
    deviceId,
    externalId,
    ready: false,
    status: 'error',
    type: 'trust_diagnostics',
    label: 'Android HTTPS trust diagnostics timed out',
    reason,
    checks: [],
    failingCheck: '',
    errorType: 'Timeout',
    error: 'Native Android trust diagnostics did not report before launch readiness timeout.',
    ts: new Date().toISOString(),
  }
  Object.assign(telemetry, withLauncherObservation(telemetry))
  updateState((next) => {
    if (!next.trustDiagnostics || typeof next.trustDiagnostics !== 'object') next.trustDiagnostics = {}
    next.trustDiagnostics[trustDiagnosticsKey(platform, deviceId, externalId)] = telemetry
    const current = next.deviceRuntime || {}
    next.deviceRuntime = {
      ...current,
      platform,
      trust: telemetry,
      ts: telemetry.ts,
    }
  })
  addLedger({
    source: 'launcher',
    platform,
    transport: 'launcher',
    type: 'trust_diagnostics',
    label: telemetry.label,
    status: 'error',
    externalId,
    payload: telemetry,
    result: { error: telemetry.error },
  })
  return telemetry
}

async function waitForAndroidTrustDiagnostics(job, { externalId, since }) {
  setJobStep(job, 'Waiting for Android trust telemetry')
  const deadline = Date.now() + trustDiagnosticsTimeoutMs
  while (Date.now() < deadline) {
    const trust = latestActiveTrustDiagnostics(readState())
    const trustTs = Date.parse(trust?.ts || '')
    if (trust && Number.isFinite(trustTs) && trustTs >= since) {
      if (trust.ready) {
        pushLog(job, 'Android HTTPS trust telemetry is ready.')
        return trust
      }
      throw new Error(trust.error || 'Android HTTPS trust diagnostics failed')
    }
    await sleep(500)
  }
  const timeout = recordAndroidTrustTimeout(externalId, 'launch_readiness_timeout')
  throw new Error(timeout.error)
}

async function waitForDeviceRuntime(job, { platform, packId, configHash, runtimeHash, since }) {
  setJobStep(job, `Verifying installed ${platform === 'android' ? 'Android' : 'iOS'} runtime`)
  const deadline = Date.now() + trustDiagnosticsTimeoutMs
  let lastMismatch = null
  while (Date.now() < deadline) {
    const runtime = readState().deviceRuntime
    const runtimeTs = Date.parse(runtime?.ts || '')
    if (
      runtime?.platform === platform &&
      isCurrentLauncherEvidence(runtime) &&
      Number.isFinite(runtimeTs) &&
      runtimeTs >= since
    ) {
      const reportedHash = runtime.runtimeHash || runtime.configHash
      const expectedHash = runtimeHash || configHash
      if (runtime.id === packId && reportedHash === expectedHash) {
        pushLog(job, `${platform === 'android' ? 'Android' : 'iOS'} reported the selected pack and runtime hash.`)
        return runtime
      }
      lastMismatch = runtime
    }
    await sleep(500)
  }
  if (lastMismatch) {
    throw new Error(
      `Installed ${platform} runtime mismatch: reported ${lastMismatch.id || '(no pack id)'} ` +
      `(${lastMismatch.runtimeHash || lastMismatch.configHash || 'no runtime hash'}), expected ${packId} (${runtimeHash || configHash}).`,
    )
  }
  throw new Error(`Installed ${platform} runtime did not report its pack identity before the launch readiness timeout.`)
}

function rememberCorrelatedIosRuntime(candidate, body, observedAt) {
  if (
    candidate?.platform !== 'ios' ||
    body?.type !== 'demo_command' ||
    normalizeSeverity(body?.status || '') !== 'success' ||
    candidate.launcherInstanceId !== launcherInstanceId ||
    !candidate.executionId ||
    !runtimeEvidenceIsComplete(candidate)
  ) return null
  const observed = withLauncherObservation(candidate, launcherInstanceId, observedAt)
  iosRuntimeEvidenceByExecution.set(candidate.executionId, observed)
  while (iosRuntimeEvidenceByExecution.size > 20) {
    iosRuntimeEvidenceByExecution.delete(iosRuntimeEvidenceByExecution.keys().next().value)
  }
  return observed
}

async function waitForCorrelatedIosRuntimeAndRender(job, {
  packId,
  configHash,
  runtimeHash,
  externalId,
  expectedSource,
  since,
  executionId,
}) {
  setJobStep(job, 'Verifying correlated iOS runtime and render')
  const expected = {
    launcherInstanceId,
    executionId,
    expectedPackId: packId,
    expectedRuntimeHash: runtimeHash || configHash,
    expectedExternalId: externalId,
    expectedSource,
  }
  const deadline = Date.now() + trustDiagnosticsTimeoutMs
  let lastRuntime = null
  let lastRender = null
  while (Date.now() < deadline) {
    const runtime = iosRuntimeEvidenceByExecution.get(executionId)
    const render = readState().deviceSourceReadiness
    const runtimeTs = Date.parse(runtime?.observedAt || runtime?.ts || '')
    const renderTs = Date.parse(render?.observedAt || render?.ts || '')
    if (runtime && Number.isFinite(runtimeTs) && runtimeTs >= since) lastRuntime = runtime
    if (
      render?.platform === 'ios' &&
      isCurrentLauncherEvidence(render) &&
      render.launcherInstanceId === expected.launcherInstanceId &&
      render.executionId === expected.executionId &&
      Number.isFinite(renderTs) &&
      renderTs >= since
    ) {
      lastRender = render
      if (render.status === 'error' || render.renderConfirmed !== true) {
        throw new Error(render.error || 'iOS reported that the configured web source failed to render.')
      }
    }
    if (
      lastRuntime &&
      lastRender &&
      iosRuntimeEvidenceMatchesExpectation(lastRuntime, expected) &&
      iosRenderReadinessMatchesExpectation(lastRender, expected)
    ) {
      pushLog(job, `iOS confirmed correlated runtime ${expected.expectedRuntimeHash} and rendered ${expectedSource}.`)
      return { runtime: lastRuntime, render: lastRender }
    }
    await sleep(250)
  }
  const runtimeSummary = lastRuntime
    ? `${lastRuntime.id || 'no pack'} (${lastRuntime.runtimeHash || lastRuntime.configHash || 'no runtime hash'}, execution ${lastRuntime.executionId || 'none'})`
    : 'no correlated runtime telemetry'
  const renderSummary = lastRender
    ? `${lastRender.sourceUrl || 'no source'} (renderConfirmed ${String(lastRender.renderConfirmed)})`
    : 'no post-launch runtime_ready render telemetry'
  throw new Error(
    `iOS readiness timed out: runtime reported ${runtimeSummary}; render reported ${renderSummary}. ` +
    `Expected ${packId} (${expected.expectedRuntimeHash}) at ${expectedSource} for execution ${executionId}.`,
  )
}

async function waitForAndroidSource({
  expectedSource,
  expectedOverride,
  expectedPackId = '',
  expectedRuntimeHash = '',
  since,
  executionId = '',
  job = null,
}) {
  if (!executionId) throw new Error('Android source confirmation requires a correlated execution id.')
  const expectation = activeAndroidSourceTransition
  if (
    !expectation ||
    expectation.executionId !== executionId ||
    expectation.launcherInstanceId !== launcherInstanceId
  ) {
    throw new Error(`Android source transition ${executionId} is not active in this launcher.`)
  }
  if (job) setJobStep(job, expectedOverride ? 'Confirming Android live-web source' : 'Confirming bundled Android source')
  const deadline = Date.now() + trustDiagnosticsTimeoutMs
  let lastEvidence = null
  while (Date.now() < deadline) {
    const source = androidSourceEvidenceByExecution.get(executionId)
    const runtimeTs = Date.parse(source?.ts || '')
    if (
      source?.platform === 'android' &&
      isCurrentLauncherEvidence(source) &&
      Number.isFinite(runtimeTs) &&
      runtimeTs >= since &&
      source?.launcherInstanceId === launcherInstanceId &&
      source?.executionId === executionId
    ) {
      lastEvidence = source
      if (source.status === 'error' || source.renderConfirmed !== true) {
        throw new Error(source.error || 'Android reported that the requested web source failed to render.')
      }
      const sourceHash = source.runtimeHash || source.configHash
      const runtimeMatches = (!expectedPackId || source.id === expectedPackId) &&
        (!expectedRuntimeHash || sourceHash === expectedRuntimeHash)
      if (runtimeMatches && source.sourceUrl === expectedSource && source.sourceOverride === expectedOverride) {
        if (job) pushLog(job, `Android confirmed ${expectedOverride ? 'live-web' : 'bundled'} source ${expectedSource}.`)
        return source
      }
    }
    await sleep(250)
  }
  const reported = lastEvidence
    ? `${lastEvidence.sourceUrl || 'no source'} (override ${String(lastEvidence.sourceOverride)})`
    : 'no correlated source telemetry'
  throw new Error(`Android source confirmation timed out: reported ${reported}, expected ${expectedSource} (override ${expectedOverride}).`)
}

function liveWebConflict(message) {
  const error = new Error(message)
  error.statusCode = 409
  return error
}

async function runLiveWebTransition(label, task) {
  if (liveWebTransition) throw liveWebConflict(`Wait for the current live-web transition (${liveWebTransition.label}) to finish.`)
  const transition = { label, promise: null }
  transition.promise = Promise.resolve().then(task)
  liveWebTransition = transition
  try {
    return await transition.promise
  } finally {
    if (liveWebTransition === transition) liveWebTransition = null
  }
}

async function clearAndroidWebOverride({ reason = 'manual_restore', stopServer = true } = {}) {
  const state = readState()
  const { pack } = activePackAndSecrets(state)
  const runtime = runtimeForPack(pack)
  const executionId = `live_web_disable_${randomUUID()}`
  const since = Date.now()
  beginAndroidSourceTransition({
    executionId,
    expectedSource: runtime.expectedSources?.android || 'file:///android_asset/demo/index.html',
    expectedOverride: false,
    expectedPackId: pack.id,
    expectedRuntimeHash: runtime.runtimeHash || runtime.configHash,
    since,
  })
  setLiveWebState({
    enabled: false,
    overrideMayBeActive: true,
    status: 'clearing',
    pid: liveWebProcess?.pid || null,
    error: '',
  })
  try {
    await sendDeviceCommand({
      action: 'clearWebSourceOverride',
      externalId: state.activeExternalId || '',
      launcherInstanceId,
      executionId,
      payload: { reason },
    }, 'android')
    await waitForAndroidSource({
      expectedSource: runtime.expectedSources?.android || 'file:///android_asset/demo/index.html',
      expectedOverride: false,
      expectedPackId: pack.id,
      expectedRuntimeHash: runtime.runtimeHash || runtime.configHash,
      since,
      executionId,
    })
  } finally {
    finishAndroidSourceTransition(executionId)
  }
  if (stopServer) await stopLiveWebProcess({ bundledSourceConfirmed: true })
  else setLiveWebState({
    enabled: false,
    overrideMayBeActive: false,
    status: 'stopped',
    pid: liveWebProcess?.pid || null,
    error: '',
  })
  addLedger({
    source: 'launcher',
    platform: 'android',
    transport: 'launcher',
    type: 'live_web',
    label: 'Restored bundled Android web source',
    status: 'success',
    payload: { launcherInstanceId, executionId, reason },
  })
  return publicState()
}

async function enableAndroidLiveWebInternal() {
  const state = readState()
  if (state.activePlatform !== 'android') throw liveWebConflict('Live-web mode is Diagnostics-only and available for Android, not iOS.')
  const runningJob = Array.from(jobs.values()).find((job) => job.status === 'running')
  if (runningJob) throw liveWebConflict(`Wait for launcher job ${runningJob.id} to finish before enabling live-web mode.`)
  const { pack } = activePackAndSecrets(state)
  const runtime = runtimeForPack(pack)
  const device = state.deviceRuntime
  const expectedHash = runtime.runtimeHash || runtime.configHash
  const reportedHash = device?.runtimeHash || device?.configHash
  if (
    device?.platform !== 'android' ||
    !isCurrentLauncherEvidence(device) ||
    device.id !== pack.id ||
    reportedHash !== expectedHash
  ) {
    throw liveWebConflict('Launch the selected bundled Android pack and confirm its runtime hash before enabling live-web mode.')
  }
  if (state.activeExternalId && device.externalId !== state.activeExternalId) {
    throw liveWebConflict('Apply the selected Android persona before enabling live-web mode.')
  }
  const bundledSource = state.deviceSourceReadiness
  const bundledSourceHash = bundledSource?.runtimeHash || bundledSource?.configHash
  if (
    !isCurrentLauncherEvidence(bundledSource) ||
    bundledSource?.renderConfirmed !== true ||
    bundledSource?.id !== pack.id ||
    bundledSourceHash !== expectedHash ||
    bundledSource?.sourceUrl !== (runtime.expectedSources?.android || 'file:///android_asset/demo/index.html') ||
    bundledSource?.sourceOverride !== false
  ) {
    throw liveWebConflict('Confirm one healthy bundled Android render before enabling live-web mode.')
  }

  const preexistingHazard = currentLiveWebHazard()
  if (preexistingHazard.mayBeActive) {
    throw liveWebConflict('Restore the existing or uncertain Android development override before enabling it again.')
  }

  await startLiveWebProcess()
  const executionId = `live_web_enable_${randomUUID()}`
  const since = Date.now()
  beginAndroidSourceTransition({
    executionId,
    expectedSource: liveWebDeviceUrl,
    expectedOverride: true,
    expectedPackId: pack.id,
    expectedRuntimeHash: expectedHash,
    since,
  })
  setLiveWebState({
    enabled: false,
    overrideMayBeActive: true,
    status: 'switching',
    pid: liveWebProcess?.pid || null,
    error: '',
  })
  try {
    await sendDeviceCommand({
      action: 'setWebSourceOverride',
      externalId: state.activeExternalId || '',
      launcherInstanceId,
      executionId,
      payload: { url: liveWebHostUrl },
    }, 'android')
    await waitForAndroidSource({
      expectedSource: liveWebDeviceUrl,
      expectedOverride: true,
      expectedPackId: pack.id,
      expectedRuntimeHash: expectedHash,
      since,
      executionId,
    })
    const confirmedAt = new Date().toISOString()
    setLiveWebState({
      enabled: true,
      overrideMayBeActive: true,
      status: 'active',
      pid: liveWebProcess?.pid || null,
      startedAt: liveWebStartedAt,
      confirmedAt,
      error: '',
    })
    addLedger({
      source: 'launcher',
      platform: 'android',
      transport: 'launcher',
      type: 'live_web',
      label: 'Enabled Android live-web development override',
      status: 'warning',
      payload: { hostUrl: liveWebHostUrl, deviceUrl: liveWebDeviceUrl, launcherInstanceId, executionId },
      result: { confirmedAt },
    })
    return publicState()
  } catch (error) {
    finishAndroidSourceTransition(executionId)
    let rollbackError = null
    try {
      await clearAndroidWebOverride({ reason: 'enable_rollback', stopServer: true })
    } catch (rollbackFailure) {
      rollbackError = rollbackFailure
      setLiveWebState({
        enabled: false,
        overrideMayBeActive: true,
        status: 'error',
        pid: liveWebProcess?.pid || null,
        error: `${error.message || String(error)} Rollback also failed: ${rollbackFailure.message || String(rollbackFailure)}`,
      })
    }
    if (rollbackError) error.details = { ...(error.details || {}), rollbackError: rollbackError.message || String(rollbackError) }
    throw error
  } finally {
    finishAndroidSourceTransition(executionId)
  }
}

async function enableAndroidLiveWeb() {
  return runLiveWebTransition('enable', enableAndroidLiveWebInternal)
}

async function disableAndroidLiveWeb() {
  return runLiveWebTransition('restore bundled mode', async () => {
    const hazard = currentLiveWebHazard()
    if (!hazard.mayBeActive && !hazard.uncertain) {
      await stopLiveWebProcess()
      return publicState()
    }
  try {
      return await clearAndroidWebOverride({ reason: 'manual_restore', stopServer: true })
  } catch (error) {
    setLiveWebState({
      enabled: false,
        overrideMayBeActive: true,
      status: 'error',
      pid: liveWebProcess?.pid || null,
      error: error.message || String(error),
    })
    throw error
  }
  })
}

function ledgerPlatformFor(entry) {
  if (entry.platform) return entry.platform
  if (entry.source === 'android' || entry.source === 'android_sdk') return 'android'
  if (entry.source === 'braze_rest') return 'host'
  if (entry.source === 'ios') return 'ios'
  if (entry.source === 'browser') return 'browser'
  return 'host'
}

function ledgerTransportFor(entry) {
  if (entry.transport) return entry.transport
  if (entry.source === 'android_sdk') return 'android_sdk'
  if (entry.source === 'android') return 'device_callback'
  if (entry.source === 'braze_rest') return 'braze_rest'
  if (entry.source === 'ios') return 'ios_bridge'
  if (entry.source === 'browser') return 'web_bridge'
  return 'launcher'
}

function normalizeSeverity(status = '') {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'success') return 'success'
  if (normalized === 'error' || normalized === 'failed' || normalized === 'failure') return 'error'
  if (normalized === 'warning' || normalized === 'warn') return 'warning'
  return 'info'
}

function titleCase(value = '') {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim()
}

function firstDeviceCommand(entry) {
  return entry.request?.commands?.[0] || entry.payload?.commands?.[0] || null
}

function activityPayload(entry) {
  const command = firstDeviceCommand(entry)
  if (command?.payload && typeof command.payload === 'object') return command.payload
  if (entry.payload && typeof entry.payload === 'object') return entry.payload
  return {}
}

function activityEventName(entry) {
  const payload = activityPayload(entry)
  return payload.name || entry.request?.body?.events?.[0]?.name || entry.request?.body?.purchases?.[0]?.product_id || ''
}

function activityEndpoint(entry) {
  const payload = activityPayload(entry)
  return entry.request?.endpoint || payload.endpoint || payload.path || ''
}

function isDemoSeedAttributeSync(entry) {
  return Boolean(entry.seedSync || entry.demoSeedSync)
}

function seedAttributesForEntry(entry) {
  const payload = activityPayload(entry)
  const attributes = payload.attributes
  return attributes && typeof attributes === 'object' && !Array.isArray(attributes) ? attributes : {}
}

function compactAttributeValue(value) {
  let rendered
  if (typeof value === 'string') rendered = `"${value}"`
  else rendered = JSON.stringify(value)
  if (rendered === undefined) rendered = String(value)
  return rendered.length > 72 ? `${rendered.slice(0, 69)}...` : rendered
}

function attributePreview(attributes, limit = 8) {
  const entries = Object.entries(attributes)
  if (!entries.length) return ''
  const shown = entries.slice(0, limit).map(([key, value]) => `${key}=${compactAttributeValue(value)}`)
  const remaining = entries.length - shown.length
  return remaining > 0 ? `${shown.join(', ')} (+${remaining} more)` : shown.join(', ')
}

function activityCategory(entry, severity) {
  const type = entry.type || ''
  if (type === 'error' || (severity === 'error' && (entry.source === 'launcher' || entry.transport === 'launcher'))) return 'error'
  if (['job', 'control_promoted', 'session_boundary', 'activity_archived', 'pack_created', 'pack_duplicated'].includes(type)) return 'launcher'
  if (['sdk_event', 'sdk_event_sequence', 'sdk_attribute', 'sdk_purchase', 'change_user', 'demo_command'].includes(type)) return 'sdk'
  if (['rest_event', 'rest_attribute', 'rest_purchase', 'braze_rest_request'].includes(type)) return 'rest'
  if (['campaign_trigger', 'canvas_trigger'].includes(type)) return 'message'
  if (['banner_mounted', 'banner_rendered', 'banner_error', 'banners_updated', 'banners_refresh'].includes(type)) return 'message'
  if (type === 'profile_export') return 'profile'
  if (['content_cards_refresh', 'content_card_impression', 'content_card_click', 'content_cards'].includes(type)) return 'content_cards'
  if (['foreground_push', 'push_permission', 'push_readiness', 'push_profile_preflight', 'push_received', 'push_opened', 'push_deleted', 'push_preview', 'apns_token', 'fcm_token'].includes(type)) return 'push'
  if (['runtime_ready', 'trust_diagnostics', 'bridge_action', 'device_event'].includes(type) || entry.transport === 'device_callback' || entry.transport === 'web_bridge' || entry.transport === 'ios_bridge') return 'diagnostics'
  return entry.transport === 'braze_rest' ? 'rest' : 'diagnostics'
}

function activityDisplayTitle(entry, category) {
  const type = entry.type || 'info'
  const label = entry.label || ''
  const name = activityEventName(entry)
  const payload = activityPayload(entry)
  const endpoint = activityEndpoint(entry)
  if (category === 'error') return label && !['error', 'launcher error'].includes(label.toLowerCase()) ? label : 'Launcher Failed'
  if (type === 'session_boundary') return label || 'Session started'
  if (type === 'activity_archived') return 'Activity archived'
  if (type === 'pack_created') return label || 'Demo pack created'
  if (type === 'pack_duplicated') return label || 'Demo pack duplicated'
  if (type === 'job') return label || 'Launcher Job Updated'
  if (type === 'sdk_event') return `SDK Event Logged${name ? `: ${name}` : ''}`
  if (type === 'sdk_event_sequence' || type === 'android_sequence') return label || 'SDK Event Sequence Ran'
  if (type === 'sdk_attribute' && isDemoSeedAttributeSync(entry)) return 'Demo Seed Attributes Synced'
  if (type === 'sdk_attribute') return 'SDK Attribute Updated'
  if (type === 'sdk_purchase') return `SDK Purchase Logged${payload.productId ? `: ${payload.productId}` : ''}`
  if (type === 'change_user') return `User Changed${entry.externalId ? `: ${entry.externalId}` : ''}`
  if (type === 'demo_command') return `Native Command Executed${payload.action ? `: ${payload.action}` : ''}`
  if (type === 'rest_event') return `REST Event Sent${name ? `: ${name}` : ''}`
  if (type === 'rest_attribute') return 'REST Attributes Sent'
  if (type === 'rest_purchase') return `REST Purchase Sent${name ? `: ${name}` : ''}`
  if (type === 'braze_rest_request') return `Braze REST Request${endpoint ? `: ${endpoint}` : ''}`
  if (type === 'campaign_trigger') return 'Campaign Trigger Sent'
  if (type === 'canvas_trigger') return 'Canvas Trigger Sent'
  if (type === 'banner_mounted') return 'Banner Placement Mounted'
  if (type === 'banner_rendered') return 'Banner Rendered'
  if (type === 'banner_error') return 'Banner Render Failed'
  if (type === 'banners_updated') return 'Banners Updated'
  if (type === 'banners_refresh') return 'Banners Refresh Requested'
  if (type === 'profile_export') return 'User Profile Exported'
  if (type === 'content_cards_refresh') return 'Content Cards Refreshed'
  if (type === 'content_card_impression') return 'Content Card Impression Logged'
  if (type === 'content_card_click') return 'Content Card Click Logged'
  if (type === 'foreground_push') return 'Diagnostics Push Preview Shown'
  if (type === 'push_received') return 'Native Push Received'
  if (type === 'push_opened') return 'Native Push Opened'
  if (type === 'push_deleted') return 'Native Push Dismissed'
  if (type === 'push_preview') return 'Diagnostics Push Preview Shown'
  if (type === 'push_permission') return 'Push Permission Updated'
  if (type === 'push_readiness') return 'Push Readiness Checked'
  if (type === 'push_profile_preflight') return 'Braze Push Profile Checked'
  if (type === 'trust_diagnostics') return 'Android HTTPS Trust Checked'
  if (type === 'apns_token' || type === 'fcm_token') return 'Push Token Updated'
  if (type === 'runtime_ready') return 'Runtime Ready'
  if (type === 'bridge_action') return `Bridge Action${payload.action ? `: ${payload.action}` : ''}`
  return label || titleCase(type) || 'Activity Recorded'
}

function activityDisplaySummary(entry, category) {
  const type = entry.type || ''
  const response = entry.response || entry.result || null
  const payload = activityPayload(entry)
  if (entry.severity === 'error' || normalizeSeverity(entry.status) === 'error') {
    return response?.error || 'This action did not complete. Open details for the exact error and validation context.'
  }
  if (type === 'session_boundary') return entry.displaySummary || 'A new Control Room activity session began.'
  if (type === 'activity_archived') return 'A redacted copy of the current activity was saved locally for handoff or troubleshooting.'
  if (type === 'pack_created') return 'A new local pack workspace and notes.md handoff template were created without credentials.'
  if (type === 'pack_duplicated') return 'A local pack copy was created; credentials and Firebase key material were deliberately omitted.'
  if (type === 'profile_export') return 'The active user profile was exported so profile, events, purchases, apps, and push token data can be checked.'
  if (type === 'push_profile_preflight') {
    const result = response && typeof response === 'object' ? response : {}
    if (result.warning) return result.warning
    if (result.pushTokenCount !== undefined) {
      return `Braze profile push check: ${result.pushTokenCount} token(s), ${result.appCount || 0} app record(s), ${result.deviceCount || 0} device record(s).`
    }
    return 'The active Braze profile was checked for push-token and app evidence before sending.'
  }
  if (type === 'campaign_trigger') return 'A campaign trigger was sent for the active user.'
  if (type === 'canvas_trigger') return 'A Canvas trigger was sent for the active user.'
  if (type === 'banner_mounted') return 'The native shell mounted the configured Banner placement over the matching web surface.'
  if (type === 'banner_rendered') return 'The native SDK reported a rendered Banner for the configured placement.'
  if (type === 'banner_error') return payload.error || 'The native SDK could not render the configured Banner placement.'
  if (type === 'banners_updated') return 'The native SDK delivered its current Banner placements to the app.'
  if (type === 'banners_refresh') return 'The app requested fresh Banners for the configured placement IDs.'
  if (type === 'rest_event') return 'A REST event was tracked for the active user.'
  if (type === 'rest_attribute') return 'REST profile attributes were tracked for the active user.'
  if (type === 'rest_purchase') return 'A REST purchase was tracked for the active user.'
  if (type === 'braze_rest_request') return 'A safe custom Braze REST request was sent from the host launcher.'
  if (type === 'change_user') return 'The selected app SDK user was changed for this demo.'
  if (type === 'sdk_event') return 'The native SDK captured this custom event for the active demo user.'
  if (type === 'sdk_attribute' && isDemoSeedAttributeSync(entry)) {
    const attributes = seedAttributesForEntry(entry)
    const preview = attributePreview(attributes, 6)
    return preview
      ? `The native SDK explicitly applied ${Object.keys(attributes).length} demo seed attributes: ${preview}.`
      : 'The native SDK explicitly applied the active pack demo seed attributes.'
  }
  if (type === 'sdk_attribute') return 'The native SDK updated profile attributes for this user.'
  if (type === 'sdk_purchase') return 'The native SDK captured a purchase for this user.'
  if (type === 'push_permission') return 'The app handled notification permission for this user.'
  if (type === 'push_received') {
    const warning = payload.lastPushChannelWarning || payload.diagnostics?.push?.lastPushChannelWarning || ''
    if (warning) return warning
    const channel = payload.displayChannelId || payload.notificationChannelId || payload.diagnostics?.push?.activeChannelId || ''
    return channel
      ? `A real Braze push was received; native display path used channel ${channel}.`
      : 'A real Braze push was received and handled by the native notification path.'
  }
  if (type === 'push_opened') return 'A native push notification was opened and routed into the app.'
  if (type === 'push_deleted') return 'A native push notification was dismissed.'
  if (type === 'push_preview') return 'Diagnostics-only native notification preview; this is not proof of Braze push delivery.'
  if (type === 'push_readiness') return 'The app refreshed native push-token registration for this user.'
  if (type === 'trust_diagnostics') return 'The app verified HTTPS trust for Braze image media and Firebase endpoints.'
  if (type === 'content_card_impression') return 'A Content Card impression was recorded for this user.'
  if (type === 'content_card_click') return 'A Content Card click was recorded for this user.'
  if (type === 'content_cards_refresh') return 'The app requested fresh Content Cards from the SDK.'
  if (type === 'foreground_push') return 'Diagnostics-only notification preview; this is not proof of Braze push delivery.'
  if (type === 'job') return 'The launcher updated demo runtime, build, install, or launch state.'
  if (category === 'diagnostics') return 'The app or bridge reported runtime telemetry for diagnostics.'
  return 'The Control Room recorded this demo activity and its response.'
}

function contextItem(label, value) {
  const text = value === undefined || value === null ? '' : String(value).trim()
  return text ? { label, value: text } : null
}

function normalizeActivityEntry(entry) {
  const severity = normalizeSeverity(entry.status)
  const category = entry.category || activityCategory(entry, severity)
  const payload = activityPayload(entry)
  const seedAttributes = isDemoSeedAttributeSync(entry) ? seedAttributesForEntry(entry) : {}
  const context = [
    contextItem('Platform', entry.platform),
    contextItem('Transport', entry.transport),
    contextItem('User', entry.externalId),
    contextItem('Seed attributes', attributePreview(seedAttributes, 12)),
    contextItem('Event', activityEventName(entry)),
    contextItem('Action', payload.action),
    contextItem('Endpoint', activityEndpoint(entry)),
    contextItem('Type', entry.type),
  ].filter(Boolean)
  return {
    ...entry,
    category,
    severity,
    displayTitle: entry.displayTitle || activityDisplayTitle(entry, category),
    displaySummary: entry.displaySummary || activityDisplaySummary({ ...entry, severity }, category),
    primaryContext: Array.isArray(entry.primaryContext) && entry.primaryContext.length ? entry.primaryContext : context,
  }
}

const deduplicatedTelemetryTypes = new Set([
  'apns_token',
  'bridge_action',
  'content_cards',
  'demo_source_ready',
  'device_event',
  'fcm_token',
  'runtime_ready',
])

function canonicalActivityValue(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => canonicalActivityValue(item))
  if (!value || typeof value !== 'object') return value
  const ignored = new Set([
    'createdAt',
    'generatedAt',
    'lastEventAt',
    'lastSeenAt',
    'observedAt',
    'receivedAt',
    'timestamp',
    'ts',
    'updatedAt',
  ])
  return Object.fromEntries(
    Object.entries(value)
      .filter(([childKey]) => !ignored.has(childKey))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([childKey, childValue]) => [childKey, canonicalActivityValue(childValue, childKey || key)]),
  )
}

function activityCorrelationId(entry) {
  const payload = activityPayload(entry)
  return String(
    entry.correlationId ||
    entry.executionId ||
    entry.requestId ||
    payload.executionId ||
    payload.requestId ||
    payload.sync?.executionId ||
    entry.result?.executionId ||
    entry.result?.sync?.executionId ||
    '',
  ).trim()
}

export function activityDedupeKey(entry) {
  if (!entry || entry.type === 'session_boundary') return ''
  const correlationId = activityCorrelationId(entry)
  const payload = activityPayload(entry)
  if (correlationId) {
    return createHash('sha256').update(JSON.stringify({
      correlationId,
      type: entry.type || '',
      platform: entry.platform || '',
      transport: entry.transport || '',
      event: activityEventName(entry),
      action: payload.action || '',
    })).digest('hex')
  }
  if (!deduplicatedTelemetryTypes.has(entry.type)) return ''
  return createHash('sha256').update(JSON.stringify(canonicalActivityValue({
    type: entry.type || '',
    label: entry.label || '',
    status: entry.status || '',
    platform: entry.platform || '',
    transport: entry.transport || '',
    externalId: entry.externalId || '',
    payload: entry.payload || null,
    request: entry.request || null,
    response: entry.response || entry.result || null,
  }))).digest('hex')
}

export function mergeActivityLedger(ledger, entry, {
  limit = activityLedgerLimit,
  windowMs = activityDedupeWindowMs,
  nowMs = Date.parse(entry?.ts || '') || Date.now(),
} = {}) {
  const current = Array.isArray(ledger) ? ledger : []
  const dedupeKey = activityDedupeKey(entry)
  if (!dedupeKey) return { ledger: [entry, ...current].slice(0, limit), entry, deduplicated: false }
  const index = current.findIndex((candidate) => {
    if ((candidate.sessionId || '') !== (entry.sessionId || '')) return false
    const candidateAt = Date.parse(candidate.lastSeenAt || candidate.ts || '') || 0
    return Math.abs(nowMs - candidateAt) <= windowMs && activityDedupeKey(candidate) === dedupeKey
  })
  if (index < 0) return { ledger: [entry, ...current].slice(0, limit), entry, deduplicated: false }
  const previous = current[index]
  const merged = {
    ...previous,
    ...entry,
    id: previous.id,
    firstSeenAt: previous.firstSeenAt || previous.ts,
    lastSeenAt: entry.ts,
    duplicateCount: Number(previous.duplicateCount || 1) + 1,
  }
  return {
    ledger: [merged, ...current.slice(0, index), ...current.slice(index + 1)].slice(0, limit),
    entry: merged,
    deduplicated: true,
  }
}

function addLedger(entry) {
  let recorded
  updateState((state) => {
    const response = entry.response ?? entry.result ?? null
    const withDefaults = normalizeActivityEntry({
      id: entry.id || randomUUID(),
      ts: entry.ts || new Date().toISOString(),
      status: entry.status || 'info',
      source: entry.source || 'launcher',
      platform: ledgerPlatformFor(entry),
      transport: ledgerTransportFor(entry),
      type: entry.type || 'info',
      label: entry.label || entry.type || 'Event',
      seedSync: Boolean(entry.seedSync),
      externalId: entry.externalId || state.activeExternalId,
      sessionId: entry.sessionId || state.activitySession?.id || '',
      correlationId: entry.correlationId || entry.executionId || entry.requestId || '',
      payload: entry.payload || {},
      request: entry.request || null,
      response,
      validation: entry.validation || null,
      result: entry.result ?? response,
    })
    const merged = mergeActivityLedger(state.ledger, withDefaults)
    state.ledger = merged.ledger
    recorded = merged.entry
  })
  return recorded
}

function activityBoundary(session, label = 'Session started') {
  return normalizeActivityEntry({
    id: randomUUID(),
    ts: session.startedAt,
    status: 'info',
    source: 'launcher',
    platform: 'host',
    transport: 'launcher',
    type: 'session_boundary',
    category: 'launcher',
    label,
    sessionId: session.id,
    payload: { reason: session.reason },
    result: null,
    displayTitle: label,
    displaySummary: session.reason === 'activity_cleared'
      ? 'Earlier activity was archived and the Control Room started a clean session.'
      : 'A new launcher session began. Events below this boundary belong to an earlier run.',
  })
}

function beginActivitySession(reason = 'launcher_started') {
  const session = {
    id: randomUUID(),
    startedAt: new Date().toISOString(),
    reason,
  }
  updateState((state) => {
    const legacySessionId = state.activitySession?.id || 'legacy'
    state.ledger = (state.ledger || []).map((entry) => entry.sessionId ? entry : { ...entry, sessionId: legacySessionId })
    state.activitySession = session
    state.ledger = [activityBoundary(session), ...state.ledger].slice(0, activityLedgerLimit)
  })
  return session
}

function addRestResponse(response) {
  updateState((state) => {
    state.restResponses = [
      { id: randomUUID(), ts: new Date().toISOString(), ...response },
      ...(state.restResponses || []),
    ].slice(0, 40)
  })
}

function launcherCallbackUrl() {
  return `http://10.0.2.2:${serverPort}/api/device-events`
}

function iosLauncherCallbackUrl() {
  return `http://localhost:${serverPort}/api/device-events`
}

function createJob(packId, options = {}) {
  const running = Array.from(jobs.values()).find((candidate) => candidate.status === 'running')
  if (running) {
    const error = new Error(`Launcher job ${running.id} is already running (${running.step}).`)
    error.statusCode = 409
    throw error
  }
  const platform = options.platform === 'ios' ? 'ios' : 'android'
  const target = platform === 'ios' ? (options.simulator || 'booted') : resolvedAndroidAvd(options)
  const id = `job_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const job = {
    id,
    packId,
    platform,
    target,
    status: 'running',
    step: 'Queued',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    timings: {},
    skipped: [],
    launchMode: 'pending',
    currentStageStartedAt: Date.now(),
    logs: [],
  }
  jobs.set(id, job)
  broadcastJob(job)
  runApplyBuildLaunch(job, options).catch((error) => {
    const failedStep = job.step || 'Unknown stage'
    const staleInstallPossible = job.platform === 'android' && /emulator|install|launch|runtime/i.test(failedStep)
    job.failedStep = failedStep
    finishJob(job, 'failed', failedStep)
    const failureLogs = [error.stack || String(error)]
    if (staleInstallPossible) {
      failureLogs.push('Android launch did not complete. The wrapper force-stops the previous app so a stale pack is not presented as the selected one.')
    }
    appendJobLogs(job, failureLogs)
    addLedger({
      source: 'launcher',
      type: 'job',
      label: `${job.platform} launch failed for ${job.packId}`,
      status: 'error',
      platform: job.platform,
      result: {
        error: error.message || String(error),
        step: failedStep,
        staleInstallPossible,
        job: jobEvidence(job),
      },
    })
  })
  return job
}

async function runApplyBuildLaunch(job, options = {}) {
  const platform = options.platform === 'ios' ? 'ios' : 'android'
  const initialState = readState()
  const initialLiveHazard = currentLiveWebHazard(initialState)
  let deferredBundledRecovery = false
  if (initialLiveHazard.mayBeActive) {
    const safeRecoveryLaunch = platform === 'android' && options.run !== false && !options.applyOnly && job.packId === initialState.activePackId
    if (!safeRecoveryLaunch) {
      throw liveWebConflict('Restore the bundled Android source before applying, building, switching packs, or launching iOS.')
    }
    deferredBundledRecovery = true
    setJobStep(job, 'Deferring bundled source recovery')
    await stopLiveWebProcess({ preserveStatus: true })
    setLiveWebState({
      enabled: false,
      overrideMayBeActive: true,
      status: 'clearing',
      pid: null,
      error: 'Bundled source recovery is queued for the correlated post-launch preparation command.',
    })
    appendJobLogs(job, ['Deferred Android source recovery until the expected app is launched; no pre-device command was sent.'])
  }
  setJobStep(job, 'Applying demo pack')
  const previousState = readState()
  const previousPackId = previousState.activePackId
  const pack = applyDemoPack(job.packId, {
    launcherCallbackUrl: launcherCallbackUrl(),
    iosLauncherCallbackUrl: iosLauncherCallbackUrl(),
  })
  updateState((state) => {
    const switchedPack = previousPackId !== pack.id
    state.activePackId = pack.id
    state.activePlatform = platform
    if (switchedPack || !state.activeExternalId) {
      state.activeExternalId = pack.android?.defaultExternalId || pack.brand.demoUser.externalId
    }
    if (switchedPack || !state.activeDisplayName) {
      state.activeDisplayName = pack.brand.demoUser.firstName || ''
    }
  })
  const changedApplyParts = Object.entries(pack.applyChanges || {}).filter(([, changed]) => changed).map(([name]) => name)
  if (!changedApplyParts.length) job.skipped.push('semantic pack apply')
  appendJobLogs(job, [
    `Applied demo pack: ${pack.name}`,
    changedApplyParts.length ? `Changed apply outputs: ${changedApplyParts.join(', ')}` : 'Pack apply was a semantic no-op.',
  ])

  if (options.applyOnly) {
    finishJob(job, 'complete', 'Applied')
    addLedger({ source: 'launcher', type: 'job', label: `Applied ${pack.name}`, status: 'success', platform, result: { job: jobEvidence(job) } })
    return
  }

  setJobStep(job, 'Preparing web assets')
  const webBuild = packWebBuildCommand(pack)
  if (webBuild) {
    const inputHash = webBuildInputHash(pack, webBuild)
    if (reusableWebBuild(pack, inputHash)) {
      job.skipped.push('web build')
      appendJobLogs(job, [`Reusing web build for runtime ${pack.runtimeManifest.runtimeHash}.`])
    } else {
      await runCommand(webBuild.command, webBuild.args, { cwd: webBuild.cwd }, job)
      rememberWebBuild(pack, inputHash)
    }
  } else {
    const distDir = packWebDistDir(pack)
    const indexPath = path.join(distDir, 'index.html')
    if (!fs.existsSync(indexPath)) {
      throw new Error(`Missing ${indexPath}. Build the source app or set web.build in the demo pack.`)
    }
    appendJobLogs(job, [`Using prebuilt web assets: ${distDir}`])
  }

  if (options.run === false) {
    finishJob(job, 'complete', 'Built')
    addLedger({ source: 'launcher', type: 'job', label: `Built ${pack.name}`, status: 'success', platform, result: { job: jobEvidence(job) } })
    return
  }

  if (platform === 'ios') {
    const { launchedAt } = await runIosBuildInstallLaunch(job, options)
    const expectedRuntime = runtimeForPack(pack)
    const externalId = readState().activeExternalId || pack.android?.defaultExternalId || pack.brand.demoUser.externalId
    setJobStep(job, 'Applying runtime identity')
    await applyRuntimeIdentity({
      packId: pack.id,
      platform: 'ios',
      externalId,
      displayName: readState().activeDisplayName || pack.brand.demoUser.firstName || '',
      reason: 'launcher_ready',
      executionId: job.id,
    })
    await waitForCorrelatedIosRuntimeAndRender(job, {
      packId: expectedRuntime.id,
      configHash: expectedRuntime.configHash,
      runtimeHash: expectedRuntime.runtimeHash,
      externalId,
      expectedSource: expectedRuntime.expectedSources?.ios || 'http://localhost:5173',
      since: launchedAt,
      executionId: job.id,
    })
    finishJob(job, 'complete', 'Ready')
    addLedger({ source: 'launcher', type: 'job', label: `${pack.name} ready on iOS`, status: 'success', platform: 'ios', result: { job: jobEvidence(job) } })
    return
  }

  const avd = resolvedAndroidAvd(options)
  const serial = await expectedAndroidSerial(avd)
  job.launchMode = serial ? 'warm' : 'cold'

  setJobStep(job, 'Refreshing Android package')
  await runCommand('./gradlew', [':app:validateDemoWebAssets', ':app:assembleDebug'], { cwd: androidShellDir }, job)

  const apkPath = path.join(androidShellDir, 'app/build/outputs/apk/debug/app-debug.apk')
  if (!fs.existsSync(apkPath)) throw new Error(`Android build did not produce ${apkPath}.`)
  const appId = process.env.APP_ID || 'com.braze.demoshell'
  const localApkHash = sha256File(apkPath)
  const installedApkHash = await installedAndroidApkHash(serial, appId)
  const installApp = !installedApkHash || installedApkHash !== localApkHash
  if (!installApp) {
    job.skipped.push('identical APK install')
    appendJobLogs(job, [`Reusing installed APK ${localApkHash.slice(0, 12)}; app data remains untouched.`])
  } else {
    appendJobLogs(job, [installedApkHash
      ? `APK changed (${installedApkHash.slice(0, 12)} → ${localApkHash.slice(0, 12)}); using one adb install -r.`
      : `No installed APK hash is available; using one adb install -r for ${localApkHash.slice(0, 12)}.`])
  }

  setJobStep(job, installApp ? 'Starting emulator and refreshing app' : 'Reusing emulator and installed app')
  const env = {
    AVD: avd,
    APP_ID: appId,
    ANDROID_USER: '0',
    APK_PATH: apkPath,
    INSTALL_APP: installApp ? '1' : '0',
    LAUNCH_APP: '1',
    TRUST_MODE: 'auto',
  }
  const runtimeWaitStartedAt = Date.now()
  await runCommand(path.join(androidShellDir, 'tools/run-demo-emulator.sh'), [], { cwd: repoRoot, env }, job)
  const launchedSerial = await expectedAndroidSerial(avd)
  setJobStep(job, 'Ensuring launcher-owned Android clock coverage')
  await ensureLauncherOwnedAndroidTimeGuard(launchedSerial, job)
  const expectedRuntime = runtimeForPack(pack)

  setJobStep(job, 'Applying runtime identity')
  const externalId = readState().activeExternalId || pack.android?.defaultExternalId || pack.brand.demoUser.externalId
  const trustWaitStartedAt = Date.now()
  const expectedBundledSource = expectedRuntime.expectedSources?.android || 'file:///android_asset/demo/index.html'
  beginAndroidSourceTransition({
    executionId: job.id,
    expectedSource: expectedBundledSource,
    expectedOverride: false,
    expectedPackId: expectedRuntime.id,
    expectedRuntimeHash: expectedRuntime.runtimeHash || expectedRuntime.configHash,
    since: runtimeWaitStartedAt,
  })
  try {
    await applyRuntimeIdentity({
      packId: pack.id,
      platform: 'android',
      externalId,
      displayName: readState().activeDisplayName || pack.brand.demoUser.firstName || '',
      reason: deferredBundledRecovery ? 'launcher_recovery' : 'launcher_ready',
      executionId: job.id,
      clearWebSourceOverride: true,
    })
    await waitForDeviceRuntime(job, {
      platform: 'android',
      packId: expectedRuntime.id,
      configHash: expectedRuntime.configHash,
      runtimeHash: expectedRuntime.runtimeHash,
      since: runtimeWaitStartedAt,
    })
    await waitForAndroidSource({
      expectedSource: expectedBundledSource,
      expectedOverride: false,
      expectedPackId: expectedRuntime.id,
      expectedRuntimeHash: expectedRuntime.runtimeHash || expectedRuntime.configHash,
      since: runtimeWaitStartedAt,
      executionId: job.id,
      job,
    })
  } finally {
    finishAndroidSourceTransition(job.id)
  }
  await stopLiveWebProcess({ bundledSourceConfirmed: true })
  await waitForAndroidTrustDiagnostics(job, { externalId, since: trustWaitStartedAt })

  finishJob(job, 'complete', 'Ready')
  addLedger({ source: 'launcher', type: 'job', label: `${pack.name} ready on Android`, status: 'success', platform: 'android', result: { job: jobEvidence(job) } })
}

async function runIosBuildInstallLaunch(job, options = {}) {
  const simulator = options.simulator || 'iPhone 17'
  const projectPath = path.join(repoRoot, 'ios-shell/BrazeDemoShell.xcodeproj')
  const appPath = path.join(repoRoot, 'ios-shell/DerivedData/Build/Products/Debug-iphonesimulator/BrazeDemoShell.app')
  setJobStep(job, 'Generating iOS project')
  if (fs.existsSync(path.join(repoRoot, 'ios-shell/project.yml'))) {
    await runCommand('xcodegen', ['generate'], { cwd: path.join(repoRoot, 'ios-shell') }, job)
  }
  setJobStep(job, 'Building iOS simulator app')
  await runCommand('xcodebuild', [
    '-project', projectPath,
    '-scheme', 'BrazeDemoShell',
    '-sdk', 'iphonesimulator',
    '-destination', `platform=iOS Simulator,name=${simulator}`,
    '-derivedDataPath', './DerivedData',
    'CODE_SIGNING_ALLOWED=NO',
    'build',
  ], { cwd: path.join(repoRoot, 'ios-shell') }, job)
  setJobStep(job, 'Booting iOS simulator')
  await runCommand('xcrun', ['simctl', 'boot', simulator], { cwd: repoRoot }, job).catch((error) => {
    if (!String(error.message || error).includes('Unable to boot device in current state')) throw error
    pushLog(job, `Simulator ${simulator} is already booted.`)
  })
  setJobStep(job, 'Installing iOS app')
  await runCommand('xcrun', ['simctl', 'install', 'booted', appPath], { cwd: repoRoot }, job)
  setJobStep(job, 'Launching iOS app')
  const launchedAt = Date.now()
  await runCommand('xcrun', ['simctl', 'launch', 'booted', 'com.braze.masquerade'], { cwd: repoRoot }, job)
  return { launchedAt }
}

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/api[_-]?key|authorization|bearer|token|secret|password/i.test(key)) return [key, '[redacted]']
    return [key, redactSecrets(item)]
  }))
}

function escapedRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function diagnosticRedactionContext(pack = null, state = null) {
  let localPacks = pack?.source === 'local' ? [pack] : []
  try {
    localPacks = listDemoPacks().filter((item) => item.source === 'local')
  } catch {
    // Keep at least the active local pack aliases when another workspace pack is malformed.
  }
  const localPack = pack?.source === 'local'
  const aliases = [...new Set(localPacks.flatMap((item) => [item.id, item.name, item.directory]).filter(Boolean))]
    .sort((left, right) => String(right).length - String(left).length)
  const identifiers = [...new Set([
    state?.activeExternalId,
    state?.deviceRuntime?.externalId,
    state?.deviceRuntime?.deviceId,
    pack?.android?.defaultExternalId,
    pack?.brand?.demoUser?.externalId,
    ...(state?.ledger || []).flatMap((entry) => [entry.externalId, entry.payload?.externalId, entry.result?.externalId]),
  ].filter((value) => String(value || '').length >= 4))]
    .sort((left, right) => String(right).length - String(left).length)
  return { aliases, identifiers, localPack }
}

function redactDiagnosticString(value, context = {}) {
  let output = String(value)
  const userHome = String(process.env.HOME || '')
  if (repoRoot) output = output.replaceAll(repoRoot, '<repo>')
  if (userHome) output = output.replaceAll(userHome, '<home>')
  for (const alias of context.aliases || []) {
    if (!alias) continue
    output = output.replace(new RegExp(escapedRegExp(alias), 'gi'), '[local-pack]')
  }
  for (const identifier of context.identifiers || []) {
    if (!identifier) continue
    output = output.replace(new RegExp(escapedRegExp(identifier), 'g'), '[redacted-id]')
  }
  output = output
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;]+/gi, '$1[redacted]')
    .replace(/((?:api[_-]?key|token|secret|password)["']?\s*[:=]\s*["']?)[^"'\s,;}]+/gi, '$1[redacted]')
    .replace(/((?:external[_-]?id|device[_-]?id|installation[_-]?id)["']?\s*[:=]\s*["']?)[^"'\s,;}]+/gi, '$1[redacted]')
    .replace(/((?:braze\.apiKey|braze\.restApiKey|firebase\.[A-Za-z]*token)\s*=\s*)[^\s]+/gi, '$1[redacted]')
    .replace(/([?&](?:api_key|token|secret|password)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
  return output
}

export function redactDiagnosticValue(value, context = {}, key = '') {
  if (Array.isArray(value)) return value.map((item) => redactDiagnosticValue(item, context, key))
  if (typeof value === 'string') return redactDiagnosticString(value, context)
  if (!value || typeof value !== 'object') return value
  const sensitiveKey = /api[_-]?key|authorization|bearer|token|secret|password|external[_-]?id|device[_-]?id|installation[_-]?id|email|phone|display[_-]?name|first[_-]?name|last[_-]?name|profile[_-]?name/i
  if (/^(?:attributes|userAttributes)$/i.test(key)) {
    return Object.fromEntries(Object.keys(value).map((childKey) => [childKey, '[redacted]']))
  }
  return Object.fromEntries(Object.entries(value).map(([childKey, item]) => {
    if (sensitiveKey.test(childKey)) return [childKey, item ? '[redacted]' : item]
    return [childKey, redactDiagnosticValue(item, context, childKey || key)]
  }))
}

function troubleshootingLevel(blockers, codes, ready = false) {
  if (blockers.some((blocker) => codes.includes(blocker.code))) return 'error'
  return ready ? 'success' : 'warning'
}

export function guidedTroubleshootingCards(pack, runtime, state = readState(), instanceId = launcherInstanceId) {
  const blockers = operatorBaseBlockers(pack, runtime, state, instanceId)
  const byCode = (codes) => blockers.find((blocker) => codes.includes(blocker.code))
  const platform = state.activePlatform === 'ios' ? 'ios' : 'android'
  const latestJob = Array.from(jobs.values()).sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)))[0]
  const push = latestActivePushReadiness(state, instanceId)
  const pushReason = pushReadinessBlockReason(push, { platform, externalId: state.activeExternalId || '' })
  const trust = latestActiveTrustDiagnostics(state, instanceId)
  const runtimeIssue = byCode(['device_missing', 'device_evidence_stale', 'platform_mismatch', 'pack_mismatch', 'runtime_hash_mismatch'])
  const sourceIssue = byCode(['source_mismatch', 'source_not_confirmed', 'live_web_uncertain'])
  const credentialIssue = byCode(['sdk_credentials_missing', 'sdk_credential_context_missing', 'sdk_credential_context_mismatch'])
  const identityIssue = byCode(['persona_unapproved', 'identity_mismatch'])
  const trustIssue = byCode(['trust_not_ready'])
  const jobFailed = latestJob?.status === 'failed'
  const sessionId = state.activitySession?.id || ''
  const sessionLedger = (state.ledger || []).filter((entry) => !sessionId || entry.sessionId === sessionId)
  const latestEvent = (predicate) => sessionLedger.find(predicate)
  const contentCardSurfaces = Array.isArray(pack.content?.contentCardSurfaces) ? pack.content.contentCardSurfaces : []
  const bannerSurfaces = Array.isArray(pack.content?.bannerSurfaces) ? pack.content.bannerSurfaces : []
  const contentCardsEvent = latestEvent((entry) => entry.type === 'content_cards')
  const contentCardsCount = Number(activityPayload(contentCardsEvent || {}).count || 0)
  const configuredBannerPlacements = bannerSurfaces.map((surface) => String(surface.placement || '')).filter(Boolean)
  const bannerError = latestEvent((entry) => entry.type === 'banner_error')
  const bannerMounted = latestEvent((entry) => {
    if (entry.type !== 'banner_mounted') return false
    const placement = String(activityPayload(entry).placementId || '')
    return !configuredBannerPlacements.length || configuredBannerPlacements.includes(placement)
  })
  const bannerDelivered = latestEvent((entry) => {
    const payload = activityPayload(entry)
    if (entry.type === 'banner_rendered') return configuredBannerPlacements.includes(String(payload.placementId || ''))
    if (entry.type !== 'banners_updated') return false
    const placements = Array.isArray(payload.placements) ? payload.placements.map(String) : []
    return configuredBannerPlacements.some((placement) => placements.includes(placement))
  })
  const iamTrigger = latestEvent((entry) => entry.type === 'sdk_event' && activityEventName(entry) === 'demo_iam_trigger')
  return [
    {
      id: 'android_launch',
      level: jobFailed ? 'error' : troubleshootingLevel(blockers, ['device_missing', 'device_evidence_stale', 'platform_mismatch'], Boolean(state.deviceRuntime)),
      title: jobFailed ? 'Android launch stopped' : (state.deviceRuntime ? 'Native app is connected' : 'Launch the Android demo'),
      observation: jobFailed
        ? `${latestJob.failedStep || latestJob.step || 'Launcher job'} failed. The exact command output is retained in Launcher Logs.`
        : state.deviceRuntime
          ? `The ${state.deviceRuntime.platform || platform} shell reported runtime evidence to this launcher.`
          : 'No current native runtime evidence has reached the Control Room.',
      nextStep: jobFailed ? 'Open Launcher Logs, follow the first failing step, then launch again.' : 'Keep the Control Room running and use Launch so clock sync and telemetry stay supervised.',
      action: 'launch_android',
      actionLabel: jobFailed ? 'Retry Android launch' : 'Launch Android',
      agentHint: 'Start the persistent Control Room with npm run lumo:cockpit, then launch Android from the Setup card.',
    },
    {
      id: 'workspace_credentials',
      level: credentialIssue ? 'error' : 'success',
      title: credentialIssue ? credentialIssue.label : 'Selected Braze workspace is confirmed',
      observation: credentialIssue?.detail || 'The active pack has SDK credentials and the native credential fingerprint matches.',
      nextStep: credentialIssue ? 'Open SDK and REST configuration, enter only the selected-pack values, save, then relaunch.' : 'No credential action is needed.',
      action: 'open_credentials',
      actionLabel: 'Open configuration',
      agentHint: 'Never put REST keys in a pack. Keep REST keys in the launcher session or the documented host environment variable.',
    },
    {
      id: 'runtime_identity',
      level: runtimeIssue ? 'error' : (state.deviceRuntime ? 'success' : 'warning'),
      title: runtimeIssue ? runtimeIssue.label : (state.deviceRuntime ? 'Pack and runtime hashes align' : 'Runtime identity not observed'),
      observation: runtimeIssue?.detail || (state.deviceRuntime ? 'Native pack id and runtimeHash match the active generated runtime.' : 'The app has not yet reported its bundled runtime identity.'),
      nextStep: runtimeIssue ? 'Apply the active pack and relaunch the same pack; do not select a pack by brand name.' : 'Use Apply pack whenever pack content or assets change.',
      action: 'apply_pack',
      actionLabel: 'Apply active pack',
      agentHint: 'Treat demo-pack.json as source and never hand-edit generated runtime files.',
    },
    {
      id: 'render_source',
      level: sourceIssue ? 'error' : (state.deviceSourceReadiness?.renderConfirmed ? 'success' : 'warning'),
      title: sourceIssue ? sourceIssue.label : (state.deviceSourceReadiness?.renderConfirmed ? 'Rendered source is confirmed' : 'Waiting for rendered-page proof'),
      observation: sourceIssue?.detail || 'Native main-frame completion and webReady agree on the canonical runtime.',
      nextStep: sourceIssue?.code === 'live_web_uncertain' ? 'Restore bundled Android mode and wait for correlated native confirmation.' : 'Keep bundled mode for rehearsal and handoff.',
      action: sourceIssue?.code === 'live_web_uncertain' ? 'restore_bundled' : 'open_runtime',
      actionLabel: sourceIssue?.code === 'live_web_uncertain' ? 'Restore bundled mode' : 'Inspect runtime',
      agentHint: 'A URL alone is not readiness; use the matching pack id, configHash, runtimeHash, source generation, and webReady evidence.',
    },
    {
      id: 'content_cards',
      level: contentCardsCount > 0 ? 'success' : 'warning',
      title: contentCardsCount > 0 ? `${contentCardsCount} Content Card${contentCardsCount === 1 ? '' : 's'} delivered` : 'Verify Content Card delivery',
      observation: contentCardsEvent
        ? `The native SDK returned ${contentCardsCount} active card${contentCardsCount === 1 ? '' : 's'} for ${contentCardSurfaces.length} declared surface${contentCardSurfaces.length === 1 ? '' : 's'}.`
        : `The pack declares ${contentCardSurfaces.length} Content Card surface${contentCardSurfaces.length === 1 ? '' : 's'}, but this session has no SDK card update yet.`,
      nextStep: contentCardsCount > 0
        ? 'Open Home and Inbox and confirm each card uses the placement mapped in notes.md.'
        : 'Refresh Content Cards, then confirm the Braze cards use an extras.placement value declared by this pack.',
      action: 'verify_content_cards',
      actionLabel: 'Refresh Content Cards',
      agentHint: 'A successful refresh request is not delivery proof. Look for a later Content Cards updated event with a non-zero count and check the dashboard mapping in notes.md.',
    },
    {
      id: 'banners',
      level: bannerError ? 'error' : (bannerDelivered ? 'success' : 'warning'),
      title: bannerError ? 'Banner render failed' : (bannerDelivered ? 'Configured Banner placement delivered' : 'Verify Banner placement and delivery'),
      observation: bannerError
        ? (activityPayload(bannerError).error || 'The native SDK reported a Banner rendering error.')
        : bannerDelivered
          ? `The SDK reported a configured placement (${configuredBannerPlacements.join(', ')}) in this session.`
          : bannerMounted
            ? 'The native placement is mounted, but no matching Banner update has been reported by the SDK.'
            : `The pack declares ${bannerSurfaces.length} Banner surface${bannerSurfaces.length === 1 ? '' : 's'}; none has mounted in this session.`,
      nextStep: bannerDelivered
        ? 'Visually confirm the creative is visible on the screen and placement mapped in notes.md.'
        : 'Open app Home to mount and refresh the Banner, then check that the dashboard placement ID exactly matches notes.md.',
      action: 'verify_banners',
      actionLabel: 'Open Home and inspect',
      agentHint: 'A mounted slot proves placement wiring, not message delivery. Require matching Banner update/render telemetry plus a visible creative before rehearsal.',
    },
    {
      id: 'iam',
      level: 'warning',
      title: iamTrigger ? 'IAM trigger logged; confirm the message' : 'Verify the IAM event mapping',
      observation: iamTrigger
        ? 'The native SDK logged demo_iam_trigger for the active user. The launcher cannot treat that event alone as visual display proof.'
        : 'This session has not logged the default demo_iam_trigger event.',
      nextStep: 'Map the dashboard action-based campaign to demo_iam_trigger, run it, and visually confirm the in-app message appears.',
      action: 'verify_iam',
      actionLabel: 'Log IAM trigger',
      agentHint: 'Use the IAM row in notes.md. Check user identity, campaign eligibility, trigger event, and impression in that order when the message does not appear.',
    },
    {
      id: 'android_trust_clock',
      level: platform !== 'android' ? 'success' : (trustIssue ? 'error' : (trust?.ready ? 'success' : 'warning')),
      title: platform !== 'android' ? 'Android-only check not applicable' : (trustIssue ? trustIssue.label : (trust?.ready ? 'Android trust is ready' : 'Verify Android trust and clock')),
      observation: platform !== 'android' ? 'The selected target is iOS.' : (trustIssue?.detail || 'HTTPS media/Firebase trust and emulator clock health are required for reliable messaging.'),
      nextStep: platform !== 'android' ? 'Switch to Android for the prioritized handoff flow.' : 'Run native HTTPS diagnostics; if TLS fails, follow the Zscaler and emulator clock guidance.',
      action: 'verify_trust',
      actionLabel: 'Verify Android trust',
      agentHint: 'Do not disable TLS validation. Repair the emulator trust chain and network clock instead.',
    },
    {
      id: 'push_delivery',
      level: platform !== 'android' ? 'warning' : (pushReason ? 'error' : (push ? 'success' : 'warning')),
      title: pushReason ? 'Push is not ready' : (push ? 'Push token is bound to the active user' : 'Push readiness not yet verified'),
      observation: pushReason || (push ? 'Current native token telemetry matches this app, device, and External User ID.' : 'No current token evidence exists for the active user.'),
      nextStep: 'Verify push readiness, confirm the Braze profile/app registration, then send a real dashboard push. A local preview is not delivery proof.',
      action: 'verify_push',
      actionLabel: 'Verify push readiness',
      agentHint: 'For first-time push setup, follow the lumo-push-readiness campaign and use the manually shared Firebase service-account handoff.',
    },
    {
      id: 'identity',
      level: identityIssue ? 'warning' : 'success',
      title: identityIssue ? identityIssue.label : 'Active persona is applied',
      observation: identityIssue?.detail || 'SDK and REST controls target the same approved pack persona.',
      nextStep: identityIssue ? 'Choose a named pack persona and use Apply user before sending events or messages.' : 'Keep the same persona through rehearsal and dashboard verification.',
      action: 'open_setup',
      actionLabel: 'Open user setup',
      agentHint: 'Preserve SDK device identity; clearing app data is a recovery action, not a normal persona switch.',
    },
  ]
}

function activityArchivePayload(state, reason, createdAt) {
  const pack = safeGetDemoPack(state.activePackId)
  const runtime = runtimeForPack(pack)
  const context = diagnosticRedactionContext(pack, state)
  return redactDiagnosticValue({
    schemaVersion: 1,
    kind: 'lumo-redacted-activity-archive',
    createdAt,
    reason,
    active: {
      pack: { id: pack.id, name: pack.name, source: pack.source },
      platform: state.activePlatform || 'android',
      runtime: { configHash: runtime.configHash, runtimeHash: runtime.runtimeHash },
    },
    session: state.activitySession || null,
    events: state.ledger || [],
  }, context)
}

function writeActivityArchive(state, reason = 'manual_archive') {
  const createdAt = new Date().toISOString()
  const id = randomUUID()
  const timestamp = createdAt.replace(/[:.]/g, '-').replace('Z', '')
  const fileName = `activity-${timestamp}-${id.slice(0, 8)}.json`
  const archive = activityArchivePayload(state, reason, createdAt)
  fs.mkdirSync(activityArchiveDir, { recursive: true })
  const destination = path.join(activityArchiveDir, fileName)
  const temporary = `${destination}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(archive, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, destination)
  const metadata = {
    id,
    fileName,
    createdAt,
    reason,
    eventCount: archive.events.length,
    redacted: true,
  }
  return { archive, metadata }
}

function archiveCurrentActivity(reason = 'manual_archive') {
  let result
  updateState((state) => {
    result = writeActivityArchive(state, reason)
    state.activityArchives = [result.metadata, ...(state.activityArchives || [])].slice(0, 20)
    const entry = normalizeActivityEntry({
      id: randomUUID(),
      ts: new Date().toISOString(),
      sessionId: state.activitySession?.id || '',
      status: 'success',
      source: 'launcher',
      platform: 'host',
      transport: 'launcher',
      type: 'activity_archived',
      label: 'Activity archived',
      payload: { fileName: result.metadata.fileName, eventCount: result.metadata.eventCount },
      result: { redacted: true },
    })
    state.ledger = [entry, ...(state.ledger || [])].slice(0, activityLedgerLimit)
  })
  return result
}

function clearCurrentActivity() {
  let result
  updateState((state) => {
    result = writeActivityArchive(state, 'clear_activity')
    state.activityArchives = [result.metadata, ...(state.activityArchives || [])].slice(0, 20)
    const session = { id: randomUUID(), startedAt: new Date().toISOString(), reason: 'activity_cleared' }
    state.activitySession = session
    state.ledger = [activityBoundary(session, 'Activity cleared · new session')]
    state.restResponses = []
  })
  return result
}

function diagnosticBundle() {
  const state = readState()
  const { pack, secrets } = activePackAndSecrets(state)
  const runtime = runtimeForPack(pack)
  const profile = packProfile(pack, secrets, state)
  const context = diagnosticRedactionContext(pack, state)
  const latestJobs = Array.from(jobs.values()).slice(-5).reverse().map((job) => ({
    ...job,
    logs: (job.logs || []).slice(-120),
  }))
  const raw = {
    schemaVersion: 1,
    kind: 'lumo-redacted-diagnostic-bundle',
    generatedAt: new Date().toISOString(),
    redaction: {
      applied: true,
      note: 'Credentials, tokens, personal identifiers, local customer-pack names, and user-specific filesystem paths are removed.',
    },
    host: {
      platform: process.platform,
      architecture: process.arch,
      node: process.versions.node,
      launcherInstanceId,
      port: serverPort,
    },
    active: {
      platform: state.activePlatform || 'android',
      pack: { id: pack.id, name: pack.name, source: pack.source },
      profile,
      runtime,
      deviceRuntime: state.deviceRuntime || null,
      sourceReadiness: state.deviceSourceReadiness || null,
      pushReadiness: latestActivePushReadiness(state),
      trustDiagnostics: latestActiveTrustDiagnostics(state),
    },
    development: state.development || {},
    troubleshooting: guidedTroubleshootingCards(pack, runtime, state),
    runtimeWarnings: runtimeWarnings(runtime, state),
    activity: {
      session: state.activitySession || null,
      archives: state.activityArchives || [],
      recentEvents: (state.ledger || []).slice(0, 80),
      recentRestResponses: (state.restResponses || []).slice(0, 20),
    },
    jobs: latestJobs,
  }
  return redactDiagnosticValue(raw, context)
}

function queryString(query = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) value.forEach((item) => params.append(key, String(item)))
    else params.set(key, String(value))
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

function validateBrazeRestRequest(method, pathname, body = {}) {
  const errors = []
  const upperMethod = String(method || 'POST').toUpperCase()
  const pathValue = String(pathname || '')
  if (!['GET', 'POST', 'PUT', 'PATCH'].includes(upperMethod)) errors.push('Generic REST requests support GET, POST, PUT, and PATCH only.')
  if (!pathValue.startsWith('/')) errors.push('Braze REST path must be relative and start with /.')
  if (/^https?:\/\//i.test(pathValue) || pathValue.startsWith('//')) errors.push('Braze REST path cannot be an absolute URL.')
  if (pathValue.includes('..')) errors.push('Braze REST path cannot contain path traversal.')
  if (upperMethod === 'DELETE') errors.push('DELETE requests are blocked in the Control Room.')
  const normalizedPath = pathValue.toLowerCase()
  const blockedPatterns = [
    /^\/users\/delete\b/,
    /^\/users\/merge\b/,
    /^\/users\/external_ids\//,
    /^\/campaigns\/trigger\/schedule\/delete\b/,
    /^\/canvas\/trigger\/schedule\/delete\b/,
    /^\/messages\/schedule\/delete\b/,
    /^\/email\/(blacklist|bounce\/remove|spam\/remove)\b/,
  ]
  if (blockedPatterns.some((pattern) => pattern.test(normalizedPath))) {
    errors.push('This endpoint is blocked because it can destructively modify users, schedules, or workspace state.')
  }
  if (body && typeof body === 'object' && body.broadcast === true) {
    errors.push('Broadcast sends are blocked. Target the active user with recipients instead.')
  }
  if ((normalizedPath === '/campaigns/trigger/send' || normalizedPath === '/canvas/trigger/send') && body && typeof body === 'object') {
    if (!Array.isArray(body.recipients) || !body.recipients.length) {
      errors.push('Campaign and Canvas REST triggers must include explicit recipients.')
    }
  }
  return validation(errors, [])
}

function restRequestForPayload(payload = {}) {
  const method = String(payload.method || 'POST').toUpperCase()
  const endpoint = String(payload.path || payload.endpoint || '').trim()
  const body = payload.body && typeof payload.body === 'object' ? payload.body : {}
  const query = payload.query && typeof payload.query === 'object' ? payload.query : {}
  const serializedBody = JSON.stringify(body)
  const result = validateBrazeRestRequest(method, endpoint, body)
  if (serializedBody.length > 64 * 1024) {
    result.ok = false
    result.errors.push('Braze REST request body must be 64 KB or smaller.')
  }
  return {
    endpoint,
    method,
    query,
    body,
    validation: result,
  }
}

async function callBraze(pathname, payload, { method = 'POST', query = {} } = {}) {
  const state = readState()
  const { pack, secrets } = activePackAndSecrets(state)
  const profile = packProfile(pack, secrets, state)
  const restStatus = restCredentialStatus(pack, secrets)
  if (!profile.restEndpoint || !restStatus.key) {
    throw new Error(`Braze REST endpoint/API key missing. Configure a session key, ${restStatus.envName || 'pack-specific env var'}, or BRAZE_REST_API_KEY.`)
  }
  const url = `${profile.restEndpoint}${pathname}${queryString(query)}`
  const response = await fetch(url, {
    method: String(method || 'POST').toUpperCase(),
    headers: {
      authorization: `Bearer ${restStatus.key}`,
      'content-type': 'application/json',
    },
    body: String(method || 'POST').toUpperCase() === 'GET' ? undefined : JSON.stringify(payload),
  })
  const text = await response.text()
  let body = text
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = text
  }
  const summary = { endpoint: pathname, status: response.status, ok: response.ok, body: redactSecrets(body) }
  addRestResponse(summary)
  if (!response.ok) {
    const error = new Error(`Braze REST ${pathname} failed with ${response.status}`)
    error.details = summary
    throw error
  }
  return summary
}

function deepContainsAndroid(value) {
  if (typeof value === 'string') return value.toLowerCase().includes('android')
  if (Array.isArray(value)) return value.some((item) => deepContainsAndroid(item))
  if (value && typeof value === 'object') return Object.values(value).some((item) => deepContainsAndroid(item))
  return false
}

function arrayCount(value) {
  return Array.isArray(value) ? value.length : 0
}

async function preflightPushProfile({ externalId, platform = 'android', label = 'Push profile preflight', localPush = null }) {
  const body = {
    external_ids: [externalId],
    fields_to_export: ['external_id', 'apps', 'devices', 'push_tokens', 'push_subscribe'],
  }
  try {
    const result = await callBraze('/users/export/ids', body)
    const users = Array.isArray(result.body?.users) ? result.body.users : []
    const user = users[0] || null
    const pushTokenCount = arrayCount(user?.push_tokens)
    const appCount = arrayCount(user?.apps)
    const deviceCount = arrayCount(user?.devices)
    const androidEvidence = deepContainsAndroid(user?.apps) || deepContainsAndroid(user?.devices) || deepContainsAndroid(user?.push_tokens)
    const platformEvidence = platform !== 'android' || androidEvidence || (appCount === 0 && deviceCount === 0 && pushTokenCount > 0)
    const appDeviceEvidence = appCount > 0 || deviceCount > 0
    const strongPushEvidence = pushTokenCount > 0 && platformEvidence
    const fallbackPushEvidence = platform === 'android' && appDeviceEvidence && androidEvidence
    const localPushEvidence = Boolean(localPush?.tokenPresent && localPush?.ready)
    const ok = Boolean(user) && (strongPushEvidence || fallbackPushEvidence || (platform === 'android' && localPushEvidence))
    const warning = ok && !strongPushEvidence
      ? localPushEvidence
        ? 'Braze export did not include push_tokens, but local Android SDK token/display readiness is current; allowing send with a warning.'
        : 'Braze export did not include push_tokens, but Android app/device evidence exists; allowing send based on local SDK token readiness.'
      : ''
    const summary = {
      externalId,
      platform,
      userFound: Boolean(user),
      pushSubscribe: user?.push_subscribe || '',
      appCount,
      deviceCount,
      pushTokenCount,
      androidEvidence,
      localPushEvidence,
      localTokenPreview: localPush?.tokenPreview || '',
      localSdkDeviceId: localPush?.deviceId || '',
      warning,
    }
    addLedger({
      source: 'braze_rest',
      transport: 'braze_rest',
      type: 'push_profile_preflight',
      label,
      status: ok ? (warning ? 'warning' : 'success') : 'error',
      externalId,
      payload: body,
      result: summary,
    })
    if (!ok) {
      const reason = !user
        ? `Braze profile ${externalId} was not found.`
        : !appDeviceEvidence && pushTokenCount === 0
          ? `Braze profile ${externalId} has no exported push tokens.`
          : `Braze profile ${externalId} does not show Android app/token evidence.`
      const error = new Error(reason)
      error.details = { preflight: summary }
      throw error
    }
    return summary
  } catch (error) {
    if (!error.details?.preflight) {
      addLedger({
        source: 'braze_rest',
        transport: 'braze_rest',
        type: 'push_profile_preflight',
        label,
        status: 'error',
        externalId,
        payload: body,
        result: { error: error.message || 'Braze profile export failed' },
      })
    }
    throw error
  }
}

async function ensurePushDependentSendReady({ preset, rest, externalId }) {
  if (!preset.requiresPushToken || !triggerSendEndpoint(rest.endpoint)) return
  const state = readState()
  const platform = state.activePlatform || 'android'
  const push = latestActivePushReadiness(state)
  const localReason = pushReadinessBlockReason(push, { platform, externalId })
  if (localReason) {
    addLedger({
      source: 'launcher',
      platform,
      type: 'push_readiness',
      label: 'Native push readiness blocked trigger',
      status: 'error',
      externalId,
      payload: { endpoint: rest.endpoint, reason: localReason, push: push || null },
      result: { error: localReason },
    })
    const error = new Error(localReason)
    error.details = { pushReadiness: push || null }
    throw error
  }
  await preflightPushProfile({
    externalId,
    platform,
    label: `Push preflight before ${rest.endpoint}`,
    localPush: push,
  })
}

function androidAdbPath() {
  return process.env.ADB || path.join(process.env.HOME, 'Library/Android/sdk/platform-tools/adb')
}

async function expectedAndroidSerial(avd) {
  const adb = androidAdbPath()
  const { stdout } = await runCapture(adb, ['devices'])
  const rows = stdout.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean)
  if (!rows.length) return ''
  if (rows.length > 1) throw new Error(`Expected at most one Android device, found ${rows.length}. Close unrelated devices before launching.`)
  const [serial, status] = rows[0].split(/\s+/)
  if (status !== 'device') throw new Error(`Android device ${serial || '(unknown)'} is ${status || 'offline'}; refusing an ambiguous launch.`)
  if (!serial.startsWith('emulator-')) throw new Error(`Connected Android target ${serial} is not the expected demo AVD.`)
  const result = await runCapture(adb, ['-s', serial, 'emu', 'avd', 'name'])
  const reportedAvd = result.stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => line && line !== 'OK') || ''
  if (reportedAvd !== avd) throw new Error(`Connected emulator is ${reportedAvd || '(unknown)'}, expected ${avd}.`)
  return serial
}

function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

async function installedAndroidApkHash(serial, appId) {
  if (!serial) return ''
  const adb = androidAdbPath()
  const packageResult = await runCapture(adb, ['-s', serial, 'shell', 'pm', 'path', appId])
  const apkPath = packageResult.stdout.split(/\r?\n/).find((line) => line.startsWith('package:'))?.slice('package:'.length).trim() || ''
  if (!apkPath) return ''
  const hashResult = await runCapture(adb, ['-s', serial, 'shell', 'sha256sum', apkPath])
  return hashResult.stdout.trim().split(/\s+/)[0] || ''
}

async function legacyAndroidTimeGuardPids(excludedPid = null) {
  let stdout = ''
  try {
    stdout = (await runCapture('ps', ['-axo', 'pid=,command='])).stdout
  } catch {
    return []
  }
  return stdout.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*(\d+)\s+(.+)$/)
    if (!match) return null
    const pid = Number(match[1])
    const command = match[2]
    if (pid === Number(excludedPid) || pid === process.pid) return null
    if (!command.includes(androidTimeSyncScript) || !/(?:^|\s)--watch(?:\s|$)/.test(command)) return null
    return pid
  }).filter(Boolean)
}

async function stopLegacyAndroidTimeGuards(job, excludedPid = null) {
  const pids = await legacyAndroidTimeGuardPids(excludedPid)
  if (!pids.length) return
  appendJobLogs(job, [`Stopping ${pids.length} detached legacy Android clock watcher${pids.length === 1 ? '' : 's'} before launcher ownership.`])
  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM') } catch {}
  }
  const deadline = Date.now() + 1_500
  while (Date.now() < deadline && pids.some((pid) => processIsAlive(pid))) await sleep(50)
  for (const pid of pids) {
    if (!processIsAlive(pid)) continue
    try { process.kill(pid, 'SIGKILL') } catch {}
  }
}

async function ensureLauncherOwnedAndroidTimeGuard(serial, job) {
  if (!launcherAuthority || launcherAuthority.instanceId !== launcherInstanceId) {
    throw new Error('Android clock watching requires the active launcher state authority.')
  }
  const current = androidTimeGuard.status()
  if (current.running && current.key === serial) {
    appendJobLogs(job, [`Reusing launcher-owned Android network clock guard pid=${current.pid} for ${serial}.`])
    return current
  }
  await stopLegacyAndroidTimeGuards(job, current.pid)
  fs.mkdirSync(path.dirname(androidTimeSyncLog), { recursive: true })
  const logFd = fs.openSync(androidTimeSyncLog, 'a', 0o600)
  let result
  try {
    result = await androidTimeGuard.ensure(serial, () => spawn(
      androidTimeSyncGuardScript,
      ['--watch-owned', serial],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          ANDROID_SERIAL: serial,
          ADB: androidAdbPath(),
          BRAZE_DEMO_LAUNCHER_OWNER_PID: String(process.pid),
          BRAZE_DEMO_LAUNCHER_INSTANCE_ID: launcherInstanceId,
        },
        shell: false,
        detached: false,
        stdio: ['ignore', logFd, logFd],
      },
    ))
  } finally {
    fs.closeSync(logFd)
  }
  appendJobLogs(job, [result.reused
    ? `Reusing launcher-owned Android network clock guard pid=${result.child.pid} for ${serial}.`
    : `Started launcher-owned Android network clock guard pid=${result.child.pid} for ${serial}.`])
  return androidTimeGuard.status()
}

async function resolveAndroidActivity() {
  const adb = androidAdbPath()
  const appId = process.env.APP_ID || 'com.braze.demoshell'
  const { stdout } = await runCapture(adb, ['shell', 'cmd', 'package', 'resolve-activity', '--brief', appId])
  const component = stdout.trim().split(/\r?\n/).pop()
  if (!component || !component.startsWith(`${appId}/`)) {
    throw new Error(`Could not resolve launcher activity for ${appId}. Is the app installed?`)
  }
  return { adb, component }
}

async function sendAndroidCommand(command) {
  const { adb, component } = await resolveAndroidActivity()
  const commandWithCallback = {
    ...command,
    callbackUrl: command.callbackUrl || launcherCallbackUrl(),
  }
  const encoded = Buffer.from(JSON.stringify(commandWithCallback), 'utf8').toString('base64')
  const args = [
    'shell',
    'am',
    'start',
    '-a',
    'com.braze.demoshell.DEMO_COMMAND',
    '-n',
    component,
    '--es',
    'command',
    encoded,
  ]
  const result = await runCapture(adb, args)
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() }
}

async function sendIosCommand(command) {
  const commandWithCallback = {
    ...command,
    callbackUrl: command.callbackUrl || iosLauncherCallbackUrl(),
  }
  const encoded = Buffer.from(JSON.stringify(commandWithCallback), 'utf8').toString('base64url')
  const url = `braze-demo://command?payload=${encoded}`
  const result = await runCapture('xcrun', ['simctl', 'openurl', 'booted', url], { cwd: repoRoot })
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() }
}

async function sendDeviceCommand(command, platform) {
  if (platform === 'ios') return sendIosCommand(command)
  return sendAndroidCommand(command)
}

function commandForPreset(preset, externalId, payloadOverride = {}) {
  const payload = { ...(preset.payload || {}), ...(payloadOverride || {}) }
  switch (preset.type) {
    case 'sdk_event':
      return { action: 'logCustomEvent', externalId, payload }
    case 'sdk_attribute':
      return { action: 'setCustomAttribute', externalId, payload }
    case 'sdk_purchase':
      return { action: 'logPurchase', externalId, payload }
    case 'change_user':
      return { action: 'changeUser', externalId: payload.externalId || externalId, payload }
    case 'content_cards_refresh':
      return { action: 'requestContentCardsRefresh', externalId, payload }
    case 'push_permission':
      return { action: 'requestPushPermission', externalId, payload }
    case 'push_readiness':
      return { action: 'requestPushReadiness', externalId, payload }
    case 'trust_diagnostics':
      return { action: 'requestTrustDiagnostics', externalId, payload }
    case 'navigate':
      return { action: 'navigate', externalId, payload }
    case 'foreground_push':
      return { action: 'foregroundPush', externalId, payload }
    default:
      return null
  }
}

function commandsForPreset(preset, externalId, payloadOverride = {}) {
  const payload = { ...(preset.payload || {}), ...(payloadOverride || {}) }
  if (preset.type === 'sdk_event_sequence') {
    return (payload.events || []).map((event) => ({
      action: 'logCustomEvent',
      externalId,
      payload: event,
    }))
  }
  if (preset.type === 'android_sequence') {
    return (payload.commands || []).map((command) => ({
      action: command.action,
      externalId,
      payload: command.payload || {},
    }))
  }
  const command = commandForPreset(preset, externalId, payloadOverride)
  return command ? [command] : []
}

export function correlateDeviceCommands(commands = [], correlation = null) {
  if (!correlation) return commands
  return commands.map((command, index) => ({
    ...command,
    launcherInstanceId: correlation.launcherInstanceId,
    executionId: correlation.commandExecutionIds?.[index] || correlation.executionId,
  }))
}

async function applyRuntimeIdentity(body = {}) {
  const externalId = String(body.externalId || '').trim()
  if (!externalId) throw new Error('External user ID is required')
  const displayName = String(body.displayName || '').trim()
  const platform = body.platform === 'ios' ? 'ios' : 'android'
  const pack = body.packId ? getDemoPack(body.packId) : activePackAndSecrets().pack
  const currentState = readState()
  const liveHazard = currentLiveWebHazard(currentState)
  if (liveHazard.mayBeActive && (platform === 'ios' || pack.id !== currentState.activePackId)) {
    throw liveWebConflict('Restore the bundled Android source before switching platform or pack identity.')
  }

  updateState((state) => {
    state.activePackId = pack.id
    state.activePlatform = platform
    state.activeExternalId = externalId
    if (body.displayName !== undefined) state.activeDisplayName = displayName
  })

  const executionId = String(body.executionId || randomUUID())
  const correlation = { launcherInstanceId, executionId }
  const commands = [{
    action: 'prepareRuntime',
    externalId,
    ...correlation,
    payload: {
      externalId,
      displayName,
      reason: String(body.reason || 'identity_apply'),
      refreshContentCards: body.refreshContentCards !== false,
      refreshTrust: body.refreshTrust !== false,
      refreshPush: body.refreshPush !== false,
      clearWebSourceOverride: platform === 'android' && body.clearWebSourceOverride === true,
    },
  }]
  const result = []
  for (const command of commands) {
    result.push(await sendDeviceCommand(command, platform))
  }

  addLedger({
    source: 'launcher',
    platform,
    transport: `${platform}_sdk`,
    type: 'change_user',
    label: 'Applied demo user',
    status: 'success',
    externalId,
    payload: {
      packId: pack.id,
      displayName,
      launcherInstanceId,
      executionId,
    },
    request: { commands },
    response: result,
    result,
  })

  return publicState()
}

function restPayloadForPreset(preset, externalId, payloadOverride = {}) {
  const payload = { ...(preset.payload || {}), ...(payloadOverride || {}) }
  const time = new Date().toISOString()
  switch (preset.type) {
    case 'rest_event':
      return {
        endpoint: '/users/track',
        method: 'POST',
        body: {
          events: [
            {
              external_id: externalId,
              name: payload.name,
              time,
              properties: payload.properties || {},
            },
          ],
        },
      }
    case 'rest_attribute':
      return {
        endpoint: '/users/track',
        method: 'POST',
        body: { attributes: [{ external_id: externalId, ...(payload.attributes || {}) }] },
      }
    case 'rest_purchase':
      return {
        endpoint: '/users/track',
        method: 'POST',
        body: {
          purchases: [
            {
              external_id: externalId,
              product_id: payload.productId,
              currency: payload.currency || 'USD',
              price: Number(payload.price || 0),
              quantity: Number(payload.quantity || 1),
              time,
              properties: payload.properties || {},
            },
          ],
        },
      }
    case 'campaign_trigger':
      return {
        endpoint: '/campaigns/trigger/send',
        method: 'POST',
        body: {
          campaign_id: payload.campaignId,
          recipients: [
            {
              external_user_id: externalId,
              trigger_properties: payload.triggerProperties || {},
              send_to_existing_only: payload.sendToExistingOnly !== false,
            },
          ],
        },
      }
    case 'canvas_trigger':
      {
        const context = payload.context && typeof payload.context === 'object'
          ? payload.context
          : payload.triggerProperties || {}
        const triggerProperties = payload.triggerProperties || context
      return {
        endpoint: '/canvas/trigger/send',
        method: 'POST',
        body: {
          canvas_id: payload.canvasId,
          context,
          recipients: [
            {
              external_user_id: externalId,
              trigger_properties: triggerProperties,
              send_to_existing_only: payload.sendToExistingOnly !== false,
            },
          ],
        },
      }
      }
    case 'profile_export':
      return {
        endpoint: '/users/export/ids',
        method: 'POST',
        body: {
          external_ids: [externalId],
          fields_to_export: Array.isArray(payload.fieldsToExport) && payload.fieldsToExport.length
            ? payload.fieldsToExport
            : ['external_id', 'first_name', 'custom_attributes', 'custom_events', 'purchases', 'apps', 'push_tokens'],
        },
      }
    case 'braze_rest_request': {
      const request = restRequestForPayload(payload)
      return {
        endpoint: request.endpoint,
        method: request.method,
        query: request.query,
        body: request.body,
        validation: request.validation,
      }
    }
    default:
      return null
  }
}

function sourceForPreset(preset) {
  if (preset.transport === 'braze_rest') return 'braze_rest'
  if (['android_sdk', 'ios_sdk', 'app_sdk'].includes(preset.transport)) return 'app_sdk'
  if (preset.type.startsWith('rest_') || preset.type.endsWith('_trigger') || ['profile_export', 'braze_rest_request'].includes(preset.type)) return 'braze_rest'
  return 'app_sdk'
}

function platformForPreset(preset, state = readState()) {
  if (preset.platform) return preset.platform
  return sourceForPreset(preset) === 'braze_rest' ? 'host' : (state.activePlatform || 'android')
}

function withPresetMeta(preset, state = readState()) {
  const source = sourceForPreset(preset)
  const platform = platformForPreset(preset, state)
  return {
    ...preset,
    source,
    transport: preset.transport || (source === 'app_sdk' ? `${platform}_sdk` : source),
    platform,
    requiresPushToken: Boolean(preset.requiresPushToken),
  }
}

function withControlUiState(preset, controlState) {
  return {
    ...preset,
    hidden: controlState.hidden.includes(preset.id),
    pinned: controlState.pinned.includes(preset.id),
    locked: controlState.locked.includes(preset.id),
  }
}

function stageControl(body = {}) {
  let stagedControlId = ''
  updateState((state) => {
    const { pack } = activePackAndSecrets(state)
    const source = body.sourceControlId ? findControlById(pack, state, body.sourceControlId) : null
    const staged = cleanPresetForStorage({
      ...(source || {}),
      id: body.id || `staged_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      label: body.label || source?.label || 'Untitled control',
      description: body.description ?? source?.description ?? 'Tailored control for this demo.',
      type: body.type || source?.type || 'sdk_event',
      payload: body.payload || source?.payload || { name: 'demo_action', properties: { source: 'control_room' } },
      transport: body.transport || source?.transport,
      platform: body.platform || source?.platform,
      requiresPushToken: body.requiresPushToken ?? source?.requiresPushToken ?? false,
      custom: true,
    })
    staged.originControlId = body.sourceControlId || source?.id || null
    staged.origin = 'staged'
    stagedControlId = staged.id

    const controlState = controlStateForPack(state, pack.id)
    controlState.staged = [staged, ...controlState.staged.filter((control) => control.id !== staged.id)].slice(0, 80)
    if (body.pin !== false && !controlState.pinned.includes(staged.id)) controlState.pinned.unshift(staged.id)
    if (body.lock && !controlState.locked.includes(staged.id)) controlState.locked.unshift(staged.id)
  })
  return {
    stagedControlId,
    state: publicState(),
  }
}

function updateControl(body = {}) {
  if (!body.controlId) throw new Error('controlId is required')
  return updateState((state) => {
    const { pack } = activePackAndSecrets(state)
    const controlState = controlStateForPack(state, pack.id)
    const index = controlState.staged.findIndex((control) => control.id === body.controlId)
    if (index < 0) throw new Error('Only staged controls can be edited. Stage this control first.')
    if (controlState.locked.includes(body.controlId)) throw new Error('This staged control is locked. Unlock it before editing.')
    const current = controlState.staged[index]
    controlState.staged[index] = cleanPresetForStorage({
      ...current,
      label: body.label ?? current.label,
      description: body.description ?? current.description,
      type: body.type ?? current.type,
      payload: body.payload ?? current.payload,
      transport: body.transport ?? current.transport,
      platform: body.platform ?? current.platform,
      requiresPushToken: body.requiresPushToken ?? current.requiresPushToken ?? false,
      custom: true,
    })
    controlState.staged[index].originControlId = current.originControlId || null
    controlState.staged[index].origin = current.origin || 'staged'
  })
}

function updateControlVisibility(body = {}) {
  if (!body.controlId) throw new Error('controlId is required')
  return updateState((state) => {
    const { pack } = activePackAndSecrets(state)
    const controlState = controlStateForPack(state, pack.id)
    for (const key of ['hidden', 'pinned', 'locked']) {
      if (typeof body[key] !== 'boolean') continue
      const next = new Set(controlState[key])
      if (body[key]) next.add(body.controlId)
      else next.delete(body.controlId)
      controlState[key] = Array.from(next)
    }
  })
}

function promoteControl(body = {}) {
  if (!body.controlId) throw new Error('controlId is required')
  const state = readState()
  const { pack } = activePackAndSecrets(state)
  const control = findControlById(pack, state, body.controlId)
  if (!control) throw new Error(`Control not found: ${body.controlId}`)
  const configPath = path.join(pack.directory, 'demo-pack.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  config.launcher = config.launcher || {}
  config.launcher.presets = Array.isArray(config.launcher.presets) ? config.launcher.presets : []
  const promoted = cleanPresetForStorage({
    ...control,
    id: body.newId || `library_${slug(body.label || control.label || control.id)}`,
    label: body.label || control.label,
    description: body.description ?? control.description ?? 'Reusable demo control.',
    custom: false,
  })
  const existingIndex = config.launcher.presets.findIndex((preset) => preset.id === promoted.id)
  if (existingIndex >= 0) config.launcher.presets[existingIndex] = promoted
  else config.launcher.presets.push(promoted)
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  addLedger({
    source: 'launcher',
    type: 'control_promoted',
    label: `Promoted ${promoted.label}`,
    status: 'success',
    payload: { packId: pack.id, controlId: body.controlId, promotedId: promoted.id },
    result: { configPath },
  })
  return promoted
}

async function executePresetObject(preset, payloadOverride = {}, externalIdOverride = '', platformOverride = '', correlation = null) {
  const state = readState()
  const { pack } = activePackAndSecrets(state)
  const externalId = externalIdOverride || state.activeExternalId || pack.brand.demoUser.externalId
  const resolvedPreset = withPresetMeta({ ...preset, platform: platformOverride || preset.platform }, state)
  const payload = { ...(resolvedPreset.payload || {}), ...(payloadOverride || {}) }
  const ledgerBase = {
    source: resolvedPreset.source,
    platform: resolvedPreset.platform,
    transport: resolvedPreset.transport,
    type: resolvedPreset.type,
    label: resolvedPreset.label,
    seedSync: Boolean(resolvedPreset.seedSync),
    externalId,
    payload,
    validation: resolvedPreset.validation || null,
  }

  const deviceCommands = correlateDeviceCommands(
    commandsForPreset(resolvedPreset, externalId, payloadOverride),
    correlation,
  )
  if (deviceCommands.length) {
    const result = []
    for (const command of deviceCommands) {
      result.push(await sendDeviceCommand(command, resolvedPreset.platform))
    }
    return addLedger({ ...ledgerBase, status: 'success', request: { commands: deviceCommands }, response: result, result })
  }

  const rest = restPayloadForPreset(resolvedPreset, externalId, payloadOverride)
  if (rest) {
    if (rest.validation && !rest.validation.ok) {
      addLedger({ ...ledgerBase, status: 'error', request: rest, validation: rest.validation, result: { error: rest.validation.errors.join(' ') } })
      const error = new Error(rest.validation.errors.join(' '))
      error.details = { validation: rest.validation }
      throw error
    }
    await ensurePushDependentSendReady({ preset: resolvedPreset, rest, externalId })
    const result = await callBraze(rest.endpoint, rest.body, { method: rest.method || 'POST', query: rest.query || {} })
    return addLedger({ ...ledgerBase, status: 'success', request: redactSecrets(rest), response: result, result })
  }

  throw new Error(`Unsupported preset type: ${resolvedPreset.type}`)
}

async function executePreset(presetId, payloadOverride = {}, externalIdOverride = '', platformOverride = '', correlation = null) {
  const state = readState()
  const { pack } = activePackAndSecrets(state)
  const preset = packPresets(pack, state).find((item) => item.id === presetId)
  if (!preset) throw new Error(`Preset not found: ${presetId}`)
  return executePresetObject(preset, payloadOverride, externalIdOverride, platformOverride, correlation)
}

function rememberOperatorExecution(execution) {
  operatorExecutions.set(execution.executionId, execution)
  operatorRequests.set(execution.requestId, execution.executionId)
  while (operatorExecutions.size > 30) {
    const oldestId = operatorExecutions.keys().next().value
    const oldest = operatorExecutions.get(oldestId)
    operatorExecutions.delete(oldestId)
    if (oldest?.requestId) operatorRequests.delete(oldest.requestId)
    forgetOperatorExecutionSequence(oldestId)
  }
  broadcastOperatorExecution(execution)
  return execution
}

export function createOperatorExecutionSequence(parentExecutionId, expectedResultCount, createId = randomUUID) {
  const count = Number(expectedResultCount)
  if (!parentExecutionId || !Number.isSafeInteger(count) || count < 2) return null
  return {
    parentExecutionId,
    expectedResultCount: count,
    completedResultCount: 0,
    failedResultCount: 0,
    children: Array.from({ length: count }, (_, index) => ({
      executionId: String(createId()),
      index,
      status: 'pending',
    })),
  }
}

export function aggregateOperatorSequenceResult(sequence, childExecutionId, terminal) {
  if (!sequence || !terminal || !childExecutionId) return { sequence, matched: false, changed: false }
  const childIndex = sequence.children.findIndex((child) => child.executionId === childExecutionId)
  if (childIndex < 0) return { sequence, matched: false, changed: false }
  const previous = sequence.children[childIndex]
  const nextStatus = terminal.failed ? 'failed' : 'success'
  const resolvedStatus = previous.status === 'failed' ? 'failed' : nextStatus
  const changed = previous.status !== resolvedStatus
  const children = changed
    ? sequence.children.map((child, index) => index === childIndex ? { ...child, status: resolvedStatus } : child)
    : sequence.children
  const completedResultCount = children.filter((child) => child.status !== 'pending').length
  const failedResultCount = children.filter((child) => child.status === 'failed').length
  const status = failedResultCount > 0
    ? 'failed'
    : (completedResultCount === sequence.expectedResultCount ? 'success' : 'pending')
  return {
    matched: true,
    changed,
    sequence: {
      ...sequence,
      children,
      completedResultCount,
      failedResultCount,
    },
    status,
  }
}

export function operatorSequenceResultSummary(sequence, terminal, currentSummary = '', failureMessage = '') {
  const progress = `${sequence.completedResultCount} of ${sequence.expectedResultCount}`
  if (terminal.failed) {
    return `${failureMessage || 'Native sequence command failed.'} (${progress} results received).`
  }
  if (sequence.failedResultCount > 0) {
    return currentSummary || `Native sequence failed (${progress} results received).`
  }
  return sequence.completedResultCount === sequence.expectedResultCount
    ? `Native sequence confirmed all ${sequence.expectedResultCount} commands.`
    : `Native sequence confirmed ${progress} commands.`
}

function forgetOperatorExecutionSequence(parentExecutionId) {
  const sequence = operatorExecutionSequences.get(parentExecutionId)
  if (!sequence) return
  for (const child of sequence.children) operatorChildExecutions.delete(child.executionId)
  operatorExecutionSequences.delete(parentExecutionId)
}

function registerOperatorExecutionSequence(parentExecutionId, expectedResultCount) {
  const sequence = createOperatorExecutionSequence(parentExecutionId, expectedResultCount)
  if (!sequence) return null
  operatorExecutionSequences.set(parentExecutionId, sequence)
  for (const child of sequence.children) {
    operatorChildExecutions.set(child.executionId, { parentExecutionId, index: child.index })
  }
  updateOperatorExecution(parentExecutionId, {
    expectedResultCount: sequence.expectedResultCount,
    completedResultCount: 0,
    failedResultCount: 0,
  })
  return sequence
}

function currentOperatorExecutionContext(personaId = '') {
  const state = readState()
  const { pack } = activePackAndSecrets(state)
  const runtime = runtimeForPack(pack)
  return {
    packId: pack.id,
    runtimeHash: runtime.runtimeHash || runtime.configHash,
    platform: state.activePlatform === 'ios' ? 'ios' : 'android',
    personaId: personaId || activeOperatorPersona(pack, state, operatorPersonas(pack, state)).id,
  }
}

function newOperatorExecution({ requestId, controlId, controlLabel, variantId = '', context = null }) {
  const id = String(requestId || '')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(id)) {
    const error = new Error('requestId must be an opaque 8–160 character idempotency key.')
    error.statusCode = 400
    throw error
  }
  const existingId = operatorRequests.get(id)
  if (existingId) return { execution: operatorExecutions.get(existingId), existing: true }
  const now = new Date().toISOString()
  const executionContext = context || currentOperatorExecutionContext()
  const execution = {
    launcherInstanceId,
    executionId: randomUUID(),
    requestId: id,
    controlId,
    controlLabel,
    variantId: String(variantId || ''),
    ...executionContext,
    status: 'pending',
    summary: 'Launcher accepted the approved action.',
    createdOrder: ++operatorExecutionCreationOrder,
    createdAt: now,
    updatedAt: now,
  }
  rememberOperatorExecution(execution)
  return { execution, existing: false }
}

function updateOperatorExecution(executionId, patch) {
  const current = operatorExecutions.get(executionId)
  if (!current) return null
  const execution = {
    ...current,
    ...patch,
    launcherInstanceId,
    executionId,
    createdOrder: current.createdOrder,
    updatedAt: new Date().toISOString(),
  }
  operatorExecutions.set(executionId, execution)
  broadcastOperatorExecution(execution)
  return execution
}

function operatorContextError(message) {
  const error = new Error(message)
  error.statusCode = 409
  return error
}

export function assertOperatorSnapshotContext(expected = {}, current = {}) {
  const comparisons = [
    ['launcher instance', expected.launcherInstanceId, current.launcherInstanceId],
    ['snapshot version', String(expected.snapshotVersion ?? ''), String(current.snapshotVersion ?? '')],
    ['pack', expected.packId, current.active?.pack?.id],
    ['config hash', expected.configHash, current.active?.runtime?.configHash],
    ['runtime hash', expected.runtimeHash, current.active?.runtime?.runtimeHash],
    ['platform', expected.platform, current.active?.platform],
    ['persona', expected.personaId, current.active?.persona?.id],
  ]
  for (const [label, provided, actual] of comparisons) {
    if (!provided || provided !== actual) throw operatorContextError(`Presenter context is stale (${label} changed). Refresh and try again.`)
  }
  return current
}

function assertOperatorContext(expected = {}, { allowBlockedCodes = [] } = {}) {
  const current = operatorSnapshot()
  assertOperatorSnapshotContext(expected, current)
  if (current.readiness.status !== 'ready') {
    const allowed = new Set(allowBlockedCodes)
    const state = readState()
    const { pack } = activePackAndSecrets(state)
    const remaining = operatorBaseBlockers(pack, runtimeForPack(pack), state)
      .filter((blocker) => !allowed.has(blocker.code))
    if (remaining.length) {
      throw operatorContextError(remaining[0].detail || current.readiness.summary || 'Presenter controls are blocked by launcher readiness.')
    }
  }
  return current
}

function approvedPresenterControl(controlId, state = readState()) {
  const { pack } = activePackAndSecrets(state)
  const approved = presenterControlPresets(pack, state).find((preset) => preset.id === controlId)
  if (!approved) {
    throw operatorContextError('This control is not approved for Presenter Remote.')
  }
  const resolved = withPresetMeta(approved, state)
  const blockReason = controlBlockReason(resolved, state, operatorBaseBlockers(pack, runtimeForPack(pack), state))
  if (blockReason) throw operatorContextError(blockReason)
  return resolved
}

function approvedVariantOverride(preset, variantId) {
  const variants = Array.isArray(preset.presenterVariants) ? preset.presenterVariants : []
  if (!variants.length) {
    if (variantId) throw operatorContextError('This control has no approved variants.')
    return {}
  }
  const selectedId = String(variantId || '')
  const variant = variants.find((item) => String(item.id || '') === selectedId)
  if (!variant) throw operatorContextError('Select one of the pre-approved control variants.')
  const override = variant.payloadOverride ?? variant.payload ?? {}
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    throw operatorContextError('The selected approved variant is malformed.')
  }
  return override
}

async function executeOperatorControl(controlId, body = {}) {
  const requestedVariantId = String(body.variantId || '')
  const existingId = operatorRequests.get(String(body.requestId || ''))
  if (existingId) {
    const existing = operatorExecutions.get(existingId)
    if (!operatorRequestMatches(existing, controlId, requestedVariantId)) {
      throw operatorContextError('requestId was already used for a different Presenter action or variant.')
    }
    return { execution: existing, snapshot: operatorSnapshot() }
  }
  assertOperatorContext(body.expected)
  const state = readState()
  const preset = approvedPresenterControl(controlId, state)
  const payloadOverride = approvedVariantOverride(preset, requestedVariantId)
  const { execution } = newOperatorExecution({
    requestId: body.requestId,
    controlId: preset.id,
    controlLabel: preset.label,
    variantId: requestedVariantId,
  })
  const activeExternalId = state.activeExternalId || ''
  const commandCount = commandsForPreset(preset, activeExternalId, payloadOverride).length
  const sequence = registerOperatorExecutionSequence(execution.executionId, commandCount)
  try {
    await executePresetObject(
      preset,
      payloadOverride,
      activeExternalId,
      state.activePlatform || '',
      {
        launcherInstanceId,
        executionId: execution.executionId,
        commandExecutionIds: sequence?.children.map((child) => child.executionId),
      },
    )
    const current = operatorExecutions.get(execution.executionId)
    if (current?.status === 'pending' && sourceForPreset(preset) === 'braze_rest') {
      updateOperatorExecution(execution.executionId, {
        status: 'success',
        summary: 'Braze REST action completed and was recorded in launcher telemetry.',
      })
    } else if (current?.status === 'pending') {
      updateOperatorExecution(execution.executionId, {
        summary: sequence
          ? `Native sequence accepted; waiting for ${sequence.expectedResultCount} correlated results.`
          : 'Native command accepted; waiting for correlated device telemetry.',
      })
    }
  } catch (error) {
    updateOperatorExecution(execution.executionId, { status: 'failed', summary: error.message || String(error) })
    throw error
  }
  return { execution: operatorExecutions.get(execution.executionId), snapshot: operatorSnapshot() }
}

export function operatorRequestMatches(existing, controlId, variantId = '') {
  return Boolean(
    existing &&
    existing.controlId === controlId &&
    String(existing.variantId || '') === String(variantId || ''),
  )
}

async function applyOperatorPersona(personaId, body = {}) {
  const existingId = operatorRequests.get(String(body.requestId || ''))
  if (existingId) {
    const existing = operatorExecutions.get(existingId)
    if (existing?.controlId !== `persona:${personaId}`) throw operatorContextError('requestId was already used for a different Presenter action.')
    return { execution: existing, snapshot: operatorSnapshot() }
  }
  assertOperatorContext(body.expected, {
    allowBlockedCodes: [
      'persona_unapproved',
      'identity_mismatch',
      'device_evidence_stale',
      'device_missing',
      'trust_not_ready',
    ],
  })
  const state = readState()
  const { pack } = activePackAndSecrets(state)
  const persona = operatorPersonas(pack, state).find((item) => item.id === personaId)
  if (!persona) throw operatorContextError('This named persona is not approved for Presenter Remote.')
  const { execution } = newOperatorExecution({
    requestId: body.requestId,
    controlId: `persona:${persona.id}`,
    controlLabel: `Apply ${persona.label}`,
    context: currentOperatorExecutionContext(persona.id),
  })
  try {
    await applyRuntimeIdentity({
      packId: pack.id,
      platform: state.activePlatform,
      externalId: persona.externalId,
      displayName: persona.displayName,
      reason: 'presenter_persona_apply',
      executionId: execution.executionId,
    })
    const current = operatorExecutions.get(execution.executionId)
    if (current?.status === 'pending') {
      updateOperatorExecution(execution.executionId, {
        summary: 'Identity preparation accepted; waiting for correlated native confirmation.',
      })
    }
  } catch (error) {
    updateOperatorExecution(execution.executionId, { status: 'failed', summary: error.message || String(error) })
    throw error
  }
  return { execution: operatorExecutions.get(execution.executionId), snapshot: operatorSnapshot() }
}

export function terminalOperatorTelemetry(body = {}) {
  if (body.type !== 'demo_command') return null
  const result = objectValue(body.result)
  const readiness = objectValue(result.readiness)
  const severity = normalizeSeverity(body.status || 'success')
  return {
    failed: severity === 'error' || Boolean(result.error) || readiness.ready === false,
    severity,
  }
}

function correlateOperatorTelemetry(body = {}) {
  const terminal = terminalOperatorTelemetry(body)
  if (!terminal) return null
  const runtime = extractRuntimeTelemetry(body.platform === 'ios' ? 'ios' : 'android', body)
  const reportedLauncherId = runtime.launcherInstanceId
  const reportedExecutionId = runtime.executionId
  if (!reportedExecutionId || reportedLauncherId !== launcherInstanceId) return null
  const childCorrelation = operatorChildExecutions.get(reportedExecutionId)
  const executionId = childCorrelation?.parentExecutionId || reportedExecutionId
  if (!operatorExecutions.has(executionId)) return null
  const current = operatorExecutions.get(executionId)
  const payload = objectValue(body.payload)
  const result = objectValue(body.result)
  if (childCorrelation) {
    const sequence = operatorExecutionSequences.get(executionId)
    if (current?.status === 'failed' && sequence?.failedResultCount === 0) return current
    const aggregation = aggregateOperatorSequenceResult(sequence, reportedExecutionId, terminal)
    if (!aggregation.matched || !aggregation.changed) return current
    operatorExecutionSequences.set(executionId, aggregation.sequence)
    return updateOperatorExecution(executionId, {
      status: aggregation.status,
      expectedResultCount: aggregation.sequence.expectedResultCount,
      completedResultCount: aggregation.sequence.completedResultCount,
      failedResultCount: aggregation.sequence.failedResultCount,
      summary: operatorSequenceResultSummary(
        aggregation.sequence,
        terminal,
        current?.summary,
        String(result.error || payload.error || body.label || ''),
      ),
    })
  }
  if (operatorExecutionSequences.has(executionId)) return current
  if (current?.status === 'success' || current?.status === 'failed') return current
  return updateOperatorExecution(executionId, {
    status: terminal.failed ? 'failed' : 'success',
    summary: terminal.failed
      ? String(result.error || payload.error || body.label || 'Native execution failed.')
      : String(body.label || body.action || body.type || 'Native execution confirmed.'),
  })
}

function validation(errors = [], warnings = []) {
  return {
    ok: errors.length === 0,
    errors,
    warnings,
  }
}

function manualTriggerPreset(body = {}) {
  const actionType = body.actionType || body.type || 'sdk_event'
  const restActionTypes = ['rest_event', 'rest_attribute', 'rest_purchase', 'campaign_trigger', 'canvas_trigger', 'profile_export', 'braze_rest_request']
  const transport = body.transport || (restActionTypes.includes(actionType) ? 'braze_rest' : 'app_sdk')
  const platform = body.platform || (transport === 'braze_rest' ? 'host' : (readState().activePlatform || 'android'))
  const rawPayload = body.payload && typeof body.payload === 'object' ? body.payload : {}
  const errors = []
  const warnings = []
  let type = actionType
  let payload = { ...rawPayload }

  if (['android_sdk', 'ios_sdk', 'app_sdk'].includes(transport) && !['android', 'ios'].includes(platform)) {
    errors.push('SDK transport requires Android or iOS platform.')
  }
  if (transport === 'android_sdk' && platform !== 'android') errors.push('Android SDK transport requires Android platform.')
  if (transport === 'ios_sdk' && platform !== 'ios') errors.push('iOS SDK transport requires iOS platform.')
  if (transport === 'braze_rest' && !['host', 'android', 'ios', 'browser'].includes(platform)) {
    warnings.push('Unknown platform label for Braze REST trigger.')
  }

  if (actionType === 'iam_trigger') {
    type = 'sdk_event'
    payload = {
      name: 'demo_iam_trigger',
      properties: { source: 'manual_trigger', ...(rawPayload.properties || {}) },
    }
  } else if (actionType === 'sdk_event') {
    if (!payload.name) errors.push('SDK event payload requires name.')
    payload.properties = payload.properties || {}
  } else if (actionType === 'sdk_event_sequence') {
    if (!Array.isArray(payload.events) || !payload.events.length) {
      errors.push('SDK event sequence payload requires a non-empty events array.')
    }
  } else if (actionType === 'content_cards_refresh') {
    payload = {}
  } else if (actionType === 'push_permission') {
    payload = {}
  } else if (actionType === 'push_readiness') {
    payload = { reason: payload.reason || 'manual_trigger' }
  } else if (actionType === 'trust_diagnostics') {
    payload = { reason: payload.reason || 'manual_trigger' }
  } else if (actionType === 'foreground_push') {
    payload = {
      title: payload.title || 'Demo notification',
      body: payload.body || 'Control Room sent a diagnostics-only notification preview.',
      uri: payload.uri || payload.route || '/notifications',
    }
  } else if (actionType === 'navigate') {
    payload = { route: payload.route || payload.uri || '/' }
  } else if (actionType === 'campaign_trigger') {
    if (!payload.campaignId) errors.push('Campaign trigger payload requires campaignId.')
    payload.triggerProperties = payload.triggerProperties || { source: 'manual_trigger' }
  } else if (actionType === 'canvas_trigger') {
    if (!payload.canvasId) errors.push('Canvas trigger payload requires canvasId.')
    payload.triggerProperties = payload.triggerProperties || { source: 'manual_trigger' }
  } else if (actionType === 'rest_event') {
    if (!payload.name) errors.push('REST event payload requires name.')
    payload.properties = payload.properties || {}
  } else if (actionType === 'rest_attribute') {
    if (!payload.attributes || typeof payload.attributes !== 'object') errors.push('REST attribute payload requires attributes.')
  } else if (actionType === 'rest_purchase') {
    if (!payload.productId) errors.push('REST purchase payload requires productId.')
    if (payload.price === undefined) errors.push('REST purchase payload requires price.')
  } else if (actionType === 'profile_export') {
    payload.fieldsToExport = Array.isArray(payload.fieldsToExport) ? payload.fieldsToExport : []
  } else if (actionType === 'braze_rest_request') {
    const request = restRequestForPayload(payload)
    if (!request.validation.ok) errors.push(...request.validation.errors)
    payload = { method: request.method, path: request.endpoint, query: request.query, body: request.body }
  } else {
    errors.push(`Unsupported manual action type: ${actionType}`)
  }

  if (transport === 'braze_rest' && !restActionTypes.includes(type)) {
    errors.push('Braze REST transport only supports focused REST actions and safe custom REST requests.')
  }
  if (['android_sdk', 'ios_sdk', 'app_sdk'].includes(transport) && restActionTypes.includes(type)) {
    errors.push('SDK transport cannot execute Braze REST trigger actions.')
  }

  const result = validation(errors, warnings)
  return {
    preset: {
      id: `manual_${Date.now()}`,
      label: body.label || `Manual ${actionType.replaceAll('_', ' ')}`,
      description: 'Manual trigger from the Control Room.',
      type,
      payload,
      transport,
      platform,
      validation: result,
    },
    validation: result,
  }
}

async function executeManualTrigger(body) {
  const { preset, validation: triggerValidation } = manualTriggerPreset(body)
  if (!triggerValidation.ok) {
    addLedger({
      source: preset.transport || 'launcher',
      platform: preset.platform,
      transport: preset.transport,
      type: preset.type,
      label: preset.label,
      status: 'error',
      externalId: body.externalId,
      payload: preset.payload,
      validation: triggerValidation,
      result: { error: triggerValidation.errors.join(' ') },
    })
    const error = new Error(triggerValidation.errors.join(' '))
    error.details = { validation: triggerValidation }
    throw error
  }
  return executePresetObject(preset, {}, body.externalId || '')
}

async function exportActiveUser(fields = []) {
  const state = readState()
  const { pack } = activePackAndSecrets(state)
  const externalId = state.activeExternalId || pack.brand.demoUser.externalId
  const body = {
    external_ids: [externalId],
    fields_to_export: fields.length
      ? fields
      : ['external_id', 'first_name', 'custom_attributes', 'custom_events', 'purchases', 'apps', 'push_tokens'],
  }
  const result = await callBraze('/users/export/ids', body)
  return addLedger({
    source: 'braze_rest',
    type: 'profile_export',
    label: 'Export active user',
    status: 'success',
    externalId,
    payload: body,
    result,
  })
}

export function pathIsWithinRoot(root, target) {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
}

function serveDesignAsset(req, res) {
  const prefix = '/design/'
  let target
  let stat
  const root = path.resolve(designSystemDir)
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(prefix.length))
    target = path.resolve(root, relative)
    const contained = pathIsWithinRoot(root, target)
    if (!contained) throw new Error('outside design root')
    stat = fs.statSync(target)
  } catch {
    sendText(res, 404, 'Not found')
    return
  }
  if (!stat.isFile()) {
    sendText(res, 404, 'Not found')
    return
  }
  const ext = path.extname(target)
  const type =
    ext === '.css'
      ? 'text/css; charset=utf-8'
      : ext === '.svg'
        ? 'image/svg+xml'
        : ext === '.png'
          ? 'image/png'
          : ext === '.woff'
            ? 'font/woff'
            : 'application/octet-stream'
  const stream = fs.createReadStream(target)
  stream.once('error', () => {
    if (!res.headersSent) sendText(res, 404, 'Not found')
    else res.destroy()
  })
  res.writeHead(200, { 'content-type': type })
  stream.pipe(res)
}

function packManagerReport(pack, knownPacks) {
  try {
    return validateDemoPackForAuthoring(pack, { knownPacks })
  } catch (error) {
    return {
      valid: false,
      id: pack.id || '',
      name: pack.name || pack.id || 'Invalid pack',
      directory: pack.directory || '',
      source: pack.source || '',
      configHash: '',
      runtimeHash: '',
      notesPath: '',
      errors: [error.message || String(error)],
      warnings: [],
    }
  }
}

function packManagerState() {
  const packs = listDemoPacks()
  return {
    workspaceDirectory: localDemoPacksDir,
    sourceOfTruth: 'demo-pack.json',
    credentialsCopiedOnDuplicate: false,
    packs: packs.map((pack) => packManagerReport(pack, packs)),
  }
}

function packManagerPackResult(pack) {
  const manager = packManagerState()
  return {
    pack: manager.packs.find((item) => item.id === pack.id) || packManagerReport(pack, listDemoPacks()),
    manager,
  }
}

function openPackManagerTarget(packId, target = 'directory') {
  if (!['directory', 'config', 'notes'].includes(target)) {
    const error = new Error(`Unsupported Pack Manager target: ${target}`)
    error.statusCode = 400
    throw error
  }
  const result = openDemoPack(packId, {
    config: target === 'config',
    notes: target === 'notes',
  })
  return { packId, target, path: result.target, opened: result.opened }
}

function publicState() {
  const state = readState()
  const { pack, secrets } = activePackAndSecrets(state)
  const runtime = runtimeForPack(pack)
  const controlState = controlStateForPack(state, pack.id)
  const presets = packPresets(pack, state)
    .map((preset) => withPresetMeta(preset, state))
    .map((preset) => withControlUiState(preset, controlState))
  const storyControls = controlRoomStoryControls(presets)
  const ownedLiveWebRunning = Boolean(liveWebProcess && liveWebProcess.exitCode === null)
  const nativeOverrideWithoutServer = Boolean(state.deviceRuntime?.platform === 'android' && state.deviceRuntime?.sourceOverride && !ownedLiveWebRunning)
  const recordedLiveWeb = state.development?.liveWeb || {}
  const liveHazard = liveWebHazard(state, { ownedProcessRunning: ownedLiveWebRunning })
  const timeGuardStatus = androidTimeGuard.status()
  const packs = listDemoPacks().map((item) => {
    const itemSecrets = getDemoPack(item.id).secrets || {}
    const itemRestStatus = restCredentialStatus(item, itemSecrets)
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      brand: item.brand,
      source: item.source,
      sourceLabel: item.sourceLabel,
      hasSecrets: item.hasSecrets,
      restConfigured: Boolean(itemSecrets['braze.restEndpoint'] && itemRestStatus.configured),
      sdkConfigured: Boolean(itemSecrets['braze.apiKey'] && itemSecrets['braze.endpoint']),
      presetCount: builtInPresets.length + 1 + (item.launcher?.presets?.length || 0),
    }
  })
  return {
    operator: {
      presenterUrl: `/presenter#pair=${operatorSessionAuthority.pairingToken()}`,
      launcherInstanceId,
    },
    development: {
      timeGuard: {
        ...timeGuardStatus,
        ownerInstanceId: timeGuardStatus.running ? launcherInstanceId : '',
        logFile: androidTimeSyncLog,
      },
      liveWeb: {
        enabled: Boolean(recordedLiveWeb.enabled && ownedLiveWebRunning),
        overrideMayBeActive: liveHazard.mayBeActive,
        uncertain: liveHazard.uncertain,
        status: nativeOverrideWithoutServer ? 'error' : recordedLiveWeb.status || 'stopped',
        hostUrl: liveWebHostUrl,
        deviceUrl: liveWebDeviceUrl,
        pid: ownedLiveWebRunning ? liveWebProcess.pid : null,
        startedAt: recordedLiveWeb.startedAt || '',
        confirmedAt: recordedLiveWeb.confirmedAt || '',
        error: nativeOverrideWithoutServer
          ? 'Android still reports a development source, but this launcher does not own a live server. Restore bundled mode before continuing.'
          : recordedLiveWeb.error || '',
      },
    },
    active: {
      platform: state.activePlatform || 'android',
      pack: publicPack(pack),
      profile: packProfile(pack, secrets, state),
      presets,
      story: {
        controls: storyControls,
        requirements: controlRoomStoryRequirements(storyControls),
      },
      controlState,
      runtime: {
        manifest: runtime,
        device: state.deviceRuntime || null,
        sourceReadiness: state.deviceSourceReadiness || null,
        push: latestActivePushReadiness(state),
        trust: latestActiveTrustDiagnostics(state),
        warnings: runtimeWarnings(runtime, state),
      },
      callbackUrl: launcherCallbackUrl(),
    },
    packs,
    activity: {
      currentSessionId: state.activitySession?.id || '',
      startedAt: state.activitySession?.startedAt || '',
      reason: state.activitySession?.reason || '',
      archives: state.activityArchives || [],
    },
    troubleshooting: guidedTroubleshootingCards(pack, runtime, state),
    ledger: (state.ledger || []).map(normalizeActivityEntry),
    restResponses: state.restResponses || [],
    jobs: Array.from(jobs.values()).slice(-10).reverse(),
  }
}

function launcherHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Braze Demo Control Room</title>
  <link rel="stylesheet" href="/design/colors_and_type.css" />
  <style>
    :root { color-scheme: light; --panel: rgba(255,255,255,0.92); --line: rgba(48,2,102,0.13); }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      background:
        linear-gradient(135deg, rgba(248,211,232,0.72), rgba(255,255,255,0.86) 38%, rgba(201,196,255,0.45)),
        var(--bg-canvas);
      color: var(--fg-1);
      font-family: var(--font-body);
      letter-spacing: 0;
    }
    button, input, select, textarea { font: inherit; letter-spacing: 0; }
    button { cursor: pointer; }
    .shell { min-height: 100vh; display: grid; grid-template-columns: 280px minmax(0, 1fr); }
    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      overflow: hidden;
      background: var(--purple-dark);
      color: var(--white);
      padding: 34px 28px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .sidebar::after {
      content: "";
      position: absolute;
      inset: auto -90px -100px -90px;
      height: 300px;
      background: url("/design/assets/bg-section-divider.png") center / cover no-repeat;
      opacity: 0.74;
      pointer-events: none;
    }
    .wordmark { width: 118px; position: relative; z-index: 1; }
    .side-title { position: relative; z-index: 1; }
    .side-title h1 {
      margin: 34px 0 0;
      font-family: var(--font-display);
      font-size: 48px;
      line-height: 0.98;
      letter-spacing: var(--tracking-tight);
    }
    .side-title p { margin: 18px 0 0; color: rgba(255,255,255,0.74); font-size: 15px; line-height: 1.42; }
    .callback { position: relative; z-index: 1; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: rgba(255,255,255,0.66); overflow-wrap: anywhere; }
    main { min-width: 0; padding: 32px; overflow-x: clip; }
    .topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
    h2 { font-size: 36px; line-height: 1.08; letter-spacing: var(--tracking-snug); margin: 0; }
    .muted { color: var(--fg-2); }
    .topbar p, .panel p { margin: 7px 0 0; color: var(--fg-2); font-size: 14px; line-height: 1.42; }
    .pill {
      border-radius: var(--radius-pill);
      background: var(--pink-light);
      color: var(--purple-dark);
      padding: 8px 12px;
      font-family: var(--font-ui);
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }
    .layout { display: grid; grid-template-columns: minmax(300px, 430px) minmax(0, 1fr); gap: 20px; align-items: start; }
    .stack { display: grid; gap: 20px; min-width: 0; }
    .panel {
      min-width: 0;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
      box-shadow: var(--shadow-card);
      padding: 22px;
      backdrop-filter: blur(18px);
    }
    .panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; min-width: 0; margin-bottom: 16px; }
    .panel-head > div { min-width: 0; }
    h3 { margin: 0; font-size: 22px; line-height: 1.12; letter-spacing: var(--tracking-snug); font-weight: 700; }
    label { display: block; color: var(--fg-2); font-family: var(--font-ui); font-size: 12px; font-weight: 700; margin-bottom: 7px; }
    input, select, textarea {
      width: 100%;
      border: 1px solid var(--border-hairline);
      border-radius: 10px;
      background: var(--white);
      color: var(--fg-1);
      padding: 11px 12px;
      font-family: var(--font-ui);
      font-size: 13px;
      outline-offset: 2px;
    }
    textarea { min-height: 90px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; line-height: 1.45; }
    input:focus, select:focus, textarea:focus, button:focus-visible { outline: 2px solid var(--purple); outline-offset: 2px; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .form-grid > div { min-width: 0; }
    .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .btn {
      border: 0;
      border-radius: var(--radius-pill-lg);
      padding: 11px 16px;
      font-family: var(--font-ui);
      font-size: 13px;
      font-weight: 800;
      transition: transform var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
    }
    .btn:hover { transform: translateY(-1px); opacity: 0.9; }
    .btn:disabled { transform: none; opacity: 0.45; cursor: not-allowed; }
    .primary { background: var(--purple); color: var(--white); }
    .secondary { background: var(--pink-light); color: var(--purple-dark); }
    .ghost { background: var(--white); color: var(--purple-dark); border: 1px solid var(--line); }
    .orange { background: var(--orange); color: var(--black); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .chip { border-radius: var(--radius-pill); background: var(--purple-light); color: var(--purple-dark); padding: 6px 10px; font-family: var(--font-ui); font-size: 11px; font-weight: 800; }
    .chip.warn { background: var(--orange-light); color: var(--orange-dark); }
    .preset-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr)); gap: 12px; min-width: 0; }
    .preset {
      text-align: left;
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
      background: var(--white);
      padding: 14px;
      min-height: 118px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
    }
    .preset strong { display: block; font-size: 14px; line-height: 1.25; }
    .preset span { display: block; margin-top: 5px; color: var(--fg-2); font-size: 12px; line-height: 1.35; }
    .preset small { color: var(--purple); font: 700 11px/1.2 var(--font-ui); text-transform: uppercase; }
    .ledger { display: grid; gap: 10px; min-width: 0; max-height: 560px; overflow: auto; padding-right: 4px; }
    .event {
      border: 1px solid var(--line);
      background: var(--white);
      border-radius: var(--radius-card);
      padding: 13px 14px;
    }
    .event-top { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .event strong { font-size: 14px; }
    .event time { color: var(--fg-2); font: 11px/1 var(--font-ui); white-space: nowrap; }
    .event-meta { margin-top: 7px; display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { border-radius: var(--radius-pill); background: rgba(128,30,215,0.09); color: var(--purple-dark); padding: 4px 8px; font: 700 11px/1 var(--font-ui); }
    .tag.error { background: rgba(233,55,31,0.12); color: var(--orange-dark); }
    .tag.success { background: rgba(15,118,110,0.12); color: #0f766e; }
    .json { margin-top: 9px; color: var(--fg-2); font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .logs {
      max-width: 100%;
      min-width: 0;
      margin: 14px 0 0;
      max-height: 260px;
      overflow: auto;
      border-radius: 12px;
      background: var(--purple-dark);
      color: var(--pink-light);
      padding: 14px;
      font: 11px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    @media (max-width: 1320px) {
      .layout { grid-template-columns: 1fr; }
    }
    @media (max-width: 980px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar { position: relative; height: auto; min-height: 300px; }
      .layout { grid-template-columns: 1fr; }
      main { padding: 22px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar">
      <div class="side-title">
        <img class="wordmark" src="/design/cleveland/assets/braze-wordmark-white.svg" alt="Braze" />
        <h1>Demo Control</h1>
        <p>One control room for pack selection, runtime validation, SDK actions, message triggers, and live device telemetry.</p>
      </div>
      <div class="callback" id="callback">Callback pending</div>
    </aside>
    <main>
      <div class="topbar">
        <div>
          <h2>Operating backend</h2>
          <p>Local-only REST keys stay on this host. Browser, Android, and iOS are render surfaces that report the same demo runtime.</p>
        </div>
        <div class="pill" id="status">Loading</div>
      </div>
      <div class="layout">
        <div class="stack">
          <section class="panel">
            <div class="panel-head">
              <div>
                <h3>Workspace</h3>
                <p>Choose the active pack and user for SDK and REST actions.</p>
              </div>
              <span class="pill" id="packStatus">-</span>
            </div>
            <label for="pack">Demo pack</label>
            <select id="pack"></select>
            <div class="form-grid" style="margin-top:12px">
              <div>
                <label for="externalId">External user ID</label>
                <input id="externalId" autocomplete="off" />
              </div>
              <div>
                <label for="displayName">Display name</label>
                <input id="displayName" autocomplete="off" />
              </div>
            </div>
            <div class="chips" id="profileChips"></div>
            <div class="row" style="margin-top:16px">
              <button class="btn primary" id="saveActive">Save active user</button>
              <button class="btn secondary" id="run">Build, install, launch</button>
              <button class="btn ghost" id="apply">Apply only</button>
            </div>
            <pre class="logs" id="logs">Launcher ready.</pre>
          </section>

          <section class="panel">
            <div class="panel-head">
              <div>
                <h3>Runtime source</h3>
                <p>Generated identity and expected render sources for browser, Android, and iOS.</p>
              </div>
            </div>
            <div class="chips" id="runtimeChips"></div>
            <div class="json" id="runtimeDetails"></div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <div>
                <h3>Define event preset</h3>
                <p>Create a reusable custom event button for this control room.</p>
              </div>
            </div>
            <div class="form-grid">
              <div>
                <label for="customLabel">Button label</label>
                <input id="customLabel" placeholder="Cart abandoned" />
              </div>
              <div>
                <label for="customLane">Send through</label>
                <select id="customLane">
                  <option value="sdk_event">Android SDK</option>
                  <option value="rest_event">Braze REST /users/track</option>
                </select>
              </div>
            </div>
            <div style="margin-top:12px">
              <label for="customName">Event name</label>
              <input id="customName" placeholder="cart_abandoned" />
            </div>
            <div style="margin-top:12px">
              <label for="customProps">Properties JSON</label>
              <textarea id="customProps">{ "source": "launcher" }</textarea>
            </div>
            <div class="row" style="margin-top:14px">
              <button class="btn orange" id="addPreset">Add preset</button>
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="panel">
            <div class="panel-head">
              <div>
                <h3>Controls</h3>
                <p>Presets call Android SDK transport or Braze REST depending on their type. iOS transport is diagnostic-only for now.</p>
              </div>
              <button class="btn ghost" id="exportUser">Verify user</button>
            </div>
            <div class="preset-grid" id="presets"></div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <div>
                <h3>Message trigger</h3>
                <p>Trigger existing API-triggered campaigns or Canvases. Message creation stays in Braze.</p>
              </div>
            </div>
            <div class="form-grid">
              <div>
                <label for="messageType">Type</label>
                <select id="messageType">
                  <option value="campaign_trigger">Campaign</option>
                  <option value="canvas_trigger">Canvas</option>
                </select>
              </div>
              <div>
                <label for="messageId">Campaign or Canvas ID</label>
                <input id="messageId" placeholder="Identifier from Braze" />
              </div>
            </div>
            <div style="margin-top:12px">
              <label for="triggerProps">Trigger properties JSON</label>
              <textarea id="triggerProps">{ "source": "launcher" }</textarea>
            </div>
            <div class="row" style="margin-top:14px">
              <button class="btn primary" id="sendTrigger">Trigger message</button>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <div>
                <h3>Activity Feed</h3>
                <p>Observed demo actions, REST responses, and Android telemetry.</p>
              </div>
              <button class="btn ghost" id="refresh">Refresh</button>
            </div>
            <div class="ledger" id="ledger"></div>
          </section>
        </div>
      </div>
    </main>
  </div>
  <script>
    const state = { data: null, selectedJob: null }
    const el = (id) => document.getElementById(id)
    const fmt = (value) => {
      try { return JSON.stringify(value, null, 2) } catch { return String(value) }
    }
    const parseJson = (id) => {
      const raw = el(id).value.trim()
      if (!raw) return {}
      return JSON.parse(raw)
    }
    const request = async (url, body) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Request failed')
      return payload
    }
    const setBusy = (busy) => {
      document.querySelectorAll('button').forEach((button) => { button.disabled = busy })
      el('status').textContent = busy ? 'Working' : 'Ready'
    }
    async function load() {
      const response = await fetch('/api/state')
      state.data = await response.json()
      render()
    }
    function render() {
      const data = state.data
      const profile = data.active.profile
      el('callback').textContent = 'Device callback: ' + data.active.callbackUrl
      el('status').textContent = 'Ready'
      el('pack').innerHTML = data.packs.map((pack) => '<option value="' + pack.id + '">' + pack.name + ' · ' + (pack.sourceLabel || pack.source || 'pack') + '</option>').join('')
      el('pack').value = profile.packId
      el('externalId').value = profile.externalId || ''
      el('displayName').value = profile.displayName || ''
      el('packStatus').textContent = profile.packName
      el('profileChips').innerHTML = [
        '<span class="chip">' + (data.active.pack.sourceLabel || data.active.pack.source || 'pack') + '</span>',
        '<span class="chip">' + (profile.sdkConfigured ? 'SDK ready' : 'SDK missing') + '</span>',
        '<span class="chip ' + (profile.restConfigured ? '' : 'warn') + '">' + (profile.restConfigured ? 'REST ready' : 'REST missing') + '</span>',
        '<span class="chip">' + (profile.sdkEndpoint || 'no sdk endpoint') + '</span>',
        '<span class="chip">' + (profile.restEndpoint || 'no rest endpoint') + '</span>',
        '<span class="chip">SDK ' + (profile.sdkApiKeyPreview || 'none') + '</span>',
        '<span class="chip">REST ' + (profile.restApiKeyPreview || 'none') + '</span>',
      ].join('')
      const runtime = data.active.runtime?.manifest || {}
      const warnings = data.active.runtime?.warnings || []
      el('runtimeChips').innerHTML = [
        '<span class="chip">' + (runtime.id || 'unknown demo') + '</span>',
        '<span class="chip">hash ' + (runtime.configHash || '-') + '</span>',
        '<span class="chip">' + (runtime.sourceMode || '-') + '</span>',
        ...warnings.map((warning) => '<span class="chip warn">' + warning + '</span>'),
      ].join('')
      el('runtimeDetails').textContent = fmt({
        generatedAt: runtime.generatedAt,
        assetBase: runtime.assetBase,
        expectedSources: runtime.expectedSources,
      })
      el('presets').innerHTML = data.active.presets.map((preset) => (
        '<button class="preset" data-preset="' + preset.id + '">' +
          '<span><strong>' + preset.label + '</strong><span>' + (preset.description || preset.id) + '</span></span>' +
          '<small>' + preset.type + '</small>' +
        '</button>'
      )).join('')
      document.querySelectorAll('[data-preset]').forEach((button) => {
        button.addEventListener('click', () => executePreset(button.dataset.preset))
      })
      renderLedger()
      renderJobLog()
    }
    function renderLedger() {
      const rows = state.data.ledger || []
      el('ledger').innerHTML = rows.length ? rows.map((entry) => {
        const statusClass = entry.status === 'error' ? 'error' : entry.status === 'success' ? 'success' : ''
        return '<article class="event">' +
          '<div class="event-top"><strong>' + entry.label + '</strong><time>' + new Date(entry.ts).toLocaleTimeString() + '</time></div>' +
          '<div class="event-meta">' +
            '<span class="tag ' + statusClass + '">' + entry.status + '</span>' +
            '<span class="tag">' + entry.source + '</span>' +
            '<span class="tag">' + entry.type + '</span>' +
            '<span class="tag">' + (entry.externalId || '-') + '</span>' +
          '</div>' +
          '<div class="json">' + fmt({ payload: entry.payload, result: entry.result }).replace(/[<>&]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) + '</div>' +
        '</article>'
      }).join('') : '<p>No events yet.</p>'
    }
    function renderJobLog() {
      const job = state.data.jobs?.[0]
      if (!job) return
      el('logs').textContent = job.logs?.join('\\n') || 'Waiting for output.'
      el('logs').scrollTop = el('logs').scrollHeight
      if (job.status === 'running') {
        el('status').textContent = job.step
        setTimeout(load, 1200)
      }
    }
    async function executePreset(presetId, override) {
      try {
        setBusy(true)
        await request('/api/presets/execute', {
          presetId,
          externalId: el('externalId').value.trim(),
          payloadOverride: override || {},
        })
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    }
    el('saveActive').addEventListener('click', async () => {
      try {
        setBusy(true)
        await request('/api/active', {
          packId: el('pack').value,
          externalId: el('externalId').value.trim(),
          displayName: el('displayName').value.trim(),
        })
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    })
    el('run').addEventListener('click', async () => {
      try {
        setBusy(true)
        await request('/api/run', { packId: el('pack').value, applyOnly: false })
        await load()
      } catch (error) {
        alert(error.message || String(error))
        setBusy(false)
      }
    })
    el('apply').addEventListener('click', async () => {
      try {
        setBusy(true)
        await request('/api/run', { packId: el('pack').value, applyOnly: true })
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    })
    el('addPreset').addEventListener('click', async () => {
      try {
        setBusy(true)
        await request('/api/custom-presets', {
          label: el('customLabel').value.trim(),
          type: el('customLane').value,
          name: el('customName').value.trim(),
          properties: parseJson('customProps'),
        })
        el('customLabel').value = ''
        el('customName').value = ''
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    })
    el('sendTrigger').addEventListener('click', async () => {
      const type = el('messageType').value
      const id = el('messageId').value.trim()
      if (!id) return alert('Campaign or Canvas ID is required.')
      const payloadOverride = type === 'campaign_trigger'
        ? { campaignId: id, triggerProperties: parseJson('triggerProps') }
        : { canvasId: id, triggerProperties: parseJson('triggerProps') }
      await executePreset('__adhoc_message__', { type, ...payloadOverride })
    })
    el('exportUser').addEventListener('click', async () => {
      try {
        setBusy(true)
        await request('/api/users/export', {})
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    })
    el('refresh').addEventListener('click', load)
    load().catch((error) => {
      el('status').textContent = 'Failed'
      el('logs').textContent = error.stack || String(error)
    })
  </script>
</body>
</html>`
}

function productionOperatorHttpSurface() {
  return {
    pair: (body, req) => pairOperatorSession(body, req),
    require: (req) => requireOperatorSession(req),
    snapshot: () => operatorSnapshot(),
    stream: (req, res) => streamOperatorState(req, res),
    executeControl: (controlId, body) => executeOperatorControl(controlId, body),
    applyPersona: (personaId, body) => applyOperatorPersona(personaId, body),
  }
}

export async function handleOperatorApiRequest(req, res, url, surface = productionOperatorHttpSurface()) {
  if (!url.pathname.startsWith('/api/operator/v1')) return false
  if (req.method === 'POST' && url.pathname === '/api/operator/v1/pair') {
    const paired = await surface.pair(await readBody(req), req)
    sendJson(res, 200, paired.body, paired.headers)
    return true
  }
  if (req.method === 'GET' && url.pathname === '/api/operator/v1/snapshot') {
    surface.require(req)
    sendJson(res, 200, await surface.snapshot(), { 'cache-control': 'no-store' })
    return true
  }
  if (req.method === 'GET' && url.pathname === '/api/operator/v1/events') {
    surface.require(req)
    await surface.stream(req, res)
    return true
  }
  if (req.method === 'POST' && /^\/api\/operator\/v1\/controls\/[^/]+\/executions$/.test(url.pathname)) {
    surface.require(req)
    const controlId = decodeURIComponent(url.pathname.split('/')[5])
    sendJson(res, 202, await surface.executeControl(controlId, await readBody(req)), { 'cache-control': 'no-store' })
    return true
  }
  if (req.method === 'POST' && /^\/api\/operator\/v1\/personas\/[^/]+\/apply$/.test(url.pathname)) {
    surface.require(req)
    const personaId = decodeURIComponent(url.pathname.split('/')[5])
    sendJson(res, 202, await surface.applyPersona(personaId, await readBody(req)), { 'cache-control': 'no-store' })
    return true
  }
  return false
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost')
  try {
    assertRequestBoundary(req, url)
    if (req.method === 'GET' && url.pathname === '/') {
      sendText(res, 200, controlRoomHtml(), 'text/html; charset=utf-8')
    } else if (req.method === 'GET' && url.pathname === '/presenter') {
      sendText(res, 200, presenterRemoteHtml(), 'text/html; charset=utf-8', {
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        'x-content-type-options': 'nosniff',
      })
    } else if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      res.writeHead(204)
      res.end()
    } else if (req.method === 'GET' && url.pathname.startsWith('/design/')) {
      serveDesignAsset(req, res)
    } else if (req.method === 'GET' && url.pathname === '/api/pack-manager') {
      sendJson(res, 200, packManagerState(), { 'cache-control': 'no-store' })
    } else if (req.method === 'POST' && url.pathname === '/api/pack-manager/new') {
      const body = await readBody(req)
      const pack = createDemoPack({
        id: String(body.id || '').trim(),
        name: String(body.name || '').trim(),
        description: String(body.description || '').trim(),
      })
      addLedger({
        source: 'launcher',
        type: 'pack_created',
        label: `Created pack ${pack.id}`,
        status: 'success',
        payload: { packId: pack.id, source: pack.source, credentialsCopied: false },
      })
      sendJson(res, 201, packManagerPackResult(pack), { 'cache-control': 'no-store' })
    } else if (req.method === 'POST' && url.pathname === '/api/pack-manager/duplicate') {
      const body = await readBody(req)
      const sourcePack = getDemoPack(String(body.sourcePackId || '').trim())
      const pack = duplicateDemoPack(sourcePack, {
        id: String(body.id || '').trim(),
        name: String(body.name || '').trim(),
        description: String(body.description || '').trim(),
      })
      addLedger({
        source: 'launcher',
        type: 'pack_duplicated',
        label: `Duplicated ${sourcePack.id} as ${pack.id}`,
        status: 'success',
        payload: { sourcePackId: sourcePack.id, packId: pack.id, credentialsCopied: false },
      })
      sendJson(res, 201, packManagerPackResult(pack), { 'cache-control': 'no-store' })
    } else if (req.method === 'POST' && url.pathname === '/api/pack-manager/validate') {
      const body = await readBody(req)
      const manager = packManagerState()
      const reports = body.packId
        ? manager.packs.filter((pack) => pack.id === String(body.packId))
        : manager.packs
      if (body.packId && !reports.length) {
        const error = new Error(`Unknown demo pack: ${body.packId}`)
        error.statusCode = 404
        throw error
      }
      sendJson(res, 200, { valid: reports.every((report) => report.valid), reports, manager }, { 'cache-control': 'no-store' })
    } else if (req.method === 'POST' && url.pathname === '/api/pack-manager/open') {
      const body = await readBody(req)
      sendJson(res, 200, await openPackManagerTarget(String(body.packId || '').trim(), String(body.target || 'directory')), { 'cache-control': 'no-store' })
    } else if (req.method === 'GET' && url.pathname === '/api/packs') {
      sendJson(res, 200, listDemoPacks())
    } else if (req.method === 'GET' && url.pathname === '/api/state') {
      sendJson(res, 200, publicState())
    } else if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, launcherInstanceId, pid: process.pid, port: serverPort })
    } else if (req.method === 'GET' && url.pathname === '/api/events') {
      streamState(req, res)
    } else if (req.method === 'GET' && url.pathname === '/api/diagnostics/bundle') {
      const bundle = diagnosticBundle()
      const stamp = bundle.generatedAt.replace(/[:.]/g, '-').replace('Z', '')
      sendJson(res, 200, bundle, {
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="lumo-diagnostics-${stamp}.json"`,
        'x-content-type-options': 'nosniff',
      })
    } else if (req.method === 'POST' && url.pathname === '/api/activity/archive') {
      const result = archiveCurrentActivity('manual_archive')
      sendJson(res, 201, { ...result, state: publicState() }, { 'cache-control': 'no-store' })
    } else if (req.method === 'POST' && url.pathname === '/api/activity/clear') {
      const result = clearCurrentActivity()
      sendJson(res, 200, { ...result, state: publicState() }, { 'cache-control': 'no-store' })
    } else if (url.pathname.startsWith('/api/operator/v1')) {
      const handled = await handleOperatorApiRequest(req, res, url)
      if (!handled) sendText(res, 404, 'Not found')
    } else if (req.method === 'GET' && url.pathname === '/api/credentials') {
      sendJson(res, 200, credentialPayload(url.searchParams.get('packId') || readState().activePackId))
    } else if (req.method === 'POST' && url.pathname === '/api/credentials') {
      sendJson(res, 200, saveCredentials(await readBody(req)))
    } else if (req.method === 'POST' && url.pathname === '/api/active') {
      const body = await readBody(req)
      if (!body.packId) throw new Error('packId is required')
      const currentState = readState()
      const liveHazard = currentLiveWebHazard(currentState)
      if (liveHazard.mayBeActive && (body.platform === 'ios' || body.packId !== currentState.activePackId)) {
        throw liveWebConflict('Disable the Android DEV OVERRIDE in Diagnostics before switching platform or pack.')
      }
      const pack = getDemoPack(body.packId)
      updateState((state) => {
        const previousPackId = state.activePackId
        state.activePackId = pack.id
        if (body.platform === 'android' || body.platform === 'ios') state.activePlatform = body.platform
        if (Object.hasOwn(body, 'externalId')) {
          state.activeExternalId = String(body.externalId || '').trim() || pack.android?.defaultExternalId || pack.brand.demoUser.externalId
        } else if (previousPackId !== pack.id || !state.activeExternalId) {
          state.activeExternalId = pack.android?.defaultExternalId || pack.brand.demoUser.externalId
        }
        state.activeDisplayName = body.displayName || pack.brand.demoUser.firstName || ''
      })
      sendJson(res, 200, publicState())
    } else if (req.method === 'POST' && url.pathname === '/api/identity/apply') {
      sendJson(res, 200, await applyRuntimeIdentity(await readBody(req)))
    } else if (req.method === 'POST' && url.pathname === '/api/development/live-web/start') {
      sendJson(res, 200, await enableAndroidLiveWeb())
    } else if (req.method === 'POST' && url.pathname === '/api/development/live-web/stop') {
      sendJson(res, 200, await disableAndroidLiveWeb())
    } else if (req.method === 'POST' && url.pathname === '/api/run') {
      const body = await readBody(req)
      if (!body.packId) throw new Error('packId is required')
      const currentState = readState()
      const liveHazard = currentLiveWebHazard(currentState)
      const safeRecoveryLaunch = body.platform !== 'ios' && !body.applyOnly && body.run !== false && body.packId === currentState.activePackId
      if (liveHazard.mayBeActive && !safeRecoveryLaunch) {
        throw liveWebConflict('Restore bundled Android mode before apply-only, pack switching, build-only, or iOS launcher jobs.')
      }
      sendJson(res, 202, createJob(body.packId, {
        applyOnly: Boolean(body.applyOnly),
        run: Object.hasOwn(body, 'run') ? Boolean(body.run) : !body.applyOnly,
        avd: body.avd,
        simulator: body.simulator,
        platform: body.platform === 'ios' ? 'ios' : 'android',
      }))
    } else if (req.method === 'POST' && url.pathname === '/api/presets/execute') {
      const body = await readBody(req)
      if (body.presetId === '__adhoc_message__') {
        const type = body.payloadOverride?.type
        const preset = {
          id: '__adhoc_message__',
          label: type === 'canvas_trigger' ? 'Trigger Canvas' : 'Trigger campaign',
          type,
          payload: body.payloadOverride || {},
        }
        const state = readState()
        const { pack } = activePackAndSecrets(state)
        const externalId = body.externalId || state.activeExternalId || pack.brand.demoUser.externalId
        const rest = restPayloadForPreset(preset, externalId)
        if (!rest) throw new Error('Unsupported message trigger type.')
        const result = await callBraze(rest.endpoint, rest.body)
        sendJson(res, 200, addLedger({
          source: 'braze_rest',
          type,
          label: preset.label,
          status: 'success',
          externalId,
          payload: preset.payload,
          result,
        }))
      } else {
        sendJson(res, 200, await executePreset(body.presetId, body.payloadOverride || {}, body.externalId || '', body.platform || ''))
      }
    } else if (req.method === 'POST' && url.pathname === '/api/triggers/execute') {
      const body = await readBody(req)
      sendJson(res, 200, await executeManualTrigger(body))
    } else if (req.method === 'POST' && url.pathname === '/api/custom-presets') {
      const body = await readBody(req)
      if (!body.label || !body.name) throw new Error('Preset label and event name are required')
      const preset = {
        id: `custom_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        label: body.label,
        description: `Logs ${body.name} from the launcher.`,
        type: body.type === 'rest_event' ? 'rest_event' : 'sdk_event',
        payload: { name: body.name, properties: body.properties || {} },
        custom: true,
      }
      updateState((state) => {
        const { pack } = activePackAndSecrets(state)
        const controlState = controlStateForPack(state, pack.id)
        controlState.staged = [{ ...preset, origin: 'staged' }, ...controlState.staged].slice(0, 80)
        if (!controlState.pinned.includes(preset.id)) controlState.pinned.unshift(preset.id)
      })
      sendJson(res, 201, preset)
    } else if (req.method === 'POST' && url.pathname === '/api/controls/stage') {
      const body = await readBody(req)
      sendJson(res, 201, stageControl(body))
    } else if (req.method === 'POST' && url.pathname === '/api/controls/update') {
      const body = await readBody(req)
      updateControl(body)
      sendJson(res, 200, publicState())
    } else if (req.method === 'POST' && url.pathname === '/api/controls/visibility') {
      const body = await readBody(req)
      updateControlVisibility(body)
      sendJson(res, 200, publicState())
    } else if (req.method === 'POST' && url.pathname === '/api/controls/promote') {
      const body = await readBody(req)
      sendJson(res, 201, promoteControl(body))
    } else if (req.method === 'POST' && url.pathname === '/api/users/export') {
      sendJson(res, 200, await exportActiveUser())
    } else if (req.method === 'POST' && url.pathname === '/api/device-events') {
      const body = await readBody(req)
      const platform = body.platform === 'ios' ? 'ios' : 'android'
      const now = new Date().toISOString()
      const pushTelemetry = withLauncherObservation(extractPushTelemetry(platform, body), launcherInstanceId, now)
      const trustTelemetry = withLauncherObservation(extractTrustTelemetry(platform, body), launcherInstanceId, now)
      const androidSourceCandidate = extractAndroidSourceReadiness(platform, body)
      const androidSourceObservation = observeAndroidSourceReadiness(androidSourceCandidate, now)
      const stateBeforeTelemetry = readState()
      const iosRenderCandidate = withLauncherObservation(extractIosRenderReadiness(platform, body), launcherInstanceId, now)
      const iosRenderReadiness = shouldReplaceIosRenderEvidence(
        stateBeforeTelemetry.deviceSourceReadiness,
        iosRenderCandidate,
      ) ? iosRenderCandidate : null
      const sourceReadiness = androidSourceObservation?.promote
        ? androidSourceObservation.evidence
        : iosRenderReadiness
      const currentRuntime = stateBeforeTelemetry.deviceRuntime || {}
      const incomingRuntime = extractRuntimeTelemetry(platform, body, {})
      const runtime = extractRuntimeTelemetry(platform, body, currentRuntime)
      rememberCorrelatedIosRuntime(incomingRuntime, body, now)
      const telemetryPayload = objectValue(body.payload)
      const telemetryResult = objectValue(body.result)
      const sourceEventAccepted = body.type !== 'demo_source_ready' || Boolean(androidSourceObservation)
      const acceptedExternalId = sourceEventAccepted && body.externalId ? String(body.externalId) : ''
      const hasRuntimeEvidence = sourceEventAccepted && Boolean(
        body.runtime || telemetryPayload.runtime || telemetryResult.runtime ||
        firstPresent(body.sourceUrl, telemetryPayload.sourceUrl, telemetryResult.sourceUrl) !== undefined ||
        firstPresent(body.sourceMode, telemetryPayload.sourceMode, telemetryResult.sourceMode) !== undefined ||
        firstPresent(body.sourceOverride, telemetryPayload.sourceOverride, telemetryResult.sourceOverride) !== undefined,
      )
      if (hasRuntimeEvidence || acceptedExternalId || pushTelemetry || trustTelemetry || sourceReadiness) {
        updateState((state) => {
          const current = state.deviceRuntime || {}
          const currentIsFresh = isCurrentLauncherEvidence(current)
          if (hasRuntimeEvidence && runtimeEvidenceIsComplete(incomingRuntime)) {
            state.deviceRuntime = withLauncherObservation({
              ...runtime,
              push: pushTelemetry || null,
              trust: trustTelemetry || null,
              ts: now,
            }, launcherInstanceId, now)
          } else if ((hasRuntimeEvidence || acceptedExternalId) && (currentIsFresh || Object.keys(current).length)) {
            state.deviceRuntime = {
              ...current,
              ...(currentIsFresh ? runtime : {}),
              platform,
              ...(acceptedExternalId ? { externalId: acceptedExternalId } : {}),
              push: pushTelemetry || current.push || null,
              trust: trustTelemetry || current.trust || null,
              lastEventAt: now,
            }
          }
          if (sourceReadiness) state.deviceSourceReadiness = sourceReadiness
          if (pushTelemetry) {
          if (!state.pushReadiness || typeof state.pushReadiness !== 'object') state.pushReadiness = {}
          const key = pushReadinessKey(platform, pushTelemetry.deviceId, pushTelemetry.externalId)
          state.pushReadiness[key] = pushTelemetry
          }
          if (trustTelemetry) {
          if (!state.trustDiagnostics || typeof state.trustDiagnostics !== 'object') state.trustDiagnostics = {}
          const key = trustDiagnosticsKey(platform, trustTelemetry.deviceId, trustTelemetry.externalId)
          state.trustDiagnostics[key] = trustTelemetry
          }
        })
      }
      correlateOperatorTelemetry(body)
      sendJson(res, 202, addLedger({
        source: platform,
        type: body.type || body.action || 'device_event',
        label: body.label || body.action || `${platform} telemetry`,
        status: body.status || 'info',
        platform,
        externalId: body.externalId,
        correlationId: body.executionId || body.requestId || body.correlationId || '',
        payload: body.payload || body,
        result: body.result || null,
      }))
    } else if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
      const id = url.pathname.split('/').pop()
      const job = jobs.get(id)
      if (!job) sendJson(res, 404, { error: 'Job not found' })
      else sendJson(res, 200, job)
    } else {
      sendText(res, 404, 'Not found')
    }
  } catch (error) {
    const statusCode = error.statusCode || 500
    const details = redactSecrets(error.details || null)
    if (!error.details?.validation) {
      addLedger({
        source: 'launcher',
        type: 'error',
        label: 'Launcher error',
        status: 'error',
        result: { error: error.message || String(error), details },
      })
    }
    sendJson(res, statusCode, { error: error.message || String(error), details })
  }
}

async function runCli(args) {
  if (args.command === 'list') {
    console.log(JSON.stringify(listDemoPacks(), null, 2))
    return
  }
  if (args.command === 'apply') {
    const discovered = readLauncherServerInfo()
    const candidatePort = discovered?.port ? Number(discovered.port) : args.port
    const healthy = await launcherHealth(candidatePort)
    if (healthy) {
      if (discovered?.instanceId && healthy.launcherInstanceId !== discovered.instanceId) {
        throw new Error('Launcher discovery and health report different authority instances. Stop the conflicting process before continuing.')
      }
      if (args.explicitPort && Number(args.port) !== Number(candidatePort)) {
        throw new Error(`A launcher authority is already active on port ${candidatePort}; refusing a second owner on explicit port ${args.port}.`)
      }
      const delegated = await launcherJsonRequest(candidatePort, '/api/run', {
        method: 'POST',
        body: {
          packId: args.pack,
          applyOnly: args.applyOnly,
          run: Boolean(args.run),
          avd: args.avd,
          platform: 'android',
        },
      })
      const job = await waitForDelegatedJob(candidatePort, delegated.id)
      console.log((job.logs || []).join('\n'))
      if (job.status !== 'complete') process.exitCode = 1
      return
    }
    if (discovered && (processIsAlive(discovered.pid) || !(await canListen(candidatePort)))) {
      throw new Error(
        `Launcher state is owned by an incompatible or legacy process on port ${candidatePort}. ` +
        'Stop that process before running a CLI job; a second state owner is never started.',
      )
    }
    if (!discovered && !(await canListen(args.port))) {
      throw new Error(`Port ${args.port} is already in use and no healthy launcher authority answered there.`)
    }
    serverPort = args.port
    const callbackServer = await listenControlRoomServer(serverPort)
    try {
      const job = createJob(args.pack, {
        applyOnly: args.applyOnly,
        run: Boolean(args.run),
        avd: args.avd,
      })
      while (job.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      console.log(job.logs.join('\n'))
      if (job.status !== 'complete') process.exitCode = 1
    } finally {
      await closeServer(callbackServer)
    }
    return
  }

  const port = await findAvailablePort(args.port, { strict: args.explicitPort })
  serverPort = port
  await listenControlRoomServer(port, { announce: true })
}

const isMainModule = Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))

if (isMainModule) {
  let shuttingDown = false
  const shutdown = async (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    try {
      await Promise.all([
        stopLiveWebProcess(),
        androidTimeGuard.stop(),
      ])
    } finally {
      removeServerInfo()
      releaseAuthorityLock()
      process.exit(signal === 'SIGINT' ? 130 : 143)
    }
  }
  process.once('SIGINT', () => { shutdown('SIGINT') })
  process.once('SIGTERM', () => { shutdown('SIGTERM') })
  process.once('exit', () => {
    if (liveWebProcess && liveWebProcess.exitCode === null) liveWebProcess.kill('SIGTERM')
    androidTimeGuard.terminateNow()
    removeServerInfo()
    releaseAuthorityLock()
  })
  runCli(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error.stack || String(error))
    process.exitCode = 1
  })
}
