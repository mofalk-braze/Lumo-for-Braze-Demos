const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

const sourceRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'app-source')
  : path.resolve(__dirname, '..', '..')
const designSystemSource = path.join(sourceRoot, 'Braze Design System (Collaborative)')
const appName = 'Braze Demo Studio'
const appIconPath = path.join(__dirname, '..', 'assets', 'logo.png')

app.setName(appName)
if (process.env.BRAZE_DEMO_STUDIO_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.BRAZE_DEMO_STUDIO_USER_DATA))
}

let mainWindow = null
let launcherProcess = null
let launcherUrl = ''
let launcherHealth = null
let launcherStatus = 'stopped'
let currentLogFile = ''
let recentLogs = []

function appIconDataUrl() {
  if (!fs.existsSync(appIconPath)) return ''
  return `data:image/png;base64,${fs.readFileSync(appIconPath).toString('base64')}`
}

function userDataRoot() {
  return app.getPath('userData')
}

function workspacesRoot() {
  return path.join(userDataRoot(), 'workspaces')
}

function logsRoot() {
  return path.join(userDataRoot(), 'logs')
}

function statePath() {
  return path.join(userDataRoot(), 'studio-state.json')
}

function ensureDirs() {
  fs.mkdirSync(workspacesRoot(), { recursive: true })
  fs.mkdirSync(logsRoot(), { recursive: true })
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function readStudioState() {
  const state = readJson(statePath(), { activeWorkspaceId: '', workspaces: [] })
  return {
    activeWorkspaceId: state.activeWorkspaceId || '',
    workspaces: Array.isArray(state.workspaces) ? state.workspaces : [],
    firstRun: {
      completed: Boolean(state.firstRun?.completed),
      mode: state.firstRun?.mode || '',
      completedAt: state.firstRun?.completedAt || '',
    },
  }
}

function writeStudioState(state) {
  writeJson(statePath(), state)
}

function updateStudioState(mutator) {
  const state = readStudioState()
  state.workspaces = Array.isArray(state.workspaces) ? state.workspaces : []
  mutator(state)
  writeStudioState(state)
  broadcastState()
  return state
}

function slug(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'workspace'
}

function activeWorkspace() {
  const state = readStudioState()
  return state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) || null
}

function workspaceForId(id) {
  return readStudioState().workspaces.find((workspace) => workspace.id === id) || null
}

function shouldSkipCopy(relativePath, name) {
  const normalized = relativePath.split(path.sep).join('/')
  if (!normalized) return false
  if (name === '.DS_Store') return true
  if (normalized === '.git' || normalized.startsWith('.git/')) return true
  if (normalized === '.demo-packs' || normalized.startsWith('.demo-packs/')) return true
  if (normalized === '.demo-launcher' || normalized.startsWith('.demo-launcher/')) return true
  if (normalized === 'node_modules' || normalized.endsWith('/node_modules') || normalized.includes('/node_modules/')) return true
  if (normalized === 'demo-studio/dist' || normalized.startsWith('demo-studio/dist/')) return true
  if (normalized === 'web-template/dist' || normalized.startsWith('web-template/dist/')) return true
  if (normalized === 'web-template/public/demo-assets' || normalized.startsWith('web-template/public/demo-assets/')) return true
  if (normalized === 'web-template/public/demo-runtime.json') return true
  if (normalized === 'web-template/src/brand/activeDemoConfig.generated.ts') return true
  if (normalized === 'android-shell/.gradle' || normalized.startsWith('android-shell/.gradle/')) return true
  if (normalized === 'android-shell/build' || normalized.startsWith('android-shell/build/')) return true
  if (normalized === 'android-shell/app/build' || normalized.startsWith('android-shell/app/build/')) return true
  if (normalized === 'android-shell/local.properties') return true
  if (normalized === 'android-shell/.active-demo-pack') return true
  if (normalized === 'ios-shell/DerivedData' || normalized.startsWith('ios-shell/DerivedData/')) return true
  if (normalized === 'ios-shell/build' || normalized.startsWith('ios-shell/build/')) return true
  if (normalized.startsWith('ios-shell/') && /\.(xcodeproj|xcworkspace)(\/|$)/.test(normalized)) return true
  if (normalized === 'ios-shell/Sources/Config.swift') return true
  if (normalized === 'Braze Design System (Collaborative)' || normalized.startsWith('Braze Design System (Collaborative)/')) return true
  if (/^demo-packs\/[^/]+\/secrets\.properties$/.test(normalized)) return true
  if (/\.env($|\.)/.test(name)) return true
  if (/\.(jks|keystore|p8|p12|mobileprovision|cer|certSigningRequest)$/i.test(name)) return true
  if (/service-account|firebase-service-account|braze-secrets/i.test(name)) return true
  return false
}

