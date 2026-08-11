import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PRESENTER_REMOTE_API_CONTRACT,
  escapePresenterHtml,
  presenterExecutionCandidateWins,
  presenterRemoteHtml,
  renderPresenterRemote,
} from './presenter-remote-template.mjs'

test('escapes server-rendered labels and keeps injected markup inert', () => {
  assert.equal(escapePresenterHtml(`<script>alert("x")</script> & '`), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#039;')
  const html = presenterRemoteHtml({ title: '<img src=x onerror=alert(1)>' })
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'))
})

test('exports a Node ESM render alias and clamps the visible control budget', () => {
  assert.equal(renderPresenterRemote, presenterRemoteHtml)
  const html = renderPresenterRemote({ maxControls: 99 })
  assert.match(html, /"maxControls":7/)
  assert.match(html, /"apiVersion":"operator\/v1"/)
})

test('rejects cross-origin or script-breaking resource paths', () => {
  assert.throws(() => presenterRemoteHtml({ apiBasePath: 'https://example.com/api' }), /same-origin absolute path/)
  assert.throws(() => presenterRemoteHtml({ apiBasePath: '//example.com/api' }), /same-origin absolute path/)
  assert.throws(() => presenterRemoteHtml({ designHref: '/design/<script>' }), /same-origin absolute path/)
})

test('renders the narrow operator API and fail-closed recovery contract', () => {
  const html = presenterRemoteHtml()
  assert.deepEqual(PRESENTER_REMOTE_API_CONTRACT, {
    version: 'operator/v1',
    pairPath: '/api/operator/v1/pair',
    snapshotPath: '/api/operator/v1/snapshot',
    eventsPath: '/api/operator/v1/events',
    controlExecutionPath: '/api/operator/v1/controls/:id/executions',
    personaApplyPath: '/api/operator/v1/personas/:id/apply',
  })
  assert.ok(html.includes("new EventSource(CONFIG.apiBasePath + '/events')"))
  assert.ok(html.includes("events.addEventListener('delta'"))
  assert.ok(html.includes("events.addEventListener('invalidate'"))
  assert.ok(html.includes("events.addEventListener('heartbeat'"))
  assert.ok(html.includes("state.connection === 'connected'"))
  assert.ok(html.includes('!isStale()'))
  assert.ok(html.includes("state.snapshot.readiness.status === 'ready'"))
  assert.ok(html.includes('function canApplyPersona()'))
  assert.ok(html.includes('if (!canApplyPersona()) return render()'))
  assert.ok(html.includes("refreshSnapshot().catch(() => disconnect('Snapshot recovery failed.'))"))
  assert.ok(html.includes('The launcher is unavailable. Actions are disabled.'))
})

test('rejects execution events from a prior operator context', () => {
  const html = presenterRemoteHtml()
  assert.ok(html.includes("packId: boundedText(execution.packId, '', 120)"))
  assert.ok(html.includes("runtimeHash: boundedText(execution.runtimeHash, '', 160)"))
  assert.ok(html.includes("platform: boundedText(execution.platform, '', 32)"))
  assert.ok(html.includes("personaId: boundedText(execution.personaId, '', 120)"))
  assert.ok(html.includes('function executionMatchesSnapshot(execution, snapshot)'))
  assert.ok(html.includes('execution.packId === snapshot.active.pack.id'))
  assert.ok(html.includes('execution.runtimeHash === snapshot.active.runtimeHash'))
  assert.ok(html.includes('execution.platform === snapshot.active.platform'))
  assert.ok(html.includes('execution.personaId === snapshot.active.persona.id'))
  assert.ok(html.includes('if (!execution || !executionMatchesSnapshot(execution, state.snapshot)) return false'))
  assert.ok(html.includes('presenterExecutionCandidateWins(state.localExecution, execution, state.currentRequestId)'))
})

test('keeps locally initiated B selected when execution A reports late', () => {
  const executionA = { executionId: 'execution-a', requestId: 'request-a', createdOrder: 1 }
  const pendingB = { executionId: '', requestId: 'request-b', createdOrder: 0 }
  const executionB = { executionId: 'execution-b', requestId: 'request-b', createdOrder: 2 }
  const lateA = { ...executionA, status: 'success' }

  let current = executionA
  current = pendingB // executeControl synchronously selects the new local request.
  assert.equal(presenterExecutionCandidateWins(current, lateA, 'request-b'), false)
  assert.equal(presenterExecutionCandidateWins(current, executionB, 'request-b'), true)
  current = executionB
  assert.equal(presenterExecutionCandidateWins(current, lateA, 'request-b'), false)
  assert.equal(presenterExecutionCandidateWins(executionA, lateA, 'request-a'), true)
})

test('shows bounded child-result progress for multi-command executions', () => {
  const html = presenterRemoteHtml()
  assert.ok(html.includes('expectedResultCount: boundedCount(execution.expectedResultCount)'))
  assert.ok(html.includes('completedResultCount: boundedCount(execution.completedResultCount)'))
  assert.ok(html.includes('failedResultCount: boundedCount(execution.failedResultCount)'))
  assert.ok(html.includes("' · Results ' + execution.completedResultCount + '/' + execution.expectedResultCount"))
})

test('exchanges and clears a one-time fragment token before connecting', () => {
  const html = presenterRemoteHtml()
  assert.ok(html.includes("fragment.get('pair')"))
  assert.ok(html.includes("window.history.replaceState(null, '', window.location.pathname + window.location.search)"))
  assert.ok(html.includes("fetch(CONFIG.apiBasePath + '/pair'"))
  assert.ok(html.includes("body: JSON.stringify({ token: state.pairingToken })"))
  assert.ok(html.includes("credentials: 'same-origin'"))
  assert.ok(html.includes('await pairIfNeeded()'))
  assert.ok(html.indexOf('await pairIfNeeded()') < html.indexOf('await connect()'))
  assert.ok(!html.includes('localStorage.setItem(STORAGE_KEY, JSON.stringify({ token'))
})

test('remembers size and best-effort screen position without gating operation', () => {
  const html = presenterRemoteHtml()
  assert.ok(html.includes('clamp(width, 360, 480)'))
  assert.ok(html.includes('clamp(window.outerWidth, 360, 480)'))
  assert.ok(html.includes('position: { left, top }'))
  assert.ok(html.includes('window.moveTo('))
  assert.ok(html.includes('window.screen.availWidth'))
  assert.ok(html.includes('window.screen.availHeight'))
  assert.ok(html.includes("window.addEventListener('pagehide', rememberWindowGeometry)"))
  assert.match(html, /try \{\s*window\.moveTo\([\s\S]*?\)\s*\} catch \{\}/)
})

test('posts only allow-listed identifiers and expected context from the snapshot', () => {
  const html = presenterRemoteHtml()
  assert.ok(html.includes("'/controls/' + encodeURIComponent(control.id) + '/executions'"))
  assert.ok(html.includes("'/personas/' + encodeURIComponent(personaId) + '/apply'"))
  assert.ok(html.includes('variantId: variantId || null'))
  assert.ok(html.includes('launcherInstanceId: snapshot.launcherInstanceId'))
  assert.ok(html.includes('snapshotVersion: snapshot.snapshotVersion'))
  assert.ok(html.includes('configHash: snapshot.active.configHash'))
  assert.ok(html.includes('runtimeHash: snapshot.active.runtimeHash'))
  assert.ok(!html.includes('/api/state'))
  assert.ok(!html.includes('/api/presets/execute'))
  assert.ok(!html.includes('textarea'))
})

test('inline client JavaScript parses independently', () => {
  const html = presenterRemoteHtml()
  assert.ok(html.includes("replace(/\\s+/g, ' ')"))
  assert.ok(!html.includes("replace(/s+/g, ' ')"))
  const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)
  assert.ok(match, 'expected one inline client script')
  assert.doesNotThrow(() => new Function(match[1]))
})
