import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Worker } from 'node:worker_threads'

import { launcherHtml } from './control-room-template.mjs'
import { createRuntimeManifest } from './demo-pack-utils.mjs'
import {
  acquireAuthorityLock,
  activeOperatorPersona,
  androidSdkCredentialContextFingerprint,
  aggregateOperatorSequenceResult,
  androidSourceReadinessMatchesExpectation,
  assertOperatorSnapshotContext,
  correlateDeviceCommands,
  createOwnedChildSingleton,
  createOperatorExecutionSequence,
  extractAndroidSourceReadiness,
  extractIosRenderReadiness,
  extractPushTelemetry,
  extractRenderSyncIdentity,
  extractRuntimeTelemetry,
  extractTrustTelemetry,
  guidedTroubleshootingCards,
  isCurrentLauncherEvidence,
  iosRenderReadinessMatchesExpectation,
  iosRuntimeEvidenceMatchesExpectation,
  iosSdkCredentialContextFingerprint,
  liveWebStateAfterHostStop,
  liveWebHazard,
  mergeActivityLedger,
  operatorExecutionMatchesContext,
  operatorBaseBlockers,
  operatorPersonas,
  operatorRequestMatches,
  operatorSequenceResultSummary,
  pathIsWithinRoot,
  presenterControlPresets,
  releaseAuthorityLock,
  redactDiagnosticValue,
  runtimeEvidenceIsComplete,
  renderSyncIdentityMatchesRuntime,
  selectFreshRuntimeManifest,
  selectLatestOperatorExecution,
  shouldReplaceAndroidSourceEvidence,
  shouldReplaceIosRenderEvidence,
  terminalOperatorTelemetry,
  webBuildInputHash,
  withLauncherObservation,
} from './demo-launcher.mjs'

test('activity ledger merges repeated telemetry but preserves intentional story actions and session boundaries', () => {
  const base = {
    id: 'first',
    ts: '2026-08-14T10:00:00.000Z',
    sessionId: 'session-a',
    type: 'runtime_ready',
    label: 'Runtime ready',
    status: 'success',
    platform: 'android',
    transport: 'device_callback',
    payload: { runtimeHash: 'runtime-a', observedAt: 'first-observation' },
  }
  const first = mergeActivityLedger([], base)
  const repeated = mergeActivityLedger(first.ledger, {
    ...base,
    id: 'second',
    ts: '2026-08-14T10:00:01.000Z',
    payload: { runtimeHash: 'runtime-a', observedAt: 'second-observation' },
  })
  assert.equal(repeated.deduplicated, true)
  assert.equal(repeated.ledger.length, 1)
  assert.equal(repeated.entry.id, 'first')
  assert.equal(repeated.entry.duplicateCount, 2)

  const nextSession = mergeActivityLedger(repeated.ledger, {
    ...base,
    id: 'third',
    ts: '2026-08-14T10:00:01.500Z',
    sessionId: 'session-b',
  })
  assert.equal(nextSession.deduplicated, false)
  assert.equal(nextSession.ledger.length, 2)

  const storyAction = { ...base, id: 'story-a', type: 'sdk_event', payload: { name: 'checkout' } }
  const storyLedger = mergeActivityLedger([], storyAction)
  const repeatedStory = mergeActivityLedger(storyLedger.ledger, { ...storyAction, id: 'story-b', ts: '2026-08-14T10:00:00.500Z' })
  assert.equal(repeatedStory.deduplicated, false)
  assert.equal(repeatedStory.ledger.length, 2)
})

test('diagnostic redaction removes credentials, people, local paths, and local pack aliases', () => {
  const redacted = redactDiagnosticValue({
    apiKey: 'sdk-secret',
    externalId: 'person-123',
    campaignId: 'campaign-safe',
    log: `${process.cwd()}/.demo-packs/customer-alpha Authorization: Bearer bearer-secret`,
    email: 'person@example.test',
    warning: 'Runtime belongs to person-123 and must be checked.',
  }, { aliases: ['customer-alpha'], identifiers: ['person-123'] })
  assert.equal(redacted.apiKey, '[redacted]')
  assert.equal(redacted.externalId, '[redacted]')
  assert.equal(redacted.email, '[redacted]')
  assert.equal(redacted.campaignId, 'campaign-safe')
  assert.match(redacted.log, /<repo>/)
  assert.match(redacted.log, /\[local-pack\]/)
  assert.doesNotMatch(JSON.stringify(redacted), /sdk-secret|person-123|bearer-secret|customer-alpha/)
})

test('normalizes runtime and source evidence from prepareRuntime result telemetry', () => {
  const evidence = extractRuntimeTelemetry('android', {
    platform: 'android',
    launcherInstanceId: 'launcher-top',
    executionId: 'execution-top',
    payload: { action: 'prepareRuntime' },
    result: {
      runtime: {
        id: 'demo-pack',
        configHash: 'config-hash',
        runtimeHash: 'runtime-hash',
        deviceId: 'sdk-device',
        externalId: 'known-user',
        sdkConfigured: true,
        sdkCredentialContextFingerprint: 'credential-context',
        sourceMode: 'bundled-asset',
      },
      sourceUrl: 'file:///android_asset/demo/index.html',
      sourceOverride: false,
    },
  })

  assert.deepEqual(evidence, {
    platform: 'android',
    id: 'demo-pack',
    configHash: 'config-hash',
    runtimeHash: 'runtime-hash',
    deviceId: 'sdk-device',
    externalId: 'known-user',
    sdkConfigured: true,
    sdkCredentialContextFingerprint: 'credential-context',
    sourceUrl: 'file:///android_asset/demo/index.html',
    sourceMode: 'bundled-asset',
    launcherInstanceId: 'launcher-top',
    executionId: 'execution-top',
    sourceOverride: false,
  })
})

