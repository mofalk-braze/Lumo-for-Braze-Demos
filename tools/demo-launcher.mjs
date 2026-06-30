#!/usr/bin/env node
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { launcherHtml as controlRoomHtml } from './control-room-template.mjs'
import {
  androidShellDir,
  applyDemoPack,
  createRuntimeManifest,
  generatedRuntimeManifestPath,
  getActivePackId,
  getDemoPack,
  launcherStateDir,
  listDemoPacks,
  packWebBuildCommand,
  packWebDistDir,
  readProperties,
  repoRoot,
  writeDemoPackSecrets,
  webTemplateDir,
} from './demo-pack-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const designSystemDir =
  process.env.BRAZE_DESIGN_SYSTEM_DIR ||
  path.join(repoRoot, 'Braze Design System (Collaborative)')
const jobs = new Map()
const statePath = path.join(launcherStateDir, 'state.json')
const sseClients = new Set()
const sessionRestApiKeys = new Map()
let serverPort = Number(process.env.PORT || 4177)
const requestBodyLimitBytes = Number(process.env.BRAZE_CONTROL_ROOM_BODY_LIMIT || 256 * 1024)
const defaultAndroidAvd = process.env.BRAZE_DEMO_ANDROID_AVD || 'Braze_Demo_API_36'
const trustDiagnosticsTimeoutMs = Number(process.env.BRAZE_DEMO_TRUST_DIAGNOSTICS_TIMEOUT_MS || 15_000)

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
    label: 'Show push preview',
    description: 'Shows a foreground push-style banner on the selected app render surface.',
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
  if (!firstPack) throw new Error('No demo packs found in demo-packs/.')
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

function writeState(state) {
  ensureStateDir()
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
}

function updateState(mutator) {
  const state = readState()
  ensureControlState(state, state.activePackId)
  mutator(state)
  ensureControlState(state, state.activePackId)
  state.ledger = (state.ledger || []).slice(0, 120)
  state.restResponses = (state.restResponses || []).slice(0, 40)
  writeState(state)
  broadcastState()
  return state
}

function writeSse(res, event, payload) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function broadcastState() {
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

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function sendText(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': contentType })
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

async function runCommand(command, args, options, job) {
  const line = `$ ${[command, ...args].join(' ')}`
  if (job) {
    job.logs.push(line)
    broadcastState()
  }
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

function pushLog(job, text) {
  if (!job) return
  let changed = false
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) {
      job.logs.push(line)
      changed = true
    }
  }
  if (changed) broadcastState()
}

function setJobStep(job, step) {
  job.step = step
  broadcastState()
}

function finishJob(job, status, step) {
  job.status = status
  job.step = step
  job.finishedAt = new Date().toISOString()
  broadcastState()
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

function runtimeForPack(pack) {
  if (fs.existsSync(generatedRuntimeManifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(generatedRuntimeManifestPath, 'utf8'))
      if (manifest.id === pack.id) return manifest
    } catch {
      // Fall through to a computed manifest for display.
    }
  }
  return createRuntimeManifest(pack)
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
  if (deviceRuntime && deviceRuntime.configHash && deviceRuntime.configHash !== manifest.configHash) {
    warnings.push(`${deviceRuntime.platform} reported hash ${deviceRuntime.configHash}, expected ${manifest.configHash}.`)
  }
  if (deviceRuntime && deviceRuntime.externalId && state.activeExternalId && deviceRuntime.externalId !== state.activeExternalId) {
    warnings.push(`${deviceRuntime.platform} reported user ${deviceRuntime.externalId}, expected ${state.activeExternalId}.`)
  }
  return warnings
}

function pushReadinessKey(platform, deviceId, externalId) {
  return [platform || 'unknown', deviceId || 'unknown-device', externalId || 'unknown-user'].join('|')
}

function trustDiagnosticsKey(platform, deviceId, externalId) {
  return [platform || 'unknown', deviceId || 'unknown-device', externalId || 'unknown-user'].join('|')
}

function extractPushTelemetry(platform, body = {}) {
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
  const runtime = body.runtime || payload.runtime || null
  const diagnostics = payload.diagnostics && typeof payload.diagnostics === 'object' ? payload.diagnostics : {}
  const nestedPush = payload.push && typeof payload.push === 'object'
    ? payload.push
    : diagnostics.push && typeof diagnostics.push === 'object'
      ? diagnostics.push
      : null
  const push = nestedPush || payload
  const type = body.type || body.action || ''
  const pushType = ['fcm_token', 'apns_token', 'push_permission', 'runtime_ready'].includes(type)
  if (!pushType && !nestedPush && !Object.hasOwn(push, 'tokenPresent')) return null

  const externalId = String(body.externalId || push.externalId || runtime?.externalId || diagnostics.externalId || '').trim()
  const deviceId = String(push.sdkDeviceId || runtime?.deviceId || diagnostics.sdkDeviceId || body.deviceId || payload.deviceId || '').trim()
  const status = normalizeSeverity(body.status || (push.tokenPresent ? 'success' : 'info'))
  const tokenPresent = Boolean(push.tokenPresent)
  const ready = status === 'success' && tokenPresent
  const result = body.result && typeof body.result === 'object' ? body.result : {}
  return {
    platform,
    deviceId,
    externalId,
    permission: push.permission || payload.permission || '',
    tokenPresent,
    ready,
    status,
    type,
    label: body.label || '',
    reason: push.reason || payload.reason || '',
    tokenPreview: push.tokenPreview || push.preview || payload.preview || '',
    tokenLength: push.tokenLength || payload.tokenLength || 0,
    retryScheduled: Boolean(push.retryScheduled),
    registrationError: push.registrationError || result.error || '',
    ts: new Date().toISOString(),
  }
}

function latestActivePushReadiness(state = readState()) {
  const all = state.pushReadiness && typeof state.pushReadiness === 'object'
    ? Object.values(state.pushReadiness)
    : []
  const platform = state.activePlatform || 'android'
  const externalId = state.activeExternalId || ''
  const deviceId = state.deviceRuntime?.platform === platform ? state.deviceRuntime?.deviceId || '' : ''
  return all
    .filter((entry) => entry && entry.platform === platform)
    .filter((entry) => !externalId || entry.externalId === externalId)
    .filter((entry) => !deviceId || !entry.deviceId || entry.deviceId === deviceId)
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))[0] || null
}

