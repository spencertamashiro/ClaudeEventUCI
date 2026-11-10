import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DEVICES } from '../src/domain.ts'
import type { Device, RideFeature, Rule, Snapshot } from '../src/domain.ts'
import { evaluateRules } from '../src/rules.ts'
import { pacificInput, resolvePacificInput } from '../src/time.ts'
import { canFollow } from '../src/topology.ts'

const feature: RideFeature = {
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[0, 0], [0.001, 0]] },
  properties: {
    id: 'segment',
    name: 'Fictional segment',
    kind: 'facility',
    provenance: { method: 'Synthetic fixture' },
    roadwaySpeedMph: 35,
    expectedSpeedMph: 12,
  },
}
const weekdayHours = { weekdays: [1, 2, 3, 4, 5], start: '08:30', end: '17:00' }

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'permission',
    featureId: feature.properties.id,
    devices: [...DEVICES],
    sourceIds: ['demo'],
    status: 'demo',
    explanation: 'Fixture permission.',
    access: 'allowed',
    appliesTo: 'ride',
    ...overrides,
  }
}

const regular = rule({ exceptions: [weekdayHours], riderSpeedMph: 12 })
const dismount = rule({
  id: 'weekday-dismount',
  access: 'walk-device',
  explanation: 'Fixture dismount window.',
  appliesTo: 'both',
  schedule: weekdayHours,
})

function snapshot(...rules: Rule[]): Snapshot {
  return {
    version: 'test',
    mode: 'demo',
    features: { type: 'FeatureCollection', features: [feature] },
    rules,
    sources: [{ id: 'demo', title: 'Fixture', authority: 'Fictional', url: null, verifiedOn: null }],
    issues: [],
  }
}

function at(value: string): Date {
  const candidates = resolvePacificInput(value)
  assert.equal(candidates.length, 1)
  return candidates[0]
}

const timed = snapshot(regular, dismount)
const id = feature.properties.id

test('weekday start is inclusive, end is exclusive, and weekends are outside the window', () => {
  const outcomes = [
    ['2026-11-09T08:29', 'allowed'],
    ['2026-11-09T08:30', 'walk-device'],
    ['2026-11-09T16:59', 'walk-device'],
    ['2026-11-09T17:00', 'allowed'],
    ['2026-11-14T12:00', 'allowed'],
    ['2026-11-15T12:00', 'allowed'],
  ]
  for (const [value, expected] of outcomes) {
    assert.equal(evaluateRules(timed, id, 'bicycle', at(value)).access, expected, value)
  }
})

test('all five device profiles are evaluated independently on the same segment', () => {
  const outcomes = [
    ['allowed', 10],
    ['allowed', 8],
    ['walk-device', null],
    ['prohibited', null],
    ['unverified', null],
  ] as const
  const rules = snapshot(
    rule({ devices: ['bicycle'], riderSpeedMph: 10 }),
    rule({ devices: ['ebike-1'], riderSpeedMph: 8 }),
    rule({ devices: ['ebike-2'], access: 'walk-device' }),
    rule({ devices: ['ebike-3'], access: 'prohibited' }),
  )
  const instant = at('2026-11-09T08:30')
  for (const [index, device] of DEVICES.entries()) {
    const { access, riderSpeedMph } = evaluateRules(rules, id, device, instant)
    assert.deepEqual([access, riderSpeedMph], outcomes[index], device)
  }
})

test('missing speed stays unknown and missing access remains unverified', () => {
  const instant = at('2026-11-09T08:30')
  const noSpeed = evaluateRules(snapshot(rule()), id, 'bicycle', instant)
  assert.equal(noSpeed.access, 'allowed')
  assert.equal(noSpeed.riderSpeedMph, null)
  const noAccess = evaluateRules(snapshot(rule({ access: undefined, riderSpeedMph: 10 })), id, 'bicycle', instant)
  assert.equal(noAccess.access, 'unverified')
  assert.equal(noAccess.riderSpeedMph, null)
})

test('independent rider speed limits use the lower cap and never reuse roadway speed', () => {
  const rules = snapshot(
    rule({ riderSpeedMph: 20 }),
    rule({ id: 'cap', access: undefined, riderSpeedMph: 8 }),
  )
  assert.equal(evaluateRules(rules, id, 'bicycle', at('2026-11-09T08:30')).riderSpeedMph, 8)
})

test('explicit or competing source claims yield an unresolved decision', () => {
  const instant = at('2026-11-09T08:30')
  const conflicting = snapshot(rule(), rule({ id: 'conflict', status: 'conflict', access: undefined }))
  assert.equal(evaluateRules(conflicting, id, 'bicycle', instant).access, 'unverified')
  const competing = snapshot(rule(), rule({ id: 'competing', access: 'prohibited' }))
  assert.equal(evaluateRules(competing, id, 'bicycle', instant).access, 'unverified')
})

test('the dismount window permits walking a device and has no rider ceiling', () => {
  const walking = evaluateRules(timed, id, 'bicycle', at('2026-11-09T08:30'), 'walk')
  assert.equal(walking.access, 'allowed')
  assert.equal(walking.riderSpeedMph, null)
})