function isForbiddenKitPath(relativePath, name) {
  const normalized = relativePath.split(path.sep).join('/')
  return (
    name === 'secrets.properties' ||
    name === 'local.properties' ||
    name === 'Config.swift' ||
    name === 'activeDemoConfig.generated.ts' ||
    name === 'demo-runtime.json' ||
    /^\.env($|\.)/.test(name) ||
    /\.(jks|keystore|p8|p12|mobileprovision|cer|certSigningRequest)$/i.test(name) ||
    /service-account|firebase-service-account|braze-secrets/i.test(name) ||
    normalized.includes('/build/') ||
    normalized.includes('/DerivedData/') ||
    normalized.includes('/node_modules/')
  )
}

async function copySourceToWorkspace(targetRepoPath) {
  await fs.promises.mkdir(path.dirname(targetRepoPath), { recursive: true })
  await fs.promises.cp(sourceRoot, targetRepoPath, {
    recursive: true,
    dereference: false,
    filter: (source) => {
      const relative = path.relative(sourceRoot, source)
      return !shouldSkipCopy(relative, path.basename(source))
    },
  })
}

function appendLog(line) {
  const text = typeof line === 'string' ? line : String(line)
  if (!currentLogFile) {
    fs.mkdirSync(logsRoot(), { recursive: true })
    currentLogFile = path.join(logsRoot(), `studio-${new Date().toISOString().replace(/[:.]/g, '-')}.log`)
  }
  recentLogs = [...recentLogs, text].slice(-120)
  fs.appendFileSync(currentLogFile, `${text}\n`)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('studio:log', { ts: new Date().toISOString(), line: text })
  }
}

function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('studio:state', publicStudioState())
  }
}

function publicStudioState() {
  const state = readStudioState()
  return {
    appName,
    userDataRoot: userDataRoot(),
    workspacesRoot: workspacesRoot(),
    logsRoot: logsRoot(),
    logFile: currentLogFile,
    recentLogs,
    activeWorkspaceId: state.activeWorkspaceId || '',
    workspaces: state.workspaces || [],
    firstRun: state.firstRun,
    readiness: studioReadiness(),
    launcher: {
      status: launcherStatus,
      url: launcherUrl,
      health: launcherHealth,
      pid: launcherProcess?.pid || 0,
    },
  }
}

function commandPath(command) {
  const result = spawnSync('/bin/zsh', ['-lc', `command -v ${command}`], {
    encoding: 'utf8',
    timeout: 5000,
  })
  return result.status === 0 ? result.stdout.trim() : ''
}

function existsInWorkspace(workspace, relativePath) {
  return Boolean(workspace?.repoPath && fs.existsSync(path.join(workspace.repoPath, relativePath)))
}

function firstExecutable(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate) && (fs.statSync(candidate).mode & 0o111)) || ''
}

function safeAndroidToolGlob(parent, toolName) {
  if (!fs.existsSync(parent)) return []
  return fs.readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parent, entry.name, 'bin', toolName))
}

