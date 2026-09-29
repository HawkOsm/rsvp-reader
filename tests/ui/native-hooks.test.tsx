import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it } from 'vitest'
import { useAndroidBackButton } from '../../src/ui/hooks/useAndroidBackButton'
import { useNativeAppearance } from '../../src/ui/hooks/useNativeAppearance'

// Both hooks gate all their real work behind Capacitor.isNativePlatform(),
// which is false in jsdom (no native Capacitor bridge). These just confirm
// that gate actually works — mounting/unmounting doesn't throw or try to
// use a plugin that only exists inside a real Android/iOS shell.

describe('useNativeAppearance', () => {
  it('does nothing outside a native platform, without throwing', () => {
    const { unmount } = renderHook(() => useNativeAppearance())
    unmount()
  })
})

describe('useAndroidBackButton', () => {
  it('does nothing outside a native platform, without throwing', () => {
    const { unmount } = renderHook(() => useAndroidBackButton(), {
      wrapper: ({ children }) => <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>,
    })
    unmount()
  })
})