test('a total closure supersedes ordinary ride and walk permission', () => {
  const closed = snapshot(rule({ appliesTo: 'both' }), rule({
    id: 'closed',
    totalClosure: true,
    access: 'prohibited',
    appliesTo: 'both',
  }))
  const instant = at('2026-11-09T08:30')
  assert.equal(evaluateRules(closed, id, 'bicycle', instant).access, 'prohibited')
  assert.equal(evaluateRules(closed, id, 'bicycle', instant, 'walk').access, 'prohibited')
})

test('bridge crossing does not create a node and transitions must honor direction', () => {
  const bridge = { from: 'upper-west', to: 'upper-east', grade: 1, direction: 'both' } as const
  const below = { from: 'lower-south', to: 'lower-north', grade: 0, direction: 'both' } as const
  const ramp = { from: 'upper-east', to: 'lower-north', grade: 1, direction: 'forward' } as const
  assert.equal(canFollow(bridge, below), false)
  assert.equal(canFollow(bridge, ramp), true)
  assert.equal(canFollow(below, ramp, 'forward', 'reverse'), false)
})

test('Pacific spring gap is rejected and both fall-back instants follow wall-time restrictions', () => {
  assert.deepEqual(resolvePacificInput('2026-03-08T02:30'), [])
  assert.deepEqual(resolvePacificInput('2026-02-30T09:00'), [])
  assert.equal(at('2026-03-08T03:30').toISOString(), '2026-03-08T10:30:00.000Z')
  const repeats = resolvePacificInput('2026-11-01T01:30')
  assert.deepEqual(repeats.map(date => date.toISOString()), [
    '2026-11-01T08:30:00.000Z',
    '2026-11-01T09:30:00.000Z',
  ])
  const sunday = snapshot(rule({
    access: 'prohibited',
    schedule: { weekdays: [0], start: '01:00', end: '02:00' },
  }))
  for (const instant of repeats) {
    assert.equal(pacificInput(instant), '2026-11-01T01:30')
    assert.equal(evaluateRules(sunday, id, 'bicycle', instant).access, 'prohibited')
  }
})

test('a simulated route arrival crosses a schedule boundary after departure', () => {
  const departure = at('2026-11-09T08:25')
  const arrival = new Date(departure.getTime() + 10 * 60_000)
  assert.equal(evaluateRules(timed, id, 'bicycle', departure).access, 'allowed')
  assert.equal(evaluateRules(timed, id, 'bicycle', arrival).access, 'walk-device')
})

test('overnight windows use the start day and effective dates are Pacific and end-exclusive', () => {
  const rules = snapshot(rule({
    access: 'prohibited',
    schedule: { weekdays: [5], start: '22:00', end: '02:00' },
    effective: { from: '2026-11-13', to: '2026-11-15' },
  }))
  const outcome = (time: string, device: Device = 'bicycle') => evaluateRules(rules, id, device, at(time)).access
  assert.equal(outcome('2026-11-13T21:59'), 'unverified')
  assert.equal(outcome('2026-11-13T22:00'), 'prohibited')
  assert.equal(outcome('2026-11-14T01:59'), 'prohibited')
  assert.equal(outcome('2026-11-14T02:00'), 'unverified')
  assert.equal(outcome('2026-11-20T22:00'), 'unverified')
})

test('fictional and malformed rules cannot grant access on the real map', () => {
  const instant = at('2026-11-09T08:30')
  const real = { ...snapshot(rule()), mode: 'irvine' } as const
  assert.equal(evaluateRules(real, id, 'bicycle', instant).access, 'unverified')
  const bad = snapshot(rule({ schedule: { ...weekdayHours, end: '25:00' } }))
  assert.equal(evaluateRules(bad, id, 'bicycle', instant).access, 'unverified')
})

test('bundled snapshots isolate fictional decisions from the real-map review queue', () => {
  const read = (name: string) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'))
  const demo: Snapshot = {
    ...read('../public/data/v1/demo/records.json'),
    features: read('../public/data/v1/demo/features.geojson'),
  }
  const irvine: Snapshot = {
    ...read('../public/data/v1/irvine/records.json'),
    features: read('../public/data/v1/irvine/features.geojson'),
  }

  const instant = at('2026-11-09T08:30')
  const courtyard = evaluateRules(demo, 'courtyard-link', 'ebike-2', instant)
  assert.equal(courtyard.access, 'walk-device')
  assert.deepEqual(courtyard.rules.map(rule => rule.id), ['court-peak'])
  const scooter = evaluateRules(demo, 'garden-bikeway', 'escooter', instant)
  assert.equal(scooter.access, 'walk-device')
  const conflict = evaluateRules(demo, 'south-connector', 'bicycle', instant)
  assert.equal(conflict.access, 'unverified')
  assert.equal(new Set(conflict.rules.flatMap(rule => rule.sourceIds)).size, 2)
  assert.equal(evaluateRules(irvine, 'courtyard-link', 'ebike-2', instant).access, 'unverified')
  assert(irvine.issues.some(issue => issue.status === 'conflict'))
})