function findAndroidTool(androidHome, toolName) {
  return firstExecutable([
    path.join(androidHome, 'cmdline-tools/latest/bin', toolName),
    ...safeAndroidToolGlob(path.join(androidHome, 'cmdline-tools'), toolName),
    `/Applications/Android Studio.app/Contents/plugins/android/resources/commandlinetools/bin/${toolName}`,
  ])
}

function commandOk(command, args = [], timeout = 15000) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout })
  return result.status === 0
}

function hasAndroidAvd(emulatorPath) {
  if (!emulatorPath) return false
  const result = spawnSync(emulatorPath, ['-list-avds'], { encoding: 'utf8', timeout: 15000 })
  if (result.status !== 0) return false
  const avdName = process.env.BRAZE_DEMO_ANDROID_AVD || 'Braze_Demo_API_36'
  return result.stdout.split(/\r?\n/).includes(avdName)
}

function studioReadiness() {
  const workspace = activeWorkspace()
  const androidHome = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk')
  const brew = commandPath('brew')
  const npm = commandPath('npm')
  const java = commandPath('java')
  const xcodebuild = commandPath('xcodebuild')
  const xcodegen = commandPath('xcodegen')
  const xcrun = commandPath('xcrun')
  const androidStudioPath = '/Applications/Android Studio.app'
  const xcodePath = '/Applications/Xcode.app'
  const sdkmanager = findAndroidTool(androidHome, 'sdkmanager')
  const avdmanager = findAndroidTool(androidHome, 'avdmanager')
  const adb = firstExecutable([process.env.ADB, path.join(androidHome, 'platform-tools/adb')])
  const emulator = firstExecutable([process.env.EMULATOR, path.join(androidHome, 'emulator/emulator')])
  const rootDeps = existsInWorkspace(workspace, 'node_modules')
  const webDeps = existsInWorkspace(workspace, 'web-template/node_modules')
  const firebaseClient = existsInWorkspace(workspace, 'android-shell/app/google-services.json') ||
    fs.existsSync(path.join(sourceRoot, 'android-shell/app/google-services.json'))
  const avdReady = hasAndroidAvd(emulator)
  const xcodeLicenseReady = xcodebuild ? commandOk(xcodebuild, ['-checkFirstLaunchStatus'], 10000) : false
  return {
    electronNode: {
      status: 'ready',
      detail: 'Bundled with Braze Demo Studio for launcher and doctor commands.',
    },
    homebrew: {
      status: brew ? 'ready' : 'manual',
      detail: brew || 'Install Homebrew once, then use Install system tools.',
    },
    npm: {
      status: npm ? 'ready' : 'missing',
      detail: npm || 'Required for dependency install and web builds.',
    },
    workspace: {
      status: workspace ? 'ready' : 'missing',
      detail: workspace?.repoPath || 'Create or select a workspace.',
    },
    web: {
      status: rootDeps && webDeps ? 'ready' : 'setup',
      detail: rootDeps && webDeps ? 'Root and web-template dependencies are installed.' : 'Run Install deps from Studio.',
    },
    java: {
      status: java ? 'ready' : 'setup',
      detail: java || 'Install Java 17 with Install system tools.',
    },
    androidStudio: {
      status: fs.existsSync(androidStudioPath) ? 'ready' : 'manual',
      detail: fs.existsSync(androidStudioPath) ? androidStudioPath : 'Install Android Studio, then open SDK Manager once.',
    },
    androidSdk: {
      status: sdkmanager && avdmanager && adb && emulator ? 'ready' : 'setup',
      detail: sdkmanager && avdmanager && adb && emulator
        ? androidHome
        : 'Install Android SDK Command-line Tools, Platform Tools, and Emulator in Android Studio.',
    },
    androidAvd: {
      status: avdReady ? 'ready' : 'setup',
      detail: avdReady ? (process.env.BRAZE_DEMO_ANDROID_AVD || 'Braze_Demo_API_36') : 'Run Provision AVD after Android SDK tools are installed.',
    },
    android: {
      status: java && sdkmanager && avdmanager && adb && emulator && avdReady && firebaseClient ? 'ready' : 'setup',
      detail: java && sdkmanager && avdmanager && adb && emulator && avdReady && firebaseClient
        ? 'Android demo path is ready for build and launch.'
        : 'Complete Java, Android SDK, AVD, and Firebase client config checks.',
    },
    xcode: {
      status: xcodebuild && xcrun && xcodeLicenseReady ? 'ready' : 'manual',
      detail: xcodebuild && xcrun && xcodeLicenseReady
        ? (fs.existsSync(xcodePath) ? xcodePath : xcodebuild)
        : 'Install Xcode, open it once, and accept first-launch/license prompts.',
    },
    xcodegen: {
      status: xcodegen ? 'ready' : 'setup',
      detail: xcodegen || 'Install xcodegen with Install system tools.',
    },
    ios: {
      status: xcodebuild && xcrun && xcodeLicenseReady && xcodegen ? 'ready' : 'setup',
      detail: xcodebuild && xcrun && xcodeLicenseReady && xcodegen
        ? 'iOS simulator build path is ready.'
        : 'Complete Xcode first launch and xcodegen setup.',
    },
    firebaseClient: {
      status: firebaseClient ? 'ready' : 'manual',
      detail: firebaseClient ? 'Committed SolCon Firebase client config is present.' : 'Add Firebase client google-services.json for Android package com.braze.demoshell.',
    },
    firebaseServiceAccount: {
      status: 'manual',
      detail: 'Do not bundle service accounts. Configure Firebase credentials in Braze dashboard/admin setup.',
    },
    apns: {
      status: 'manual',
      detail: 'Apple team signing and APNs keys stay outside Studio; use only for a deliberate iOS push setup.',
    },
  }
}

