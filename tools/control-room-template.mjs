export function launcherHtml() {
  const icon = (name) => '<i data-lucide="' + name + '" aria-hidden="true"></i>'
  const buttonHtml = ({ id = '', kind = 'ghost', size = '', icon: iconName = '', label = '', attrs = '' }) => {
    const idAttr = id ? ' id="' + id + '"' : ''
    const sizeClass = size ? ' ' + size : ''
    return '<button class="button icon-text ' + kind + sizeClass + '"' + idAttr + (attrs ? ' ' + attrs : '') + '>' +
      (iconName ? icon(iconName) : '') +
      '<span class="button-label">' + label + '</span>' +
    '</button>'
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Braze Demo Control Room</title>
  <link rel="stylesheet" href="/design/colors_and_type.css" />
  <script src="https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js"></script>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f1fb;
      --bg-soft: #fbf9ff;
      --surface: #ffffff;
      --surface-subtle: #f8f6fc;
      --text: #17131f;
      --muted: #686176;
      --line: #ddd5e9;
      --line-strong: #c7b8dd;
      --brand: #801ed7;
      --brand-dark: #300266;
      --orange: #ff7a1a;
      --success: #0f766e;
      --danger: #c7351b;
      --warn: #8a3c00;
      --shadow: 0 18px 42px rgba(34, 18, 62, 0.1);
      --font-ui-safe: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      background:
        linear-gradient(120deg, rgba(248, 222, 238, 0.72), rgba(255,255,255,0.84) 42%, rgba(215, 208, 255, 0.45)),
        var(--bg);
      color: var(--text);
      font-family: var(--font-body, var(--font-ui-safe));
      letter-spacing: 0;
    }
    button, input, select, textarea { font: inherit; letter-spacing: 0; }
    button { cursor: pointer; }
    .shell { min-height: 100vh; display: grid; grid-template-columns: 280px minmax(0, 1fr); }
    .shell.presentation { grid-template-columns: 1fr; background: #fff; }
    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      background: var(--brand-dark);
      color: #fff;
      padding: 30px 24px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .presentation .sidebar { display: none; }
    .brand img { width: 118px; height: auto; }
    .side-title { margin-top: 34px; }
    .side-title h1 {
      margin: 0;
      font-family: var(--font-display, var(--font-ui-safe));
      font-size: 42px;
      line-height: 0.98;
      letter-spacing: 0;
    }
    .side-title p { margin: 16px 0 0; color: rgba(255,255,255,0.74); font-size: 14px; line-height: 1.45; }
    .nav { display: grid; gap: 7px; margin-top: 34px; }
    .nav button {
      width: 100%;
      min-height: 42px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: rgba(255,255,255,0.72);
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 10px 11px;
      text-align: left;
      font: 800 13px/1.2 var(--font-ui, var(--font-ui-safe));
    }
    .nav button:hover, .nav button.active { background: rgba(255,255,255,0.13); color: #fff; }
    .nav .mark { width: 22px; color: rgba(255,255,255,0.55); font: 800 11px/1 var(--font-ui, var(--font-ui-safe)); }
    .callback {
      margin-top: auto;
      border-top: 1px solid rgba(255,255,255,0.14);
      padding-top: 16px;
      color: rgba(255,255,255,0.66);
      font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
      overflow-wrap: anywhere;
    }
    main { min-width: 0; padding: 32px; }
    .presentation main { padding: 22px 28px 28px; }
    .topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 22px; }
    .title h1 { margin: 0; font-size: 32px; line-height: 1.05; letter-spacing: 0; }
    .title p { margin: 7px 0 0; color: var(--muted); font-size: 14px; line-height: 1.42; max-width: 780px; }
    .presentation .title h1 { font-size: 24px; }
    .presentation .title p { display: none; }
    .status-row { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .view { display: none; }
    .view.active { display: block; }
    .grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 18px; align-items: start; }
    .span-4 { grid-column: span 4; }
    .span-5 { grid-column: span 5; }
    .span-6 { grid-column: span 6; }
    .span-7 { grid-column: span 7; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }
    .row-span-2 { grid-row: span 2; }
    .panel {
      min-width: 0;
      background: rgba(255,255,255,0.94);
      border: 1px solid rgba(48,2,102,0.12);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 20px;
    }
    .presentation .panel { box-shadow: none; border-color: #e6e1ee; }
    .panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 15px; }
    h2 { margin: 0; font-size: 22px; line-height: 1.16; letter-spacing: 0; }
    h3 { margin: 0; font-size: 15px; line-height: 1.25; letter-spacing: 0; }
    p { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
    label { display: block; margin: 0 0 7px; color: var(--muted); font: 800 11px/1.1 var(--font-ui, var(--font-ui-safe)); }
    input, select, textarea {
      width: 100%;
      min-width: 0;
      border: 1px solid var(--line-strong);
      border-radius: 9px;
      background: #fff;
      color: var(--text);
      padding: 10px 11px;
      font-size: 13px;
      outline-offset: 2px;
    }
    textarea {
      min-height: 150px;
      resize: vertical;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    input:focus, select:focus, textarea:focus, button:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .field-note { margin: 6px 0 0; color: var(--muted); font-size: 12px; line-height: 1.35; }
    .field-note.warn { color: var(--warn); }
    .row { display: flex; flex-wrap: wrap; gap: 9px; align-items: center; }
    .button-group { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .button {
      min-height: 36px;
      border: 1px solid transparent;
      border-radius: 999px;
      padding: 9px 13px;
      font: 850 12px/1 var(--font-ui, var(--font-ui-safe));
      background: #fff;
      color: var(--text);
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
    }
    .button:hover { filter: brightness(0.98); transform: translateY(-1px); }
    .button:disabled { opacity: 0.48; cursor: not-allowed; transform: none; }
    .button.compact {
      min-height: 30px;
      padding: 7px 10px;
      border-radius: 8px;
      font-size: 11px;
      gap: 6px;
    }
    .button svg {
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
      stroke-width: 1.75;
    }
    .button.compact svg { width: 14px; height: 14px; }
    .button-label { display: inline-block; min-width: 0; }
    .primary { background: var(--brand); color: #fff; }
    .secondary { background: #f0eaf8; color: var(--brand-dark); border-color: #ded4f0; }
    .orange { background: var(--orange); color: #170900; }
    .ghost { border-color: var(--line-strong); }
    .danger { background: #ffe6df; color: var(--danger); }
    .chip, .tag {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border-radius: 999px;
      padding: 5px 9px;
      background: #f0eaf8;
      color: #3a2b56;
      font: 800 11px/1 var(--font-ui, var(--font-ui-safe));
      white-space: nowrap;
    }
    .chip.warn, .tag.warn,
    .chip.warning, .tag.warning { background: #fff1df; color: var(--warn); }
    .chip.error, .tag.error { background: #ffe6df; color: var(--danger); }
    .chip.success, .tag.success { background: #ddf7f2; color: var(--success); }
    .identity-status { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
    .readiness { display: grid; gap: 10px; }
    .ready-row {
      display: grid;
      grid-template-columns: 10px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface-subtle);
      padding: 12px;
      min-width: 0;
    }
    .ready-row.success { border-color: rgba(0,113,105,0.24); }
    .ready-row.warn { border-color: rgba(151,75,0,0.28); }
    .ready-row.error { border-color: rgba(194,47,21,0.3); }
    .ready-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      margin-top: 4px;
      background: var(--muted);
    }
    .ready-row.success .ready-dot { background: var(--success); }
    .ready-row.warn .ready-dot { background: var(--warn); }
    .ready-row.error .ready-dot { background: var(--danger); }
    .ready-copy { min-width: 0; }
    .ready-label {
      display: block;
      color: var(--muted);
      font: 800 10px/1 var(--font-ui, var(--font-ui-safe));
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .ready-row strong { display: block; margin-top: 4px; font-size: 13px; line-height: 1.25; overflow-wrap: anywhere; }
    .ready-row p { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
    .control-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(245px, 100%), 1fr)); gap: 12px; }
    .template-list, .story-list { display: grid; gap: 10px; }
    .control-card {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 13px 14px;
      display: grid;
      gap: 10px;
    }
    .control-card.row-card {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }
    .control-card.hidden-control { opacity: 0.58; }
    .control-main { min-width: 0; }
    .control-card strong { display: block; font-size: 14px; line-height: 1.25; }
    .control-card p { margin-top: 4px; min-height: 0; font-size: 12px; }
    .control-meta { margin-top: 7px; color: var(--muted); font: 800 11px/1.35 var(--font-ui, var(--font-ui-safe)); overflow-wrap: anywhere; }
    .control-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
    .control-actions .primary { min-width: 54px; }
    .mini {
      min-height: 28px;
      padding: 6px 10px;
      border-radius: 7px;
      font-size: 11px;
    }
    .activity { display: grid; gap: 10px; max-height: 640px; overflow: auto; padding-right: 4px; }
    .event {
      position: relative;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 12px 13px 12px 17px;
      min-width: 0;
    }
    .event::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 4px;
      background: #8b7aa8;
    }
    .event.success::before { background: var(--success); }
    .event.error::before { background: var(--danger); }
    .event.warning::before { background: var(--warn); }
    .event.info::before { background: #6f5bd7; }
    .event-top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
    }
    .event-heading { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
    .event-icon {
      width: 28px;
      height: 28px;
      border-radius: 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      background: var(--surface-subtle);
      color: var(--brand-dark);
    }
    .event-icon svg { width: 15px; height: 15px; stroke-width: 2; }
    .event.success .event-icon { background: #ddf7f2; color: var(--success); }
    .event.error .event-icon { background: #ffe6df; color: var(--danger); }
    .event.warning .event-icon { background: #fff1df; color: var(--warn); }
    .event-title { min-width: 0; display: grid; gap: 5px; }
    .event-title strong { font-size: 14px; line-height: 1.25; overflow-wrap: anywhere; }
    .event-badges { display: flex; flex-wrap: wrap; gap: 5px; }
    .event time { color: var(--muted); font: 11px/1 var(--font-ui, var(--font-ui-safe)); white-space: nowrap; padding-top: 3px; }
    .event-summary { color: var(--text); font-size: 13px; line-height: 1.42; margin: 9px 0 0 38px; }
    .event-meta {
      margin: 9px 0 0 38px;
      color: var(--muted);
      font: 800 11px/1.35 var(--font-ui, var(--font-ui-safe));
      overflow-wrap: anywhere;
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .event-meta .tag {
      margin: 0;
      max-width: 100%;
      white-space: normal;
      line-height: 1.25;
      text-align: left;
    }
    .event-meta-key { color: var(--muted); margin-right: 4px; }
    .event details { margin: 9px 0 0 38px; }
    details { margin-top: 9px; }
    summary { color: var(--brand-dark); font: 800 12px/1 var(--font-ui, var(--font-ui-safe)); cursor: pointer; }
    .json, .logs {
      margin-top: 9px;
      border-radius: 10px;
      background: #2b005d;
      color: #f4ebff;
      padding: 12px;
      font: 11px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      overflow: auto;
    }
    .json.light {
      background: var(--surface-subtle);
      color: #3a3544;
      border: 1px solid var(--line);
      max-height: 380px;
    }
    .logs {
      max-height: 270px;
      border: 1px solid rgba(255,255,255,0.18);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
    }
    .credentials-box {
      margin-top: 14px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface-subtle);
      padding: 12px;
    }
    .credentials-box summary { margin-bottom: 10px; }
    .cockpit-rest-panel textarea { min-height: 92px; }
    .cockpit-rest-panel .rest-body { min-height: 178px; }
    .rest-fields { display: grid; gap: 12px; }
    .rest-advanced {
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface-subtle);
      padding: 12px;
    }
    .rest-advanced summary { margin-bottom: 10px; }
    .empty { border: 1px dashed var(--line-strong); border-radius: 12px; padding: 18px; color: var(--muted); background: var(--surface-subtle); }
    .split { display: grid; grid-template-columns: minmax(310px, 470px) minmax(0, 1fr); gap: 18px; align-items: start; }
    .template-workspace { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(360px, 0.85fr); gap: 18px; align-items: start; }
    .template-filterbar { display: flex; flex-wrap: wrap; gap: 7px; margin: 0 0 14px; }
    .template-filterbar .button.active { background: var(--brand-dark); color: #fff; border-color: var(--brand-dark); }
    .template-editor { position: sticky; top: 24px; }
    .template-editor .panel-head { display: grid; grid-template-columns: minmax(0, 1fr); }
    .template-editor #builderValidation { justify-self: start; white-space: normal; line-height: 1.25; max-width: 100%; }
    .template-editor-form { display: grid; gap: 12px; }
    .editor-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .editor-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .control-card.selected-control { border-color: var(--brand); box-shadow: 0 0 0 2px rgba(128,30,215,0.12); }
    .presentation-hide { display: initial; }
    .presentation .presentation-hide { display: none !important; }
    .presentation .control-grid { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .presentation .story-list { gap: 12px; }
    .presentation .activity { max-height: calc(100vh - 160px); }
    #view-feed .panel { height: calc(100vh - 146px); min-height: 520px; display: flex; flex-direction: column; }
    #view-feed #feedActivity { flex: 1; max-height: none; min-height: 0; }
    .presentation .event details { display: none; }
    .presentation #view-cockpit .grid {
      grid-template-columns: minmax(320px, 430px) minmax(0, 1fr);
      align-items: start;
    }
    .presentation #view-cockpit .span-4 { grid-column: 1; }
    .presentation #view-cockpit .span-12 { grid-column: 2; grid-row: 1; }
    .presentation #view-cockpit .row-span-2 { grid-row: auto; }
    .presentation #view-cockpit #storyControls { grid-template-columns: 1fr; }
    @media (max-width: 1120px) {
      .span-4, .span-5, .span-6, .span-7, .span-8 { grid-column: span 12; }
      .row-span-2 { grid-row: auto; }
      .split { grid-template-columns: 1fr; }
      .template-workspace { grid-template-columns: 1fr; }
      .template-editor { position: static; }
    }
    @media (max-width: 860px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar { position: relative; height: auto; padding: 22px; }
      .side-title { display: none; }
      .nav { margin-top: 20px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .callback { display: none; }
      main { padding: 16px; }
      .topbar { flex-direction: column; }
      .form-grid { grid-template-columns: 1fr; }
      .ready-row { grid-template-columns: 1fr; }
      .control-card.row-card { grid-template-columns: 1fr; }
      .control-actions { justify-content: flex-start; }
      .button-group { width: 100%; }
      .event-top { grid-template-columns: 1fr; }
      .event time { padding-left: 38px; padding-top: 0; }
      .presentation #view-cockpit .grid { grid-template-columns: 1fr; }
      .presentation #view-cockpit .span-4,
      .presentation #view-cockpit .span-12 { grid-column: 1; grid-row: auto; }
    }
  </style>
</head>
<body>
  <div class="shell" id="shell">
    <aside class="sidebar">
      <div>
        <div class="brand"><img src="/design/cleveland/assets/braze-wordmark-white.svg" alt="Braze" /></div>
        <div class="side-title">
          <h1>Demo Control</h1>
          <p>Configure quietly, run the app demo, and show the event-to-message story only when it helps the room.</p>
        </div>
        <nav class="nav" aria-label="Control Room sections">
          <button class="active" data-view="cockpit"><span class="mark">01</span><span>Demo Cockpit</span></button>
          <button data-view="feed"><span class="mark">02</span><span>Activity Feed</span></button>
          <button data-view="templates"><span class="mark">03</span><span>Control Templates</span></button>
          <button data-view="diagnostics"><span class="mark">04</span><span>Diagnostics</span></button>
        </nav>
      </div>
      <div class="callback" id="callback">Callback pending</div>
    </aside>
    <main>
      <div class="topbar">
        <div class="title">
          <h1 id="pageTitle">Demo Cockpit</h1>
          <p id="pageSubtitle">Set up the demo, pin the actions that fit your story, and keep the latest activity visible.</p>
        </div>
        <div class="status-row">
          ${buttonHtml({ id: 'presentationToggle', kind: 'secondary', icon: 'presentation', label: 'Present' })}
          <span id="topStatus"></span>
        </div>
      </div>

      <section class="view active" id="view-cockpit">
        <div class="grid">
          <section class="panel span-4 presentation-hide">
            <div class="panel-head">
              <div>
                <h2>Setup</h2>
                <p>Active demo pack, user, and launch actions.</p>
              </div>
              <span class="chip" id="packStatus">-</span>
            </div>
            <label for="pack">Demo pack</label>
            <select id="pack"></select>
            <div class="form-grid" style="margin-top:12px">
              <div>
                <label for="platform">Platform</label>
                <select id="platform">
                  <option value="android">Android</option>
                  <option value="ios">iOS</option>
                </select>
              </div>
              <div>
                <label for="externalId">External user ID</label>
                <input id="externalId" autocomplete="off" />
              </div>
            </div>
            <div class="form-grid" style="margin-top:12px">
              <div>
                <label for="displayName">Display name</label>
                <input id="displayName" autocomplete="off" />
              </div>
            </div>
            <details class="credentials-box" id="credentialsPanel">
              <summary>SDK and REST configuration</summary>
              <div class="form-grid">
                <div>
                  <label for="brazeCluster">Braze cluster</label>
                  <select id="brazeCluster"></select>
                  <p class="field-note" id="brazeClusterNote">Choose a cluster to fill SDK and REST endpoints.</p>
                </div>
                <div>
                  <label for="sdkApiKey">SDK API key</label>
                  <input id="sdkApiKey" autocomplete="off" placeholder="Keep current" />
                </div>
                <div>
                  <label for="sdkEndpoint">SDK endpoint</label>
                  <input id="sdkEndpoint" autocomplete="off" placeholder="sdk.iad-03.braze.com" />
                </div>
                <div>
                  <label for="restEndpoint">REST endpoint</label>
                  <input id="restEndpoint" autocomplete="off" placeholder="https://rest.iad-03.braze.com" />
                </div>
                <div>
                  <label for="restApiKey">REST API key</label>
                  <input id="restApiKey" autocomplete="off" placeholder="Session only, never saved" />
                </div>
                <div>
                  <label for="firebaseSenderId">Firebase sender ID</label>
                  <input id="firebaseSenderId" autocomplete="off" placeholder="Keep current" />
                </div>
                <div>
                  <label for="profileName">Profile name</label>
                  <input id="profileName" autocomplete="off" />
                </div>
              </div>
              <div class="button-group" style="margin-top:12px">
                ${buttonHtml({ id: 'saveCredentials', kind: 'secondary', icon: 'save', label: 'Save config' })}
                <span class="chip" id="credentialStatus">Not loaded</span>
              </div>
            </details>
            <div class="button-group" style="margin-top:15px">
              ${buttonHtml({ id: 'saveActive', kind: 'primary', icon: 'save', label: 'Save' })}
              ${buttonHtml({ id: 'applyUser', kind: 'secondary', icon: 'user-check', label: 'Apply user' })}
              ${buttonHtml({ id: 'createApplyUser', kind: 'secondary', icon: 'user-plus', label: 'Create user' })}
              ${buttonHtml({ id: 'apply', kind: 'secondary', icon: 'check', label: 'Apply pack' })}
              ${buttonHtml({ id: 'run', kind: 'orange', icon: 'rocket', label: 'Launch' })}
              ${buttonHtml({ id: 'exportUser', kind: 'ghost', icon: 'badge-check', label: 'Verify' })}
            </div>
            <div class="identity-status">
              <span class="chip" id="identityStatus">User pending</span>
            </div>
          </section>

          <section class="panel span-4 presentation-hide">
            <div class="panel-head">
              <div>
                <h2>Readiness</h2>
                <p>What matters for this demo, with impact and next step.</p>
              </div>
            </div>
            <div class="readiness" id="readiness"></div>
          </section>

          <section class="panel span-4 row-span-2">
            <div class="panel-head">
              <div>
                <h2>Story Controls</h2>
                <p>Pinned or ready controls for the current live story.</p>
              </div>
              ${buttonHtml({ kind: 'ghost compact presentation-hide', icon: 'settings', label: 'Manage', attrs: 'data-view-jump="templates" data-template-filter-jump="story"' })}
            </div>
            <div class="control-grid" id="storyControls"></div>
          </section>

          <section class="panel span-8 presentation-hide cockpit-rest-panel">
            <div class="panel-head">
              <div>
                <h2>Custom REST Control</h2>
                <p>Run or stage safe Braze REST calls against the active user.</p>
              </div>
            </div>
            <div class="rest-fields">
              <div>
                <label for="cockpitRestLabel">Label</label>
                <input id="cockpitRestLabel" placeholder="Trigger abandoned cart Canvas" />
              </div>
              <div class="form-grid">
                <div>
                  <label for="cockpitRestMethod">Method</label>
                  <select id="cockpitRestMethod">
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>
                <div>
                  <label for="cockpitRestPath">Endpoint</label>
                  <input id="cockpitRestPath" placeholder="/canvas/trigger/send" value="/users/track" />
                </div>
              </div>
              <div>
                <label for="cockpitRestBody">Body JSON</label>
                <textarea class="rest-body" id="cockpitRestBody">{
  "events": [
    {
      "name": "demo_action",
      "properties": { "source": "control_room" }
    }
  ]
}</textarea>
              </div>
            </div>
            <details class="rest-advanced">
              <summary>Query JSON</summary>
              <textarea id="cockpitRestQuery">{}</textarea>
            </details>
            <div class="button-group" style="margin-top:14px">
              ${buttonHtml({ id: 'cockpitRestRun', kind: 'primary', icon: 'play', label: 'Run' })}
              ${buttonHtml({ id: 'cockpitRestStage', kind: 'secondary', icon: 'bookmark-plus', label: 'Stage' })}
            </div>
          </section>

          <section class="panel span-12">
            <div class="panel-head">
              <div>
                <h2>Activity Feed</h2>
                <p>Actions, captured events, message triggers, profile checks, and responses.</p>
              </div>
              ${buttonHtml({ id: 'refreshCockpit', kind: 'ghost compact presentation-hide', icon: 'refresh-cw', label: 'Refresh' })}
            </div>
            <div class="activity" id="recentActivity"></div>
          </section>
        </div>
      </section>

      <section class="view" id="view-feed">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Activity Feed</h2>
              <p>Searchable proof of the live demo: what was clicked, captured, sent, and returned.</p>
            </div>
            ${buttonHtml({ id: 'refreshFeed', kind: 'ghost compact', icon: 'refresh-cw', label: 'Refresh' })}
          </div>
          <div class="form-grid">
            <div>
              <label for="feedSearch">Search</label>
              <input id="feedSearch" placeholder="event, user, source, response" />
            </div>
            <div>
              <label for="feedStatus">Status</label>
              <select id="feedStatus">
                <option value="">All statuses</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div>
              <label for="feedCategory">Category</label>
              <select id="feedCategory">
                <option value="">All categories</option>
                <option value="launcher">Launcher</option>
                <option value="sdk">SDK</option>
                <option value="rest">REST</option>
                <option value="message">Message</option>
                <option value="profile">Profile</option>
                <option value="content_cards">Content Cards</option>
                <option value="push">Push</option>
                <option value="diagnostics">Diagnostics</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>
          <div class="activity" id="feedActivity" style="margin-top:14px"></div>
        </section>
      </section>

      <section class="view" id="view-templates">
        <div class="template-workspace">
          <section class="panel">
            <div class="panel-head">
              <div>
                <h2>Control Templates</h2>
                <p>Start from standard controls, tailor them to the demo, then promote only repeatable structures.</p>
              </div>
              <span class="chip" id="templateCount">0 controls</span>
            </div>
            <div class="template-filterbar" id="templateFilters" aria-label="Control template filters"></div>
            <div class="control-grid" id="templateControls"></div>
          </section>
          <section class="panel template-editor" id="templateEditor">
            <div class="panel-head">
              <div>
                <h2 id="templateEditorTitle">Tailor Control</h2>
                <p id="templateEditorSubtitle">Choose a template to create an editable staged control.</p>
              </div>
              <span class="chip" id="builderValidation">Ready</span>
            </div>
            <div id="templateEditorEmpty" class="empty">Select Tailor on any control to create or open a staged copy without leaving this overview.</div>
            <div id="templateEditorForm" class="template-editor-form" hidden>
              <div class="editor-toolbar">
                <span class="chip" id="templateEditorContext">No control selected</span>
                <div class="editor-actions">
                  ${buttonHtml({ id: 'templateUnlock', kind: 'secondary', icon: 'unlock', label: 'Unlock' })}
                  ${buttonHtml({ id: 'templatePromote', kind: 'ghost', icon: 'arrow-up-circle', label: 'Promote' })}
                </div>
              </div>
              <div class="form-grid">
                <div>
                  <label for="builderLabel">Label</label>
                  <input id="builderLabel" />
                </div>
                <div>
                  <label for="builderType">Action type</label>
                  <select id="builderType"></select>
                </div>
              </div>
              <div class="form-grid">
                <div>
                  <label for="builderTransport">Transport</label>
                  <select id="builderTransport">
                    <option value="app_sdk">Selected app SDK</option>
                    <option value="android_sdk">Android SDK</option>
                    <option value="ios_sdk">iOS SDK</option>
                    <option value="braze_rest">Braze REST</option>
                  </select>
                </div>
                <div>
                  <label for="builderPlatform">Platform</label>
                  <select id="builderPlatform">
                    <option value="android">Android</option>
                    <option value="ios">iOS</option>
                    <option value="host">Host / REST</option>
                    <option value="browser">Browser render</option>
                  </select>
                </div>
              </div>
              <div>
                <label for="builderPayload">Payload JSON</label>
                <textarea id="builderPayload"></textarea>
              </div>
              <label class="ready-row" for="builderRequiresPushToken" style="display:flex;align-items:flex-start;gap:10px">
                <input id="builderRequiresPushToken" type="checkbox" style="margin-top:2px" />
                <span class="ready-copy">
                  <span class="ready-label">Push token</span>
                  <strong>Require native push token before running</strong>
                  <p>Use this for campaign or Canvas controls that send push. Leave off for IAM, Content Cards, or unknown message channels.</p>
                </span>
              </label>
              <div class="button-group">
                ${buttonHtml({ id: 'builderExecute', kind: 'primary', icon: 'play', label: 'Run draft' })}
                ${buttonHtml({ id: 'builderUpdate', kind: 'secondary', icon: 'save', label: 'Save' })}
                ${buttonHtml({ id: 'builderStage', kind: 'ghost', icon: 'bookmark-plus', label: 'Stage & pin' })}
              </div>
              <div>
                <div class="panel-head" style="margin:2px 0 8px">
                  <div>
                    <h3>Payload Preview</h3>
                    <p>What will be sent to the executor.</p>
                  </div>
                </div>
                <pre class="json light" id="builderPreview"></pre>
              </div>
              <div class="activity" id="builderActivity"></div>
            </div>
          </section>
        </div>
      </section>

      <section class="view" id="view-diagnostics">
        <div class="grid">
          <section class="panel span-6">
            <div class="panel-head">
              <div>
                <h2>Runtime Contract</h2>
                <p>Demo identity, hash, and expected render sources.</p>
              </div>
            </div>
            <pre class="json light" id="runtimeDetails"></pre>
          </section>
          <section class="panel span-6">
            <div class="panel-head">
              <div>
                <h2>Device Identity</h2>
                <p>Last native runtime report, SDK device ID, and source parity warnings.</p>
              </div>
            </div>
            <pre class="json light" id="deviceDetails"></pre>
          </section>
          <section class="panel span-6">
            <div class="panel-head">
              <div>
                <h2>Launcher Logs</h2>
                <p>Build, install, emulator, and recovery output.</p>
              </div>
            </div>
            <pre class="logs" id="logs">Launcher ready.</pre>
          </section>
          <section class="panel span-6">
            <div class="panel-head">
              <div>
                <h2>Debug Events</h2>
                <p>Bridge, runtime, SDK refresh, token, and raw device telemetry.</p>
              </div>
            </div>
            <div class="activity" id="debugActivity"></div>
          </section>
          <section class="panel span-12">
            <div class="panel-head">
              <div>
                <h2>REST Responses</h2>
                <p>Host-only responses from Braze REST actions.</p>
              </div>
            </div>
            <div class="activity" id="restActivity"></div>
          </section>
        </div>
      </section>
    </main>
  </div>

  <script>
    const state = {
      data: null,
      view: 'cockpit',
      busy: false,
      selectedControlId: '',
      editorLoadedControlId: '',
      templateFilter: 'all',
      presentation: false,
      live: 'connecting',
      livePollTimer: null,
      liveRenderTimer: null,
      jobLogSignature: '',
      openDetails: new Set(),
      activitySignatures: {},
      credentialsPackId: '',
      identityDirty: false,
      displayNameDirty: false,
    }
    const titles = {
      cockpit: ['Demo Cockpit', 'Set up the demo, pin the actions that fit your story, and keep the latest activity visible.'],
      feed: ['Activity Feed', 'Audience-readable proof of actions, events, message triggers, profile checks, and responses.'],
      templates: ['Control Templates', 'Standard controls become demo-specific when you stage, pin, lock, and reuse them.'],
      diagnostics: ['Diagnostics', 'Runtime sources, raw logs, REST history, and recovery context.'],
    }
    const templateCategories = [
      ['all', 'All'],
      ['story', 'Story'],
      ['identity', 'Identity'],
      ['events', 'Events'],
      ['purchases', 'Purchases'],
      ['messaging', 'Messaging'],
      ['content_cards', 'Content Cards'],
      ['rest_api', 'REST / API'],
      ['navigation', 'Navigation'],
      ['staged', 'Staged'],
    ]
    const restActionTypes = ['rest_event', 'rest_attribute', 'rest_purchase', 'campaign_trigger', 'canvas_trigger', 'profile_export', 'braze_rest_request']
    const brazeClusters = [
      { id: 'custom', label: 'Custom', sdkEndpoint: '', restEndpoint: '' },
      { id: 'us-01', label: 'US-01', sdkEndpoint: 'sdk.iad-01.braze.com', restEndpoint: 'https://rest.iad-01.braze.com' },
      { id: 'us-02', label: 'US-02', sdkEndpoint: 'sdk.iad-02.braze.com', restEndpoint: 'https://rest.iad-02.braze.com' },
      { id: 'us-03', label: 'US-03', sdkEndpoint: 'sdk.iad-03.braze.com', restEndpoint: 'https://rest.iad-03.braze.com' },
      { id: 'us-04', label: 'US-04', sdkEndpoint: 'sdk.iad-04.braze.com', restEndpoint: 'https://rest.iad-04.braze.com' },
      { id: 'us-05', label: 'US-05', sdkEndpoint: 'sdk.iad-05.braze.com', restEndpoint: 'https://rest.iad-05.braze.com' },
      { id: 'us-06', label: 'US-06', sdkEndpoint: 'sdk.iad-06.braze.com', restEndpoint: 'https://rest.iad-06.braze.com' },
      { id: 'us-07', label: 'US-07', sdkEndpoint: 'sdk.iad-07.braze.com', restEndpoint: 'https://rest.iad-07.braze.com' },
      { id: 'us-08', label: 'US-08', sdkEndpoint: 'sdk.iad-08.braze.com', restEndpoint: 'https://rest.iad-08.braze.com' },
      { id: 'us-10', label: 'US-10', sdkEndpoint: 'sdk.iad-10.braze.com', restEndpoint: 'https://rest.iad-10.braze.com' },
      { id: 'eu-01', label: 'EU-01', sdkEndpoint: 'sdk.fra-01.braze.eu', restEndpoint: 'https://rest.fra-01.braze.eu' },
      { id: 'eu-02', label: 'EU-02', sdkEndpoint: 'sdk.fra-02.braze.eu', restEndpoint: 'https://rest.fra-02.braze.eu' },
      { id: 'au-01', label: 'AU-01', sdkEndpoint: 'sdk.au-01.braze.com', restEndpoint: 'https://rest.au-01.braze.com' },
      { id: 'id-01', label: 'ID-01', sdkEndpoint: 'sdk.id-01.braze.com', restEndpoint: 'https://rest.id-01.braze.com' },
      { id: 'jp-01', label: 'JP-01', sdkEndpoint: 'sdk.jp-01.braze.com', restEndpoint: 'https://rest.jp-01.braze.com' },
      { id: 'kr-01', label: 'KR-01', sdkEndpoint: 'sdk.kr-01.braze.com', restEndpoint: 'https://rest.kr-01.braze.com' },
    ]
    const actionTypes = ['change_user', 'sdk_event', 'sdk_attribute', 'sdk_purchase', 'sdk_event_sequence', 'content_cards_refresh', 'push_permission', 'push_readiness', 'trust_diagnostics', 'foreground_push', 'navigate', 'android_sequence', ...restActionTypes]
    const audienceActivityTypes = new Set([
      'change_user',
      'sdk_event',
      'sdk_attribute',
      'sdk_purchase',
      'rest_event',
      'rest_attribute',
      'rest_purchase',
      'campaign_trigger',
      'canvas_trigger',
      'profile_export',
      'push_permission',
      'push_received',
      'push_opened',
      'push_deleted',
      'content_cards_refresh',
      'content_card_impression',
      'content_card_click',
      'braze_rest_request',
    ])
    const diagnosticsOnlyTypes = new Set([
      'bridge_action',
      'runtime_ready',
      'content_cards',
      'content_cards_refresh',
      'foreground_push',
      'push_preview',
      'fcm_token',
      'trust_diagnostics',
      'demo_command',
      'device_event',
      'control_promoted',
    ])
    const el = (id) => document.getElementById(id)
    const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]))
    const iconHtml = (name) => '<i data-lucide="' + esc(name) + '" aria-hidden="true"></i>'
    function buttonHtml({ id = '', kind = 'ghost', size = '', icon = '', label = '', attrs = '' } = {}) {
      const idAttr = id ? ' id="' + esc(id) + '"' : ''
      const sizeClass = size ? ' ' + esc(size) : ''
      return '<button class="button icon-text ' + esc(kind) + sizeClass + '"' + idAttr + (attrs ? ' ' + attrs : '') + '>' +
        (icon ? iconHtml(icon) : '') +
        '<span class="button-label">' + esc(label) + '</span>' +
      '</button>'
    }
    function refreshIcons() {
      if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons()
    }
    const fmt = (value) => {
      try { return JSON.stringify(value, null, 2) } catch { return String(value) }
    }
    const normalizeSdkEndpoint = (value) => String(value || '').trim().replace(/^https?:\\/\\//, '').replace(/\\/+$/, '').toLowerCase()
    const normalizeRestEndpoint = (value) => {
      const trimmed = String(value || '').trim().replace(/\\/+$/, '')
      if (!trimmed) return ''
      return (trimmed.startsWith('http') ? trimmed : 'https://' + trimmed).toLowerCase()
    }
    function selectedBrazeCluster() {
      const sdkEndpoint = normalizeSdkEndpoint(el('sdkEndpoint').value)
      const restEndpoint = normalizeRestEndpoint(el('restEndpoint').value)
      return brazeClusters.find((cluster) =>
        cluster.id !== 'custom' &&
        normalizeSdkEndpoint(cluster.sdkEndpoint) === sdkEndpoint &&
        normalizeRestEndpoint(cluster.restEndpoint) === restEndpoint
      ) || brazeClusters[0]
    }
    function renderBrazeClusterOptions() {
      el('brazeCluster').innerHTML = brazeClusters
        .map((cluster) => '<option value="' + esc(cluster.id) + '">' + esc(cluster.label) + '</option>')
        .join('')
    }
    function updateBrazeClusterState() {
      const cluster = selectedBrazeCluster()
      el('brazeCluster').value = cluster.id
      const sdkEndpoint = normalizeSdkEndpoint(el('sdkEndpoint').value)
      const restEndpoint = normalizeRestEndpoint(el('restEndpoint').value)
      const sdkMatch = brazeClusters.find((item) => item.id !== 'custom' && normalizeSdkEndpoint(item.sdkEndpoint) === sdkEndpoint)
      const restMatch = brazeClusters.find((item) => item.id !== 'custom' && normalizeRestEndpoint(item.restEndpoint) === restEndpoint)
      const note = el('brazeClusterNote')
      if (cluster.id !== 'custom') {
        note.className = 'field-note'
        note.textContent = 'Using ' + cluster.label + ' endpoints.'
      } else if (sdkMatch && restMatch && sdkMatch.id !== restMatch.id) {
        note.className = 'field-note warn'
        note.textContent = 'SDK endpoint matches ' + sdkMatch.label + ', but REST endpoint matches ' + restMatch.label + '.'
      } else if (sdkEndpoint || restEndpoint) {
        note.className = 'field-note'
        note.textContent = 'Custom endpoints will be saved exactly as entered.'
      } else {
        note.className = 'field-note'
        note.textContent = 'Choose a cluster to fill SDK and REST endpoints.'
      }
    }
    function applyBrazeCluster(clusterId) {
      const cluster = brazeClusters.find((item) => item.id === clusterId) || brazeClusters[0]
      if (cluster.id !== 'custom') {
        el('sdkEndpoint').value = cluster.sdkEndpoint
        el('restEndpoint').value = cluster.restEndpoint
      }
      updateBrazeClusterState()
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
      state.busy = busy
      document.querySelectorAll('button').forEach((button) => {
        const navigation = button.matches('[data-view], [data-view-jump], #presentationToggle, #refreshCockpit, #refreshFeed')
        if (!navigation) button.disabled = busy
      })
      renderTopStatus()
      updateActionAvailability()
    }
    const selectedPlatform = () => (el('platform') && el('platform').value) || (state.data && state.data.active.platform) || 'android'
    const currentPackId = () => (el('pack') && el('pack').value) || (state.data && state.data.active.profile && state.data.active.profile.packId) || ''
    const appliedExternalId = () => (state.data && state.data.active.profile && state.data.active.profile.externalId) || ''
    const pendingExternalId = () => (el('externalId') ? el('externalId').value.trim() : appliedExternalId())
    const selectedDeviceRuntime = () => {
      const device = state.data && state.data.active.runtime && state.data.active.runtime.device ? state.data.active.runtime.device : null
      return device && device.platform === selectedPlatform() ? device : null
    }
    const reportedExternalId = () => {
      const device = selectedDeviceRuntime()
      return device && device.externalId ? device.externalId : ''
    }
    const expectedSourceForPlatform = () => {
      const runtime = state.data && state.data.active.runtime && state.data.active.runtime.manifest ? state.data.active.runtime.manifest : {}
      const expected = runtime.expectedSources || {}
      return expected[selectedPlatform()] || ''
    }
    const activeRuntimeManifest = () => state.data && state.data.active.runtime && state.data.active.runtime.manifest ? state.data.active.runtime.manifest : {}
    const runtimeBlockReason = () => {
      const device = selectedDeviceRuntime()
      const runtime = activeRuntimeManifest()
      const platform = selectedPlatform()
      if (!device) return 'Launch the selected app and wait for native runtime telemetry.'
      if (device.id && runtime.id && device.id !== runtime.id) return platform + ' reported pack ' + device.id + ', expected ' + runtime.id + '.'
      if (device.configHash && runtime.configHash && device.configHash !== runtime.configHash) return platform + ' reported hash ' + device.configHash + ', expected ' + runtime.configHash + '.'
      const expectedSource = expectedSourceForPlatform()
      if (expectedSource && device.sourceUrl && device.sourceUrl !== expectedSource) return platform + ' reported source ' + device.sourceUrl + ', expected ' + expectedSource + '.'
      const applied = appliedExternalId()
      if (device.externalId && applied && device.externalId !== applied) return platform + ' reported user ' + device.externalId + ', expected ' + applied + '.'
      return ''
    }
    const identityBlockReason = () => {
      const pending = pendingExternalId()
      const applied = appliedExternalId()
      const reported = reportedExternalId()
      if (!pending) return 'Enter an External User ID.'
      if (pending !== applied) return 'Apply this user before running demo controls.'
      if (reported && reported !== applied) return 'Waiting for the selected app to report the applied user.'
      return ''
    }
    const activePushReadiness = () => state.data && state.data.active.runtime ? state.data.active.runtime.push : null
    const activeTrustDiagnostics = () => state.data && state.data.active.runtime ? state.data.active.runtime.trust : null
    const trustDiagnosticsReason = () => {
      if (selectedPlatform() !== 'android') return ''
      const trust = activeTrustDiagnostics()
      if (!trust) return 'Waiting for Android HTTPS trust telemetry.'
      if (trust.platform && trust.platform !== selectedPlatform()) return 'Waiting for Android HTTPS trust telemetry from the selected platform.'
      const applied = appliedExternalId()
      if (trust.externalId && applied && trust.externalId !== applied) return 'Android HTTPS trust was reported for ' + trust.externalId + ', expected ' + applied + '.'
      if (!trust.ready) {
        const target = trust.failingCheck ? ' (' + trust.failingCheck + ')' : ''
        return trust.error || ('Android HTTPS trust is failing' + target + '.')
      }
      return ''
    }
    const pushReadinessReason = () => {
      const push = activePushReadiness()
      if (!push) return 'Waiting for native push-token telemetry.'
      if (push.platform && push.platform !== selectedPlatform()) return 'Waiting for push-token telemetry from the selected platform.'
      const applied = appliedExternalId()
      if (push.externalId && applied && push.externalId !== applied) return 'Push token was reported for ' + push.externalId + ', expected ' + applied + '.'
      if (selectedPlatform() === 'android') {
        if (push.permission !== 'granted') return 'Android notification permission is not granted.'
        if (push.notificationsEnabled === false) return 'Android app notifications are disabled in system settings.'
        if (push.notificationChannelsSupported) {
          const activeChannel = push.activeChannelId || push.defaultChannelId || '(default)'
          const demoChannel = push.highVisibilityChannelId || 'braze_demo_high_v1'
          if (push.channelBlocked) return 'Android notification channel ' + activeChannel + ' is blocked.'
          if (Number(push.channelImportance || 0) === 0) return 'Android notification channel ' + activeChannel + ' has no display importance.'
          if (push.preferredChannelBlocked) return 'Android high-visibility demo channel ' + demoChannel + ' is blocked.'
          if (Number(push.preferredChannelImportance || 0) === 0) return 'Android high-visibility demo channel ' + demoChannel + ' has no display importance.'
        }
      }
      if (!push.tokenPresent || !push.ready) {
        if (push.retryScheduled) return 'Native push token is not ready yet; retry is scheduled.'
        return push.registrationError || 'Native push token is not ready for this user.'
      }
      return ''
    }
    const controlRequiresPush = (control) => Boolean(control && control.requiresPushToken)
    const controlRequiresTrust = (control) => {
      if (selectedPlatform() !== 'android' || !control) return false
      const payload = control.payload || {}
      const eventName = payload.name || payload.eventName || ''
      return controlRequiresPush(control) || eventName === 'demo_iam_trigger'
    }
    const controlBlockReason = (control = null) => {
      const runtimeReason = runtimeBlockReason()
      if (runtimeReason) return runtimeReason
      const identityReason = identityBlockReason()
      if (identityReason) return identityReason
      if (controlRequiresTrust(control)) {
        const trustReason = trustDiagnosticsReason()
        if (trustReason) return trustReason
      }
      if (controlRequiresPush(control)) {
        const pushReason = pushReadinessReason()
        if (pushReason) return pushReason
      }
      return ''
    }
    const identityBlocked = () => Boolean(identityBlockReason())
    const generatedExternalId = () => {
      const packId = currentPackId() || 'demo'
      const suffix = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())).slice(0, 8)
      return packId + '-demo-' + Date.now().toString(36) + '-' + suffix
    }
    function updateActionAvailability() {
      renderIdentityStatus()
      const blocked = Boolean(controlBlockReason())
      ;['exportUser', 'builderExecute', 'cockpitRestRun', 'cockpitRestStage'].forEach((id) => {
        if (el(id)) el(id).disabled = state.busy || blocked
      })
      const selected = selectedControl()
      const locked = Boolean(selected && selected.locked)
      ;['builderLabel', 'builderType', 'builderTransport', 'builderPlatform', 'builderPayload', 'builderRequiresPushToken'].forEach((id) => {
        if (el(id)) el(id).disabled = state.busy || locked || !selected
      })
      ;['builderUpdate'].forEach((id) => {
        if (el(id)) el(id).disabled = state.busy || locked || !selected
      })
      ;['builderStage', 'templatePromote'].forEach((id) => {
        if (el(id)) el(id).disabled = state.busy || !selected
      })
      if (el('templateUnlock')) el('templateUnlock').disabled = state.busy || !locked
      document.querySelectorAll('[data-execute]').forEach((button) => {
        const control = allControls().find((item) => item.id === button.dataset.execute)
        const reason = controlBlockReason(control)
        button.disabled = state.busy || Boolean(reason)
        button.title = reason || ''
      })
    }
    const entryKey = (scope, entry, index) => scope + ':' + (entry.id || entry.ts || index)
    const isAudienceActivity = (entry) => {
      if (!entry) return false
      if (entry.type === 'job') return entry.status === 'success' || entry.status === 'error'
      if (diagnosticsOnlyTypes.has(entry.type)) return false
      if (entry.status === 'error') return true
      return audienceActivityTypes.has(entry.type)
    }
    const audienceRows = (rows) => (rows || []).filter(isAudienceActivity)
    const diagnosticsRows = (rows) => (rows || []).filter((entry) => !isAudienceActivity(entry))
    const rememberOpenDetails = (root) => {
      if (!root) return
      root.querySelectorAll('details[data-detail-key]').forEach((details) => {
        if (details.open) state.openDetails.add(details.dataset.detailKey)
        else state.openDetails.delete(details.dataset.detailKey)
      })
    }
    async function load() {
      const response = await fetch('/api/state', { cache: 'no-store' })
      state.data = await response.json()
      render()
    }
    function render() {
      if (!state.data) return
      renderNav()
      renderTopStatus()
      renderSetup()
      renderReadiness()
      renderStoryControls()
      renderBuilder()
      renderFeed()
      renderTemplates()
      renderDiagnostics()
      renderJobLog()
      updateActionAvailability()
      refreshIcons()
    }
    function renderLiveActivity() {
      if (!state.data) return
      renderTopStatus()
      renderReadiness()
      renderActivityInto('recentActivity', audienceRows(state.data.ledger).slice(0, state.presentation ? 8 : 5))
      if (el('builderActivity')) renderActivityInto('builderActivity', audienceRows(state.data.ledger).slice(0, 4))
      renderFeed()
      renderDiagnostics()
      renderJobLog()
      updateActionAvailability()
      refreshIcons()
    }
    function scheduleLiveRender() {
      if (state.liveRenderTimer) return
      state.liveRenderTimer = window.setTimeout(() => {
        state.liveRenderTimer = null
        renderLiveActivity()
      }, 100)
    }
    function applyLiveState(data) {
      state.data = data
      scheduleLiveRender()
    }
    function applyJobUpdate(update) {
      if (!state.data || !update || !update.job) return
      const jobs = Array.isArray(state.data.jobs) ? [...state.data.jobs] : []
      const index = jobs.findIndex((job) => job.id === update.job.id)
      const current = index >= 0 ? jobs[index] : { logs: [] }
      const currentLogs = Array.isArray(current.logs) ? current.logs : []
      const appendedLogs = Array.isArray(update.logs) ? update.logs : []
      const logOffset = Number.isInteger(update.logOffset) ? update.logOffset : currentLogs.length
      if (logOffset > currentLogs.length) {
        refreshLiveState()
        return
      }
      const next = {
        ...current,
        ...update.job,
        logs: [...currentLogs.slice(0, logOffset), ...appendedLogs],
      }
      delete next.logCount
      if (index >= 0) jobs[index] = next
      else jobs.unshift(next)
      state.data = { ...state.data, jobs: jobs.slice(0, 10) }
      scheduleLiveRender()
    }
    async function refreshLiveState() {
      try {
        const response = await fetch('/api/state', { cache: 'no-store' })
        applyLiveState(await response.json())
        if (state.live !== 'connected') state.live = 'polling'
      } catch {
        if (state.live !== 'connected') state.live = 'reconnecting'
      }
      renderTopStatus()
    }
    function startLivePolling() {
      if (state.livePollTimer) return
      state.live = 'polling'
      refreshLiveState()
      state.livePollTimer = window.setInterval(refreshLiveState, 2000)
    }
    function stopLivePolling() {
      if (!state.livePollTimer) return
      window.clearInterval(state.livePollTimer)
      state.livePollTimer = null
    }
    function connectLiveUpdates() {
      if (!window.EventSource) {
        startLivePolling()
        return
      }
      const events = new EventSource('/api/events')
      events.addEventListener('state', (event) => {
        state.live = 'connected'
        stopLivePolling()
        applyLiveState(JSON.parse(event.data))
      })
      events.addEventListener('job', (event) => {
        state.live = 'connected'
        stopLivePolling()
        applyJobUpdate(JSON.parse(event.data))
      })
      events.onopen = () => {
        state.live = 'connected'
        stopLivePolling()
        renderTopStatus()
      }
      events.onerror = () => {
        startLivePolling()
      }
    }
    function renderNav() {
      if (state.presentation) state.view = 'cockpit'
      if (state.view === 'builder') state.view = 'templates'
      const title = titles[state.view] || titles.cockpit
      el('pageTitle').textContent = state.presentation ? 'Presentation Mode' : title[0]
      el('pageSubtitle').textContent = title[1]
      document.querySelectorAll('[data-view]').forEach((button) => {
        button.classList.toggle('active', button.dataset.view === state.view)
      })
      document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'))
      el('view-' + state.view).classList.add('active')
      el('shell').classList.toggle('presentation', state.presentation)
      el('presentationToggle').innerHTML = state.presentation
        ? iconHtml('log-out') + '<span class="button-label">Exit</span>'
        : iconHtml('presentation') + '<span class="button-label">Present</span>'
      refreshIcons()
    }
    function renderTopStatus() {
      if (!state.data) return
      const profile = state.data.active.profile
      const runtime = state.data.active.runtime && state.data.active.runtime.manifest ? state.data.active.runtime.manifest : {}
      const blockers = readinessChecks().filter((item) => item.level === 'error').length
      el('topStatus').innerHTML = [
        '<span class="chip ' + (state.busy ? 'warn' : blockers ? 'error' : 'success') + '">' + (state.busy ? 'Working' : blockers ? blockers + ' blocker' + (blockers > 1 ? 's' : '') : 'Ready') + '</span>',
        '<span class="chip ' + (state.live === 'connected' || state.live === 'polling' ? 'success' : 'warn') + '">' + (state.live === 'connected' ? 'Live' : state.live === 'polling' ? 'Live polling' : 'Live reconnecting') + '</span>',
        '<span class="chip">' + esc(profile.packName || runtime.name || profile.packId || 'demo') + '</span>',
      ].join('')
    }
    function renderSetup() {
      const data = state.data
      const profile = data.active.profile
      el('callback').textContent = 'Device callback: ' + data.active.callbackUrl
      el('pack').innerHTML = data.packs.map((pack) => '<option value="' + esc(pack.id) + '">' + esc(pack.name) + '</option>').join('')
      el('pack').value = profile.packId
      el('platform').value = data.active.platform || 'android'
      if (!state.identityDirty && document.activeElement !== el('externalId')) el('externalId').value = profile.externalId || ''
      if (!state.displayNameDirty && document.activeElement !== el('displayName')) el('displayName').value = profile.displayName || ''
      el('packStatus').textContent = profile.packName || profile.packId || '-'
      renderIdentityStatus()
      if (state.credentialsPackId !== profile.packId) loadCredentials(profile.packId).catch(() => {})
    }
    function renderIdentityStatus() {
      const reason = identityBlockReason()
      const pending = pendingExternalId()
      const applied = appliedExternalId()
      const reported = reportedExternalId()
      const status = el('identityStatus')
      if (!status) return
      status.className = 'chip ' + (reason ? 'warn' : 'success')
      status.textContent = reason
        ? 'Pending user: ' + (pending || '-') + ' · Applied: ' + (applied || '-') + (reported && reported !== applied ? ' · App: ' + reported : '')
        : 'Applied user: ' + (applied || '-')
    }
    async function loadCredentials(packId) {
      const response = await fetch('/api/credentials?packId=' + encodeURIComponent(packId), { cache: 'no-store' })
      const credentials = await response.json()
      state.credentialsPackId = credentials.packId
      el('sdkApiKey').value = ''
      el('sdkApiKey').placeholder = credentials.fields.brazeApiKey || 'Keep current'
      el('sdkEndpoint').value = credentials.fields.brazeEndpoint || ''
      el('restEndpoint').value = credentials.fields.brazeRestEndpoint || ''
      updateBrazeClusterState()
      el('restApiKey').value = ''
      el('restApiKey').placeholder = credentials.configured.rest
        ? 'Session key active (' + (credentials.security.restKeySource || 'configured') + ')'
        : 'Session only, never saved'
      el('firebaseSenderId').value = ''
      el('firebaseSenderId').placeholder = credentials.fields.firebaseSenderId || 'Keep current'
      el('profileName').value = credentials.fields.demoProfileName || ''
      el('credentialStatus').textContent = [
        credentials.configured.sdk ? 'SDK ready' : 'SDK missing',
        credentials.configured.rest ? 'REST ' + (credentials.security.restKeySource || 'ready') : 'REST missing',
        credentials.security.legacyRestKeyIgnored ? 'legacy REST key ignored' : '',
        credentials.security.restEnvName ? 'env ' + credentials.security.restEnvName : '',
      ].filter(Boolean).join(' · ')
      el('credentialStatus').className = 'chip ' + (credentials.configured.sdk ? 'success' : 'warn')
    }
    function readinessChecks() {
      const data = state.data
      if (!data) return []
      const profile = data.active.profile
      const deviceRuntime = data.active.runtime && data.active.runtime.device ? data.active.runtime.device : null
      const job = data.jobs && data.jobs[0]
      const failedJobIsCurrent = Boolean(job && job.status === 'failed' && (
        !deviceRuntime ||
        !deviceRuntime.ts ||
        !job.finishedAt ||
        Date.parse(job.finishedAt) >= Date.parse(deviceRuntime.ts)
      ))
      const platform = data.active.platform || 'android'
      const controls = runnableStoryControls()
      const needsRest = allControls().some((control) => control.transport === 'braze_rest' || restActionTypes.includes(control.type))
      const identityReason = identityBlockReason()
      const runtimeReason = runtimeBlockReason()
      const trustReason = trustDiagnosticsReason()
      const pushReason = pushReadinessReason()
      const push = activePushReadiness()
      const pushWarning = !pushReason && push && push.lastPushChannelWarning ? push.lastPushChannelWarning : ''
      const trust = activeTrustDiagnostics()
      const accessLevel = profile.sdkConfigured && (!needsRest || profile.restConfigured)
        ? 'success'
        : profile.sdkConfigured
          ? 'warn'
          : 'error'
      const accessTitle = profile.sdkConfigured
        ? (needsRest && !profile.restConfigured ? 'SDK ready, REST unavailable' : 'Braze actions ready')
        : 'SDK not configured'
      const accessDetail = profile.sdkConfigured
        ? (needsRest && !profile.restConfigured ? 'SDK story moments can run. REST-only controls stay in diagnostics until a session key is available.' : 'SDK and configured REST story moments can run for the active user.')
        : 'Add SDK API key and endpoint before running app SDK story moments.'
      const deviceLevel = runtimeReason
        ? 'error'
        : failedJobIsCurrent
        ? 'error'
        : job && job.status === 'running'
          ? 'warn'
          : deviceRuntime
            ? 'success'
            : 'warn'
      const deviceTitle = job && job.status === 'running'
        ? job.step
        : failedJobIsCurrent
          ? 'Launch needs attention'
          : runtimeReason
            ? 'Runtime not aligned'
            : deviceRuntime
            ? (platform === 'ios' ? 'iOS reported ready' : 'Android reported ready')
            : 'Device not yet reported'
      const deviceDetail = failedJobIsCurrent
        ? ((job.failedStep || job.step || 'Launch failed') + '. Open Logs for the underlying launcher error.')
        : deviceRuntime
        ? (runtimeReason || 'Latest native handshake received. Identity and source details are in Diagnostics.')
        : 'Build/install/launch the selected platform to confirm the app is ready.'
      const pushLevel = !push
        ? 'warn'
        : pushReason
          ? (push.retryScheduled ? 'warn' : 'error')
          : pushWarning
            ? 'warn'
          : 'success'
      const pushTitle = !push
        ? 'Push token unknown'
        : pushReason
          ? 'Push not ready'
          : pushWarning
            ? 'Push channel warning'
          : 'Push token ready'
      const pushDetail = !push
        ? 'Run push readiness after launch to verify native token binding.'
        : pushReason || pushWarning || ('Token telemetry is current for ' + (push.externalId || profile.externalId || 'the active user') + (platform === 'android' && push.highVisibilityChannelId ? '; demo channel ' + push.highVisibilityChannelId + ' importance ' + (push.preferredChannelImportance || 'unknown') + '.' : '.'))
      const trustLevel = platform !== 'android'
        ? 'success'
        : trustReason
          ? (deviceRuntime ? 'error' : 'warn')
          : 'success'
      const trustTitle = platform !== 'android'
        ? 'Trust managed by iOS'
        : !trust
          ? 'Android trust unknown'
          : trustReason
            ? 'Android trust failing'
            : 'Android trust ready'
      const trustDetail = platform !== 'android'
        ? 'APNs and media trust use the iOS simulator or device trust store.'
        : !trust
          ? 'Launch readiness will run native HTTPS diagnostics for Braze image media and Firebase endpoints.'
          : trustReason || 'Native HTTPS diagnostics passed for Braze image media and Firebase endpoints.'
      return [
        {
          label: 'Demo',
          level: profile.packId ? 'success' : 'error',
          title: profile.packName || profile.packId || 'No demo pack selected',
          detail: profile.packId ? 'Current app story selected for the live run.' : 'Choose a demo pack before running controls.',
        },
        {
          label: 'Braze',
          level: accessLevel,
          title: accessTitle,
          detail: accessDetail,
        },
        {
          label: 'Device',
          level: deviceLevel,
          title: deviceTitle,
          detail: deviceDetail,
        },
        {
          label: 'Trust',
          level: trustLevel,
          title: trustTitle,
          detail: trustDetail,
        },
        {
          label: 'Push',
          level: pushLevel,
          title: pushTitle,
          detail: pushDetail,
        },
        {
          label: 'User',
          level: identityReason ? 'warn' : 'success',
          title: identityReason ? 'User change pending' : (profile.externalId || 'Applied user'),
          detail: identityReason || 'SDK and REST controls target the applied External User ID.',
        },
        {
          label: 'Story',
          level: controls.length ? 'success' : 'warn',
          title: controls.length ? controls.length + ' controls ready' : 'No story controls pinned',
          detail: controls.length ? 'Pinned controls are ready in the cockpit.' : 'Pin or stage controls before the live walkthrough.',
        },
      ]
    }
    function renderReadiness() {
      el('readiness').innerHTML = readinessChecks().map((item) => (
        '<div class="ready-row ' + esc(item.level) + '">' +
          '<span class="ready-dot" aria-hidden="true"></span>' +
          '<div class="ready-copy"><span class="ready-label">' + esc(item.label) + '</span><strong>' + esc(item.title) + '</strong><p>' + esc(item.detail) + '</p></div>' +
        '</div>'
      )).join('')
    }
    function allControls() {
      return state.data && state.data.active && state.data.active.presets ? state.data.active.presets : []
    }
    function selectedControl() {
      return allControls().find((control) => control.id === state.selectedControlId) || null
    }
    function controlMatchesTemplateFilter(control) {
      const type = control.type || ''
      const transport = control.transport || control.source || ''
      if (state.templateFilter === 'all') return true
      if (state.templateFilter === 'story') return control.pinned && !control.hidden
      if (state.templateFilter === 'staged') return Boolean(control.staged)
      if (state.templateFilter === 'identity') return ['change_user', 'sdk_attribute', 'rest_attribute', 'profile_export'].includes(type)
      if (state.templateFilter === 'events') return ['sdk_event', 'sdk_event_sequence', 'rest_event', 'android_sequence'].includes(type)
      if (state.templateFilter === 'purchases') return ['sdk_purchase', 'rest_purchase'].includes(type)
      if (state.templateFilter === 'messaging') return ['campaign_trigger', 'canvas_trigger', 'push_permission', 'push_readiness', 'trust_diagnostics'].includes(type)
      if (state.templateFilter === 'content_cards') return type === 'content_cards_refresh'
      if (state.templateFilter === 'rest_api') return transport === 'braze_rest' || restActionTypes.includes(type)
      if (state.templateFilter === 'navigation') return type === 'navigate'
      return true
    }
    function runnableStoryControls() {
      const controls = allControls().filter((control) => control.type !== 'change_user')
      const pinned = controls.filter((control) => control.pinned && !control.hidden)
      if (pinned.length) return pinned.slice(0, state.presentation ? 8 : 6)
      return controls.filter((control) => !control.hidden && ['standard', 'pack_library', 'pack_story', 'staged'].includes(control.origin)).slice(0, state.presentation ? 8 : 6)
    }
    function controlCard(control, mode) {
      const meta = [
        control.staged ? 'demo staged' : (control.origin || 'template'),
        control.transport || control.source || '',
        control.requiresPushToken ? 'push token required' : '',
        ['campaign_trigger', 'canvas_trigger'].includes(control.type || '') && !control.requiresPushToken ? 'message channel unverified' : '',
        control.pinned ? 'pinned' : '',
        control.locked ? 'locked' : '',
      ].filter(Boolean).join(' · ')
      const actions = mode === 'story'
        ? buttonHtml({ kind: 'primary', size: 'compact', icon: 'play', label: 'Run', attrs: 'data-execute="' + esc(control.id) + '"' }) +
          buttonHtml({ kind: 'ghost presentation-hide', size: 'compact', icon: 'pencil', label: 'Edit', attrs: 'data-tailor-control="' + esc(control.id) + '"' }) +
          buttonHtml({ kind: 'ghost presentation-hide', size: 'compact', icon: control.pinned ? 'pin-off' : 'pin', label: control.pinned ? 'Unpin' : 'Pin', attrs: 'data-pin="' + esc(control.id) + '"' })
        : buttonHtml({ kind: 'primary', size: 'compact', icon: 'sliders-horizontal', label: 'Tailor', attrs: 'data-tailor-control="' + esc(control.id) + '"' }) +
          (!control.staged ? buttonHtml({ kind: 'secondary', size: 'compact', icon: 'bookmark-plus', label: 'Stage', attrs: 'data-stage="' + esc(control.id) + '"' }) : '') +
          buttonHtml({ kind: 'ghost', size: 'compact', icon: control.pinned ? 'pin-off' : 'pin', label: control.pinned ? 'Unpin' : 'Pin', attrs: 'data-pin="' + esc(control.id) + '"' }) +
          (control.staged ? buttonHtml({ kind: 'ghost', size: 'compact', icon: control.locked ? 'unlock' : 'lock', label: control.locked ? 'Unlock' : 'Lock', attrs: 'data-lock="' + esc(control.id) + '"' }) : '') +
          buttonHtml({ kind: 'ghost', size: 'compact', icon: control.hidden ? 'eye' : 'eye-off', label: control.hidden ? 'Show' : 'Hide', attrs: 'data-hide="' + esc(control.id) + '"' }) +
          (control.staged ? buttonHtml({ kind: 'ghost', size: 'compact', icon: 'arrow-up-circle', label: 'Promote', attrs: 'data-promote="' + esc(control.id) + '"' }) : '')
      return '<article class="control-card row-card ' + (control.hidden ? 'hidden-control ' : '') + (state.selectedControlId === control.id ? 'selected-control' : '') + '">' +
        '<div class="control-main">' +
          '<strong>' + esc(control.label || control.id) + '</strong>' +
          '<p>' + esc(control.description || control.type || 'Control') + '</p>' +
          '<div class="control-meta">' + esc(meta) + '</div>' +
        '</div>' +
        '<div class="control-actions">' + actions + '</div>' +
      '</article>'
    }
    function bindControlActions(root) {
      root.querySelectorAll('[data-execute]').forEach((button) => button.addEventListener('click', () => executeControl(button.dataset.execute)))
      root.querySelectorAll('[data-tailor-control]').forEach((button) => button.addEventListener('click', () => tailorControl(button.dataset.tailorControl)))
      root.querySelectorAll('[data-stage]').forEach((button) => button.addEventListener('click', () => stageExistingControl(button.dataset.stage)))
      root.querySelectorAll('[data-pin]').forEach((button) => button.addEventListener('click', () => toggleVisibility(button.dataset.pin, 'pinned')))
      root.querySelectorAll('[data-lock]').forEach((button) => button.addEventListener('click', () => toggleVisibility(button.dataset.lock, 'locked')))
      root.querySelectorAll('[data-hide]').forEach((button) => button.addEventListener('click', () => toggleVisibility(button.dataset.hide, 'hidden')))
      root.querySelectorAll('[data-promote]').forEach((button) => button.addEventListener('click', () => promoteControl(button.dataset.promote)))
    }
    function renderStoryControls() {
      const controls = runnableStoryControls()
      el('storyControls').className = 'story-list'
      el('storyControls').innerHTML = controls.length ? controls.map((control) => controlCard(control, 'story')).join('') : '<div class="empty">Pin controls from Control Templates to build the story for this demo.</div>'
      bindControlActions(el('storyControls'))
      renderActivityInto('recentActivity', audienceRows(state.data.ledger).slice(0, state.presentation ? 8 : 5))
    }
    function renderBuilder() {
      if (!el('templateEditorForm')) return
      if (el('builderType').options.length !== actionTypes.length) {
        el('builderType').innerHTML = actionTypes.map((type) => '<option value="' + esc(type) + '">' + esc(type) + '</option>').join('')
      }
      const selected = selectedControl()
      el('templateEditorEmpty').hidden = Boolean(selected)
      el('templateEditorForm').hidden = !selected
      if (!selected) {
        state.editorLoadedControlId = ''
        el('builderPreview').textContent = ''
        el('builderValidation').textContent = 'Ready'
        el('builderValidation').className = 'chip'
        return
      }
      if (state.editorLoadedControlId !== selected.id) fillBuilder(selected)
      const locked = Boolean(selected.locked)
      ;['builderLabel', 'builderType', 'builderTransport', 'builderPlatform', 'builderPayload', 'builderRequiresPushToken'].forEach((id) => {
        if (el(id)) el(id).disabled = locked || state.busy
      })
      el('templateEditorTitle').textContent = selected.locked ? 'Locked staged control' : 'Tailor staged control'
      el('templateEditorSubtitle').textContent = selected.staged
        ? 'This editable copy belongs to the active demo session. Promote it only when it should become reusable pack structure.'
        : 'Tailor creates a staged copy before editing so source templates stay unchanged.'
      el('templateEditorContext').textContent = [
        selected.staged ? 'Staged' : (selected.origin || 'Template'),
        selected.transport || selected.source || '',
        selected.platform || '',
        selected.locked ? 'locked' : '',
      ].filter(Boolean).join(' · ')
      el('templateUnlock').style.display = locked ? '' : 'none'
      el('templatePromote').style.display = selected.staged ? '' : 'none'
      updateBuilderPreview()
      renderActivityInto('builderActivity', audienceRows(state.data.ledger).slice(0, 4))
    }
    function fillBuilder(control) {
      state.selectedControlId = control.id
      state.editorLoadedControlId = control.id
      el('builderLabel').value = control.label || ''
      el('builderType').value = control.type || 'sdk_event'
      el('builderTransport').value = control.transport && control.transport !== 'android_sdk' && control.transport !== 'ios_sdk' ? control.transport : (control.source === 'braze_rest' ? 'braze_rest' : 'app_sdk')
      el('builderPlatform').value = control.platform || (el('builderTransport').value === 'braze_rest' ? 'host' : selectedPlatform())
      el('builderPayload').value = fmt(control.payload || {})
      el('builderRequiresPushToken').checked = Boolean(control.requiresPushToken)
      updateBuilderPreview()
    }
    function currentBuilderBody() {
      const type = el('builderType').value
      let payload = parseJson('builderPayload')
      if (type === 'braze_rest_request' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
        payload = {
          ...payload,
          body: hydrateRestBody(payload.path || payload.endpoint, payload.body || {}),
          query: payload.query || {},
        }
      }
      return {
        sourceControlId: state.selectedControlId,
        label: el('builderLabel').value.trim() || 'Untitled control',
        type,
        transport: el('builderTransport').value,
        platform: el('builderPlatform').value,
        payload,
        requiresPushToken: el('builderRequiresPushToken').checked,
      }
    }
    function isBrazeTriggerSend(body) {
      if (!body || body.transport !== 'braze_rest') return false
      if (['campaign_trigger', 'canvas_trigger'].includes(body.type)) return true
      if (body.type !== 'braze_rest_request') return false
      const payload = body.payload || {}
      const path = String(payload.path || payload.endpoint || '').toLowerCase()
      return path === '/campaigns/trigger/send' || path === '/canvas/trigger/send'
    }
    function updateBuilderPreview() {
      try {
        const body = currentBuilderBody()
        el('builderPreview').textContent = fmt(body)
        const warnings = []
        if (['app_sdk', 'android_sdk', 'ios_sdk'].includes(body.transport) && !['android', 'ios'].includes(body.platform)) warnings.push('SDK transport requires Android or iOS platform.')
        if (body.transport === 'android_sdk' && body.platform !== 'android') warnings.push('Android SDK is pinned to Android.')
        if (body.transport === 'ios_sdk' && body.platform !== 'ios') warnings.push('iOS SDK is pinned to iOS.')
        if (body.transport === 'braze_rest' && !restActionTypes.includes(body.type)) warnings.push('REST supports focused REST actions and safe custom requests.')
        if (isBrazeTriggerSend(body) && !body.requiresPushToken) warnings.push('Message channel unknown; push readiness will not block this trigger unless push token is required.')
        el('builderValidation').textContent = warnings.length ? warnings.join(' ') : 'Valid'
        el('builderValidation').className = 'chip ' + (warnings.length ? 'warn' : 'success')
      } catch (error) {
        el('builderPreview').textContent = error.message || String(error)
        el('builderValidation').textContent = 'Invalid JSON'
        el('builderValidation').className = 'chip error'
      }
    }
    function renderFeed() {
      const query = (el('feedSearch').value || '').toLowerCase()
      const status = el('feedStatus').value
      const category = el('feedCategory').value
      const rows = audienceRows(state.data.ledger).filter((entry) => {
        const haystack = [
          entry.displayTitle,
          entry.displaySummary,
          entry.category,
          entry.severity,
          entry.label,
          entry.type,
          entry.source,
          entry.platform,
          entry.transport,
          entry.externalId,
          fmt(entry.primaryContext || []),
          fmt(entry.payload),
          fmt(entry.result),
          fmt(entry.response),
        ].join(' ').toLowerCase()
        return (!query || haystack.includes(query)) &&
          (!status || (entry.severity || entry.status) === status) &&
          (!category || entry.category === category)
      })
      renderActivityInto('feedActivity', rows)
    }
    function renderTemplates() {
      const controls = allControls().filter(controlMatchesTemplateFilter)
      el('templateCount').textContent = controls.length + ' of ' + allControls().length + ' controls'
      el('templateFilters').innerHTML = templateCategories.map(([id, label]) => (
        buttonHtml({ kind: state.templateFilter === id ? 'ghost active' : 'ghost', size: 'compact', label, attrs: 'data-template-filter="' + esc(id) + '"' })
      )).join('')
      el('templateFilters').querySelectorAll('[data-template-filter]').forEach((button) => {
        button.addEventListener('click', () => {
          state.templateFilter = button.dataset.templateFilter
          renderTemplates()
          refreshIcons()
        })
      })
      el('templateControls').className = 'template-list'
      el('templateControls').innerHTML = controls.length ? controls.map((control) => controlCard(control, 'template')).join('') : '<div class="empty">No controls match this filter.</div>'
      bindControlActions(el('templateControls'))
    }
    function renderDiagnostics() {
      const runtime = state.data.active.runtime && state.data.active.runtime.manifest ? state.data.active.runtime.manifest : {}
      el('runtimeDetails').textContent = fmt(runtime)
      const diagnostics = {
        selectedPlatform: state.data.active.platform,
        deviceRuntime: state.data.active.runtime && state.data.active.runtime.device ? state.data.active.runtime.device : null,
        warnings: state.data.active.runtime && state.data.active.runtime.warnings ? state.data.active.runtime.warnings : [],
        restCredential: {
          configured: state.data.active.profile.restConfigured,
          source: state.data.active.profile.restCredentialSource,
          envName: state.data.active.profile.restCredentialEnvName,
          legacyKeyIgnored: state.data.active.profile.restLegacyKeyIgnored,
        },
      }
      el('deviceDetails').textContent = fmt(diagnostics)
      renderActivityInto('debugActivity', diagnosticsRows(state.data.ledger).slice(0, 30), { diagnostics: true })
      const responses = state.data.restResponses || []
      rememberOpenDetails(el('restActivity'))
      el('restActivity').innerHTML = responses.length ? responses.map((entry, index) => {
        const key = entryKey('rest', entry, index)
        const open = state.openDetails.has(key) ? ' open' : ''
        return (
        '<article class="event"><div class="event-top"><strong>' + esc(entry.endpoint || 'REST response') + '</strong><time>' + esc(new Date(entry.ts).toLocaleTimeString()) + '</time></div>' +
        '<div class="event-summary">' + esc(entry.ok ? 'Braze REST returned successfully.' : 'Braze REST returned an error.') + '</div>' +
        '<div class="event-meta"><span class="tag ' + (entry.ok ? 'success' : 'error') + '">' + esc(entry.status) + '</span></div>' +
        '<details data-detail-key="' + esc(key) + '"' + open + '><summary>Show response JSON</summary><pre class="json light">' + esc(fmt(entry.body)) + '</pre></details></article>'
        )
      }).join('') : '<div class="empty">No REST responses yet.</div>'
    }
    function summaryFor(entry) {
      if (entry.displaySummary) return entry.displaySummary
      const request = entry.request || entry.payload || {}
      const response = entry.response || entry.result || null
      if (entry.status === 'error') return 'This action did not complete. Open details for the exact error and validation context.'
      if (entry.type === 'profile_export') return 'The active user profile was exported so profile, events, purchases, apps, and push token data can be checked.'
      if (entry.type === 'campaign_trigger') return 'A campaign trigger was sent for the active user.'
      if (entry.type === 'canvas_trigger') return 'A Canvas trigger was sent for the active user.'
      if (entry.type === 'rest_event') return 'A REST event was tracked for the active user.'
      if (entry.type === 'rest_attribute') return 'REST profile attributes were tracked for the active user.'
      if (entry.type === 'rest_purchase') return 'A REST purchase was tracked for the active user.'
      if (entry.type === 'braze_rest_request') return 'A safe custom Braze REST request was sent from the host launcher.'
      if (entry.type === 'change_user') return 'The selected app SDK user was changed for this demo.'
      if (entry.type === 'sdk_event') {
        const name = request.commands && request.commands[0] && request.commands[0].payload ? request.commands[0].payload.name : entry.payload && entry.payload.name
        return 'The SDK captured event "' + (name || 'custom event') + '" for this user.'
      }
      if (entry.type === 'sdk_attribute' && entry.seedSync) {
        const payload = request.commands && request.commands[0] && request.commands[0].payload ? request.commands[0].payload : entry.payload || {}
        const attributes = payload.attributes && typeof payload.attributes === 'object' ? payload.attributes : {}
        const keys = Object.keys(attributes)
        return keys.length
          ? 'The SDK explicitly applied ' + keys.length + ' demo seed attributes: ' + keys.slice(0, 6).join(', ') + (keys.length > 6 ? ' +' + (keys.length - 6) + ' more' : '') + '.'
          : 'The SDK explicitly applied the active pack demo seed attributes.'
      }
      if (entry.type === 'sdk_attribute') return 'The SDK updated profile attributes for this user.'
      if (entry.type === 'sdk_purchase') return 'The SDK captured a purchase for this user.'
      if (entry.type === 'push_permission') return 'The app handled notification permission for this user.'
      if (entry.type === 'push_received') return 'The app received a real Braze push and reported the native display path.'
      if (entry.type === 'push_opened') return 'A native push notification was opened and routed into the app.'
      if (entry.type === 'push_deleted') return 'A native push notification was dismissed.'
      if (entry.type === 'push_preview') return 'Diagnostics-only native notification preview; this is not proof of Braze push delivery.'
      if (entry.type === 'content_card_impression') return 'A Content Card impression was recorded for this user.'
      if (entry.type === 'content_card_click') return 'A Content Card click was recorded for this user.'
      if (entry.type === 'content_cards_refresh') return 'The app requested fresh Content Cards from the SDK.'
      if (entry.type === 'foreground_push') return 'Legacy diagnostics-only notification preview; this is not proof of Braze push delivery.'
      if (entry.type === 'job') return response && response.error ? response.error : 'The launcher updated demo runtime, build, install, or launch state.'
      return 'The control room recorded this demo activity and its response.'
    }
    function titleFor(entry) {
      if (entry.type === 'sdk_attribute' && entry.seedSync) return 'Demo Seed Attributes Synced'
      return entry.displayTitle || entry.label || entry.type || 'Activity Recorded'
    }
    function severityFor(entry) {
      const severity = entry.severity || entry.status || 'info'
      if (severity === 'success' || severity === 'error' || severity === 'warning') return severity
      if (severity === 'warn') return 'warning'
      return 'info'
    }
    function categoryFor(entry) {
      return entry.category || (entry.transport === 'braze_rest' ? 'rest' : entry.type === 'job' ? 'launcher' : 'diagnostics')
    }
    function categoryLabel(category) {
      const labels = {
        launcher: 'Launcher',
        sdk: 'SDK',
        rest: 'REST',
        message: 'Message',
        profile: 'Profile',
        content_cards: 'Content Cards',
        push: 'Push',
        diagnostics: 'Diagnostics',
        error: 'Failure',
      }
      return labels[category] || category || 'Activity'
    }
    function categoryIcon(category, severity) {
      if (severity === 'error' || category === 'error') return 'triangle-alert'
      const icons = {
        launcher: 'rocket',
        sdk: 'activity',
        rest: 'send',
        message: 'message-square',
        profile: 'user',
        content_cards: 'panel-top',
        push: 'bell',
        diagnostics: 'stethoscope',
      }
      return icons[category] || 'activity'
    }
    function severityLabel(severity) {
      if (severity === 'success') return 'Success'
      if (severity === 'error') return 'Error'
      if (severity === 'warning') return 'Warning'
      return 'Info'
    }
    function transportLabel(entry) {
      const platform = entry.platform === 'ios' ? 'iOS' : entry.platform === 'android' ? 'Android' : entry.platform === 'host' ? 'Host' : entry.platform || ''
      const transport = entry.transport || entry.source || ''
      if (transport === 'braze_rest') return 'Braze REST'
      if (transport === 'android_sdk') return 'Android SDK'
      if (transport === 'ios_sdk') return 'iOS SDK'
      if (transport === 'app_sdk') return platform ? platform + ' SDK' : 'App SDK'
      if (transport === 'device_callback') return platform ? platform + ' callback' : 'Device callback'
      if (transport === 'ios_bridge') return 'iOS bridge'
      if (transport === 'web_bridge') return 'Web bridge'
      if (transport === 'launcher') return 'Launcher'
      return [platform, transport].filter(Boolean).join(' ')
    }
    function contextFor(entry, diagnostics) {
      if (Array.isArray(entry.primaryContext) && entry.primaryContext.length) return entry.primaryContext
      return [
        { label: 'Platform', value: entry.platform },
        { label: 'Transport', value: transportLabel(entry) },
        diagnostics ? { label: 'Type', value: entry.type } : null,
        { label: 'User', value: entry.externalId },
      ].filter((item) => item && item.value)
    }
    function renderContext(entry, diagnostics) {
      const seen = new Set()
      return contextFor(entry, diagnostics).filter((item) => {
        const key = String(item.label || '') + ':' + String(item.value || '')
        if (!item.value || seen.has(key)) return false
        seen.add(key)
        return true
      }).slice(0, diagnostics ? 6 : 5).map((item) => (
        '<span class="tag"><span class="event-meta-key">' + esc(item.label || 'Meta') + ':</span>' + esc(item.value) + '</span>'
      )).join('')
    }
    function renderActivityInto(id, rows, options = {}) {
      const root = el(id)
      rememberOpenDetails(root)
      const signature = rows.map((entry) => [entry.id || entry.ts || entry.label || entry.type, entry.displayTitle, entry.severity, entry.category].join(':')).join('|')
      if (state.activitySignatures[id] === signature && root.children.length) return
      state.activitySignatures[id] = signature
      root.innerHTML = rows.length ? rows.map((entry, index) => {
        const key = entryKey(id, entry, index)
        const open = state.openDetails.has(key) ? ' open' : ''
        const severity = severityFor(entry)
        const category = categoryFor(entry)
        const detailsLabel = options.diagnostics ? 'Raw JSON' : 'Details'
        return '<article class="event ' + esc(severity) + '">' +
          '<div class="event-top">' +
            '<div class="event-heading">' +
              '<span class="event-icon">' + iconHtml(categoryIcon(category, severity)) + '</span>' +
              '<div class="event-title">' +
                '<strong>' + esc(titleFor(entry)) + '</strong>' +
                '<div class="event-badges"><span class="tag">' + esc(categoryLabel(category)) + '</span><span class="tag ' + esc(severity) + '">' + esc(severityLabel(severity)) + '</span></div>' +
              '</div>' +
            '</div>' +
            '<time>' + esc(new Date(entry.ts).toLocaleTimeString()) + '</time>' +
          '</div>' +
          '<div class="event-summary">' + esc(summaryFor(entry)) + '</div>' +
          '<div class="event-meta">' + renderContext(entry, options.diagnostics) + '</div>' +
          '<details data-detail-key="' + esc(key) + '"' + open + '><summary>' + detailsLabel + '</summary><pre class="json light">' + esc(fmt(options.diagnostics ? entry : { request: entry.request || entry.payload, response: entry.response || entry.result, validation: entry.validation })) + '</pre></details>' +
        '</article>'
      }).join('') : '<div class="empty">No activity yet.</div>'
    }
    function renderJobLog() {
      const job = state.data.jobs && state.data.jobs[0]
      if (!job) return
      const logs = Array.isArray(job.logs) ? job.logs : []
      const signature = [job.id, job.status, job.step, logs.length, logs[logs.length - 1] || ''].join(':')
      if (state.jobLogSignature === signature) return
      state.jobLogSignature = signature
      el('logs').textContent = logs.length ? logs.join('\\n') : 'Waiting for output.'
      el('logs').scrollTop = el('logs').scrollHeight
    }
    async function executeControl(controlId) {
      const control = allControls().find((item) => item.id === controlId)
      const reason = controlBlockReason(control)
      if (reason) return alert(reason)
      try {
        setBusy(true)
        await request('/api/presets/execute', { presetId: controlId, externalId: appliedExternalId(), platform: selectedPlatform(), payloadOverride: {} })
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    }
    async function executeBuilder() {
      const body = currentBuilderBody()
      const reason = controlBlockReason(body)
      if (reason) return alert(reason)
      try {
        setBusy(true)
        await request('/api/triggers/execute', {
          transport: body.transport,
          platform: body.platform,
          actionType: body.type,
          label: body.label,
          externalId: appliedExternalId(),
          payload: body.payload,
        })
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    }
    async function stageExistingControl(controlId) {
      try {
        setBusy(true)
        const response = await request('/api/controls/stage', { sourceControlId: controlId, pin: true })
        if (response.state) state.data = response.state
        else await load()
        render()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    }
    async function stageBuilderControl() {
      try {
        setBusy(true)
        const response = await request('/api/controls/stage', { ...currentBuilderBody(), pin: true })
        if (response.stagedControlId) state.selectedControlId = response.stagedControlId
        state.editorLoadedControlId = ''
        if (response.state) {
          state.data = response.state
          render()
        } else {
          await load()
        }
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    }
    async function updateBuilderControl() {
      try {
        setBusy(true)
        await request('/api/controls/update', { controlId: state.selectedControlId, ...currentBuilderBody() })
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    }
    async function toggleVisibility(controlId, key) {
      const control = allControls().find((item) => item.id === controlId)
      if (!control) return
      try {
        setBusy(true)
        await request('/api/controls/visibility', { controlId, [key]: !Boolean(control[key]) })
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    }
    async function promoteControl(controlId) {
      try {
        setBusy(true)
        await request('/api/controls/promote', { controlId })
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    }
    async function tailorControl(controlId) {
      const control = allControls().find((item) => item.id === controlId)
      if (!control) return
      state.view = 'templates'
      if (control.staged) {
        state.selectedControlId = control.id
        state.editorLoadedControlId = ''
        render()
        return
      }
      try {
        setBusy(true)
        const response = await request('/api/controls/stage', { sourceControlId: controlId, pin: true })
        if (response.stagedControlId) state.selectedControlId = response.stagedControlId
        state.editorLoadedControlId = ''
        if (response.state) {
          state.data = response.state
          render()
        } else {
          await load()
        }
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    }
    function customRestPayload(prefix = 'customRest') {
      const path = el(prefix + 'Path').value.trim()
      const method = el(prefix + 'Method').value
      const query = parseJson(prefix + 'Query')
      const body = hydrateRestBody(path, parseJson(prefix + 'Body'))
      return { method, path, query, body }
    }
    function hydrateRestBody(path, body) {
      const externalId = appliedExternalId()
      if (!externalId || !body || typeof body !== 'object' || Array.isArray(body)) return body
      const normalizedPath = String(path || '').toLowerCase()
      if (normalizedPath === '/users/track') {
        const next = { ...body }
        ;['events', 'attributes', 'purchases'].forEach((key) => {
          if (Array.isArray(next[key])) {
            next[key] = next[key].map((item) => item && typeof item === 'object' && !Array.isArray(item) && !item.external_id ? { external_id: externalId, ...item } : item)
          }
        })
        return next
      }
      if ((normalizedPath === '/campaigns/trigger/send' || normalizedPath === '/canvas/trigger/send') && !Array.isArray(body.recipients)) {
        return {
          ...body,
          recipients: [
            {
              external_user_id: externalId,
              trigger_properties: body.trigger_properties || body.triggerProperties || { source: 'control_room' },
              send_to_existing_only: body.send_to_existing_only !== false,
            },
          ],
        }
      }
      return body
    }
    async function runCustomRestControl(prefix = 'customRest') {
      const reason = controlBlockReason()
      if (reason) return alert(reason)
      try {
        setBusy(true)
        await request('/api/triggers/execute', {
          transport: 'braze_rest',
          platform: 'host',
          actionType: 'braze_rest_request',
          label: el(prefix + 'Label').value.trim() || 'Custom Braze REST request',
          externalId: appliedExternalId(),
          payload: customRestPayload(prefix),
        })
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    }
    async function applyUser() {
      try {
        setBusy(true)
        await request('/api/identity/apply', {
          packId: currentPackId(),
          platform: selectedPlatform(),
          externalId: pendingExternalId(),
          displayName: el('displayName').value.trim(),
        })
        state.identityDirty = false
        state.displayNameDirty = false
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    }
    async function createAndApplyUser() {
      el('externalId').value = generatedExternalId()
      state.identityDirty = true
      renderIdentityStatus()
      await applyUser()
    }
    async function stageCustomRestControl(prefix = 'customRest') {
      const reason = identityBlockReason()
      if (reason) return alert(reason)
      try {
        setBusy(true)
        await request('/api/controls/stage', {
          label: el(prefix + 'Label').value.trim() || 'Custom Braze REST request',
          description: 'Safe host-side Braze REST request staged from the Control Room.',
          type: 'braze_rest_request',
          transport: 'braze_rest',
          platform: 'host',
          payload: customRestPayload(prefix),
          pin: true,
        })
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    }
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        state.view = button.dataset.view
        render()
      })
    })
    document.querySelectorAll('[data-view-jump]').forEach((button) => {
      button.addEventListener('click', () => {
        state.view = button.dataset.viewJump
        if (button.dataset.templateFilterJump) state.templateFilter = button.dataset.templateFilterJump
        render()
      })
    })
    el('presentationToggle').addEventListener('click', () => {
      state.presentation = !state.presentation
      render()
    })
    el('saveActive').addEventListener('click', async () => {
      try {
        setBusy(true)
        await request('/api/active', {
          packId: el('pack').value,
          platform: selectedPlatform(),
          displayName: el('displayName').value.trim(),
        })
        state.displayNameDirty = false
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    })
    el('applyUser').addEventListener('click', applyUser)
    el('createApplyUser').addEventListener('click', createAndApplyUser)
    el('apply').addEventListener('click', async () => {
      try {
        setBusy(true)
        await request('/api/run', { packId: el('pack').value, platform: selectedPlatform(), applyOnly: true })
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
        await request('/api/run', { packId: el('pack').value, platform: selectedPlatform(), applyOnly: false, simulator: 'iPhone 17' })
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    })
    el('saveCredentials').addEventListener('click', async () => {
      try {
        setBusy(true)
        await request('/api/credentials', {
          packId: el('pack').value,
          brazeApiKey: el('sdkApiKey').value.trim(),
          brazeEndpoint: el('sdkEndpoint').value.trim(),
          brazeRestEndpoint: el('restEndpoint').value.trim(),
          sessionRestApiKey: el('restApiKey').value.trim(),
          firebaseSenderId: el('firebaseSenderId').value.trim(),
          demoExternalId: el('externalId').value.trim(),
          demoProfileName: el('profileName').value.trim(),
          demoDisplayName: el('displayName').value.trim(),
        })
        state.credentialsPackId = ''
        await load()
      } catch (error) {
        alert(error.message || String(error))
      } finally {
        setBusy(false)
      }
    })
    el('exportUser').addEventListener('click', async () => {
      const reason = identityBlockReason()
      if (reason) return alert(reason)
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
    el('builderLabel').addEventListener('input', updateBuilderPreview)
    el('builderType').addEventListener('change', updateBuilderPreview)
    el('builderTransport').addEventListener('change', updateBuilderPreview)
    el('builderPlatform').addEventListener('change', updateBuilderPreview)
    el('externalId').addEventListener('input', () => {
      state.identityDirty = true
      renderIdentityStatus()
      updateActionAvailability()
    })
    el('displayName').addEventListener('input', () => {
      state.displayNameDirty = true
    })
    el('brazeCluster').addEventListener('change', () => {
      applyBrazeCluster(el('brazeCluster').value)
    })
    el('sdkEndpoint').addEventListener('input', updateBrazeClusterState)
    el('restEndpoint').addEventListener('input', updateBrazeClusterState)
    el('platform').addEventListener('change', () => {
      if (el('builderTransport').value !== 'braze_rest') el('builderPlatform').value = selectedPlatform()
      updateBuilderPreview()
      renderIdentityStatus()
      updateActionAvailability()
    })
    el('pack').addEventListener('change', () => {
      state.credentialsPackId = ''
      loadCredentials(el('pack').value).catch(() => {})
    })
    el('builderPayload').addEventListener('input', updateBuilderPreview)
    el('builderRequiresPushToken').addEventListener('change', updateBuilderPreview)
    el('builderExecute').addEventListener('click', executeBuilder)
    el('builderStage').addEventListener('click', stageBuilderControl)
    el('builderUpdate').addEventListener('click', updateBuilderControl)
    el('templatePromote').addEventListener('click', () => {
      if (state.selectedControlId) promoteControl(state.selectedControlId)
    })
    el('templateUnlock').addEventListener('click', () => {
      if (state.selectedControlId) toggleVisibility(state.selectedControlId, 'locked')
    })
    el('feedSearch').addEventListener('input', renderFeed)
    el('feedStatus').addEventListener('change', renderFeed)
    el('feedCategory').addEventListener('change', renderFeed)
    el('refreshCockpit').addEventListener('click', load)
    el('refreshFeed').addEventListener('click', load)
    el('cockpitRestRun').addEventListener('click', () => runCustomRestControl('cockpitRest'))
    el('cockpitRestStage').addEventListener('click', () => stageCustomRestControl('cockpitRest'))
    renderBrazeClusterOptions()
    updateBrazeClusterState()
    load().then(connectLiveUpdates).catch((error) => {
      el('topStatus').innerHTML = '<span class="chip error">Failed</span>'
      el('logs').textContent = error.stack || String(error)
    })
  </script>
</body>
</html>`
}