function extractTrustTelemetry(platform, body = {}) {
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
  const runtime = body.runtime || payload.runtime || null
  const diagnostics = payload.diagnostics && typeof payload.diagnostics === 'object' ? payload.diagnostics : {}
  const nestedTrust = payload.trust && typeof payload.trust === 'object'
    ? payload.trust
    : diagnostics.trust && typeof diagnostics.trust === 'object'
      ? diagnostics.trust
      : null
  const type = body.type || body.action || ''
  const trust = nestedTrust || (type === 'trust_diagnostics' ? payload : null)
  if (!trust || !Object.hasOwn(trust, 'ready')) return null

  const checks = Array.isArray(trust.checks) ? trust.checks : []
  const failed = checks.find((check) => check && check.ok === false) || null
  const status = normalizeSeverity(body.status || (trust.ready ? 'success' : 'error'))
  const externalId = String(body.externalId || trust.externalId || runtime?.externalId || diagnostics.externalId || '').trim()
  const deviceId = String(trust.sdkDeviceId || runtime?.deviceId || diagnostics.sdkDeviceId || body.deviceId || payload.deviceId || '').trim()
  return {
    platform,
    deviceId,
    externalId,
    ready: status === 'success' && Boolean(trust.ready),
    status,
    type,
    label: body.label || '',
    reason: trust.reason || payload.reason || '',
    checks,
    failingCheck: failed?.name || failed?.url || '',
    errorType: failed?.errorType || '',
    error: failed?.error || '',
    ts: new Date().toISOString(),
  }
}

function latestActiveTrustDiagnostics(state = readState()) {
  const all = state.trustDiagnostics && typeof state.trustDiagnostics === 'object'
    ? Object.values(state.trustDiagnostics)
    : []
  const platform = state.activePlatform || 'android'
  const externalId = state.activeExternalId || ''
  const deviceId = state.deviceRuntime?.platform === platform ? state.deviceRuntime?.deviceId || '' : ''
  return all
    .filter((entry) => entry && entry.platform === platform)
    .filter((entry) => !externalId || entry.externalId === externalId)
    .filter((entry) => !deviceId || !entry.deviceId || entry.deviceId === deviceId)
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))[0] || null
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