function stopLauncher() {
  if (!launcherProcess) return
  appendLog(`Stopping launcher pid ${launcherProcess.pid}`)
  launcherProcess.kill('SIGTERM')
  launcherProcess = null
  launcherUrl = ''
  launcherHealth = null
  launcherStatus = 'stopped'
  broadcastState()
}

function loadingHtml(message, detail = '') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${appName}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f1fb; color: #17131f; letter-spacing: 0; }
    .panel { width: min(460px, calc(100vw - 40px)); border: 1px solid #ddd5e9; border-radius: 8px; background: #fff; padding: 24px; box-shadow: 0 18px 42px rgba(34, 18, 62, 0.1); }
    img { width: 54px; height: 54px; border-radius: 12px; display: block; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 22px; line-height: 1.16; }
    p { margin: 8px 0 0; color: #686176; font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main class="panel">
    ${appIconDataUrl() ? `<img src="${appIconDataUrl()}" alt="" />` : ''}
    <h1>${message}</h1>
    <p>${detail}</p>
  </main>
</body>
</html>`
}

function loadLoadingScreen(message = 'Starting Braze Demo Studio', detail = 'Preparing the local Control Room workspace.') {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml(message, detail))}`)
}

function loadControlRoomUrl(url) {
  if (!mainWindow || mainWindow.isDestroyed() || !url) return
  mainWindow.loadURL(url)
}