test('Android SDK credential context fingerprint is safe stable and workspace-bound', () => {
  const { pack } = syntheticPackAndState()
  const runtime = { configHash: 'config-hash' }
  const fingerprint = androidSdkCredentialContextFingerprint(pack, runtime)
  assert.equal(fingerprint.length, 64)
  assert.equal(fingerprint, '68415ab515d35ffd6e8dd636764dcfdafdc9404b371a3d4c718f8c9993081b8a')
  assert.doesNotMatch(fingerprint, /test-sdk-key|sdk\.test\.invalid/)
  assert.equal(androidSdkCredentialContextFingerprint(pack, runtime), fingerprint)
  assert.notEqual(
    androidSdkCredentialContextFingerprint(
      { ...pack, secrets: { ...pack.secrets, 'braze.endpoint': 'sdk.other.invalid' } },
      runtime,
    ),
    fingerprint,
  )
  assert.equal(androidSdkCredentialContextFingerprint({ ...pack, secrets: {} }, runtime), '')
})

test('iOS SDK credential context fingerprint matches the native Swift contract', () => {
  const pack = {
    id: 'pack-a',
    secrets: {
      'braze.apiKey': 'sdk-selected',
      'braze.endpoint': 'endpoint-selected',
    },
  }
  assert.equal(
    iosSdkCredentialContextFingerprint(pack, { configHash: 'config-a' }),
    'a2c8eecc73793179d31d794c18702ec3e8e18eb8921368c3c2ef0c1a261f8e41',
  )
})

test('operator readiness requires selected-pack credentials and matching Android SDK context telemetry', () => {
  const { pack, state } = syntheticPackAndState()
  state.activeExternalId = 'known-default'
  const runtime = {
    id: pack.id,
    configHash: 'config-hash',
    runtimeHash: 'runtime-hash',
    expectedSources: { android: 'file:///android_asset/demo/index.html' },
  }
  const baseDevice = withLauncherObservation({
    platform: 'android',
    id: pack.id,
    configHash: runtime.configHash,
    runtimeHash: runtime.runtimeHash,
    sourceUrl: runtime.expectedSources.android,
    sourceOverride: false,
    deviceId: 'sdk-device',
    externalId: 'known-default',
  }, 'current-launcher')
  state.deviceRuntime = baseDevice

  let codes = operatorBaseBlockers(pack, runtime, state, 'current-launcher').map((blocker) => blocker.code)
  assert.ok(codes.includes('sdk_credential_context_missing'))

  state.deviceRuntime = {
    ...baseDevice,
    sdkConfigured: true,
    sdkCredentialContextFingerprint: 'wrong-context',
  }
  codes = operatorBaseBlockers(pack, runtime, state, 'current-launcher').map((blocker) => blocker.code)
  assert.ok(codes.includes('sdk_credential_context_mismatch'))

  state.deviceRuntime = {
    ...baseDevice,
    sdkConfigured: true,
    sdkCredentialContextFingerprint: androidSdkCredentialContextFingerprint(pack, runtime),
  }
  codes = operatorBaseBlockers(pack, runtime, state, 'current-launcher').map((blocker) => blocker.code)
  assert.equal(codes.includes('sdk_credential_context_missing'), false)
  assert.equal(codes.includes('sdk_credential_context_mismatch'), false)

  const packWithoutSdk = { ...pack, secrets: {} }
  codes = operatorBaseBlockers(packWithoutSdk, runtime, state, 'current-launcher').map((blocker) => blocker.code)
  assert.ok(codes.includes('sdk_credentials_missing'))
})

test('normalizes live-web source and correlation from nested command result sync', () => {
  const evidence = extractRuntimeTelemetry('android', {
    payload: { action: 'setWebSourceOverride' },
    result: {
      sourceUrl: 'http://10.0.2.2:5173',
      sourceMode: 'host-dev',
      sourceOverride: true,
      runtime: { id: 'demo-pack', runtimeHash: 'runtime-hash' },
      sync: { launcherInstanceId: 'nested-launcher', executionId: 'nested-execution' },
    },
  })

  assert.equal(evidence.sourceUrl, 'http://10.0.2.2:5173')
  assert.equal(evidence.sourceMode, 'host-dev')
  assert.equal(evidence.sourceOverride, true)
  assert.equal(evidence.launcherInstanceId, 'nested-launcher')
  assert.equal(evidence.executionId, 'nested-execution')
})

test('requires complete runtime evidence before promoting it to the current launcher', () => {
  const complete = {
    id: 'demo-pack',
    runtimeHash: 'runtime-hash',
    sourceUrl: 'file:///android_asset/demo/index.html',
    deviceId: 'sdk-device',
    externalId: 'known-user',
  }
  assert.equal(runtimeEvidenceIsComplete(complete), true)
  assert.equal(runtimeEvidenceIsComplete({ ...complete, sourceUrl: '' }), false)
  const observed = withLauncherObservation(complete, 'current-launcher', '2026-08-03T10:00:00.000Z')
  assert.equal(isCurrentLauncherEvidence(observed, 'current-launcher'), true)
  assert.equal(isCurrentLauncherEvidence(observed, 'old-launcher'), false)
})

test('operator readiness rejects persisted runtime evidence from a previous launcher', () => {
  const { pack, state } = syntheticPackAndState()
  state.activeExternalId = 'known-default'
  state.development = { liveWeb: { enabled: false, overrideMayBeActive: false, status: 'stopped' } }
  state.deviceRuntime = withLauncherObservation({
    platform: 'android',
    id: pack.id,
    configHash: 'config-hash',
    runtimeHash: 'runtime-hash',
    sourceUrl: 'file:///android_asset/demo/index.html',
    sourceOverride: false,
    deviceId: 'sdk-device',
    externalId: 'known-default',
  }, 'old-launcher')
  state.deviceSourceReadiness = withLauncherObservation({
    ...state.deviceRuntime,
    renderConfirmed: true,
  }, 'old-launcher')
  state.trustDiagnostics = {
    current: withLauncherObservation({
      platform: 'android', deviceId: 'sdk-device', externalId: 'known-default', ready: true, ts: new Date().toISOString(),
    }, 'old-launcher'),
  }
  const runtime = {
    id: pack.id,
    configHash: 'config-hash',
    runtimeHash: 'runtime-hash',
    expectedSources: { android: 'file:///android_asset/demo/index.html' },
  }
  const codes = operatorBaseBlockers(pack, runtime, state, 'current-launcher').map((blocker) => blocker.code)
  assert.ok(codes.includes('device_evidence_stale'))
  assert.ok(codes.includes('source_not_confirmed'))
  assert.ok(codes.includes('trust_not_ready'))
})

