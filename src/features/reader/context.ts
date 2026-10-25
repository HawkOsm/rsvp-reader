import type { Token } from '@/core/types'

export interface WordContext {
  before: string
  current: string
  after: string
}

/** The words around `index`, for the faint line under the RSVP word. It
 * stops at paragraph ends, so it never runs into the next paragraph. */
export function contextAround(tokens: Token[], index: number, radius = 6): WordContext {
  const current = tokens[index]?.text ?? ''
  const before: string[] = []
  for (let i = index - 1; i >= 0 && before.length < radius; i--) {
    const token = tokens[i]
    if (!token || token.paraEnd) break
    before.unshift(token.text)
  }
  const after: string[] = []
  if (!tokens[index]?.paraEnd) {
    for (let i = index + 1; i < tokens.length && after.length < radius; i++) {
      const token = tokens[i]
      if (!token) break
      after.push(token.text)
      if (token.paraEnd) break
    }
  }
  return { before: before.join(' '), current, after: after.join(' ') }
}
