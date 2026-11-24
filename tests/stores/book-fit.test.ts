import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/stores/app-store'

const fits = (page: number, width: number) => ({ page, width })

beforeEach(() => {
  useAppStore.setState({ bookFits: null, bookScale: null, pendingFit: null, bookFit: null })
})

describe('fitting the page in book mode', () => {
  it('fits as asked once the page sizes are known', () => {
    const { requestFit, setBookFits } = useAppStore.getState()
    requestFit('width')
    expect(useAppStore.getState().bookScale).toBeNull() // nothing to fit to yet
    setBookFits(fits(0.4, 0.6))
    expect(useAppStore.getState().bookScale).toBe(0.6)
    expect(useAppStore.getState().pendingFit).toBeNull()
  })

  it('fits at once when sizes are known, and again when the new layout reports its own', () => {
    const { requestFit, setBookFits } = useAppStore.getState()
    setBookFits(fits(0.26, 0.26)) // a spread, on a screen that then turns out small
    requestFit('width')
    expect(useAppStore.getState().bookScale).toBe(0.26)
    setBookFits(fits(0.58, 0.58)) // the single page reports
    expect(useAppStore.getState().bookScale).toBe(0.58)
  })

  it('keeps a fitted page fitted when the screen turns or the window changes', () => {
    const { setBookFits, setBookScale } = useAppStore.getState()
    setBookFits(fits(0.5, 0.6))
    setBookScale(0.6) // fitted to the width
    setBookFits(fits(0.4, 1.2)) // turned on its side
    expect(useAppStore.getState().bookScale).toBe(1.2)

    setBookScale(0.4) // the whole page
    setBookFits(fits(0.5, 0.6))
    expect(useAppStore.getState().bookScale).toBe(0.5)
  })

  it('leaves a size the reader zoomed to alone', () => {
    const { setBookFits, setBookScale } = useAppStore.getState()
    setBookFits(fits(0.5, 0.6))
    setBookScale(0.9) // pinched
    setBookFits(fits(0.4, 1.2))
    expect(useAppStore.getState().bookScale).toBe(0.9)
  })

  it('remembers which fit was asked for when the two are the same size', () => {
    // A spread fitted to the page in a tall window, where the width is what
    // limits it: both fits are 0.77. Made shorter, the whole page must still
    // fit (it once kept to the width, and ran off the bottom).
    const { requestFit, setBookFits, fitBook } = useAppStore.getState()
    setBookFits(fits(0.77, 0.77))
    requestFit('page')
    setBookFits(fits(0.61, 0.77))
    expect(useAppStore.getState().bookScale).toBe(0.61)

    // Fit, with nothing to switch between, puts a zoomed page back.
    setBookFits(fits(0.58, 0.58))
    useAppStore.getState().setBookScale(1.5)
    fitBook()
    expect(useAppStore.getState().bookScale).toBe(0.58)
  })
})
