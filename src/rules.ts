import type { Access, Device, ModeOfTravel, Rule, Snapshot, WeeklyWindow } from './domain.ts'
import { pacificWeekTime, resolvePacificInput } from './time.ts'

export interface Evaluation {
  access: Access
  riderSpeedMph: number | null
  explanation: string
  rules: Rule[]
  relatedRules: Rule[]
}

function minutes(value: string): number {
  if (value === '24:00') return 1440
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
}

function inWindow(window: WeeklyWindow, weekday: number, minute: number): boolean | null {
  const start = minutes(window.start)
  const end = minutes(window.end)
  const validDays = window.weekdays.length > 0 &&
    window.weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
  if (!validDays || !Number.isFinite(start + end) || start === 1440 || start === end) return null

  if (end > start) return window.weekdays.includes(weekday) && minute >= start && minute < end
  const yesterday = (weekday + 6) % 7
  return (window.weekdays.includes(weekday) && minute >= start) ||
    (window.weekdays.includes(yesterday) && minute < end)
}

function effectiveBoundary(value: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return resolvePacificInput(value + 'T00:00')[0]?.getTime() ?? NaN
  }

  // Instants require an explicit offset so the host's local timezone is immaterial.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return NaN
  }
  const calendarTime = value.slice(0, 16)
  const utc = new Date(calendarTime + 'Z')
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 16) !== calendarTime) return NaN
  return Date.parse(value)
}

function isActive(rule: Rule, epoch: number, weekday: number, minute: number): boolean | null {
  const start = rule.effective?.from === undefined ? -Infinity : effectiveBoundary(rule.effective.from)
  const end = rule.effective?.to === undefined ? Infinity : effectiveBoundary(rule.effective.to)
  if (Number.isNaN(start) || Number.isNaN(end) || start >= end) return null
  if (epoch < start || epoch >= end) return false

  const scheduled = rule.schedule ? inWindow(rule.schedule, weekday, minute) : true
  if (scheduled !== true) return scheduled

  const exceptions = rule.exceptions?.map(window => inWindow(window, weekday, minute)) ?? []
  if (exceptions.includes(null)) return null
  return !exceptions.includes(true)
}

function supports(rule: Rule, travel: ModeOfTravel): boolean {
  return rule.totalClosure === true || rule.appliesTo === 'both' || rule.appliesTo === travel
}

export function evaluateRules(
  snapshot: Snapshot,
  featureId: string,
  device: Device,
  instant: Date,
  travel: ModeOfTravel = 'ride',
): Evaluation {
  const relatedRules = snapshot.rules.filter(rule =>
    rule.featureId === featureId && rule.devices.includes(device) && supports(rule, travel),
  )
  const result = (
    access: Access,
    explanation: string,
    rules: Rule[] = [],
    riderSpeedMph: number | null = null,
  ): Evaluation => ({ access, explanation, rules, relatedRules, riderSpeedMph })

  const epoch = instant.getTime()
  if (!Number.isFinite(epoch)) return result('unverified', 'Select a valid Pacific departure time.')
  if (!snapshot.features.features.some(feature => feature.properties.id === featureId)) {
    return result('unverified', 'This feature is missing from the selected dataset.')
  }
  const { weekday, minute } = pacificWeekTime(instant)
  const active = relatedRules.map(rule => ({ rule, applies: isActive(rule, epoch, weekday, minute) }))
    .filter(candidate => candidate.applies !== false)
  const rules = active.map(candidate => candidate.rule)

  if (rules.some(rule => rule.status === 'conflict')) {
    return result('unverified', 'Applicable sources conflict and need review.', rules)
  }
  const acceptedStatus = snapshot.mode === 'demo' ? 'demo' : 'verified'
  if (active.some(({ rule, applies }) => rule.status !== acceptedStatus || applies === null)) {
    return result('unverified', 'An applicable rule or schedule requires verification.', rules)
  }

  if (rules.some(rule => rule.totalClosure)) {
    return result('prohibited', 'A total closure applies to riding and walking a device.', rules)
  }

  const outcomes = new Set(rules.flatMap(rule => {
    if (!rule.access) return []
    if (travel === 'walk' && rule.access === 'walk-device') return ['allowed'] as const
    return [rule.access]
  }))
  if (outcomes.size > 1) return result('unverified', 'Applicable access rules disagree and need review.', rules)

  const [access] = outcomes
  if (!access) return result('unverified', 'No applicable verified access decision covers this device and time.', rules)
  const details = [...new Set(rules.map(rule => rule.explanation))].join(' ')

  const caps = rules.flatMap(rule => rule.riderSpeedMph === undefined ? [] : [rule.riderSpeedMph])
  const riderSpeedMph = access === 'allowed' && travel === 'ride' && caps.length > 0 &&
    caps.every(cap => typeof cap === 'number' && Number.isFinite(cap) && cap >= 0)
    ? Math.min(...caps)
    : null
  return result(access, details, rules, riderSpeedMph)
}