function activityCategory(entry, severity) {
  const type = entry.type || ''
  if (type === 'error' || (severity === 'error' && (entry.source === 'launcher' || entry.transport === 'launcher'))) return 'error'
  if (['job', 'control_promoted'].includes(type)) return 'launcher'
  if (['sdk_event', 'sdk_event_sequence', 'sdk_attribute', 'sdk_purchase', 'change_user', 'demo_command'].includes(type)) return 'sdk'
  if (['rest_event', 'rest_attribute', 'rest_purchase', 'braze_rest_request'].includes(type)) return 'rest'
  if (['campaign_trigger', 'canvas_trigger', 'foreground_push'].includes(type)) return 'message'
  if (type === 'profile_export') return 'profile'
  if (['content_cards_refresh', 'content_card_impression', 'content_card_click', 'content_cards'].includes(type)) return 'content_cards'
  if (['push_permission', 'push_readiness', 'apns_token', 'fcm_token'].includes(type)) return 'push'
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
  if (type === 'job') return label || 'Launcher Job Updated'
  if (type === 'sdk_event') return `SDK Event Logged${name ? `: ${name}` : ''}`
  if (type === 'sdk_event_sequence' || type === 'android_sequence') return label || 'SDK Event Sequence Ran'
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
  if (type === 'profile_export') return 'User Profile Exported'
  if (type === 'content_cards_refresh') return 'Content Cards Refreshed'
  if (type === 'content_card_impression') return 'Content Card Impression Logged'
  if (type === 'content_card_click') return 'Content Card Click Logged'
  if (type === 'foreground_push') return 'Foreground Push Preview Shown'
  if (type === 'push_permission') return 'Push Permission Updated'
  if (type === 'push_readiness') return 'Push Readiness Checked'
  if (type === 'trust_diagnostics') return 'Android HTTPS Trust Checked'
  if (type === 'apns_token' || type === 'fcm_token') return 'Push Token Updated'
  if (type === 'runtime_ready') return 'Runtime Ready'
  if (type === 'bridge_action') return `Bridge Action${payload.action ? `: ${payload.action}` : ''}`
  return label || titleCase(type) || 'Activity Recorded'
}