test('operator readiness requires current iOS runtime_ready render evidence', () => {
  const { pack, state } = syntheticPackAndState()
  state.activePlatform = 'ios'
  state.activeExternalId = 'known-default'
  state.deviceRuntime = withLauncherObservation({
    platform: 'ios',
    id: pack.id,
    configHash: 'config-hash',
    runtimeHash: 'runtime-hash',
    sourceUrl: 'http://localhost:5173',
    sourceOverride: false,
    deviceId: 'sdk-device',
    externalId: 'known-default',
  }, 'current-launcher')
  const runtime = {
    id: pack.id,
    configHash: 'config-hash',
    runtimeHash: 'runtime-hash',
    expectedSources: { ios: 'http://localhost:5173' },
  }
  let codes = operatorBaseBlockers(pack, runtime, state, 'current-launcher').map((item) => item.code)
  assert.ok(codes.includes('source_not_confirmed'))
  assert.ok(codes.includes('sdk_credential_context_missing'))

  state.deviceRuntime = {
    ...state.deviceRuntime,
    sdkConfigured: true,
    sdkCredentialContextFingerprint: 'wrong-context',
  }
  codes = operatorBaseBlockers(pack, runtime, state, 'current-launcher').map((item) => item.code)
  assert.ok(codes.includes('sdk_credential_context_mismatch'))

  state.deviceRuntime = {
    ...state.deviceRuntime,
    sdkCredentialContextFingerprint: iosSdkCredentialContextFingerprint(pack, runtime),
  }
  state.deviceSourceReadiness = withLauncherObservation({
    ...state.deviceRuntime,
    status: 'success',
    renderConfirmed: true,
  }, 'current-launcher')
  codes = operatorBaseBlockers(pack, runtime, state, 'current-launcher').map((item) => item.code)
  assert.equal(codes.includes('source_not_confirmed'), false)
  assert.equal(codes.includes('sdk_credential_context_missing'), false)
  assert.equal(codes.includes('sdk_credential_context_mismatch'), false)
})

test('extracts combined prepareRuntime push and trust readiness from the terminal result', () => {
  const body = {
    platform: 'android',
    type: 'demo_command',
    status: 'success',
    externalId: 'known-user',
    result: {
      runtime: { deviceId: 'sdk-device', externalId: 'known-user' },
      readiness: {
        ready: true,
        push: {
          ready: true,
          tokenPresent: true,
          permission: 'granted',
          notificationsEnabled: true,
          notificationChannelsSupported: true,
          channelImportance: 4,
          preferredChannelImportance: 4,
          sdkDeviceId: 'sdk-device',
          externalId: 'known-user',
        },
        trust: {
          ready: true,
          sdkDeviceId: 'sdk-device',
          externalId: 'known-user',
          checks: [{ name: 'media', ok: true }],
        },
      },
    },
  }
  const push = extractPushTelemetry('android', body)
  const trust = extractTrustTelemetry('android', body)
  assert.equal(push.ready, true)
  assert.equal(push.deviceId, 'sdk-device')
  assert.equal(trust.ready, true)
  assert.equal(trust.deviceId, 'sdk-device')
})

test('accepts only terminal command telemetry for operator completion', () => {
  assert.equal(terminalOperatorTelemetry({ type: 'change_user', status: 'success' }), null)
  assert.equal(terminalOperatorTelemetry({ type: 'demo_source_ready', status: 'success' }), null)
  assert.deepEqual(
    terminalOperatorTelemetry({ type: 'demo_command', status: 'success', result: { readiness: { ready: true } } }),
    { failed: false, severity: 'success' },
  )
  assert.equal(
    terminalOperatorTelemetry({
      type: 'demo_command', status: 'error', result: { runtime: { id: 'demo-pack' }, readiness: { ready: false } },
    }).failed,
    true,
  )
  assert.equal(
    terminalOperatorTelemetry({ type: 'demo_command', status: 'error', result: { error: 'command failed' } }).failed,
    true,
  )
})

test('Presenter sequence remains pending after one success and fails when a later child fails', () => {
  let nextId = 0
  let sequence = createOperatorExecutionSequence('parent-execution', 2, () => `child-${nextId += 1}`)
  assert.deepEqual(sequence.children.map((child) => child.executionId), ['child-1', 'child-2'])

  const first = aggregateOperatorSequenceResult(sequence, 'child-1', { failed: false })
  sequence = first.sequence
  assert.equal(first.matched, true)
  assert.equal(first.status, 'pending')
  assert.equal(sequence.completedResultCount, 1)
  assert.equal(sequence.failedResultCount, 0)

  const second = aggregateOperatorSequenceResult(sequence, 'child-2', { failed: true })
  assert.equal(second.status, 'failed')
  assert.equal(second.sequence.completedResultCount, 2)
  assert.equal(second.sequence.failedResultCount, 1)
})

test('Presenter sequence preserves the first failure summary when a later child succeeds', () => {
  let nextId = 0
  let sequence = createOperatorExecutionSequence('parent-execution', 2, () => `child-${nextId += 1}`)

  const failedFirst = aggregateOperatorSequenceResult(sequence, 'child-1', { failed: true })
  sequence = failedFirst.sequence
  const failureSummary = operatorSequenceResultSummary(sequence, { failed: true }, '', 'First command failed')
  assert.equal(failedFirst.status, 'failed')
  assert.equal(failureSummary, 'First command failed (1 of 2 results received).')

  const succeededLast = aggregateOperatorSequenceResult(sequence, 'child-2', { failed: false })
  const finalSummary = operatorSequenceResultSummary(succeededLast.sequence, { failed: false }, failureSummary)
  assert.equal(succeededLast.status, 'failed')
  assert.equal(succeededLast.sequence.completedResultCount, 2)
  assert.equal(succeededLast.sequence.failedResultCount, 1)
  assert.equal(finalSummary, failureSummary)
  assert.doesNotMatch(finalSummary, /confirmed/)
})