function startLauncher(workspace) {
  stopLauncher()
  if (!workspace?.repoPath) {
    launcherStatus = 'missing-workspace'
    broadcastState()
    return Promise.resolve(null)
  }

  launcherStatus = 'starting'
  launcherUrl = ''
  launcherHealth = null
  broadcastState()

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      BRAZE_CONTROL_ROOM_STARTUP_JSON: '1',
      BRAZE_DEMO_WORKSPACE_ROOT: workspace.repoPath,
    }
    if (fs.existsSync(designSystemSource)) env.BRAZE_DESIGN_SYSTEM_DIR = designSystemSource

    const child = spawn(process.execPath, [path.join(workspace.repoPath, 'tools/demo-launcher.mjs'), '--startup-json'], {
      cwd: workspace.repoPath,
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    launcherProcess = child
    appendLog(`Starting launcher for ${workspace.name} at ${workspace.repoPath}`)
    appendLog('Using Braze Demo Studio bundled Node runtime for the launcher.')

    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      launcherStatus = 'starting'
      broadcastState()
      resolve(null)
    }, 15000)

    const handleOutput = (data) => {
      for (const line of data.toString().split(/\r?\n/)) {
        if (!line.trim()) continue
        appendLog(line)
        const marker = 'BRAZE_DEMO_LAUNCHER_READY '
        if (line.startsWith(marker)) {
          try {
            launcherHealth = JSON.parse(line.slice(marker.length))
            launcherUrl = launcherHealth.url
            launcherStatus = 'running'
            clearTimeout(timeout)
            settled = true
            broadcastState()
            loadControlRoomUrl(launcherUrl)
            resolve(launcherHealth)
          } catch (error) {
            appendLog(`Could not parse launcher readiness: ${error.message}`)
          }
        }
      }
    }

    child.stdout.on('data', handleOutput)
    child.stderr.on('data', handleOutput)
    child.on('error', (error) => {
      launcherStatus = 'failed'
      appendLog(error.stack || error.message)
      broadcastState()
      if (!settled) {
        clearTimeout(timeout)
        settled = true
        reject(error)
      }
    })
    child.on('close', (code) => {
      if (launcherProcess === child) launcherProcess = null
      launcherStatus = code === 0 ? 'stopped' : 'failed'
      appendLog(`Launcher exited with code ${code}`)
      broadcastState()
      if (!settled) {
        clearTimeout(timeout)
        settled = true
        reject(new Error(`Launcher exited before startup completed with code ${code}`))
      }
    })
  })
}

async function createWorkspace(name = 'Demo Workspace') {
  ensureDirs()
  const id = `${new Date().toISOString().slice(0, 10)}-${slug(name)}-${Date.now().toString(36)}`
  const workspaceDir = path.join(workspacesRoot(), id)
  const repoPath = path.join(workspaceDir, 'repo')
  appendLog(`Creating workspace ${name}`)
  await copySourceToWorkspace(repoPath)
  const workspace = {
    id,
    name,
    repoPath,
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
  }
  updateStudioState((state) => {
    state.workspaces.unshift(workspace)
    state.activeWorkspaceId = workspace.id
  })
  await startLauncher(workspace)
  return publicStudioState()
}

async function ensureInitialWorkspace() {
  ensureDirs()
  const state = readStudioState()
  if (state.workspaces?.length && state.activeWorkspaceId) {
    const workspace = activeWorkspace()
    if (workspace) {
      await startLauncher(workspace)
      return
    }
  }
  await createWorkspace('Default Workspace')
}

async function switchWorkspace(id) {
  const workspace = workspaceForId(id)
  if (!workspace) throw new Error(`Workspace not found: ${id}`)
  updateStudioState((state) => {
    state.activeWorkspaceId = id
    state.workspaces = state.workspaces.map((item) => (
      item.id === id ? { ...item, lastOpenedAt: new Date().toISOString() } : item
    ))
  })
  await startLauncher(workspace)
  return publicStudioState()
}

