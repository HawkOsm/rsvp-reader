// A hybrid logical clock (docs/architecture/sync.md, section 5): wall time
// plus a counter, always moved past anything this device has seen, with the
// device id breaking ties. It orders changes across devices whose wall
// clocks disagree. Wall time is passed in, so this stays pure.

export interface Hlc {
  /** Milliseconds since the epoch, as this device's clock saw them (or
   * later, if it had already seen a later time). */
  wall: number
  /** Orders events within one millisecond. */
  count: number
  device: string
}

/** How far ahead of this device's own clock a remote time may pull it. A
 * device whose clock runs days fast would otherwise win every "newest wins"
 * for as long as its clock is wrong. */
export const MAX_SKEW_MS = 24 * 60 * 60 * 1000

/** Negative if `a` happened before `b`, positive if after, 0 only for the
 * same event. */
export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.wall !== b.wall) return a.wall - b.wall
  if (a.count !== b.count) return a.count - b.count
  return a.device < b.device ? -1 : a.device > b.device ? 1 : 0
}

/** The time of a new local event. */
export function tick(last: Hlc | null, now: number, device: string): Hlc {
  if (!last || now > last.wall) return { wall: now, count: 0, device }
  return { wall: last.wall, count: last.count + 1, device }
}

/** The clock after seeing `remote`, so the next local event comes after it.
 * A remote time more than `MAX_SKEW_MS` ahead of `now` is not followed:
 * `skewed` says so, and the clock stays where it was. */
export function receive(
  last: Hlc | null,
  remote: Hlc,
  now: number,
  device: string,
): { clock: Hlc | null; skewed: boolean } {
  if (remote.wall > now + MAX_SKEW_MS) return { clock: last, skewed: true }
  if (last && compareHlc(remote, last) <= 0) return { clock: last, skewed: false }
  return { clock: { wall: remote.wall, count: remote.count, device }, skewed: false }
}