test('multi-command presets dispatch distinct child correlations under one launcher', () => {
  const commands = correlateDeviceCommands(
    [{ action: 'first' }, { action: 'second' }],
    {
      launcherInstanceId: 'launcher',
      executionId: 'parent',
      commandExecutionIds: ['child-1', 'child-2'],
    },
  )
  assert.deepEqual(commands, [
    { action: 'first', launcherInstanceId: 'launcher', executionId: 'child-1' },
    { action: 'second', launcherInstanceId: 'launcher', executionId: 'child-2' },
  ])
})

test('Presenter sequence reports success only after every distinct child succeeds', () => {
  let nextId = 0
  let sequence = createOperatorExecutionSequence('parent-execution', 3, () => `child-${nextId += 1}`)

  for (const childExecutionId of ['child-1', 'child-2']) {
    const result = aggregateOperatorSequenceResult(sequence, childExecutionId, { failed: false })
    sequence = result.sequence
    assert.equal(result.status, 'pending')
  }
  const duplicate = aggregateOperatorSequenceResult(sequence, 'child-2', { failed: false })
  assert.equal(duplicate.changed, false)
  assert.equal(duplicate.sequence.completedResultCount, 2)

  const terminal = aggregateOperatorSequenceResult(sequence, 'child-3', { failed: false })
  assert.equal(terminal.status, 'success')
  assert.equal(terminal.sequence.completedResultCount, 3)
  assert.equal(terminal.sequence.failedResultCount, 0)
})

test('source readiness requires the terminal render contract and preserves failures', () => {
  const base = {
    platform: 'android',
    type: 'demo_source_ready',
    launcherInstanceId: 'launcher',
    executionId: 'execution',
    result: {
      renderConfirmed: true,
      renderGeneration: 12,
      sourceUrl: 'http://10.0.2.2:5173',
      sourceOverride: true,
      runtime: {
        id: 'demo-pack',
        runtimeHash: 'runtime-hash',
        configHash: 'config-hash',
        deviceId: 'sdk-device',
        externalId: 'known-user',
      },
      sync: {
        protocol: 'braze-demo-sync/v1',
        runtimeId: 'demo-pack',
        configHash: 'config-hash',
        runtimeHash: 'runtime-hash',
      },
    },
  }
  const success = extractAndroidSourceReadiness('android', { ...base, status: 'success' })
  assert.equal(success.renderConfirmed, true)
  assert.equal(success.executionId, 'execution')
  assert.equal(success.renderGeneration, 12)
  assert.equal(success.syncIdentityValid, true)
  const failed = extractAndroidSourceReadiness('android', {
    ...base,
    status: 'error',
    result: { ...base.result, renderConfirmed: false, error: 'load failed' },
  })
  assert.equal(failed.renderConfirmed, false)
  assert.equal(failed.error, 'load failed')
  assert.equal(extractAndroidSourceReadiness('android', { ...base, type: 'demo_command' }), null)

  const staleWebBundle = extractAndroidSourceReadiness('android', {
    ...base,
    status: 'success',
    result: {
      ...base.result,
      sync: { ...base.result.sync, runtimeHash: 'stale-runtime' },
    },
  })
  assert.equal(staleWebBundle.renderConfirmed, false)
  assert.equal(staleWebBundle.status, 'error')
  assert.match(staleWebBundle.error, /sync identity/)
})

test('source readiness is bound to the issued launcher/execution/runtime/source and ignores late generations', () => {
  const expectation = {
    launcherInstanceId: 'launcher',
    executionId: 'execution-new',
    expectedPackId: 'demo-pack',
    expectedRuntimeHash: 'runtime-hash',
    expectedSource: 'file:///android_asset/demo/index.html',
    expectedOverride: false,
  }
  const current = {
    platform: 'android',
    launcherInstanceId: 'launcher',
    executionId: 'execution-new',
    id: 'demo-pack',
    runtimeHash: 'runtime-hash',
    sourceUrl: 'file:///android_asset/demo/index.html',
    sourceOverride: false,
    renderConfirmed: true,
    renderGeneration: 8,
  }
  assert.equal(androidSourceReadinessMatchesExpectation(current, expectation), true)
  assert.equal(androidSourceReadinessMatchesExpectation({ ...current, executionId: 'execution-old' }, expectation), false)
  assert.equal(androidSourceReadinessMatchesExpectation({ ...current, runtimeHash: 'old-runtime' }, expectation), false)
  assert.equal(androidSourceReadinessMatchesExpectation({ ...current, sourceUrl: 'http://10.0.2.2:5173' }, expectation), false)
  assert.equal(shouldReplaceAndroidSourceEvidence(current, { ...current, renderGeneration: 7 }), false)
  assert.equal(shouldReplaceAndroidSourceEvidence(current, { ...current, renderGeneration: 8, renderConfirmed: false }), false)
  assert.equal(shouldReplaceAndroidSourceEvidence(current, { ...current, renderGeneration: 9 }), true)
})

test('iOS render evidence is monotonic across generations and webReady sessions', () => {
  const newerFailure = {
    platform: 'ios',
    launcherInstanceId: 'launcher',
    id: 'demo-pack',
    configHash: 'config-hash',
    runtimeHash: 'runtime-hash',
    deviceId: 'sdk-device',
    sourceUrl: 'http://localhost:5173',
    renderConfirmed: false,
    status: 'error',
    renderGeneration: 9,
    syncIdentity: { sessionId: 'session-current', timestamp: 200 },
  }
  const delayedSuccess = {
    ...newerFailure,
    renderConfirmed: true,
    status: 'success',
    renderGeneration: 8,
    syncIdentity: { sessionId: 'session-old', timestamp: 100 },
  }
  assert.equal(shouldReplaceIosRenderEvidence(newerFailure, delayedSuccess), false)
  assert.equal(
    shouldReplaceIosRenderEvidence(newerFailure, {
      ...delayedSuccess,
      renderGeneration: 10,
      syncIdentity: { sessionId: 'session-old', timestamp: 100 },
    }),
    false,
  )
  assert.equal(
    shouldReplaceIosRenderEvidence(newerFailure, {
      ...newerFailure,
      renderConfirmed: true,
      status: 'success',
      renderGeneration: 10,
    }),
    true,
  )
  assert.equal(
    shouldReplaceIosRenderEvidence(newerFailure, {
      ...delayedSuccess,
      renderGeneration: 1,
      syncIdentity: { sessionId: 'session-new', timestamp: 300 },
    }),
    true,
  )

  const ready = { ...newerFailure, renderConfirmed: true, status: 'success' }
  assert.equal(
    shouldReplaceIosRenderEvidence(ready, { ...newerFailure, renderGeneration: 9 }),
    false,
  )
})