function activityDisplaySummary(entry, category) {
  const type = entry.type || ''
  const response = entry.response || entry.result || null
  if (entry.severity === 'error' || normalizeSeverity(entry.status) === 'error') {
    return response?.error || 'This action did not complete. Open details for the exact error and validation context.'
  }
  if (type === 'profile_export') return 'The active user profile was exported so profile, events, purchases, apps, and push token data can be checked.'
  if (type === 'campaign_trigger') return 'A campaign trigger was sent for the active user.'
  if (type === 'canvas_trigger') return 'A Canvas trigger was sent for the active user.'
  if (type === 'rest_event') return 'A REST event was tracked for the active user.'
  if (type === 'rest_attribute') return 'REST profile attributes were tracked for the active user.'
  if (type === 'rest_purchase') return 'A REST purchase was tracked for the active user.'
  if (type === 'braze_rest_request') return 'A safe custom Braze REST request was sent from the host launcher.'
  if (type === 'change_user') return 'The selected app SDK user was changed for this demo.'
  if (type === 'sdk_event') return 'The native SDK captured this custom event for the active demo user.'
  if (type === 'sdk_attribute') return 'The native SDK updated profile attributes for this user.'
  if (type === 'sdk_purchase') return 'The native SDK captured a purchase for this user.'
  if (type === 'push_permission') return 'The app handled notification permission for this user.'
  if (type === 'push_readiness') return 'The app refreshed native push-token registration for this user.'
  if (type === 'trust_diagnostics') return 'The app verified HTTPS trust for Braze image media and Firebase endpoints.'
  if (type === 'content_card_impression') return 'A Content Card impression was recorded for this user.'
  if (type === 'content_card_click') return 'A Content Card click was recorded for this user.'
  if (type === 'content_cards_refresh') return 'The app requested fresh Content Cards from the SDK.'
  if (type === 'foreground_push') return 'The app displayed a foreground push preview for the demo user.'
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
  const context = [
    contextItem('Platform', entry.platform),
    contextItem('Transport', entry.transport),
    contextItem('User', entry.externalId),
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

function addLedger(entry) {
  const response = entry.response ?? entry.result ?? null
  const withDefaults = normalizeActivityEntry({
    id: entry.id || randomUUID(),
    ts: new Date().toISOString(),
    status: entry.status || 'info',
    source: entry.source || 'launcher',
    platform: ledgerPlatformFor(entry),
    transport: ledgerTransportFor(entry),
    type: entry.type || 'info',
    label: entry.label || entry.type || 'Event',
    externalId: entry.externalId || readState().activeExternalId,
    payload: entry.payload || {},
    request: entry.request || null,
    response,
    validation: entry.validation || null,
    result: entry.result ?? response,
  })
  updateState((state) => {
    state.ledger = [withDefaults, ...(state.ledger || [])].slice(0, 120)
  })
  return withDefaults
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
    logs: [],
  }
  jobs.set(id, job)
  broadcastState()
  runApplyBuildLaunch(job, options).catch((error) => {
    finishJob(job, 'failed', 'Failed')
    job.logs.push(error.stack || String(error))
    if (job.platform === 'android' && /emulator|install|launch/i.test(job.step || '')) {
      job.logs.push('Android launch did not complete. The emulator may still have an older installed app until a successful installDebug run finishes.')
    }
    broadcastState()
    addLedger({
      source: 'launcher',
      type: 'job',
      label: `${job.platform} launch failed for ${job.packId}`,
      status: 'error',
      platform: job.platform,
      result: {
        error: error.message || String(error),
        step: job.step,
        staleInstallPossible: job.platform === 'android' && /emulator|install|launch/i.test(job.step || ''),
      },
    })
  })
  return job
}

async function runApplyBuildLaunch(job, options = {}) {
  const platform = options.platform === 'ios' ? 'ios' : 'android'
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
  job.logs.push(`Applied demo pack: ${pack.name}`)
  broadcastState()

  if (options.applyOnly) {
    finishJob(job, 'complete', 'Applied')
    addLedger({ source: 'launcher', type: 'job', label: `Applied ${pack.name}`, status: 'success', platform })
    return
  }

  setJobStep(job, 'Preparing web assets')
  const webBuild = packWebBuildCommand(pack)
  if (webBuild) {
    await runCommand(webBuild.command, webBuild.args, { cwd: webBuild.cwd }, job)
  } else {
    const distDir = packWebDistDir(pack)
    const indexPath = path.join(distDir, 'index.html')
    if (!fs.existsSync(indexPath)) {
      throw new Error(`Missing ${indexPath}. Build the source app or set web.build in the demo pack.`)
    }
    job.logs.push(`Using prebuilt web assets: ${distDir}`)
    broadcastState()
  }

  if (options.run === false) {
    finishJob(job, 'complete', 'Built')
    addLedger({ source: 'launcher', type: 'job', label: `Built ${pack.name}`, status: 'success', platform })
    return
  }

  if (platform === 'ios') {
    await runIosBuildInstallLaunch(job, options)
    setJobStep(job, 'Applying runtime identity')
    await applyRuntimeIdentity({
      packId: pack.id,
      platform: 'ios',
      externalId: readState().activeExternalId || pack.android?.defaultExternalId || pack.brand.demoUser.externalId,
      displayName: readState().activeDisplayName || pack.brand.demoUser.firstName || '',
    })
    finishJob(job, 'complete', 'Ready')
    addLedger({ source: 'launcher', type: 'job', label: `${pack.name} ready on iOS`, status: 'success', platform: 'ios' })
    return
  }

  setJobStep(job, 'Refreshing Android package')
  await runCommand('./gradlew', [':app:validateDemoWebAssets', ':app:assembleDebug'], { cwd: androidShellDir }, job)

  setJobStep(job, 'Starting emulator and installing app')
  const env = { AVD: resolvedAndroidAvd(options) }
  await runCommand(path.join(androidShellDir, 'tools/run-demo-emulator.sh'), [], { cwd: repoRoot, env }, job)

  setJobStep(job, 'Applying runtime identity')
  const externalId = readState().activeExternalId || pack.android?.defaultExternalId || pack.brand.demoUser.externalId
  const trustWaitStartedAt = Date.now()
  await applyRuntimeIdentity({
    packId: pack.id,
    platform: 'android',
    externalId,
    displayName: readState().activeDisplayName || pack.brand.demoUser.firstName || '',
  })
  await waitForAndroidTrustDiagnostics(job, { externalId, since: trustWaitStartedAt })

  finishJob(job, 'complete', 'Ready')
  addLedger({ source: 'launcher', type: 'job', label: `${pack.name} ready on Android`, status: 'success', platform: 'android' })
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
  await runCommand('xcrun', ['simctl', 'launch', 'booted', 'com.braze.masquerade'], { cwd: repoRoot }, job)
}

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/api[_-]?key|authorization|bearer|token|secret|password/i.test(key)) return [key, '[redacted]']
    return [key, redactSecrets(item)]
  }))
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

