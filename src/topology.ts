import type { Direction, Topology } from './domain.ts'

/** A transition needs explicit connectivity and permission in both directions of travel. */
export function canFollow(
  current: Topology,
  next: Topology,
  currentDirection: Direction = 'forward',
  nextDirection: Direction = 'forward',
): boolean {
  const exit = currentDirection === 'forward' ? current.to : current.from
  const entry = nextDirection === 'forward' ? next.from : next.to
  return exit === entry &&
    (current.direction === 'both' || current.direction === currentDirection) &&
    (next.direction === 'both' || next.direction === nextDirection)
}