test('iOS readiness requires correlated runtime identity plus real runtime_ready render proof', () => {
  const body = {
    platform: 'ios',
    type: 'runtime_ready',
    status: 'success',
    payload: {
      sourceUrl: 'http://localhost:5173',
      sourceOverride: false,
      renderConfirmed: true,
      renderGeneration: 4,
      runtime: {
        id: 'demo-pack',
        configHash: 'config-hash',
        runtimeHash: 'runtime-hash',
        deviceId: 'sdk-device',
        externalId: 'known-user',
      },
      sync: {
        protocol: 'braze-demo-sync/v1',
        sessionId: 'web-session',
        runtimeId: 'demo-pack',
        configHash: 'config-hash',
        runtimeHash: 'runtime-hash',
        timestamp: 123456,
        launcherInstanceId: 'launcher',
        executionId: 'execution',
      },
    },
    result: { renderConfirmed: true },
  }
  const render = extractIosRenderReadiness('ios', body)
  const expectation = {
    launcherInstanceId: 'launcher',
    executionId: 'execution',
    expectedPackId: 'demo-pack',
    expectedRuntimeHash: 'runtime-hash',
    expectedExternalId: 'known-user',
    expectedSource: 'http://localhost:5173',
  }
  assert.equal(render.renderConfirmed, true)
  assert.equal(render.renderGeneration, 4)
  assert.equal(render.syncIdentityValid, true)
  assert.equal(render.syncIdentity.sessionId, 'web-session')
  assert.equal(render.syncIdentity.timestamp, 123456)
  assert.equal(iosRenderReadinessMatchesExpectation(render, expectation), true)
  assert.equal(iosRenderReadinessMatchesExpectation({ ...render, launcherInstanceId: 'launcher-old' }, expectation), false)
  assert.equal(iosRenderReadinessMatchesExpectation({ ...render, executionId: 'execution-old' }, expectation), false)
  assert.equal(iosRenderReadinessMatchesExpectation({ ...render, renderConfirmed: false }, expectation), false)
  assert.equal(iosRenderReadinessMatchesExpectation({ ...render, sourceUrl: 'http://localhost:5174' }, expectation), false)
  assert.equal(iosRuntimeEvidenceMatchesExpectation(render, expectation), true)
  assert.equal(iosRuntimeEvidenceMatchesExpectation({ ...render, executionId: 'late-execution' }, expectation), false)
  assert.equal(extractIosRenderReadiness('android', body), null)
  assert.equal(extractIosRenderReadiness('ios', { ...body, type: 'demo_command' }), null)

  const missingRuntimeHash = {
    ...body,
    payload: {
      ...body.payload,
      sync: { ...body.payload.sync, runtimeHash: '' },
    },
  }
  const rejected = extractIosRenderReadiness('ios', missingRuntimeHash)
  assert.equal(rejected.renderConfirmed, false)
  assert.equal(rejected.status, 'error')
})

test('render sync identity requires protocol and full deployment identity', () => {
  const body = {
    payload: {
      sync: {
        protocol: 'braze-demo-sync/v1',
        runtimeId: 'demo-pack',
        configHash: 'config-hash',
        runtimeHash: 'runtime-hash',
      },
    },
  }
  const sync = extractRenderSyncIdentity(body)
  const runtime = { id: 'demo-pack', configHash: 'config-hash', runtimeHash: 'runtime-hash' }
  assert.equal(renderSyncIdentityMatchesRuntime(sync, runtime), true)
  for (const field of ['protocol', 'runtimeId', 'configHash', 'runtimeHash']) {
    assert.equal(renderSyncIdentityMatchesRuntime({ ...sync, [field]: '' }, runtime), false)
  }
})

test('operator expected context requires every current snapshot dimension', () => {
  const current = {
    launcherInstanceId: 'launcher',
    snapshotVersion: 'snapshot',
    active: {
      pack: { id: 'demo-pack' },
      runtime: { configHash: 'config-hash', runtimeHash: 'runtime-hash' },
      platform: 'android',
      persona: { id: 'known-persona' },
    },
  }
  const expected = {
    launcherInstanceId: 'launcher',
    snapshotVersion: 'snapshot',
    packId: 'demo-pack',
    configHash: 'config-hash',
    runtimeHash: 'runtime-hash',
    platform: 'android',
    personaId: 'known-persona',
  }
  assert.equal(assertOperatorSnapshotContext(expected, current), current)
  assert.throws(() => assertOperatorSnapshotContext({ ...expected, runtimeHash: 'stale' }, current), /context is stale/)
})

function syntheticPackAndState() {
  const controls = Array.from({ length: 8 }, (_, index) => ({
    id: `control_${index + 1}`,
    label: `Control ${index + 1}`,
    type: 'sdk_event',
    payload: { name: `event_${index + 1}` },
  }))
  const pack = {
    id: 'demo-pack',
    name: 'Demo Pack',
    android: { defaultExternalId: 'known-default' },
    brand: { demoUser: { externalId: 'known-default', firstName: 'Default' } },
    secrets: {
      'braze.apiKey': 'test-sdk-key',
      'braze.endpoint': 'sdk.test.invalid',
    },
    launcher: {
      presets: [
        {
          id: 'known_second',
          label: 'Second persona',
          type: 'change_user',
          payload: { externalId: 'known-second', displayName: 'Second' },
        },
        ...controls,
      ],
    },
  }
  const state = {
    activePackId: pack.id,
    activePlatform: 'android',
    activeExternalId: 'unknown-custom-user',
    activeDisplayName: 'Do not expose me',
    customPresets: [],
    controlsByPack: {
      [pack.id]: {
        staged: [{
          id: 'staged_persona',
          label: 'Staged custom persona',
          type: 'change_user',
          payload: { externalId: 'staged-custom' },
        }],
        hidden: [],
        pinned: controls.map((control) => control.id),
        locked: [],
      },
    },
  }
  return { pack, state }
}

