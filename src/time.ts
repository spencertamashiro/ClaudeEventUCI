export const TIME_ZONE = 'America/Los_Angeles'

const localParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const displayTime = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

const offsetFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  timeZoneName: 'longOffset',
})

export function pacificInput(instant: Date): string {
  const fields = Object.fromEntries(localParts.formatToParts(instant).map(part => [part.type, part.value]))
  return [fields.year.padStart(4, '0'), fields.month, fields.day].join('-') + 'T' + fields.hour + ':' + fields.minute
}

export function formatPacific(instant: Date): string {
  return displayTime.format(instant)
}

function offsetMilliseconds(instant: number): number {
  const offset = offsetFormat.formatToParts(instant).find(part => part.type === 'timeZoneName')?.value
  const fields = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset ?? '')
  if (!fields) return 0
  const minutes = Number(fields[2]) * 60 + Number(fields[3])
  return minutes * 60_000 * (fields[1] === '-' ? -1 : 1)
}

/** Return zero candidates for nonexistent wall times and two for fall-back repeats. */
export function resolvePacificInput(value: string): Date[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return []
  const wallTime = Date.parse(value + 'Z')
  if (!Number.isFinite(wallTime)) return []

  const day = 86_400_000
  const offsets = new Set([wallTime - day, wallTime, wallTime + day].map(offsetMilliseconds))
  return [...offsets]
    .map(offset => new Date(wallTime - offset))
    .filter(candidate => pacificInput(candidate) === value)
    .sort((earlier, later) => earlier.getTime() - later.getTime())
}

export function pacificWeekTime(instant: Date): { weekday: number; minute: number } {
  const local = pacificInput(instant)
  const weekday = new Date(local + 'Z').getUTCDay()
  const minute = Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16))
  return { weekday, minute }
}
