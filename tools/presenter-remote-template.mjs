export const PRESENTER_REMOTE_API_CONTRACT = Object.freeze({
  version: 'operator/v1',
  pairPath: '/api/operator/v1/pair',
  snapshotPath: '/api/operator/v1/snapshot',
  eventsPath: '/api/operator/v1/events',
  controlExecutionPath: '/api/operator/v1/controls/:id/executions',
  personaApplyPath: '/api/operator/v1/personas/:id/apply',
})

const DEFAULT_TITLE = 'Braze Demo Presenter'
const MIN_CONTROL_COUNT = 1
const MAX_CONTROL_COUNT = 7

export function escapePresenterHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character])
}

function normalizedLocalPath(value, fallback, label) {
  const candidate = String(value || fallback).trim().replace(/\/+$/, '')
  if (!candidate.startsWith('/') || candidate.startsWith('//') || /[\\<>\u0000-\u001f]/.test(candidate)) {
    throw new TypeError(`${label} must be a same-origin absolute path.`)
  }
  return candidate
}

function safeInlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Decide whether a correlated execution may replace the execution currently
 * shown by Presenter Remote. Server creation order is immutable, so a late
 * update for an older request cannot win merely because its updatedAt changed.
 * A locally initiated request has order 0 until the server acknowledges it;
 * during that interval only an acknowledgement for that request may replace it.
 */
export function presenterExecutionCandidateWins(current, candidate, currentRequestId = '') {
  if (!candidate) return false
  if (!current) return !currentRequestId || candidate.requestId === currentRequestId
  if (candidate.executionId && candidate.executionId === current.executionId) return true
  if (candidate.requestId && candidate.requestId === current.requestId) return true

  const currentOrder = Number.isSafeInteger(Number(current.createdOrder)) && Number(current.createdOrder) > 0
    ? Number(current.createdOrder)
    : 0
  const candidateOrder = Number.isSafeInteger(Number(candidate.createdOrder)) && Number(candidate.createdOrder) > 0
    ? Number(candidate.createdOrder)
    : 0
  if (currentRequestId && current.requestId === currentRequestId && currentOrder === 0) {
    return candidate.requestId === currentRequestId
  }
  return candidateOrder > currentOrder
}

/**
 * Render the standalone, same-origin Presenter Remote.
 *
 * The launcher owns all authorization, readiness, context validation, SDK/REST
 * execution, and response sanitization. This client intentionally understands
 * only the narrow operator/v1 view model documented by the exported contract.
 */
