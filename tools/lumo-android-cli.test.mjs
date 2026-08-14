import assert from 'node:assert/strict'
import test from 'node:test'

import { parseAndroidArgs, runAndroidCommand } from './lumo-android-cli.mjs'
import { runLumo } from './lumo.mjs'

function captureIo() {
  const stdout = []
  const stderr = []
  return {
    io: {
      stdout: (line) => stdout.push(String(line)),
      stderr: (line) => stderr.push(String(line)),
    },
    stdout,
    stderr,
  }
}

test('parses the canonical persistent Android start command', () => {
  assert.deepEqual(
    parseAndroidArgs(['start', '--pack', 'lumo-default', '--avd', 'Braze_Demo_API_36', '--port', '4180']),
    {
      command: 'start',
      pack: 'lumo-default',
      avd: 'Braze_Demo_API_36',
      port: 4180,
      checkOnly: false,
      skipInstall: false,
      skipAvd: false,
    },
  )
})

test('rejects setup-only flags on launch commands and invalid ports', () => {
  assert.throws(() => parseAndroidArgs(['start', '--skip-avd']), /only valid with android setup/)
  assert.throws(() => parseAndroidArgs(['start', '--port', '0']), /integer from 1 to 65535/)
})

test('start attaches to the healthy authority and delegates one Android job', async () => {
  const captured = captureIo()
  const requests = []
  const serverInfo = { instanceId: 'launcher-test', pid: 4321, port: 4177 }
  const status = await runAndroidCommand(['start', '--pack', 'lumo-default'], captured.io, {
    getActivePackId: () => 'unused-pack',
    processAlive: () => true,
    readServerInfo: () => serverInfo,
    runSync: () => 0,
    sleep: async () => {},
    request: async (port, requestPath, options = {}) => {
      requests.push({ port, requestPath, options })
      if (requestPath === '/api/health') {
        return { ok: true, launcherInstanceId: 'launcher-test', pid: 4321, port: 4177 }
      }
      if (requestPath === '/api/run') return { id: 'job-1' }
      if (requestPath === '/api/jobs/job-1') {
        return { status: 'complete', logs: ['Applying demo pack', 'Ready'] }
      }
      throw new Error(`Unexpected request: ${requestPath}`)
    },
  })

  assert.equal(status, 0)
  assert.equal(requests.filter((entry) => entry.requestPath === '/api/run').length, 1)
  const runRequest = requests.find((entry) => entry.requestPath === '/api/run')
  assert.deepEqual(runRequest.options.body, {
    packId: 'lumo-default',
    applyOnly: false,
    run: true,
    avd: 'Braze_Demo_API_36',
    platform: 'android',
  })
  assert.match(captured.stdout.join('\n'), /Attached to launcher authority launcher-test/)
  assert.match(captured.stdout.join('\n'), /owns continuous network-clock coverage/)
})

test('start refuses to launch when the Android-only doctor fails', async () => {
  const captured = captureIo()
  let requested = false
  const status = await runAndroidCommand(['start'], captured.io, {
    runSync: () => 1,
    request: async () => {
      requested = true
      return {}
    },
  })
  assert.equal(status, 1)
  assert.equal(requested, false)
  assert.match(captured.stderr.join('\n'), /android setup/)
})

test('stop only signals an authority whose discovery and health identities agree', async () => {
  const captured = captureIo()
  let alive = true
  let stoppedPid = 0
  const status = await runAndroidCommand(['stop'], captured.io, {
    readServerInfo: () => ({ instanceId: 'launcher-test', pid: 4321, port: 4177 }),
    request: async () => ({ ok: true, launcherInstanceId: 'launcher-test', pid: 4321, port: 4177 }),
    stopProcess: (pid) => {
      stoppedPid = Number(pid)
      alive = false
    },
    processAlive: () => alive,
    sleep: async () => {},
  })
  assert.equal(status, 0)
  assert.equal(stoppedPid, 4321)
  assert.match(captured.stdout.join('\n'), /clock watcher stopped with it/)
})

test('shared Lumo router dispatches agent-readable pack validation', async () => {
  const captured = captureIo()
  const status = await runLumo(['pack', 'validate', 'lumo-default', '--json'], captured.io)
  assert.equal(status, 0)
  const result = JSON.parse(captured.stdout.join('\n'))
  assert.equal(result.valid, true)
  assert.equal(result.reports[0].id, 'lumo-default')
})
