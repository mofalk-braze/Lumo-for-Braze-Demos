import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

import { getActivePackId, launcherStateDir, repoRoot } from './demo-pack-utils.mjs'

const launcherPath = path.join(repoRoot, 'tools/demo-launcher.mjs')
const doctorPath = path.join(repoRoot, 'tools/doctor-solcon.mjs')
const bootstrapPath = path.join(repoRoot, 'bootstrap-solcon.sh')
const serverInfoPath = path.join(launcherStateDir, 'server.json')
const launcherLogPath = path.join(launcherStateDir, 'launcher.log')
const defaultPort = 4177
const defaultAvd = process.env.BRAZE_DEMO_ANDROID_AVD || 'Braze_Demo_API_36'

function usageText() {
  return `Lumo Android — guided setup and one-authority operation

Usage:
  node tools/lumo.mjs android doctor
  node tools/lumo.mjs android setup [--check-only] [--skip-install] [--skip-avd]
  node tools/lumo.mjs android start [--pack <id>] [--avd <name>] [--port <port>]
  node tools/lumo.mjs android status
  node tools/lumo.mjs android stop

The start command launches or attaches one persistent Control Room authority,
runs the Android apply/build/install/launch job through that authority, and
leaves the authority alive so its network-clock watcher remains owned.`
}

function parseInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${label} must be an integer from 1 to 65535.`)
  }
  return parsed
}

export function parseAndroidArgs(argv = []) {
  const command = argv[0] || 'help'
  const options = {
    command,
    pack: '',
    avd: defaultAvd,
    port: null,
    checkOnly: false,
    skipInstall: false,
    skipAvd: false,
  }
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--pack') {
      options.pack = argv[++index] || ''
      if (!options.pack) throw new Error('--pack requires a demo pack id.')
    } else if (arg === '--avd') {
      options.avd = argv[++index] || ''
      if (!options.avd) throw new Error('--avd requires an Android AVD name.')
    } else if (arg === '--port') {
      const value = argv[++index]
      if (!value) throw new Error('--port requires a value.')
      options.port = parseInteger(value, '--port')
    } else if (arg === '--check-only') {
      options.checkOnly = true
    } else if (arg === '--skip-install') {
      options.skipInstall = true
    } else if (arg === '--skip-avd') {
      options.skipAvd = true
    } else if (arg === '-h' || arg === '--help') {
      options.command = 'help'
    } else {
      throw new Error(`Unknown Android option: ${arg}`)
    }
  }
  if (!new Set(['help', 'doctor', 'setup', 'start', 'status', 'stop']).has(options.command)) {
    throw new Error(`Unknown Android command: ${options.command}`)
  }
  if (options.command !== 'start' && (options.pack || options.port !== null || options.avd !== defaultAvd)) {
    throw new Error('--pack, --avd, and --port are only valid with android start.')
  }
  if (options.command !== 'setup' && (options.checkOnly || options.skipInstall || options.skipAvd)) {
    throw new Error('--check-only, --skip-install, and --skip-avd are only valid with android setup.')
  }
  return options
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) < 1) return false
  try {
    process.kill(Number(pid), 0)
    return true
  } catch {
    return false
  }
}

function jsonRequest(port, requestPath, { method = 'GET', body = null, timeout = 2_000 } = {}) {
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
        ...(payload ? {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        } : {}),
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
        } else {
          resolve(parsed)
        }
      })
    })
    request.once('timeout', () => request.destroy(new Error('Launcher request timed out.')))
    request.once('error', reject)
    if (payload) request.write(payload)
    request.end()
  })
}

async function healthyAuthority(port, request = jsonRequest) {
  if (!Number.isInteger(Number(port))) return null
  try {
    const health = await request(Number(port), '/api/health', { timeout: 900 })
    return health?.ok ? health : null
  } catch {
    return null
  }
}

function runSync(command, args) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  }).status ?? 1
}

async function startDetachedAuthority(explicitPort, deps, io) {
  fs.mkdirSync(launcherStateDir, { recursive: true })
  const logFd = fs.openSync(launcherLogPath, 'a', 0o600)
  let child
  try {
    child = deps.spawnProcess(process.execPath, [
      launcherPath,
      ...(explicitPort === null ? [] : ['--port', String(explicitPort)]),
    ], {
      cwd: repoRoot,
      env: process.env,
      detached: true,
      shell: false,
      stdio: ['ignore', logFd, logFd],
    })
  } finally {
    fs.closeSync(logFd)
  }
  if (!child?.pid) throw new Error('Could not start the launcher authority process.')
  child.unref()

  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const info = deps.readServerInfo()
    if (Number(info?.pid) === Number(child.pid) && Number.isInteger(Number(info?.port))) {
      const health = await healthyAuthority(Number(info.port), deps.request)
      if (health && health.launcherInstanceId === info.instanceId && Number(health.pid) === Number(child.pid)) {
        return { info, health, started: true }
      }
    }
    if (!deps.processAlive(child.pid)) break
    await deps.sleep(200)
  }

  if (deps.processAlive(child.pid)) {
    try { process.kill(-child.pid, 'SIGTERM') } catch {}
  }
  const tail = fs.existsSync(launcherLogPath)
    ? fs.readFileSync(launcherLogPath, 'utf8').split(/\r?\n/).slice(-12).join('\n')
    : ''
  throw new Error(`Launcher authority did not become healthy. Inspect ${launcherLogPath}.${tail ? `\n${tail}` : ''}`)
}

async function resolveAuthority(explicitPort, deps, io) {
  const discovered = deps.readServerInfo()
  const candidatePort = Number(discovered?.port || explicitPort || defaultPort)
  const health = await healthyAuthority(candidatePort, deps.request)
  if (health) {
    if (discovered?.instanceId && health.launcherInstanceId !== discovered.instanceId) {
      throw new Error('Launcher discovery and health identify different authority instances. Stop the conflict before continuing.')
    }
    if (discovered?.pid && Number(health.pid) !== Number(discovered.pid)) {
      throw new Error('Launcher discovery and health identify different authority processes. Stop the conflict before continuing.')
    }
    if (explicitPort !== null && candidatePort !== explicitPort) {
      throw new Error(`A launcher authority is already active on port ${candidatePort}; refusing a second owner on port ${explicitPort}.`)
    }
    return {
      info: discovered || {
        instanceId: health.launcherInstanceId,
        pid: health.pid,
        port: candidatePort,
      },
      health,
      started: false,
    }
  }
  if (discovered && deps.processAlive(discovered.pid)) {
    throw new Error(
      `Launcher process ${discovered.pid} owns local state but is not healthy on port ${candidatePort}. ` +
      `Inspect ${launcherLogPath}; do not start a second authority.`,
    )
  }
  io.stdout('No healthy launcher authority found; starting one persistent local authority...')
  return deps.startAuthority(explicitPort, deps, io)
}

async function waitForJob(port, jobId, deps, io) {
  if (!jobId) throw new Error('Launcher did not return a job id.')
  const deadline = Date.now() + 12 * 60_000
  let printedLogs = 0
  while (Date.now() < deadline) {
    const job = await deps.request(port, `/api/jobs/${encodeURIComponent(jobId)}`, { timeout: 5_000 })
    const logs = Array.isArray(job.logs) ? job.logs : []
    for (const line of logs.slice(printedLogs)) io.stdout(line)
    printedLogs = logs.length
    if (job.status !== 'running') return job
    await deps.sleep(500)
  }
  throw new Error(`Android launch job ${jobId} did not finish within 12 minutes.`)
}

function defaultDependencies() {
  return {
    getActivePackId,
    processAlive: processIsAlive,
    readServerInfo: () => readJson(serverInfoPath),
    request: jsonRequest,
    runSync,
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    spawnProcess: spawn,
    startAuthority: startDetachedAuthority,
    stopProcess: (pid) => process.kill(Number(pid), 'SIGTERM'),
  }
}

async function runDoctor(deps) {
  return deps.runSync(process.execPath, [doctorPath, '--target', 'android'])
}

async function runSetup(options, deps, io) {
  if (options.checkOnly) return runDoctor(deps)

  io.stdout('Android setup 1/3 — install deterministic host and JavaScript dependencies.')
  if (!options.skipInstall) {
    const installStatus = deps.runSync('bash', [bootstrapPath, '--install', '--target', 'android'])
    if (installStatus !== 0) {
      io.stderr('The dependency pass still found missing Android readiness. Continuing so AVD provisioning can resolve the expected fresh-clone warning.')
    }
  } else {
    io.stdout('Skipped host dependency installation by request.')
  }

  io.stdout('Android setup 2/3 — provision or verify the dedicated rootable AVD without clearing app data.')
  let avdStatus = 0
  if (!options.skipAvd) {
    avdStatus = deps.runSync('bash', [bootstrapPath, '--android-avd', '--target', 'android'])
  } else {
    io.stdout('Skipped AVD provisioning by request.')
  }

  io.stdout('Android setup 3/3 — run the Android-only readiness doctor.')
  const doctorStatus = await runDoctor(deps)
  if (doctorStatus === 0) {
    io.stdout('Android setup is ready. Next: node tools/lumo.mjs android start')
    return 0
  }
  io.stderr('Android setup needs attention. Follow the FAIL remediation above, then rerun this command.')
  return doctorStatus || avdStatus || 1
}

async function runStatus(deps, io) {
  const info = deps.readServerInfo()
  const port = Number(info?.port || defaultPort)
  const health = await healthyAuthority(port, deps.request)
  if (!health) {
    io.stdout('Android launcher authority: stopped')
    return 1
  }
  if (info?.instanceId && health.launcherInstanceId !== info.instanceId) {
    throw new Error('Launcher discovery and health identify different authority instances.')
  }
  io.stdout(`Android launcher authority: running (pid ${health.pid}, port ${port})`)
  io.stdout(`Control Room: http://127.0.0.1:${port}`)
  return 0
}