function runWorkspaceCommand(label, command) {
  const workspace = activeWorkspace()
  if (!workspace) throw new Error('No active workspace selected.')
  appendLog(`Running ${label}`)
  return new Promise((resolve) => {
    const child = spawn('/bin/zsh', ['-lc', command], {
      cwd: workspace.repoPath,
      env: {
        ...process.env,
        ...(fs.existsSync(designSystemSource) ? { BRAZE_DESIGN_SYSTEM_DIR: designSystemSource } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const collect = (data) => {
      const text = data.toString()
      output += text
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) appendLog(line)
      }
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('close', (code) => {
      appendLog(`${label} exited with code ${code}`)
      broadcastState()
      resolve({ code, output })
    })
  })
}

function runWorkspaceNodeScript(label, script, args = []) {
  const workspace = activeWorkspace()
  if (!workspace) throw new Error('No active workspace selected.')
  appendLog(`Running ${label}`)
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(workspace.repoPath, script), ...args], {
      cwd: workspace.repoPath,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        ...(fs.existsSync(designSystemSource) ? { BRAZE_DESIGN_SYSTEM_DIR: designSystemSource } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const collect = (data) => {
      const text = data.toString()
      output += text
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) appendLog(line)
      }
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('close', (code) => {
      appendLog(`${label} exited with code ${code}`)
      broadcastState()
      resolve({ code, output })
    })
  })
}

function containsForbiddenKitFile(root) {
  const hits = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      const relative = path.relative(root, file).split(path.sep).join('/')
      if (isForbiddenKitPath(relative, entry.name)) {
        hits.push(relative)
      }
      if (entry.isDirectory()) walk(file)
    }
  }
  walk(root)
  return hits
}

function findDemoPackJson(root) {
  const candidates = []
  const walk = (dir, depth = 0) => {
    if (depth > 4) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isFile() && entry.name === 'demo-pack.json') candidates.push(file)
      if (entry.isDirectory()) walk(file, depth + 1)
    }
  }
  walk(root)
  return candidates[0] || ''
}

function validatePackFile(file) {
  const pack = readJson(file, null)
  if (!pack || typeof pack !== 'object') throw new Error('demo-pack.json is not valid JSON.')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pack.id || '')) throw new Error('Demo pack id must be kebab-case.')
  for (const key of ['name', 'brand', 'content']) {
    if (!pack[key]) throw new Error(`Demo pack is missing required field: ${key}`)
  }
  return pack
}

