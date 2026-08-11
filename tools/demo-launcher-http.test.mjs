import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'

import {
  assertOperatorSnapshotContext,
  assertRequestBoundary,
  createOperatorSessionAuthority,
  handleOperatorApiRequest,
  operatorRequestMatches,
} from './demo-launcher.mjs'

function contextFor(snapshot) {
  return {
    launcherInstanceId: snapshot.launcherInstanceId,
    snapshotVersion: snapshot.snapshotVersion,
    packId: snapshot.active.pack.id,
    configHash: snapshot.active.runtime.configHash,
    runtimeHash: snapshot.active.runtime.runtimeHash,
    platform: snapshot.active.platform,
    personaId: snapshot.active.persona.id,
  }
}

function statusError(message, statusCode = 409) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

async function startHarness() {
  const launcherInstanceId = 'launcher-http-test'
  const authority = createOperatorSessionAuthority({
    pairingToken: 'one-time-pair-token',
    instanceId: launcherInstanceId,
    createSessionId: () => 'scoped-session-id',
  })
  const controls = Array.from({ length: 8 }, (_, index) => ({ id: `control_${index + 1}` }))
  const approvedControls = controls.slice(0, 7)
  const snapshot = {
    launcherInstanceId,
    snapshotVersion: 'snapshot-v1',
    active: {
      pack: { id: 'demo-pack' },
      runtime: { configHash: 'config-hash', runtimeHash: 'runtime-hash' },
      platform: 'android',
      persona: { id: 'known-persona' },
    },
    readiness: { status: 'ready' },
    controls: approvedControls,
  }
  const requests = new Map()
  let executionSequence = 0
  const surface = {
    pair: (body, req) => authority.pair(body, req),
    require: (req) => authority.require(req),
    snapshot: () => snapshot,
    stream: (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end('event: snapshot\ndata: {}\n\n')
    },
    executeControl: async (controlId, body = {}) => {
      const requestId = String(body.requestId || '')
      if (!requestId) throw statusError('requestId is required.', 400)
      const variantId = String(body.variantId || '')
      const existing = requests.get(requestId)
      if (existing) {
        if (!operatorRequestMatches(existing, controlId, variantId)) {
          throw statusError('requestId was already used for a different Presenter action or variant.')
        }
        return { execution: existing, snapshot, existing: true }
      }
      assertOperatorSnapshotContext(body.expected, snapshot)
      if (!approvedControls.some((control) => control.id === controlId)) {
        throw statusError('This control is not approved for Presenter Remote.')
      }
      executionSequence += 1
      const execution = {
        executionId: `execution-${executionSequence}`,
        requestId,
        controlId,
        variantId,
        status: 'success',
      }
      requests.set(requestId, execution)
      return { execution, snapshot, existing: false }
    },
    applyPersona: async () => ({ snapshot }),
  }

  let port = 0
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    try {
      assertRequestBoundary(req, url, port)
      const handled = await handleOperatorApiRequest(req, res, url, surface)
      if (!handled) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Not found' }))
      }
    } catch (error) {
      const payload = JSON.stringify({ error: error.message || String(error) })
      res.writeHead(error.statusCode || 500, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      })
      res.end(payload)
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  port = server.address().port
  return {
    port,
    snapshot,
    pairingToken: authority.pairingToken(),
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

function request(harness, {
  method = 'GET',
  pathname = '/',
  headers = {},
  body,
} = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body))
    const req = http.request({
      host: '127.0.0.1',
      port: harness.port,
      path: pathname,
      method,
      headers: {
        host: `127.0.0.1:${harness.port}`,
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => {
        let parsed = raw
        try { parsed = raw ? JSON.parse(raw) : null } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: parsed })
      })
    })
    req.once('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

test('operator/v1 HTTP boundary, pairing, context, allow-list, and idempotency fail closed', async (t) => {
  const harness = await startHarness()
  t.after(() => harness.close())

  await t.test('rejects a wrong Host before routing', async () => {
    const response = await request(harness, {
      pathname: '/api/operator/v1/snapshot',
      headers: { host: `malicious.invalid:${harness.port}` },
    })
    assert.equal(response.status, 403)
    assert.match(response.body.error, /Host header/)
  })

  await t.test('rejects a cross-origin browser request', async () => {
    const response = await request(harness, {
      pathname: '/api/operator/v1/snapshot',
      headers: { origin: 'https://malicious.invalid' },
    })
    assert.equal(response.status, 403)
    assert.match(response.body.error, /Cross-origin/)
  })

  await t.test('requires JSON for mutations', async () => {
    const missing = await request(harness, {
      method: 'POST',
      pathname: '/api/operator/v1/pair',
      body: JSON.stringify({ token: harness.pairingToken }),
    })
    assert.equal(missing.status, 415)
    const wrong = await request(harness, {
      method: 'POST',
      pathname: '/api/operator/v1/pair',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ token: harness.pairingToken }),
    })
    assert.equal(wrong.status, 415)
  })

  await t.test('blocks unpaired snapshot, SSE, and action routes', async () => {
    const snapshot = await request(harness, { pathname: '/api/operator/v1/snapshot' })
    const events = await request(harness, { pathname: '/api/operator/v1/events' })
    const action = await request(harness, {
      method: 'POST',
      pathname: '/api/operator/v1/controls/control_1/executions',
      headers: { 'content-type': 'application/json' },
      body: { requestId: 'unpaired' },
    })
    assert.equal(snapshot.status, 401)
    assert.equal(events.status, 401)
    assert.equal(action.status, 401)
  })

  let cookie = ''
  await t.test('exchanges a one-time fragment token for a scoped HttpOnly session', async () => {
    const paired = await request(harness, {
      method: 'POST',
      pathname: '/api/operator/v1/pair',
      headers: { 'content-type': 'application/json' },
      body: { token: harness.pairingToken },
    })
    assert.equal(paired.status, 200)
    const setCookie = paired.headers['set-cookie']?.[0] || ''
    assert.match(setCookie, /^braze_demo_operator=/)
    assert.match(setCookie, /HttpOnly/)
    assert.match(setCookie, /SameSite=Strict/)
    assert.match(setCookie, /Path=\/api\/operator\/v1/)
    cookie = setCookie.split(';')[0]

    const replayWithoutCookie = await request(harness, {
      method: 'POST',
      pathname: '/api/operator/v1/pair',
      headers: { 'content-type': 'application/json' },
      body: { token: harness.pairingToken },
    })
    assert.equal(replayWithoutCookie.status, 401)

    const pairedSession = await request(harness, {
      pathname: '/api/operator/v1/snapshot',
      headers: { cookie },
    })
    assert.equal(pairedSession.status, 200)
    assert.equal(pairedSession.body.launcherInstanceId, 'launcher-http-test')
  })

  await t.test('rejects the eighth pinned control at the server', async () => {
    const response = await request(harness, {
      method: 'POST',
      pathname: '/api/operator/v1/controls/control_8/executions',
      headers: { 'content-type': 'application/json', cookie },
      body: {
        requestId: 'eighth-control',
        expected: contextFor(harness.snapshot),
      },
    })
    assert.equal(response.status, 409)
    assert.match(response.body.error, /not approved/)
  })

  await t.test('rejects stale expected context', async () => {
    const response = await request(harness, {
      method: 'POST',
      pathname: '/api/operator/v1/controls/control_1/executions',
      headers: { 'content-type': 'application/json', cookie },
      body: {
        requestId: 'stale-context',
        expected: { ...contextFor(harness.snapshot), snapshotVersion: 'stale-version' },
      },
    })
    assert.equal(response.status, 409)
    assert.match(response.body.error, /context is stale/)
  })

  await t.test('replays the same idempotent action and rejects action or variant reuse', async () => {
    const body = {
      requestId: 'idempotent-request',
      variantId: 'approved-variant',
      expected: contextFor(harness.snapshot),
    }
    const first = await request(harness, {
      method: 'POST',
      pathname: '/api/operator/v1/controls/control_1/executions',
      headers: { 'content-type': 'application/json', cookie },
      body,
    })
    const replay = await request(harness, {
      method: 'POST',
      pathname: '/api/operator/v1/controls/control_1/executions',
      headers: { 'content-type': 'application/json', cookie },
      body,
    })
    assert.equal(first.status, 202)
    assert.equal(replay.status, 202)
    assert.equal(replay.body.execution.executionId, first.body.execution.executionId)
    assert.equal(replay.body.existing, true)

    const actionMismatch = await request(harness, {
      method: 'POST',
      pathname: '/api/operator/v1/controls/control_2/executions',
      headers: { 'content-type': 'application/json', cookie },
      body,
    })
    assert.equal(actionMismatch.status, 409)

    const variantMismatch = await request(harness, {
      method: 'POST',
      pathname: '/api/operator/v1/controls/control_1/executions',
      headers: { 'content-type': 'application/json', cookie },
      body: { ...body, variantId: 'different-variant' },
    })
    assert.equal(variantMismatch.status, 409)
  })
})
