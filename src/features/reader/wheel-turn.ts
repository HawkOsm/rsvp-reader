// What a mouse wheel or a trackpad does to a page that has nothing left to
// scroll: it turns it. A wheel gives a few big steps and a trackpad a long
// run of small ones, so movement is added up, one turn is made when it has
// gone far enough, and no more until the wheel has rested: one flick, one
// page (the way Foliate and Readest do it).

/** Added-up movement, in pixels, that turns the page. */
export const WHEEL_TURN_PX = 40
/** A wheel still for this long has finished its flick. */
export const WHEEL_REST_MS = 180
/** One "line" of a wheel that reports lines, in pixels. */
const LINE_PX = 30

export interface WheelRun {
  /** Movement added up since the wheel last rested. */
  sum: number
  /** When the wheel last moved. */
  at: number
  /** This run has already turned a page. */
  turned: boolean
}

export const WHEEL_AT_REST: WheelRun = { sum: 0, at: -Infinity, turned: false }

/** A wheel event's movement in pixels, whatever unit it came in. */
export function wheelPixels(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === 1) return delta * LINE_PX
  if (deltaMode === 2) return delta * pageSize
  return delta
}

/** Take one wheel movement of `pixels` at time `now`: the run so far, and
 * which way to turn the page, if this movement is the one that does. */
export function wheelTurn(
  run: WheelRun,
  pixels: number,
  now: number,
): { run: WheelRun; turn: 1 | -1 | null } {
  const fresh = now - run.at > WHEEL_REST_MS
  const sum = (fresh ? 0 : run.sum) + pixels
  const turned = fresh ? false : run.turned
  if (!turned && Math.abs(sum) >= WHEEL_TURN_PX) {
    return { run: { sum: 0, at: now, turned: true }, turn: sum > 0 ? 1 : -1 }
  }
  return { run: { sum, at: now, turned }, turn: null }
}