async function runDitto(args, cwd = sourceRoot) {
  await new Promise((resolve, reject) => {
    const child = spawn('ditto', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (data) => appendLog(data.toString().trim()))
    child.stderr.on('data', (data) => appendLog(data.toString().trim()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ditto exited with code ${code}`))
    })
  })
}

async function importKit() {
  const workspace = activeWorkspace()
  if (!workspace) throw new Error('No active workspace selected.')
  const selection = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Braze demo kit',
    properties: ['openFile'],
    filters: [{ name: 'Braze Demo Kit', extensions: ['braze-demo-kit', 'zip'] }],
  })
  if (selection.canceled || !selection.filePaths[0]) return publicStudioState()

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'braze-demo-kit-'))
  await runDitto(['-x', '-k', selection.filePaths[0], tempDir])
  const forbidden = containsForbiddenKitFile(tempDir)
  if (forbidden.length) {
    throw new Error(`Kit contains local-only files: ${forbidden.slice(0, 5).join(', ')}`)
  }
  const packJson = findDemoPackJson(tempDir)
  if (!packJson) throw new Error('Kit does not contain demo-pack.json.')
  const pack = validatePackFile(packJson)
  const sourceDir = path.dirname(packJson)
  const targetDir = path.join(workspace.repoPath, '.demo-packs', pack.id)
  if (fs.existsSync(targetDir)) {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Replace', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `Replace existing kit "${pack.name}"?`,
      detail: targetDir,
    })
    if (result.response !== 0) return publicStudioState()
    fs.rmSync(targetDir, { recursive: true, force: true })
  }
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  await fs.promises.cp(sourceDir, targetDir, {
    recursive: true,
    filter: (source) => !isForbiddenKitPath(path.relative(sourceDir, source), path.basename(source)),
  })
  appendLog(`Imported kit ${pack.id}`)
  await startLauncher(workspace)
  return publicStudioState()
}

async function launcherJson(pathname) {
  if (!launcherUrl) throw new Error('Launcher is not running.')
  const response = await fetch(`${launcherUrl}${pathname}`)
  if (!response.ok) throw new Error(`Launcher request failed: ${response.status}`)
  return response.json()
}

function findPackDirectory(repoPath, packId) {
  for (const packsDir of [path.join(repoPath, '.demo-packs'), path.join(repoPath, 'demo-packs')]) {
    if (!fs.existsSync(packsDir)) continue
    for (const entry of fs.readdirSync(packsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const packFile = path.join(packsDir, entry.name, 'demo-pack.json')
      if (!fs.existsSync(packFile)) continue
      const pack = readJson(packFile, null)
      if (pack?.id === packId) return path.join(packsDir, entry.name)
    }
  }
  return ''
}

function completeFirstRun(mode = 'presenter') {
  updateStudioState((state) => {
    state.firstRun = {
      completed: true,
      mode: mode || 'presenter',
      completedAt: new Date().toISOString(),
    }
  })
  return publicStudioState()
}

async function openAppOrUrl(appPath, url, label) {
  appendLog(`Opening ${label}`)
  if (fs.existsSync(appPath)) {
    const result = await shell.openPath(appPath)
    if (result) appendLog(`${label} open warning: ${result}`)
  } else {
    await shell.openExternal(url)
  }
  return publicStudioState()
}

async function exportActiveKit() {
  const workspace = activeWorkspace()
  if (!workspace) throw new Error('No active workspace selected.')
  const health = await launcherJson('/api/health')
  const packDir = findPackDirectory(workspace.repoPath, health.activePackId)
  if (!packDir) throw new Error(`Could not find active pack: ${health.activePackId}`)
  const pack = validatePackFile(path.join(packDir, 'demo-pack.json'))
  const selection = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Braze demo kit',
    defaultPath: `${pack.id}.braze-demo-kit`,
    filters: [{ name: 'Braze Demo Kit', extensions: ['braze-demo-kit'] }],
  })
  if (selection.canceled || !selection.filePath) return publicStudioState()

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'braze-demo-kit-export-'))
  const sanitizedDir = path.join(tempDir, pack.id)
  await fs.promises.cp(packDir, sanitizedDir, {
    recursive: true,
    filter: (source) => !isForbiddenKitPath(path.relative(packDir, source), path.basename(source)),
  })
  const forbidden = containsForbiddenKitFile(sanitizedDir)
  if (forbidden.length) throw new Error(`Export would include local-only files: ${forbidden.join(', ')}`)
  await runDitto(['-c', '-k', '--keepParent', pack.id, selection.filePath], tempDir)
  appendLog(`Exported kit ${pack.id} to ${selection.filePath}`)
  return publicStudioState()
}

function createMenu() {
  const template = [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Open Logs', click: () => shell.openPath(logsRoot()) },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Workspace',
      submenu: [
        { label: 'New Workspace', click: () => mainWindow?.webContents.send('studio:menu-action', 'new-workspace') },
        { label: 'Reveal Workspace', click: () => shell.openPath(activeWorkspace()?.repoPath || workspacesRoot()) },
        { label: 'Restart Control Room', click: () => startLauncher(activeWorkspace()) },
      ],
    },
    {
      label: 'Kits',
      submenu: [
        { label: 'Import Kit...', click: () => importKit().catch((error) => dialog.showErrorBox('Import failed', error.message)) },
        { label: 'Export Active Kit...', click: () => exportActiveKit().catch((error) => dialog.showErrorBox('Export failed', error.message)) },
      ],
    },
    {
      label: 'Setup',
      submenu: [
        { label: 'Run Doctor', click: () => runWorkspaceNodeScript('doctor', 'tools/doctor-solcon.mjs') },
        { label: 'Install System Tools', click: () => runWorkspaceCommand('system tool install', './bootstrap-solcon.sh --install') },
        { label: 'Install Dependencies', click: () => runWorkspaceCommand('dependency install', 'npm install && cd web-template && npm install') },
        { label: 'Provision Android AVD', click: () => runWorkspaceCommand('Android AVD provisioning', './bootstrap-solcon.sh --android-avd') },
        { label: 'Open Android Studio', click: () => openAppOrUrl('/Applications/Android Studio.app', 'https://developer.android.com/studio', 'Android Studio') },
        { label: 'Open Xcode', click: () => openAppOrUrl('/Applications/Xcode.app', 'macappstore://apps.apple.com/app/xcode/id497799835', 'Xcode') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: appName,
    icon: fs.existsSync(appIconPath) ? appIconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  loadLoadingScreen()
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.handle('studio:get-state', () => publicStudioState())
ipcMain.handle('studio:list-workspaces', () => publicStudioState().workspaces)
ipcMain.handle('studio:create-workspace', (_event, name) => createWorkspace(name || 'Demo Workspace'))
ipcMain.handle('studio:switch-workspace', (_event, id) => switchWorkspace(id))
ipcMain.handle('studio:restart-launcher', async () => {
  await startLauncher(activeWorkspace())
  return publicStudioState()
})
ipcMain.handle('studio:run-doctor', () => runWorkspaceNodeScript('doctor', 'tools/doctor-solcon.mjs'))
ipcMain.handle('studio:install-system-tools', () => runWorkspaceCommand('system tool install', './bootstrap-solcon.sh --install'))
ipcMain.handle('studio:install-dependencies', () => runWorkspaceCommand('dependency install', 'npm install && cd web-template && npm install'))
ipcMain.handle('studio:provision-avd', () => runWorkspaceCommand('Android AVD provisioning', './bootstrap-solcon.sh --android-avd'))
ipcMain.handle('studio:open-android-studio', () => openAppOrUrl('/Applications/Android Studio.app', 'https://developer.android.com/studio', 'Android Studio'))
ipcMain.handle('studio:open-xcode', () => openAppOrUrl('/Applications/Xcode.app', 'macappstore://apps.apple.com/app/xcode/id497799835', 'Xcode'))
ipcMain.handle('studio:open-homebrew', async () => {
  appendLog('Opening Homebrew install page')
  await shell.openExternal('https://brew.sh/')
  return publicStudioState()
})
ipcMain.handle('studio:open-braze', async () => {
  appendLog('Opening Braze dashboard')
  await shell.openExternal('https://dashboard.braze.com/')
  return publicStudioState()
})
ipcMain.handle('studio:open-apple-developer', async () => {
  appendLog('Opening Apple Developer account')
  await shell.openExternal('https://developer.apple.com/account/resources/authkeys/list')
  return publicStudioState()
})
ipcMain.handle('studio:open-firebase-console', async () => {
  appendLog('Opening Firebase console')
  await shell.openExternal('https://console.firebase.google.com/')
  return publicStudioState()
})
ipcMain.handle('studio:verify-android', () => runWorkspaceCommand('Android verification', 'cd web-template && npm run build && cd ../android-shell && ./gradlew :app:validateDemoWebAssets :app:compileDebugKotlin'))
ipcMain.handle('studio:verify-ios', () => runWorkspaceCommand('iOS verification', 'cd ios-shell && xcodegen generate && xcodebuild -project BrazeDemoShell.xcodeproj -scheme BrazeDemoShell -sdk iphonesimulator -derivedDataPath ./DerivedData CODE_SIGNING_ALLOWED=NO build'))
ipcMain.handle('studio:import-kit', () => importKit())
ipcMain.handle('studio:export-active-kit', () => exportActiveKit())
ipcMain.handle('studio:open-logs', () => shell.openPath(logsRoot()))
ipcMain.handle('studio:reveal-workspace', () => shell.openPath(activeWorkspace()?.repoPath || workspacesRoot()))
ipcMain.handle('studio:complete-first-run', (_event, mode) => completeFirstRun(mode))

app.whenReady().then(async () => {
  ensureDirs()
  createMenu()
  createWindow()
  try {
    await ensureInitialWorkspace()
  } catch (error) {
    launcherStatus = 'failed'
    appendLog(error.stack || error.message)
    loadLoadingScreen('Control Room did not start', error.message || String(error))
    broadcastState()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  stopLauncher()
})