test('guided troubleshooting distinguishes messaging placement wiring from delivery proof', () => {
  const { pack, state } = syntheticPackAndState()
  pack.content = {
    contentCardSurfaces: [{ id: 'home-cards', placement: 'home_feed', screen: 'home' }],
    bannerSurfaces: [{ id: 'home-banner', placement: 'home_banner', screen: 'home' }],
  }
  state.activitySession = { id: 'session-a', startedAt: '2026-08-14T10:00:00.000Z' }
  state.ledger = [
    { id: 'iam', sessionId: 'session-a', type: 'sdk_event', payload: { name: 'demo_iam_trigger' } },
    { id: 'banner', sessionId: 'session-a', type: 'banners_updated', payload: { placements: ['home_banner'] } },
    { id: 'cards', sessionId: 'session-a', type: 'content_cards', payload: { count: 2 } },
  ]
  const cards = guidedTroubleshootingCards(pack, {
    id: pack.id,
    configHash: 'config-hash',
    runtimeHash: 'runtime-hash',
    expectedSources: { android: 'file:///android_asset/demo/index.html' },
  }, state, 'test-launcher')
  assert.equal(cards.find((card) => card.id === 'content_cards')?.level, 'success')
  assert.equal(cards.find((card) => card.id === 'banners')?.level, 'success')
  assert.equal(cards.find((card) => card.id === 'iam')?.level, 'warning')
  assert.match(cards.find((card) => card.id === 'iam')?.observation || '', /cannot treat that event alone as visual display proof/)
})

test('Presenter Remote exposes only pack-known personas and no raw custom user', () => {
  const { pack, state } = syntheticPackAndState()
  const personas = operatorPersonas(pack, state)
  assert.deepEqual(personas.map((persona) => persona.externalId), ['known-default', 'known-second'])
  const active = activeOperatorPersona(pack, state, personas)
  assert.equal(active.label, 'Unapproved active user')
  assert.equal(active.approved, false)
  assert.doesNotMatch(JSON.stringify(active), /unknown-custom-user|Do not expose me/)
})

test('server allow-list is exactly the first seven visible pinned controls', () => {
  const { pack, state } = syntheticPackAndState()
  const selected = presenterControlPresets(pack, state)
  assert.deepEqual(selected.map((control) => control.id), Array.from({ length: 7 }, (_, index) => `control_${index + 1}`))
  assert.equal(selected.some((control) => control.id === 'control_8'), false)
})

test('live-web hazard remains fail-closed after an error or orphaned native override', () => {
  const clean = liveWebHazard({
    deviceRuntime: { platform: 'android', sourceOverride: false },
    development: { liveWeb: { enabled: false, overrideMayBeActive: false, status: 'stopped' } },
  })
  assert.equal(clean.mayBeActive, false)
  const uncertain = liveWebHazard({
    deviceRuntime: { platform: 'android', sourceOverride: true },
    development: { liveWeb: { enabled: false, overrideMayBeActive: true, status: 'error' } },
  })
  assert.equal(uncertain.mayBeActive, true)
  assert.equal(uncertain.uncertain, true)
})

test('stopping the host server preserves native override uncertainty until bundled proof', () => {
  const active = {
    enabled: true,
    overrideMayBeActive: true,
    status: 'active',
    pid: 123,
    ownerInstanceId: 'launcher-old',
    error: '',
  }
  const stopped = liveWebStateAfterHostStop(active, { hazardMayBeActive: true })
  assert.equal(stopped.enabled, false)
  assert.equal(stopped.overrideMayBeActive, true)
  assert.equal(stopped.status, 'error')
  assert.equal(stopped.ownerInstanceId, '')
  assert.match(stopped.error, /bundled-source proof/)
  assert.equal(liveWebHazard({ development: { liveWeb: stopped } }).mayBeActive, true)

  const cleared = liveWebStateAfterHostStop(active, {
    hazardMayBeActive: true,
    bundledSourceConfirmed: true,
  })
  assert.equal(cleared.enabled, false)
  assert.equal(cleared.overrideMayBeActive, false)
  assert.equal(cleared.status, 'stopped')
  assert.equal(cleared.error, '')
})

test('runtime selection rejects generated identity drift in config or active assets', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumo-runtime-selection-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const assets = path.join(directory, 'assets')
  fs.mkdirSync(assets)
  fs.writeFileSync(path.join(assets, 'hero.txt'), 'hero-v1')
  const pack = {
    directory,
    id: 'demo-pack',
    name: 'Demo Pack',
    description: 'Current story',
    brand: { demoUser: { externalId: 'known-user' } },
    content: { screens: [] },
    android: { defaultExternalId: 'known-user' },
  }
  const generated = createRuntimeManifest(pack, { generatedAt: 'stable-applied-time' })
  const sameIdentity = createRuntimeManifest(pack, { generatedAt: 'computed-now' })
  assert.equal(selectFreshRuntimeManifest(generated, sameIdentity), generated)

  const configDrift = createRuntimeManifest(
    { ...pack, description: 'Changed story' },
    { generatedAt: 'computed-after-config-change' },
  )
  assert.notEqual(configDrift.configHash, generated.configHash)
  assert.equal(selectFreshRuntimeManifest(generated, configDrift), configDrift)

  fs.writeFileSync(path.join(assets, 'hero.txt'), 'hero-v2')
  const assetDrift = createRuntimeManifest(pack, { generatedAt: 'computed-after-asset-change' })
  assert.equal(assetDrift.configHash, generated.configHash)
  assert.notEqual(assetDrift.runtimeHash, generated.runtimeHash)
  assert.equal(selectFreshRuntimeManifest(generated, assetDrift), assetDrift)

  assert.equal(selectFreshRuntimeManifest({ ...generated, id: 'other-pack' }, assetDrift), assetDrift)
})

