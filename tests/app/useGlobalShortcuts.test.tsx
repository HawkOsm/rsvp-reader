import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useGlobalShortcuts } from '@/app/hooks/useGlobalShortcuts'

const toggleFullScreen = vi.fn(async () => {})
vi.mock('@/platform', () => ({ getPlatform: async () => ({ toggleFullScreen }) }))

describe('the shortcuts that work on every screen', () => {
  it('F11 asks the platform for full screen', async () => {
    renderHook(() => useGlobalShortcuts(), { wrapper: MemoryRouter })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11' }))
    await vi.waitFor(() => expect(toggleFullScreen).toHaveBeenCalledOnce())
  })
})
