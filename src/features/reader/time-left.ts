/** Roughly how long the rest of the book takes at this speed, ignoring the
 * pacing pauses: "under a minute", "12 min", "1 h 5 min". */
export function timeLeftLabel(wordsLeft: number, wpm: number): string {
  const minutes = Math.round(Math.max(0, wordsLeft) / wpm)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}