test('idempotency keys are bound to the selected control variant and active context', () => {
  const execution = {
    controlId: 'control_1',
    variantId: 'variant_a',
    packId: 'demo-pack',
    runtimeHash: 'runtime-hash',
    platform: 'android',
    personaId: 'known_second',
  }
  assert.equal(operatorRequestMatches(execution, 'control_1', 'variant_a'), true)
  assert.equal(operatorRequestMatches(execution, 'control_1', 'variant_b'), false)
  assert.equal(operatorExecutionMatchesContext(execution, {
    packId: 'demo-pack', runtimeHash: 'runtime-hash', platform: 'android', personaId: 'known_second',
  }), true)
  assert.equal(operatorExecutionMatchesContext(execution, {
    packId: 'other-pack', runtimeHash: 'runtime-hash', platform: 'android', personaId: 'known_second',
  }), false)
})

test('server latest execution uses immutable creation order instead of late update time', () => {
  const context = {
    packId: 'demo-pack', runtimeHash: 'runtime-hash', platform: 'android', personaId: 'known_second',
  }
  const executionA = {
    ...context,
    executionId: 'execution-a',
    createdOrder: 1,
    createdAt: '2026-08-10T10:00:00.000Z',
    updatedAt: '2026-08-10T10:00:03.000Z',
  }
  const executionB = {
    ...context,
    executionId: 'execution-b',
    createdOrder: 2,
    createdAt: '2026-08-10T10:00:01.000Z',
    updatedAt: '2026-08-10T10:00:02.000Z',
  }
  assert.equal(selectLatestOperatorExecution([executionA, executionB], context)?.executionId, 'execution-b')
  assert.equal(selectLatestOperatorExecution([executionB, { ...executionA, updatedAt: '2026-08-10T10:00:04.000Z' }], context)?.executionId, 'execution-b')
})