export function presenterRemoteHtml(options = {}) {
  const title = String(options.title || DEFAULT_TITLE).trim() || DEFAULT_TITLE
  const apiBasePath = normalizedLocalPath(options.apiBasePath, '/api/operator/v1', 'apiBasePath')
  const designHref = normalizedLocalPath(options.designHref, '/design/colors_and_type.css', 'designHref')
  const requestedCount = Number(options.maxControls)
  const maxControls = Number.isFinite(requestedCount)
    ? Math.min(MAX_CONTROL_COUNT, Math.max(MIN_CONTROL_COUNT, Math.floor(requestedCount)))
    : MAX_CONTROL_COUNT
  const clientConfig = safeInlineJson({
    apiVersion: PRESENTER_REMOTE_API_CONTRACT.version,
    apiBasePath,
    maxControls,
  })

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="light" />
  <title>${escapePresenterHtml(title)}</title>
  <link rel="stylesheet" href="${escapePresenterHtml(designHref)}" />
  <style>
    :root {
      color-scheme: light;
      --remote-bg: #f4f0fa;
      --remote-surface: rgba(255, 255, 255, 0.96);
      --remote-surface-soft: #faf8fd;
      --remote-text: #18121f;
      --remote-muted: #6b6375;
      --remote-line: #ded6e8;
      --remote-line-strong: #c9bcda;
      --remote-brand: #801ed7;
      --remote-brand-dark: #300266;
      --remote-success: #08766c;
      --remote-success-soft: #dcf7f0;
      --remote-warning: #8b4800;
      --remote-warning-soft: #fff0dc;
      --remote-danger: #bd321e;
      --remote-danger-soft: #ffe7e2;
      --remote-shadow: 0 18px 52px rgba(48, 2, 102, 0.13);
      --remote-font: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html, body { min-width: 320px; min-height: 100%; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at 12% -8%, rgba(255, 180, 218, 0.55), transparent 34%),
        radial-gradient(circle at 100% 8%, rgba(177, 162, 255, 0.5), transparent 38%),
        var(--remote-bg);
      color: var(--remote-text);
      font-family: var(--font-body, var(--remote-font));
      letter-spacing: 0;
    }
    button, select { font: inherit; letter-spacing: 0; }
    button { cursor: pointer; }
    button:focus-visible, select:focus-visible {
      outline: 3px solid rgba(128, 30, 215, 0.3);
      outline-offset: 2px;
    }
    .app {
      width: min(100%, 480px);
      min-height: 100vh;
      margin: 0 auto;
      padding: 14px 14px calc(18px + env(safe-area-inset-bottom));
      display: grid;
      align-content: start;
      gap: 11px;
    }
    .top-card {
      overflow: hidden;
      border-radius: 18px;
      background: var(--remote-brand-dark);
      color: #fff;
      box-shadow: var(--remote-shadow);
    }
    .top-main {
      padding: 16px 16px 14px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .eyebrow {
      margin: 0 0 5px;
      color: rgba(255, 255, 255, 0.66);
      font-size: 10px;
      font-weight: 850;
      line-height: 1;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    h1 { margin: 0; font-size: 20px; line-height: 1.1; letter-spacing: -0.02em; }
    .density-toggle {
      flex: 0 0 auto;
      min-height: 30px;
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 999px;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      font-size: 11px;
      font-weight: 800;
    }
    .status-band {
      min-height: 48px;
      padding: 11px 16px;
      display: grid;
      grid-template-columns: 11px minmax(0, 1fr);
      align-items: start;
      gap: 10px;
      background: rgba(255, 255, 255, 0.1);
      border-top: 1px solid rgba(255, 255, 255, 0.12);
    }
    .status-band.ready { background: rgba(14, 166, 146, 0.2); }
    .status-band.blocked, .status-band.stale { background: rgba(255, 123, 82, 0.18); }
    .status-dot {
      width: 10px;
      height: 10px;
      margin-top: 3px;
      border-radius: 50%;
      background: #cbbfda;
      box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.08);
    }
    .status-band.ready .status-dot { background: #65e3d1; }
    .status-band.blocked .status-dot, .status-band.stale .status-dot { background: #ff9c78; }
    .status-copy { min-width: 0; }
    .status-copy strong { display: block; font-size: 13px; line-height: 1.2; }
    .status-copy span {
      display: block;
      margin-top: 3px;
      color: rgba(255, 255, 255, 0.72);
      font-size: 11px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .card {
      min-width: 0;
      border: 1px solid rgba(48, 2, 102, 0.12);
      border-radius: 14px;
      background: var(--remote-surface);
      box-shadow: 0 10px 30px rgba(48, 2, 102, 0.07);
      padding: 14px;
    }
    .card-title {
      margin: 0 0 10px;
      color: var(--remote-muted);
      font-size: 10px;
      font-weight: 850;
      line-height: 1;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .context-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
    .context-item { min-width: 0; }
    .context-item span {
      display: block;
      margin-bottom: 3px;
      color: var(--remote-muted);
      font-size: 10px;
      font-weight: 750;
      line-height: 1.1;
    }
    .context-item strong {
      display: block;
      min-width: 0;
      font-size: 12px;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .form-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    select {
      width: 100%;
      min-width: 0;
      min-height: 40px;
      border: 1px solid var(--remote-line-strong);
      border-radius: 10px;
      background: #fff;
      color: var(--remote-text);
      padding: 8px 10px;
      font-size: 13px;
    }
    button.primary, button.run {
      border: 0;
      border-radius: 10px;
      background: var(--remote-brand);
      color: #fff;
      font-weight: 850;
    }
    button.primary { min-height: 40px; padding: 9px 13px; font-size: 12px; }
    button.run { min-height: 38px; padding: 9px 14px; font-size: 12px; }
    button:disabled, select:disabled { cursor: not-allowed; opacity: 0.46; }
    .blockers { display: grid; gap: 6px; margin-top: 10px; }
    .blocker {
      border-radius: 9px;
      background: var(--remote-danger-soft);
      color: #712216;
      padding: 8px 9px;
      font-size: 11px;
      line-height: 1.35;
    }
    .controls { display: grid; gap: 9px; }
    .control {
      min-width: 0;
      border: 1px solid var(--remote-line);
      border-radius: 12px;
      background: var(--remote-surface-soft);
      padding: 11px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
    }
    .control-copy { min-width: 0; }
    .control-copy strong { display: block; font-size: 13px; line-height: 1.25; }
    .control-copy p {
      margin: 4px 0 0;
      color: var(--remote-muted);
      font-size: 11px;
      line-height: 1.35;
    }
    .control-actions { display: grid; justify-items: end; gap: 6px; }
    .variant { min-width: 116px; max-width: 152px; min-height: 34px; padding: 6px 8px; font-size: 11px; }
    .variant-label {
      max-width: 152px;
      color: var(--remote-muted);
      font-size: 10px;
      font-weight: 750;
      line-height: 1.2;
      text-align: right;
    }
    .empty {
      border: 1px dashed var(--remote-line-strong);
      border-radius: 11px;
      padding: 15px;
      color: var(--remote-muted);
      font-size: 12px;
      line-height: 1.4;
      text-align: center;
    }
    .execution {
      min-height: 64px;
      border-left: 4px solid var(--remote-line-strong);
      padding-left: 11px;
    }
    .execution.success { border-left-color: var(--remote-success); }
    .execution.pending { border-left-color: var(--remote-warning); }
    .execution.failed { border-left-color: var(--remote-danger); }
    .execution-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .execution strong { min-width: 0; font-size: 13px; line-height: 1.25; }
    .execution-status {
      flex: 0 0 auto;
      border-radius: 999px;
      padding: 4px 7px;
      background: #eee9f4;
      color: #4a4057;
      font-size: 9px;
      font-weight: 900;
      line-height: 1;
      text-transform: uppercase;
    }
    .execution.success .execution-status { background: var(--remote-success-soft); color: var(--remote-success); }
    .execution.pending .execution-status { background: var(--remote-warning-soft); color: var(--remote-warning); }
    .execution.failed .execution-status { background: var(--remote-danger-soft); color: var(--remote-danger); }
    .execution p { margin: 5px 0 0; color: var(--remote-muted); font-size: 11px; line-height: 1.35; }
    .execution-meta { overflow-wrap: anywhere; }
    .footer {
      padding: 2px 4px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: var(--remote-muted);
      font-size: 10px;
      line-height: 1.25;
    }
    .footer button {
      border: 0;
      padding: 3px 0;
      background: transparent;
      color: var(--remote-brand-dark);
      font-size: 10px;
      font-weight: 850;
    }
    .is-compact .context-card, .is-compact .blockers, .is-compact .control-copy p, .is-compact .variant-label { display: none; }
    .is-compact .card { padding: 11px; }
    .is-compact .controls { gap: 7px; }
    .is-compact .control { padding: 9px 10px; }
    .is-compact .top-main { padding: 12px 14px 11px; }
    .is-compact .status-band { min-height: 43px; padding: 9px 14px; }
    @media (max-width: 370px) {
      .app { padding-left: 9px; padding-right: 9px; }
      .control { grid-template-columns: 1fr; }
      .control-actions { grid-template-columns: minmax(0, 1fr) auto; justify-items: stretch; width: 100%; }
      .variant, .variant-label { min-width: 0; max-width: none; }
    }
    @media (prefers-reduced-motion: no-preference) {
      .status-dot { transition: background-color 160ms ease; }
      button:not(:disabled) { transition: transform 120ms ease, filter 120ms ease; }
      button:not(:disabled):active { transform: translateY(1px); }
    }
  </style>
</head>
<body>
  <main class="app" id="app">
    <header class="top-card">
      <div class="top-main">
        <div>
          <p class="eyebrow">Operator view</p>
          <h1>${escapePresenterHtml(title)}</h1>
        </div>
        <button class="density-toggle" id="densityToggle" type="button" aria-pressed="false">Compact</button>
      </div>
      <div class="status-band stale" id="statusBand" role="status" aria-live="polite">
        <span class="status-dot" aria-hidden="true"></span>
        <div class="status-copy">
          <strong id="statusTitle">Connecting</strong>
          <span id="statusDetail">Actions stay disabled until a fresh launcher snapshot is connected.</span>
        </div>
      </div>
    </header>

    <section class="card context-card" aria-labelledby="contextTitle">
      <h2 class="card-title" id="contextTitle">Live context</h2>
      <div class="context-grid">
        <div class="context-item"><span>Pack</span><strong id="packValue">—</strong></div>
        <div class="context-item"><span>Platform</span><strong id="platformValue">—</strong></div>
        <div class="context-item"><span>Runtime hash</span><strong id="hashValue">—</strong></div>
        <div class="context-item"><span>Persona</span><strong id="personaValue">—</strong></div>
      </div>
      <div class="blockers" id="blockers" aria-live="polite"></div>
    </section>

    <section class="card" aria-labelledby="personaTitle">
      <h2 class="card-title" id="personaTitle">Persona</h2>
      <div class="form-row">
        <select id="personaSelect" aria-label="Named demo persona" disabled>
          <option value="">Waiting for launcher</option>
        </select>
        <button class="primary" id="applyPersona" type="button" disabled>Apply</button>
      </div>
    </section>

    <section class="card" aria-labelledby="controlsTitle">
      <h2 class="card-title" id="controlsTitle">Story controls</h2>
      <div class="controls" id="controls">
        <div class="empty">Waiting for a fresh operator snapshot.</div>
      </div>
    </section>

    <section class="card" aria-labelledby="executionTitle">
      <h2 class="card-title" id="executionTitle">Latest execution</h2>
      <div class="execution" id="execution" aria-live="polite">
        <div class="execution-head"><strong>No action yet</strong><span class="execution-status">Idle</span></div>
        <p>Run an approved story control to see its correlated result.</p>
      </div>
    </section>

    <footer class="footer">
      <span id="connectionNote">operator/v1 · connecting</span>
      <button id="recoverButton" type="button">Refresh snapshot</button>
    </footer>
  </main>

  <script>
    (function () {
      'use strict'

      const CONFIG = ${clientConfig}
      const STORAGE_KEY = 'braze-presenter-remote/v1'
      const DEFAULT_STALE_AFTER_MS = 12000
      const MIN_STALE_AFTER_MS = 3000
      const MAX_STALE_AFTER_MS = 60000
      const SUCCESS_STATES = new Set(['success', 'executed', 'received', 'complete', 'completed'])
      const PENDING_STATES = new Set(['queued', 'pending', 'running', 'accepted'])
      const FAILURE_STATES = new Set(['failed', 'error', 'blocked', 'rejected'])
      const state = {
        snapshot: null,
        connection: 'connecting',
        eventSource: null,
        reconnectTimer: null,
        reconnectAttempt: 0,
        refreshPromise: null,
        busy: false,
        density: 'full',
        variants: new Map(),
        localExecution: null,
        currentRequestId: '',
        lastSignalAt: 0,
        lastError: '',
        pairingToken: '',
      }

      const element = (id) => document.getElementById(id)
      const asText = (value, fallback) => {
        const text = String(value == null ? '' : value).trim()
        return text || (fallback || '')
      }
      const boundedText = (value, fallback, maxLength) => asText(value, fallback).replace(/\\s+/g, ' ').slice(0, maxLength || 180)
      const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      const asList = (value) => Array.isArray(value) ? value : []
      const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))
      const boundedCount = (value) => {
        const count = Number(value)
        return Number.isFinite(count) ? clamp(Math.trunc(count), 0, 100) : 0
      }
      const boundedOrder = (value) => {
        const order = Number(value)
        return Number.isSafeInteger(order) && order > 0 ? order : 0
      }
      const sameVersion = (left, right) => String(left == null ? '' : left) === String(right == null ? '' : right)
      const shortId = (value) => {
        const text = asText(value, '')
        if (!text) return '—'
        return text.length > 14 ? text.slice(0, 7) + '…' + text.slice(-5) : text
      }
      const nowIso = () => new Date().toISOString()
      const requestId = () => {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID()
        return 'operator-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
      }

      ${presenterExecutionCandidateWins.toString()}

      function normalizePersona(value) {
        const persona = asObject(value)
        return {
          id: boundedText(persona.id, '', 120),
          label: boundedText(persona.label || persona.name, 'Unnamed persona', 80),
          description: boundedText(persona.description, '', 140),
        }
      }

      function normalizeVariant(value) {
        const variant = asObject(value)
        return {
          id: boundedText(variant.id, '', 120),
          label: boundedText(variant.label || variant.name, 'Variant', 80),
          description: boundedText(variant.description, '', 140),
          isDefault: Boolean(variant.isDefault || variant.default),
        }
      }

      function normalizeControl(value) {
        const control = asObject(value)
        const variants = asList(control.variants).map(normalizeVariant).filter((variant) => variant.id).slice(0, 12)
        return {
          id: boundedText(control.id, '', 120),
          label: boundedText(control.label || control.name, 'Story action', 100),
          description: boundedText(control.description, '', 180),
          disabled: Boolean(control.disabled),
          blockReason: boundedText(control.blockReason, '', 180),
          variants,
        }
      }

      function normalizeExecution(value, launcherInstanceId) {
        const execution = asObject(value)
        if (!Object.keys(execution).length) return null
        const executionLauncherId = boundedText(execution.launcherInstanceId, '', 160)
        if (launcherInstanceId && executionLauncherId !== launcherInstanceId) return null
        return {
          launcherInstanceId: executionLauncherId,
          executionId: boundedText(execution.executionId || execution.id, '', 160),
          requestId: boundedText(execution.requestId, '', 160),
          controlId: boundedText(execution.controlId, '', 120),
          controlLabel: boundedText(execution.controlLabel || execution.label, 'Story action', 100),
          packId: boundedText(execution.packId, '', 120),
          runtimeHash: boundedText(execution.runtimeHash, '', 160),
          platform: boundedText(execution.platform, '', 32),
          personaId: boundedText(execution.personaId, '', 120),
          status: boundedText(execution.status, 'pending', 32).toLowerCase(),
          summary: boundedText(execution.summary || execution.message, '', 220),
          expectedResultCount: boundedCount(execution.expectedResultCount),
          completedResultCount: boundedCount(execution.completedResultCount),
          failedResultCount: boundedCount(execution.failedResultCount),
          createdOrder: boundedOrder(execution.createdOrder),
          occurredAt: boundedText(execution.completedAt || execution.updatedAt || execution.createdAt, nowIso(), 64),
        }
      }

      function executionMatchesSnapshot(execution, snapshot) {
        return Boolean(
          execution &&
          snapshot &&
          execution.launcherInstanceId === snapshot.launcherInstanceId &&
          execution.packId === snapshot.active.pack.id &&
          execution.runtimeHash === snapshot.active.runtimeHash &&
          execution.platform === snapshot.active.platform &&
          execution.personaId === snapshot.active.persona.id
        )
      }

      function acceptExecution(execution) {
        if (!execution || !executionMatchesSnapshot(execution, state.snapshot)) return false
        if (!presenterExecutionCandidateWins(state.localExecution, execution, state.currentRequestId)) return false
        state.localExecution = execution
        return true
      }

      function normalizeSnapshot(payload) {
        const source = asObject(payload)
        const active = asObject(source.active)
        const pack = asObject(active.pack)
        const runtime = asObject(active.runtime)
        const persona = normalizePersona(active.persona)
        const readiness = asObject(source.readiness)
        const launcherInstanceId = boundedText(source.launcherInstanceId, '', 160)
        const personas = asList(source.personas).map(normalizePersona).filter((item) => item.id).slice(0, 24)
        const controls = asList(source.controls).map(normalizeControl).filter((item) => item.id).slice(0, CONFIG.maxControls)
        const staleAfterNumber = Number(source.staleAfterMs)
        const staleAfterMs = Number.isFinite(staleAfterNumber)
          ? clamp(staleAfterNumber, MIN_STALE_AFTER_MS, MAX_STALE_AFTER_MS)
          : DEFAULT_STALE_AFTER_MS
        const normalized = {
          apiVersion: boundedText(source.apiVersion, '', 32),
          launcherInstanceId,
          snapshotVersion: source.snapshotVersion == null ? '' : source.snapshotVersion,
          staleAfterMs,
          receivedAt: Date.now(),
          active: {
            pack: {
              id: boundedText(pack.id || active.packId, '', 120),
              name: boundedText(pack.name || active.packName, 'No active pack', 100),
            },
            platform: boundedText(active.platform, '—', 32),
            configHash: boundedText(runtime.configHash || active.configHash, '', 160),
            runtimeHash: boundedText(runtime.runtimeHash || active.runtimeHash || runtime.configHash || active.configHash, '', 160),
            persona,
          },
          readiness: {
            status: boundedText(readiness.status, 'blocked', 24).toLowerCase(),
            summary: boundedText(readiness.summary, '', 220),
            blockers: asList(readiness.blockers).map((item) => {
              const blocker = asObject(item)
              return {
                code: boundedText(blocker.code, '', 80),
                label: boundedText(blocker.label || blocker.title, 'Blocked', 100),
                detail: boundedText(blocker.detail || blocker.message, '', 180),
              }
            }).slice(0, 5),
          },
          personas,
          controls,
          latestExecution: null,
        }
        const latestExecution = normalizeExecution(source.latestExecution, launcherInstanceId)
        normalized.latestExecution = executionMatchesSnapshot(latestExecution, normalized) ? latestExecution : null
        return normalized
      }

      function contextKey(snapshot) {
        if (!snapshot) return ''
        return [
          snapshot.launcherInstanceId,
          snapshot.active.pack.id,
          snapshot.active.runtimeHash,
          snapshot.active.platform,
          snapshot.active.persona.id,
        ].join('|')
      }

      function snapshotIsValid(snapshot) {
        return Boolean(
          snapshot &&
          snapshot.apiVersion === CONFIG.apiVersion &&
          snapshot.launcherInstanceId &&
          snapshot.active.pack.id &&
          snapshot.active.configHash &&
          snapshot.active.runtimeHash &&
          snapshot.active.platform &&
          snapshot.snapshotVersion !== ''
        )
      }

      function isStale() {
        if (!state.snapshot || !state.lastSignalAt) return true
        return Date.now() - state.lastSignalAt > state.snapshot.staleAfterMs
      }

      function canOperate() {
        return Boolean(
          !state.busy &&
          state.connection === 'connected' &&
          snapshotIsValid(state.snapshot) &&
          !isStale() &&
          state.snapshot.readiness.status === 'ready'
        )
      }

      function canApplyPersona() {
        return Boolean(
          !state.busy &&
          state.connection === 'connected' &&
          snapshotIsValid(state.snapshot) &&
          !isStale()
        )
      }

      function expectedContext() {
        const snapshot = state.snapshot
        return {
          launcherInstanceId: snapshot.launcherInstanceId,
          snapshotVersion: snapshot.snapshotVersion,
          packId: snapshot.active.pack.id,
          configHash: snapshot.active.configHash,
          runtimeHash: snapshot.active.runtimeHash,
          platform: snapshot.active.platform,
          personaId: snapshot.active.persona.id,
        }
      }

      function executionClass(status) {
        if (SUCCESS_STATES.has(status)) return 'success'
        if (PENDING_STATES.has(status)) return 'pending'
        if (FAILURE_STATES.has(status)) return 'failed'
        return ''
      }

      function statusModel() {
        if (state.connection !== 'connected') {
          return {
            kind: 'stale',
            title: state.connection === 'pairing' ? 'Pairing' : state.connection === 'connecting' ? 'Connecting' : 'Disconnected',
            detail: state.lastError || 'Actions are disabled until the launcher reconnects.',
          }
        }
        if (!snapshotIsValid(state.snapshot)) {
          return { kind: 'stale', title: 'Invalid snapshot', detail: 'The launcher did not provide the required operator context.' }
        }
        if (isStale()) {
          return { kind: 'stale', title: 'State is stale', detail: 'Refreshing launcher context. Actions remain disabled.' }
        }
        if (state.snapshot.readiness.status !== 'ready') {
          return {
            kind: 'blocked',
            title: 'Blocked',
            detail: state.snapshot.readiness.summary || 'Resolve readiness blockers in Control Room.',
          }
        }
        if (state.busy) return { kind: 'ready', title: 'Working', detail: 'Waiting for correlated launcher evidence.' }
        return { kind: 'ready', title: 'Ready', detail: state.snapshot.readiness.summary || 'Context verified. Story controls are available.' }
      }

      function replaceText(id, value) {
        element(id).textContent = value
      }

      function renderStatus() {
        const model = statusModel()
        const band = element('statusBand')
        band.className = 'status-band ' + model.kind
        replaceText('statusTitle', model.title)
        replaceText('statusDetail', model.detail)
        replaceText('connectionNote', CONFIG.apiVersion + ' · ' + state.connection)
      }

      function renderContext() {
        const snapshot = state.snapshot
        replaceText('packValue', snapshot ? snapshot.active.pack.name : '—')
        replaceText('platformValue', snapshot ? snapshot.active.platform : '—')
        replaceText('hashValue', snapshot ? shortId(snapshot.active.runtimeHash) : '—')
        replaceText('personaValue', snapshot ? snapshot.active.persona.label : '—')
        const root = element('blockers')
        root.replaceChildren()
        if (!snapshot || snapshot.readiness.status === 'ready') return
        snapshot.readiness.blockers.forEach((item) => {
          const row = document.createElement('div')
          row.className = 'blocker'
          row.textContent = item.detail ? item.label + ': ' + item.detail : item.label
          root.appendChild(row)
        })
      }

      function renderPersonas() {
        const select = element('personaSelect')
        const apply = element('applyPersona')
        const previous = select.value
        select.replaceChildren()
        const personas = state.snapshot ? state.snapshot.personas : []
        if (!personas.length) {
          const option = document.createElement('option')
          option.value = ''
          option.textContent = state.snapshot ? 'No named personas' : 'Waiting for launcher'
          select.appendChild(option)
        } else {
          personas.forEach((persona) => {
            const option = document.createElement('option')
            option.value = persona.id
            option.textContent = persona.label
            select.appendChild(option)
          })
          const activeId = state.snapshot.active.persona.id
          const selected = personas.some((item) => item.id === previous) ? previous : activeId
          select.value = selected || personas[0].id
        }
        const activeIsNamed = Boolean(state.snapshot && personas.some((item) => item.id === state.snapshot.active.persona.id))
        const hasAlternative = personas.length > (activeIsNamed ? 1 : 0)
        select.disabled = !canApplyPersona() || !hasAlternative
        apply.disabled = !canApplyPersona() || !select.value || select.value === state.snapshot.active.persona.id
      }

      function selectedVariantId(control) {
        const remembered = state.variants.get(control.id)
        if (control.variants.some((variant) => variant.id === remembered)) return remembered
        const preferred = control.variants.find((variant) => variant.isDefault) || control.variants[0]
        return preferred ? preferred.id : ''
      }

      function renderControls() {
        const root = element('controls')
        root.replaceChildren()
        const controls = state.snapshot ? state.snapshot.controls : []
        if (!controls.length) {
          const empty = document.createElement('div')
          empty.className = 'empty'
          empty.textContent = state.snapshot ? 'Pin approved story controls in Control Room.' : 'Waiting for a fresh operator snapshot.'
          root.appendChild(empty)
          return
        }
        controls.forEach((control) => {
          const card = document.createElement('article')
          card.className = 'control'

          const copy = document.createElement('div')
          copy.className = 'control-copy'
          const title = document.createElement('strong')
          title.textContent = control.label
          copy.appendChild(title)
          if (control.description || control.blockReason) {
            const description = document.createElement('p')
            description.textContent = control.blockReason || control.description
            copy.appendChild(description)
          }

          const actions = document.createElement('div')
          actions.className = 'control-actions'
          let variantSelect = null
          const variantId = selectedVariantId(control)
          if (control.variants.length > 1) {
            variantSelect = document.createElement('select')
            variantSelect.className = 'variant'
            variantSelect.setAttribute('aria-label', control.label + ' variant')
            control.variants.forEach((variant) => {
              const option = document.createElement('option')
              option.value = variant.id
              option.textContent = variant.label
              variantSelect.appendChild(option)
            })
            variantSelect.value = variantId
            variantSelect.disabled = !canOperate() || control.disabled
            variantSelect.addEventListener('change', () => state.variants.set(control.id, variantSelect.value))
            actions.appendChild(variantSelect)
          } else if (control.variants.length === 1) {
            const label = document.createElement('span')
            label.className = 'variant-label'
            label.textContent = control.variants[0].label
            actions.appendChild(label)
          }

          const run = document.createElement('button')
          run.type = 'button'
          run.className = 'run'
          run.textContent = 'Run'
          run.disabled = !canOperate() || control.disabled
          run.title = control.blockReason || ''
          run.addEventListener('click', () => executeControl(control, variantSelect ? variantSelect.value : variantId))
          actions.appendChild(run)
          card.append(copy, actions)
          root.appendChild(card)
        })
      }

      function renderExecution() {
        const execution = state.localExecution || (state.snapshot && state.snapshot.latestExecution)
        const root = element('execution')
        root.replaceChildren()
        if (!execution) {
          root.className = 'execution'
          const head = document.createElement('div')
          head.className = 'execution-head'
          const title = document.createElement('strong')
          title.textContent = 'No action yet'
          const badge = document.createElement('span')
          badge.className = 'execution-status'
          badge.textContent = 'Idle'
          head.append(title, badge)
          const copy = document.createElement('p')
          copy.textContent = 'Run an approved story control to see its correlated result.'
          root.append(head, copy)
          return
        }
        const status = boundedText(execution.status, 'pending', 32).toLowerCase()
        root.className = 'execution ' + executionClass(status)
        const head = document.createElement('div')
        head.className = 'execution-head'
        const title = document.createElement('strong')
        title.textContent = execution.controlLabel || 'Story action'
        const badge = document.createElement('span')
        badge.className = 'execution-status'
        badge.textContent = status
        head.append(title, badge)
        const summary = document.createElement('p')
        summary.textContent = execution.summary || 'Waiting for correlated launcher evidence.'
        const meta = document.createElement('p')
        meta.className = 'execution-meta'
        const progress = execution.expectedResultCount > 1
          ? ' · Results ' + execution.completedResultCount + '/' + execution.expectedResultCount
          : ''
        meta.textContent = 'Execution ' + shortId(execution.executionId) + ' · Request ' + shortId(execution.requestId) + progress
        root.append(head, summary, meta)
      }

      function render() {
        renderStatus()
        renderContext()
        renderPersonas()
        renderControls()
        renderExecution()
      }

      function applySnapshot(payload) {
        const previousContext = contextKey(state.snapshot)
        const snapshot = normalizeSnapshot(payload)
        state.snapshot = snapshot
        state.lastSignalAt = Date.now()
        state.lastError = snapshotIsValid(snapshot) ? '' : 'Snapshot contract mismatch. Actions are disabled.'
        if (previousContext && previousContext !== contextKey(snapshot)) {
          state.variants.clear()
          state.localExecution = null
          state.currentRequestId = ''
        } else if (snapshot.latestExecution) {
          acceptExecution(snapshot.latestExecution)
        }
        render()
      }

      async function responsePayload(response) {
        const contentType = response.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) return {}
        try { return asObject(await response.json()) } catch { return {} }
      }

      async function fetchSnapshot() {
        const response = await fetch(CONFIG.apiBasePath + '/snapshot', {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
        })
        const payload = await responsePayload(response)
        if (!response.ok) throw new Error(boundedText(payload.error && payload.error.message ? payload.error.message : payload.error, 'Snapshot request failed.', 180))
        applySnapshot(payload)
        return payload
      }

      function refreshSnapshot() {
        if (state.refreshPromise) return state.refreshPromise
        state.refreshPromise = fetchSnapshot().finally(() => { state.refreshPromise = null })
        return state.refreshPromise
      }

      function scheduleReconnect() {
        if (state.reconnectTimer || document.hidden) return
        const delay = Math.min(12000, 800 * Math.pow(2, state.reconnectAttempt))
        state.reconnectAttempt += 1
        state.reconnectTimer = window.setTimeout(() => {
          state.reconnectTimer = null
          connect()
        }, delay)
      }

      function disconnect(message) {
        if (state.eventSource) state.eventSource.close()
        state.eventSource = null
        state.connection = 'disconnected'
        const detail = boundedText(message, 'Connection lost. Actions are disabled.', 180)
        state.lastError = /failed to fetch|networkerror|load failed/i.test(detail)
          ? 'The launcher is unavailable. Actions are disabled.'
          : detail
        render()
        scheduleReconnect()
      }

      function applyDelta(payload) {
        const delta = asObject(payload)
        if (!state.snapshot) return refreshSnapshot()
        if (boundedText(delta.launcherInstanceId, '', 160) !== state.snapshot.launcherInstanceId) return refreshSnapshot()
        if (!sameVersion(delta.baseVersion, state.snapshot.snapshotVersion)) return refreshSnapshot()
        if (!delta.patch || typeof delta.patch !== 'object' || Array.isArray(delta.patch)) return refreshSnapshot()
        const patch = asObject(delta.patch)
        const current = state.snapshot
        const activePatch = asObject(patch.active)
        const activeRuntimePatch = asObject(activePatch.runtime)
        const raw = {
          apiVersion: current.apiVersion,
          launcherInstanceId: current.launcherInstanceId,
          snapshotVersion: delta.snapshotVersion,
          staleAfterMs: current.staleAfterMs,
          active: {
            ...current.active,
            ...activePatch,
            pack: activePatch.pack ? activePatch.pack : current.active.pack,
            runtime: {
              configHash: activeRuntimePatch.configHash || activePatch.configHash || current.active.configHash,
              runtimeHash: activeRuntimePatch.runtimeHash || activePatch.runtimeHash || current.active.runtimeHash,
            },
            persona: activePatch.persona ? activePatch.persona : current.active.persona,
          },
          readiness: Object.hasOwn(patch, 'readiness') ? patch.readiness : current.readiness,
          personas: Object.hasOwn(patch, 'personas') ? patch.personas : current.personas,
          controls: Object.hasOwn(patch, 'controls') ? patch.controls : current.controls,
          latestExecution: Object.hasOwn(patch, 'latestExecution') ? patch.latestExecution : current.latestExecution,
        }
        applySnapshot(raw)
      }

      function handleSseData(event, handler) {
        try { handler(JSON.parse(event.data)) } catch { refreshSnapshot().catch(() => disconnect('Snapshot recovery failed.')) }
      }

      async function connect() {
        if (state.eventSource) state.eventSource.close()
        if (state.reconnectTimer) window.clearTimeout(state.reconnectTimer)
        state.reconnectTimer = null
        state.connection = 'connecting'
        render()
        if (!window.EventSource) {
          disconnect('This browser does not support live operator updates.')
          return
        }
        try {
          await refreshSnapshot()
        } catch (error) {
          disconnect(error.message || 'Could not load launcher state.')
          return
        }
        const events = new EventSource(CONFIG.apiBasePath + '/events')
        state.eventSource = events
        events.onopen = () => {
          if (state.eventSource !== events) return
          state.connection = 'connected'
          state.reconnectAttempt = 0
          state.lastSignalAt = Date.now()
          refreshSnapshot().catch(() => disconnect('Could not verify the live launcher snapshot.'))
          render()
        }
        events.addEventListener('snapshot', (event) => handleSseData(event, applySnapshot))
        events.addEventListener('delta', (event) => handleSseData(event, (payload) => {
          Promise.resolve(applyDelta(payload)).catch(() => disconnect('Snapshot recovery failed.'))
        }))
        events.addEventListener('invalidate', () => {
          refreshSnapshot().catch(() => disconnect('Snapshot recovery failed.'))
        })
        events.addEventListener('heartbeat', (event) => handleSseData(event, (payload) => {
          if (!state.snapshot || payload.launcherInstanceId !== state.snapshot.launcherInstanceId) return refreshSnapshot()
          if (!sameVersion(payload.snapshotVersion, state.snapshot.snapshotVersion)) return refreshSnapshot()
          state.lastSignalAt = Date.now()
        }))
        events.addEventListener('execution', (event) => handleSseData(event, (payload) => {
          if (!state.snapshot || payload.launcherInstanceId !== state.snapshot.launcherInstanceId) return refreshSnapshot()
          const execution = normalizeExecution(payload, state.snapshot.launcherInstanceId)
          acceptExecution(execution)
          state.lastSignalAt = Date.now()
          render()
        }))
        events.onerror = () => {
          if (state.eventSource === events) disconnect('Live updates disconnected. Actions are disabled.')
        }
      }

      async function postOperator(path, body) {
        const response = await fetch(CONFIG.apiBasePath + path, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        const payload = await responsePayload(response)
        if (!response.ok) {
          const serverError = payload.error && payload.error.message ? payload.error.message : payload.error
          throw new Error(boundedText(serverError, 'The launcher rejected this action.', 180))
        }
        return payload
      }

      async function executeControl(control, variantId) {
        if (!canOperate()) return render()
        const expected = expectedContext()
        const id = requestId()
        state.busy = true
        state.currentRequestId = id
        state.localExecution = {
          launcherInstanceId: expected.launcherInstanceId,
          executionId: '',
          requestId: id,
          controlId: control.id,
          controlLabel: control.label,
          packId: expected.packId,
          runtimeHash: expected.runtimeHash,
          platform: expected.platform,
          personaId: expected.personaId,
          status: 'pending',
          summary: 'Waiting for the launcher to accept and correlate this action.',
          createdOrder: 0,
          occurredAt: nowIso(),
        }
        render()
        try {
          const payload = await postOperator('/controls/' + encodeURIComponent(control.id) + '/executions', {
            requestId: id,
            expected,
            variantId: variantId || null,
          })
          if (payload.snapshot) applySnapshot(payload.snapshot)
          const execution = normalizeExecution(payload.execution || payload, expected.launcherInstanceId)
          acceptExecution(execution)
          await refreshSnapshot()
        } catch (error) {
          state.localExecution = {
            ...state.localExecution,
            status: 'failed',
            summary: boundedText(error.message, 'The launcher rejected this action.', 180),
          }
          await refreshSnapshot().catch(() => disconnect('Could not recover launcher state after the failed action.'))
        } finally {
          state.busy = false
          render()
        }
      }

      async function applyPersona() {
        if (!canApplyPersona()) return render()
        const personaId = element('personaSelect').value
        if (!personaId || personaId === state.snapshot.active.persona.id) return
        const expected = expectedContext()
        const id = requestId()
        state.busy = true
        state.currentRequestId = id
        state.localExecution = {
          launcherInstanceId: expected.launcherInstanceId,
          executionId: '',
          requestId: id,
          controlId: 'persona:' + personaId,
          controlLabel: 'Apply persona',
          packId: expected.packId,
          runtimeHash: expected.runtimeHash,
          platform: expected.platform,
          personaId,
          status: 'pending',
          summary: 'Waiting for native identity confirmation.',
          createdOrder: 0,
          occurredAt: nowIso(),
        }
        render()
        try {
          const payload = await postOperator('/personas/' + encodeURIComponent(personaId) + '/apply', {
            requestId: id,
            expected,
          })
          if (payload.snapshot) applySnapshot(payload.snapshot)
          const execution = normalizeExecution(payload.execution || payload, expected.launcherInstanceId)
          acceptExecution(execution)
          await refreshSnapshot()
        } catch (error) {
          state.localExecution = {
            ...state.localExecution,
            status: 'failed',
            summary: boundedText(error.message, 'The launcher rejected this persona change.', 180),
          }
          await refreshSnapshot().catch(() => disconnect('Could not recover launcher state after the failed persona change.'))
        } finally {
          state.busy = false
          render()
        }
      }

      function readPreferences() {
        try { return asObject(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) } catch { return {} }
      }

      function writePreferences(patch) {
        try {
          const current = readPreferences()
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }))
        } catch {}
      }

      function applyDensity(density) {
        state.density = density === 'compact' ? 'compact' : 'full'
        element('app').classList.toggle('is-compact', state.density === 'compact')
        const toggle = element('densityToggle')
        toggle.setAttribute('aria-pressed', String(state.density === 'compact'))
        toggle.textContent = state.density === 'compact' ? 'Full' : 'Compact'
        writePreferences({ density: state.density })
      }

      function restoreWindowPreference(preferences) {
        const size = asObject(preferences.size)
        const width = Number(size.width)
        const height = Number(size.height)
        const restoredWidth = Number.isFinite(width) ? clamp(width, 360, 480) : window.outerWidth
        const restoredHeight = Number.isFinite(height) ? clamp(height, 520, 900) : window.outerHeight
        if (Number.isFinite(width) && Number.isFinite(height)) {
          try { window.resizeTo(restoredWidth, restoredHeight) } catch {}
        }
        const position = asObject(preferences.position)
        const left = Number(position.left)
        const top = Number(position.top)
        if (!Number.isFinite(left) || !Number.isFinite(top)) return
        const availableLeft = Number.isFinite(Number(window.screen.availLeft)) ? Number(window.screen.availLeft) : 0
        const availableTop = Number.isFinite(Number(window.screen.availTop)) ? Number(window.screen.availTop) : 0
        const availableWidth = Number(window.screen.availWidth) || restoredWidth
        const availableHeight = Number(window.screen.availHeight) || restoredHeight
        const maximumLeft = Math.max(availableLeft, availableLeft + availableWidth - restoredWidth)
        const maximumTop = Math.max(availableTop, availableTop + availableHeight - restoredHeight)
        try {
          window.moveTo(
            clamp(left, availableLeft, maximumLeft),
            clamp(top, availableTop, maximumTop),
          )
        } catch {}
      }

      let resizeTimer = null
      let geometrySignature = ''
      function rememberWindowGeometry() {
        const width = clamp(window.outerWidth, 360, 480)
        const height = clamp(window.outerHeight, 520, 900)
        const left = Number.isFinite(Number(window.screenX)) ? Number(window.screenX) : Number(window.screenLeft) || 0
        const top = Number.isFinite(Number(window.screenY)) ? Number(window.screenY) : Number(window.screenTop) || 0
        const signature = [width, height, left, top].join('|')
        if (signature === geometrySignature) return
        geometrySignature = signature
        writePreferences({
          size: { width, height },
          position: { left, top },
        })
      }

      function consumePairingToken() {
        let token = ''
        try {
          const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
          token = boundedText(fragment.get('pair'), '', 512)
        } catch {}
        if (window.location.hash) {
          try { window.history.replaceState(null, '', window.location.pathname + window.location.search) } catch {}
        }
        return token
      }

      async function pairIfNeeded() {
        if (!state.pairingToken) return
        state.connection = 'pairing'
        state.lastError = 'Exchanging the one-time Control Room pairing token.'
        render()
        const response = await fetch(CONFIG.apiBasePath + '/pair', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ token: state.pairingToken }),
        })
        const payload = await responsePayload(response)
        if (!response.ok) {
          const serverError = payload.error && payload.error.message ? payload.error.message : payload.error
          throw new Error(boundedText(serverError, 'Pairing failed. Reopen Presenter Remote from Control Room.', 180))
        }
        state.pairingToken = ''
        state.lastError = ''
      }

      async function bootstrap() {
        try {
          await pairIfNeeded()
          await connect()
        } catch (error) {
          state.connection = 'disconnected'
          state.lastError = boundedText(error.message, 'Pairing failed. Reopen Presenter Remote from Control Room.', 180)
          render()
        }
      }

      window.addEventListener('resize', () => {
        if (resizeTimer) window.clearTimeout(resizeTimer)
        resizeTimer = window.setTimeout(() => {
          rememberWindowGeometry()
        }, 300)
      })
      window.addEventListener('pagehide', rememberWindowGeometry)
      window.setInterval(rememberWindowGeometry, 1500)
      window.addEventListener('offline', () => disconnect('The host is offline. Actions are disabled.'))
      window.addEventListener('online', bootstrap)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return
        if (state.connection !== 'connected' || isStale()) bootstrap()
        else refreshSnapshot().catch(() => disconnect('Could not refresh launcher state.'))
      })
      window.setInterval(() => {
        if (state.connection === 'connected' && isStale()) {
          render()
          refreshSnapshot().catch(() => disconnect('Launcher state became stale.'))
        }
      }, 1000)

      element('densityToggle').addEventListener('click', () => applyDensity(state.density === 'compact' ? 'full' : 'compact'))
      element('applyPersona').addEventListener('click', applyPersona)
      element('personaSelect').addEventListener('change', renderPersonas)
      element('recoverButton').addEventListener('click', bootstrap)

      const preferences = readPreferences()
      state.pairingToken = consumePairingToken()
      applyDensity(preferences.density)
      restoreWindowPreference(preferences)
      render()
      bootstrap()
    })()
  </script>
</body>
</html>`
}

export const renderPresenterRemote = presenterRemoteHtml
