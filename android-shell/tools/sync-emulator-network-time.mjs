#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const adb = process.env.ADB || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`
const watchMode = process.argv.includes('--watch')
const intervalMs = Math.max(10_000, Number(process.env.BRAZE_DEMO_TIME_SYNC_INTERVAL_MS || 30_000))
const maxDriftMs = Math.max(1_000, Number(process.env.BRAZE_DEMO_TIME_MAX_DRIFT_MS || 30_000))
const retryDelayMs = 1_000
const maxRefreshAttempts = 3

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runAdb(args, { required = true } = {}) {
  const result = spawnSync(adb, args, { encoding: 'utf8' })
  if (result.error) {
    if (!required) return null
    throw result.error
  }
  if (result.status !== 0) {
    if (!required) return null
    throw new Error((result.stderr || result.stdout || `adb exited ${result.status}`).trim())
  }
  return (result.stdout || '').trim()
}

function durationToMilliseconds(value) {
  const match = String(value).trim().match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/,
  )
  if (!match) throw new Error(`Unsupported Android duration: ${value}`)
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match
  return (
    Number(days) * 86_400_000 +
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1_000
  )
}

function readClockState() {
  if (runAdb(['get-state'], { required: false }) !== 'device') {
    throw new Error('Android emulator is not connected')
  }

  const systemEpochSeconds = Number(runAdb(['shell', 'date', '+%s']))
  const dump = runAdb(['shell', 'dumpsys', 'network_time_update_service'], { required: false }) || ''
  const timeMatch = dump.match(/mTimeResult=TimeResult\{unixEpochTime=([^,}]+)/)
  const ageMatch = dump.match(/mTimeResult\.getAgeMillis\(\)=([^\r\n]+)/)
  if (!Number.isFinite(systemEpochSeconds)) {
    throw new Error('Android system time is unavailable')
  }

  let referenceNowMs = Date.now()
  let reference = 'host time'
  if (timeMatch && ageMatch) {
    const networkBaseMs = Date.parse(timeMatch[1])
    if (Number.isFinite(networkBaseMs)) {
      try {
        referenceNowMs = networkBaseMs + durationToMilliseconds(ageMatch[1])
        reference = 'Android network time'
      } catch {
        // A freshly booted emulator can expose an incomplete network-time
        // record. Host time is still a valid drift reference for this AVD.
      }
    }
  }

  const systemNowMs = systemEpochSeconds * 1_000
  return {
    systemNowMs,
    referenceNowMs,
    reference,
    driftMs: systemNowMs - referenceNowMs,
  }
}

async function forceRefresh() {
  let lastError = 'unknown error'
  for (let attempt = 1; attempt <= maxRefreshAttempts; attempt += 1) {
    const result = runAdb(
      ['shell', 'cmd', 'network_time_update_service', 'force_refresh'],
      { required: false },
    )
    if (result === 'true') return
    lastError = result || 'Android network time refresh failed'
    if (attempt < maxRefreshAttempts) await delay(retryDelayMs)
  }
  throw new Error(lastError)
}

async function ensureClockIsSynchronized({ force = false } = {}) {
  let state
  try {
    state = readClockState()
  } catch (error) {
    if (!force && /not connected/.test(error.message)) throw error
  }

  if (force || !state || Math.abs(state.driftMs) > maxDriftMs) {
    await forceRefresh()
    state = readClockState()
  }

  if (Math.abs(state.driftMs) > maxDriftMs) {
    throw new Error(`Android clocks still differ by ${Math.round(state.driftMs / 1_000)} seconds`)
  }

  return state
}

function formatDrift(state) {
  return `${Math.round(state.driftMs / 1_000)}s drift vs ${state.reference}`
}

async function runOnce() {
  const state = await ensureClockIsSynchronized()
  console.log(`Android network clock synchronized (${formatDrift(state)}).`)
}

async function runWatch() {
  let disconnectedChecks = 0
  const initialState = await ensureClockIsSynchronized()
  console.log(`Android network clock guard started (${formatDrift(initialState)}).`)

  while (true) {
    await delay(intervalMs)
    try {
      const before = readClockState()
      disconnectedChecks = 0
      if (Math.abs(before.driftMs) <= maxDriftMs) continue
      const after = await ensureClockIsSynchronized()
      console.log(
        `${new Date().toISOString()} corrected Android network clock ` +
        `from ${Math.round(before.driftMs / 1_000)}s to ${Math.round(after.driftMs / 1_000)}s drift.`,
      )
    } catch (error) {
      disconnectedChecks += 1
      console.error(`${new Date().toISOString()} ${error.message}`)
      if (/not connected/.test(error.message) && disconnectedChecks >= 3) return
    }
  }
}

try {
  if (watchMode) await runWatch()
  else await runOnce()
} catch (error) {
  console.error(`Android network clock synchronization failed: ${error.message}`)
  process.exitCode = 1
}
