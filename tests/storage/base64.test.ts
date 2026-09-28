import { describe, expect, it } from 'vitest'
import { arrayBufferToBase64, base64ToArrayBuffer } from '../../src/storage/base64'

describe('base64', () => {
  it('round-trips arbitrary bytes, including all 256 byte values', () => {
    const bytes = new Uint8Array(256)
    for (let i = 0; i < 256; i++) bytes[i] = i
    const base64 = arrayBufferToBase64(bytes.buffer)
    const roundTripped = new Uint8Array(base64ToArrayBuffer(base64))
    expect(Array.from(roundTripped)).toEqual(Array.from(bytes))
  })

  it('round-trips a buffer larger than the internal chunk size', () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256)
    const base64 = arrayBufferToBase64(bytes.buffer)
    const roundTripped = new Uint8Array(base64ToArrayBuffer(base64))
    expect(roundTripped).toEqual(bytes)
  })

  it('round-trips an empty buffer', () => {
    expect(base64ToArrayBuffer(arrayBufferToBase64(new ArrayBuffer(0))).byteLength).toBe(0)
  })
})