async function resolveAndroidActivity() {
  const adb = process.env.ADB || path.join(process.env.HOME, 'Library/Android/sdk/platform-tools/adb')
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

async function applyRuntimeIdentity(body = {}) {
  const externalId = String(body.externalId || '').trim()
  if (!externalId) throw new Error('External user ID is required')
  const platform = body.platform === 'ios' ? 'ios' : 'android'
  const pack = body.packId ? getDemoPack(body.packId) : activePackAndSecrets().pack

  updateState((state) => {
    state.activePackId = pack.id
    state.activePlatform = platform
    state.activeExternalId = externalId
    if (body.displayName !== undefined) state.activeDisplayName = String(body.displayName || '').trim()
  })

  const commands = [
    { action: 'changeUser', externalId, payload: { externalId } },
    { action: 'requestContentCardsRefresh', externalId, payload: {} },
    { action: 'requestTrustDiagnostics', externalId, payload: { reason: 'identity_apply' } },
    { action: 'requestPushReadiness', externalId, payload: { reason: 'identity_apply' } },
  ]
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
      displayName: body.displayName || '',
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
      return {
        endpoint: '/canvas/trigger/send',
        method: 'POST',
        body: {
          canvas_id: payload.canvasId,
          recipients: [
            {
              external_user_id: externalId,
              trigger_properties: payload.triggerProperties || {},
              send_to_existing_only: payload.sendToExistingOnly !== false,
            },
          ],
        },
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

async function executePresetObject(preset, payloadOverride = {}, externalIdOverride = '', platformOverride = '') {
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
    externalId,
    payload,
    validation: resolvedPreset.validation || null,
  }

  const deviceCommands = commandsForPreset(resolvedPreset, externalId, payloadOverride)
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
    const result = await callBraze(rest.endpoint, rest.body, { method: rest.method || 'POST', query: rest.query || {} })
    return addLedger({ ...ledgerBase, status: 'success', request: redactSecrets(rest), response: result, result })
  }

  throw new Error(`Unsupported preset type: ${resolvedPreset.type}`)
}

async function executePreset(presetId, payloadOverride = {}, externalIdOverride = '', platformOverride = '') {
  const state = readState()
  const { pack } = activePackAndSecrets(state)
  const preset = packPresets(pack, state).find((item) => item.id === presetId)
  if (!preset) throw new Error(`Preset not found: ${presetId}`)
  return executePresetObject(preset, payloadOverride, externalIdOverride, platformOverride)
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
      body: payload.body || 'Control Room sent a foreground push preview.',
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

function serveDesignAsset(req, res) {
  const prefix = '/design/'
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(prefix.length))
  const target = path.normalize(path.join(designSystemDir, relative))
  if (!target.startsWith(designSystemDir) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
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
  res.writeHead(200, { 'content-type': type })
  fs.createReadStream(target).pipe(res)
}

function publicState() {
  const state = readState()
  const { pack, secrets } = activePackAndSecrets(state)
  const runtime = runtimeForPack(pack)
  const controlState = controlStateForPack(state, pack.id)
  const packs = listDemoPacks().map((item) => {
    const itemSecrets = getDemoPack(item.id).secrets || {}
    const itemRestStatus = restCredentialStatus(item, itemSecrets)
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      brand: item.brand,
      hasSecrets: item.hasSecrets,
      restConfigured: Boolean(itemSecrets['braze.restEndpoint'] && itemRestStatus.configured),
      sdkConfigured: Boolean(itemSecrets['braze.apiKey'] && itemSecrets['braze.endpoint']),
      presetCount: builtInPresets.length + (item.launcher?.presets?.length || 0),
    }
  })
  return {
    active: {
      platform: state.activePlatform || 'android',
      pack: publicPack(pack),
      profile: packProfile(pack, secrets, state),
      presets: packPresets(pack, state).map((preset) => withPresetMeta(preset, state)).map((preset) => withControlUiState(preset, controlState)),
      controlState,
      runtime: {
        manifest: runtime,
        device: state.deviceRuntime || null,
        push: latestActivePushReadiness(state),
        trust: latestActiveTrustDiagnostics(state),
        warnings: runtimeWarnings(runtime, state),
      },
      callbackUrl: launcherCallbackUrl(),
    },
    packs,
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
      el('pack').innerHTML = data.packs.map((pack) => '<option value="' + pack.id + '">' + pack.name + '</option>').join('')
      el('pack').value = profile.packId
      el('externalId').value = profile.externalId || ''
      el('displayName').value = profile.displayName || ''
      el('packStatus').textContent = profile.packName
      el('profileChips').innerHTML = [
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

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost')
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      sendText(res, 200, controlRoomHtml(), 'text/html; charset=utf-8')
    } else if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      res.writeHead(204)
      res.end()
    } else if (req.method === 'GET' && url.pathname.startsWith('/design/')) {
      serveDesignAsset(req, res)
    } else if (req.method === 'GET' && url.pathname === '/api/packs') {
      sendJson(res, 200, listDemoPacks())
    } else if (req.method === 'GET' && url.pathname === '/api/state') {
      sendJson(res, 200, publicState())
    } else if (req.method === 'GET' && url.pathname === '/api/events') {
      streamState(req, res)
    } else if (req.method === 'GET' && url.pathname === '/api/credentials') {
      sendJson(res, 200, credentialPayload(url.searchParams.get('packId') || readState().activePackId))
    } else if (req.method === 'POST' && url.pathname === '/api/credentials') {
      sendJson(res, 200, saveCredentials(await readBody(req)))
    } else if (req.method === 'POST' && url.pathname === '/api/active') {
      const body = await readBody(req)
      if (!body.packId) throw new Error('packId is required')
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
    } else if (req.method === 'POST' && url.pathname === '/api/run') {
      const body = await readBody(req)
      if (!body.packId) throw new Error('packId is required')
      sendJson(res, 202, createJob(body.packId, {
        applyOnly: Boolean(body.applyOnly),
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
      const runtime = body.runtime || body.payload?.runtime || null
      const pushTelemetry = extractPushTelemetry(platform, body)
      const trustTelemetry = extractTrustTelemetry(platform, body)
      if (runtime?.id || runtime?.configHash) {
        updateState((state) => {
          state.deviceRuntime = {
            platform,
            id: runtime.id || '',
            configHash: runtime.configHash || '',
            deviceId: runtime.deviceId || body.deviceId || body.payload?.deviceId || '',
            externalId: runtime.externalId || body.externalId || body.payload?.externalId || '',
            sourceUrl: body.sourceUrl || body.payload?.sourceUrl || '',
            push: pushTelemetry || null,
            trust: trustTelemetry || null,
            ts: new Date().toISOString(),
          }
        })
      } else if (body.externalId) {
        updateState((state) => {
          const current = state.deviceRuntime || {}
          state.deviceRuntime = {
            ...current,
            platform,
            externalId: body.externalId,
            push: pushTelemetry || current.push || null,
            trust: trustTelemetry || current.trust || null,
            ts: new Date().toISOString(),
          }
        })
      }
      if (pushTelemetry) {
        updateState((state) => {
          if (!state.pushReadiness || typeof state.pushReadiness !== 'object') state.pushReadiness = {}
          const key = pushReadinessKey(platform, pushTelemetry.deviceId, pushTelemetry.externalId)
          state.pushReadiness[key] = pushTelemetry
        })
      }
      if (trustTelemetry) {
        updateState((state) => {
          if (!state.trustDiagnostics || typeof state.trustDiagnostics !== 'object') state.trustDiagnostics = {}
          const key = trustDiagnosticsKey(platform, trustTelemetry.deviceId, trustTelemetry.externalId)
          state.trustDiagnostics[key] = trustTelemetry
        })
      }
      sendJson(res, 202, addLedger({
        source: platform,
        type: body.type || body.action || 'device_event',
        label: body.label || body.action || `${platform} telemetry`,
        status: body.status || 'info',
        platform,
        externalId: body.externalId,
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
    return
  }

  const port = await findAvailablePort(args.port, { strict: args.explicitPort })
  serverPort = port
  const server = http.createServer((req, res) => {
    handleRequest(req, res)
  })
  server.listen(port, '127.0.0.1', () => {
    const serverUrl = `http://127.0.0.1:${port}`
    console.log(`Braze Demo Control Room running at ${serverUrl}`)
    console.log(`Android telemetry callback: ${launcherCallbackUrl()}`)
    console.log('Press Ctrl+C to stop.')
  })
}

runCli(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(error.stack || String(error))
  process.exitCode = 1
})