test('launcher authority lock rejects a live second owner and recovers stale state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'braze-demo-authority-'))
  const lockPath = path.join(root, 'owner.lock')
  const serverPath = path.join(root, 'server.json')
  const alive = (pid) => Number(pid) === 101
  let first = null
  let recovered = null
  try {
    first = acquireAuthorityLock({ lockPath, legacyServerInfoPath: serverPath, instanceId: 'first', pid: 101, isAlive: alive })
    assert.throws(
      () => acquireAuthorityLock({ lockPath, legacyServerInfoPath: serverPath, instanceId: 'second', pid: 202, isAlive: alive }),
      /already owns demo state/,
    )
    releaseAuthorityLock(first)
    first = null
    fs.writeFileSync(lockPath, JSON.stringify({ instanceId: 'stale', pid: 999 }))
    recovered = acquireAuthorityLock({ lockPath, legacyServerInfoPath: serverPath, instanceId: 'recovered', pid: 202, isAlive: alive })
    assert.equal(JSON.parse(fs.readFileSync(lockPath, 'utf8')).instanceId, 'recovered')
    releaseAuthorityLock(recovered)
    recovered = null
    fs.writeFileSync(serverPath, JSON.stringify({ instanceId: 'legacy-live', pid: 101, port: 4177 }))
    assert.throws(
      () => acquireAuthorityLock({ lockPath, legacyServerInfoPath: serverPath, instanceId: 'third', pid: 303, isAlive: alive }),
      /already active/,
    )
  } finally {
    if (first) releaseAuthorityLock(first)
    if (recovered) releaseAuthorityLock(recovered)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('concurrent stale authority reclamation has one winner and never removes its live lock', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'braze-demo-authority-race-'))
  const lockPath = path.join(root, 'owner.lock')
  const serverPath = path.join(root, 'server.json')
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const launcherModuleUrl = new URL('./demo-launcher.mjs', import.meta.url).href
  const workerSource = String.raw`
    const { parentPort, workerData } = require('node:worker_threads')

    ;(async () => {
      const { acquireAuthorityLock, releaseAuthorityLock } = await import(workerData.launcherModuleUrl)
      const contendersAtStaleOwner = new Int32Array(workerData.barrier)
      const isAlive = (pid) => {
        if (Number(pid) !== 999999) return true
        Atomics.add(contendersAtStaleOwner, 0, 1)
        Atomics.notify(contendersAtStaleOwner, 0)
        while (Atomics.load(contendersAtStaleOwner, 0) < 2) {
          Atomics.wait(contendersAtStaleOwner, 0, 1_000)
        }
        return false
      }
      let handle = null
      try {
        handle = acquireAuthorityLock({
          lockPath: workerData.lockPath,
          legacyServerInfoPath: workerData.serverPath,
          instanceId: workerData.instanceId,
          pid: workerData.pid,
          isAlive,
        })
        parentPort.postMessage({ status: 'acquired', instanceId: workerData.instanceId })
        await new Promise((resolve) => parentPort.once('message', resolve))
      } catch (error) {
        parentPort.postMessage({
          status: 'rejected',
          instanceId: workerData.instanceId,
          statusCode: error.statusCode || 0,
          message: error.message || String(error),
        })
      } finally {
        if (handle) releaseAuthorityLock(handle)
      }
    })().catch((error) => {
      parentPort.postMessage({ status: 'crashed', message: error.stack || String(error) })
    })
  `

  const workers = []
  const workerExits = []
  try {
    fs.writeFileSync(lockPath, JSON.stringify({
      schemaVersion: 1,
      instanceId: 'stale-owner',
      pid: 999999,
    }))
    for (const [index, instanceId] of ['contender-a', 'contender-b'].entries()) {
      const worker = new Worker(workerSource, {
        eval: true,
        workerData: {
          launcherModuleUrl,
          lockPath,
          serverPath,
          instanceId,
          pid: 1100 + index,
          barrier,
        },
      })
      workers.push(worker)
      workerExits.push(new Promise((resolve, reject) => {
        worker.once('exit', resolve)
        worker.once('error', reject)
      }))
    }

    const results = await Promise.all(workers.map((worker) => new Promise((resolve, reject) => {
      worker.once('message', resolve)
      worker.once('error', reject)
    })))
    const winners = results.filter((result) => result.status === 'acquired')
    const rejected = results.filter((result) => result.status === 'rejected')
    assert.equal(winners.length, 1, JSON.stringify(results))
    assert.equal(rejected.length, 1, JSON.stringify(results))
    assert.equal(rejected[0].statusCode, 409)
    assert.match(
      rejected[0].message,
      /already owns demo state|reclamation is already in progress|changed during stale-lock reclamation/,
    )
    assert.equal(JSON.parse(fs.readFileSync(lockPath, 'utf8')).instanceId, winners[0].instanceId)

    workers[results.findIndex((result) => result.status === 'acquired')].postMessage('release')
    await Promise.all(workerExits)
    assert.equal(fs.existsSync(lockPath), false)
    assert.equal(fs.existsSync(`${lockPath}.reclaim`), false)
    assert.deepEqual(
      fs.readdirSync(root).filter((entry) => entry.includes('.stale.')),
      [],
    )
  } finally {
    for (const worker of workers) {
      try { await worker.terminate() } catch {}
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('launcher-owned child singleton reuses one watcher and stops it before replacement or shutdown', async () => {
  let nextPid = 1000
  const children = []
  class FakeChild extends EventEmitter {
    constructor() {
      super()
      this.pid = nextPid += 1
      this.exitCode = null
      this.signals = []
    }

    kill(signal) {
      this.signals.push(signal)
      if (this.exitCode === null) {
        this.exitCode = signal === 'SIGKILL' ? 137 : 0
        queueMicrotask(() => this.emit('exit', this.exitCode, signal))
      }
      return true
    }
  }
  const singleton = createOwnedChildSingleton({ startupDelayMs: 0, stopTimeoutMs: 20 })
  const spawnChild = () => {
    const child = new FakeChild()
    children.push(child)
    return child
  }

  const first = await singleton.ensure('emulator-one', spawnChild)
  const reused = await singleton.ensure('emulator-one', spawnChild)
  assert.equal(first.reused, false)
  assert.equal(reused.reused, true)
  assert.equal(reused.child.pid, first.child.pid)
  assert.equal(children.length, 1)

  const replacement = await singleton.ensure('emulator-two', spawnChild)
  assert.equal(replacement.reused, false)
  assert.equal(children.length, 2)
  assert.deepEqual(children[0].signals, ['SIGTERM'])
  assert.deepEqual(singleton.status(), { key: 'emulator-two', pid: children[1].pid, running: true })

  await singleton.stop()
  assert.deepEqual(children[1].signals, ['SIGTERM'])
  assert.deepEqual(singleton.status(), { key: '', pid: null, running: false })
})

test('design assets reject sibling-prefix traversal', () => {
  const root = path.join(os.tmpdir(), 'design-root')
  assert.equal(pathIsWithinRoot(root, path.join(root, 'icons/icon.svg')), true)
  assert.equal(pathIsWithinRoot(root, `${root}-sibling/secret.svg`), false)
  assert.equal(pathIsWithinRoot(root, path.join(root, '..', 'outside.svg')), false)
})

test('web build hashing ignores local tooling churn but includes source changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'braze-demo-web-hash-'))
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.mkdirSync(path.join(root, 'node_modules/pkg'), { recursive: true })
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src/app.tsx'), 'export const value = 1\n')
    fs.writeFileSync(path.join(root, 'node_modules/pkg/index.js'), 'dependency churn\n')
    fs.writeFileSync(path.join(root, 'dist/index.html'), 'build churn\n')
    fs.writeFileSync(path.join(root, '.DS_Store'), 'finder churn\n')
    fs.writeFileSync(path.join(root, 'tsconfig.tsbuildinfo'), 'typescript churn\n')
    const pack = { id: 'demo-pack', runtimeManifest: { runtimeHash: 'runtime-hash' } }
    const build = { cwd: root, command: 'npm', args: ['run', 'build'] }
    const initial = webBuildInputHash(pack, build)

    fs.writeFileSync(path.join(root, '.DS_Store'), 'different finder churn\n')
    fs.writeFileSync(path.join(root, 'tsconfig.tsbuildinfo'), 'different typescript churn\n')
    fs.writeFileSync(path.join(root, 'node_modules/pkg/index.js'), 'different dependency churn\n')
    fs.writeFileSync(path.join(root, 'dist/index.html'), 'different build churn\n')
    assert.equal(webBuildInputHash(pack, build), initial)

    fs.writeFileSync(path.join(root, 'src/app.tsx'), 'export const value = 2\n')
    assert.notEqual(webBuildInputHash(pack, build), initial)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('Control Room renders Diagnostics-only live-web controls with parseable client JavaScript', () => {
  const html = launcherHtml()
  assert.match(html, /Android Live Web · DEV OVERRIDE/)
  assert.match(html, /\/api\/development\/live-web\/start/)
  assert.match(html, /\/api\/development\/live-web\/stop/)
  assert.match(html, /Unavailable for iOS/)
  assert.match(html, /<details class="panel span-4 row-span-2 story-controls-fallback">/)
  assert.doesNotMatch(html, /<details class="panel span-4 row-span-2 story-controls-fallback" open>/)
  assert.match(html, /Story Controls · Control Room fallback/)
  assert.match(html, /timeGuard: state\.data\.development/)
  assert.match(html, /Pack Manager/)
  assert.match(html, /\/api\/pack-manager\/new/)
  assert.match(html, /\/api\/pack-manager\/duplicate/)
  assert.match(html, /\/api\/pack-manager\/validate/)
  assert.match(html, /\/api\/diagnostics\/bundle/)
  assert.match(html, /\/api\/activity\/archive/)
  assert.match(html, /\/api\/activity\/clear/)
  assert.match(html, /Agent hint:/)
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  const inline = scripts.map((match) => match[1]).find((source) => source.trim())
  assert.ok(inline, 'expected an inline Control Room client script')
  assert.doesNotThrow(() => new Function(inline))
})