async function runStop(deps, io) {
  const info = deps.readServerInfo()
  if (!info) {
    io.stdout('Android launcher authority is already stopped.')
    return 0
  }
  const health = await healthyAuthority(Number(info.port), deps.request)
  if (!health || health.launcherInstanceId !== info.instanceId || Number(health.pid) !== Number(info.pid)) {
    throw new Error('Refusing to stop an unverified process. Launcher discovery does not match a healthy authority.')
  }
  deps.stopProcess(info.pid)
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline && deps.processAlive(info.pid)) await deps.sleep(100)
  if (deps.processAlive(info.pid)) throw new Error(`Launcher authority ${info.pid} did not stop after SIGTERM.`)
  io.stdout('Android launcher authority stopped cleanly; its owned clock watcher stopped with it.')
  return 0
}

async function runStart(options, deps, io) {
  const doctorStatus = await runDoctor(deps)
  if (doctorStatus !== 0) {
    io.stderr('Android readiness is incomplete. Run: node tools/lumo.mjs android setup')
    return doctorStatus
  }

  const authority = await resolveAuthority(options.port, deps, io)
  const port = Number(authority.info.port)
  io.stdout(`${authority.started ? 'Started' : 'Attached to'} launcher authority ${authority.info.instanceId} (pid ${authority.info.pid}, port ${port}).`)
  io.stdout(`Control Room: http://127.0.0.1:${port}`)

  const packId = options.pack || deps.getActivePackId() || 'lumo-default'
  io.stdout(`Launching Android pack '${packId}' on AVD '${options.avd}' through the shared authority...`)
  const delegated = await deps.request(port, '/api/run', {
    method: 'POST',
    body: {
      packId,
      applyOnly: false,
      run: true,
      avd: options.avd,
      platform: 'android',
    },
    timeout: 5_000,
  })
  const job = await waitForJob(port, delegated.id, deps, io)
  if (job.status !== 'complete') {
    io.stderr(`Android launch failed. The launcher remains available for guided diagnostics at http://127.0.0.1:${port}.`)
    io.stderr(`Persistent launcher log: ${launcherLogPath}`)
    return 1
  }

  io.stdout('Android is ready. The launcher authority remains active and owns continuous network-clock coverage.')
  io.stdout('Stop it deliberately with: node tools/lumo.mjs android stop')
  return 0
}

export async function runAndroidCommand(argv = [], io = {}, dependencyOverrides = {}) {
  const output = {
    stdout: io.stdout || ((line) => console.log(line)),
    stderr: io.stderr || ((line) => console.error(line)),
  }
  let options
  try {
    options = parseAndroidArgs(argv)
  } catch (error) {
    output.stderr(`Error: ${error.message}`)
    output.stderr(usageText())
    return 2
  }
  const deps = { ...defaultDependencies(), ...dependencyOverrides }
  try {
    if (options.command === 'help') {
      output.stdout(usageText())
      return 0
    }
    if (options.command === 'doctor') return runDoctor(deps)
    if (options.command === 'setup') return runSetup(options, deps, output)
    if (options.command === 'start') return runStart(options, deps, output)
    if (options.command === 'status') return runStatus(deps, output)
    if (options.command === 'stop') return runStop(deps, output)
    return 2
  } catch (error) {
    output.stderr(`Error: ${error.message || String(error)}`)
    return 1
  }
}
