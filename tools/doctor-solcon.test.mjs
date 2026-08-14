import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseDoctorArgs, targetIncludes } from './doctor-solcon.mjs'

const doctorPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'doctor-solcon.mjs')

test('doctor defaults to the complete cross-platform target', () => {
  assert.deepEqual(parseDoctorArgs([]), { target: 'all', help: false })
  assert.equal(targetIncludes('all', 'android'), true)
  assert.equal(targetIncludes('all', 'ios'), true)
})

test('Android target excludes unrelated iOS requirements', () => {
  assert.deepEqual(parseDoctorArgs(['--target', 'android']), { target: 'android', help: false })
  assert.deepEqual(parseDoctorArgs(['--target=android']), { target: 'android', help: false })
  assert.equal(targetIncludes('android', 'android'), true)
  assert.equal(targetIncludes('android', 'ios'), false)
})

test('doctor rejects missing, unsupported, and unknown options', () => {
  assert.throws(() => parseDoctorArgs(['--target']), /requires/)
  assert.throws(() => parseDoctorArgs(['--target', 'windows']), /Unsupported doctor target/)
  assert.throws(() => parseDoctorArgs(['--wat']), /Unknown doctor option/)
})

test('Android doctor output excludes Xcode and iOS readiness checks', () => {
  const result = spawnSync(process.execPath, [doctorPath, '--target', 'android'], {
    encoding: 'utf8',
  })
  assert.match(result.stdout, /SolCon capability status \(target: android\)/)
  assert.match(result.stdout, /Android shell:/)
  assert.doesNotMatch(result.stdout, /Xcode|xcodegen|iOS shell|iOS simulator/)
})

test('Android doctor is strict for a missing AVD except during the bootstrap install phase', () => {
  const baseEnv = {
    ...process.env,
    BRAZE_DEMO_ANDROID_AVD: 'Lumo_Missing_Test_AVD',
  }
  const strict = spawnSync(process.execPath, [doctorPath, '--target', 'android'], {
    encoding: 'utf8',
    env: baseEnv,
  })
  const bootstrapInstall = spawnSync(process.execPath, [doctorPath, '--target', 'android'], {
    encoding: 'utf8',
    env: { ...baseEnv, BRAZE_DEMO_DOCTOR_ALLOW_MISSING_AVD: '1' },
  })
  assert.match(strict.stdout, /\[FAIL\] Dedicated Android AVD/)
  assert.match(bootstrapInstall.stdout, /\[WARN\] Dedicated Android AVD/)
})
