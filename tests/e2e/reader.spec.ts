import { expect, test, type Page } from '@playwright/test'
import { PDF, addBook, collectErrors, wordNumber } from './helpers.ts'

// The reader's fragile spots (docs/architecture/reader.md): the page overlay,
// book-mode fitting, and the PDF engine dying under an open book. Run on the
// desktop project only; each test sets its own window sizes.

/** These tests set their own window sizes, so one project is enough. */
const desktopOnly = () =>
  test.skip(test.info().project.name !== 'desktop', 'sets its own window sizes')

/** The vertical band the RSVP word may occupy: the canvas's centre line
 * ± wordZoneHalfHeight(fontSize) from rsvp-geometry.ts. */
async function wordBand(page: Page, fontSize: number) {
  const area = (await page.locator('canvas').first().boundingBox())!
  const centre = area.y + area.height / 2
  const half = fontSize * 0.75 + 14
  return { top: centre - half, bottom: centre + half }
}

const SIZES = [
  { width: 1280, height: 800 },
  { width: 1280, height: 420 },
  { width: 1280, height: 300 },
  { width: 900, height: 600 },
  { width: 600, height: 900 },
  { width: 412, height: 915 },
  { width: 360, height: 640 },
  { width: 915, height: 412 }, // a phone held sideways
  { width: 320, height: 480 },
]

test('the page overlay stays off the word at every window size, and shows the page', async ({
  page,
}) => {
  desktopOnly()
  const errors = collectErrors(page)
  await page.goto('/')
  await addBook(page, PDF)
  await page.keyboard.press('p')

  const shown: string[] = []
  for (const size of SIZES) {
    await page.setViewportSize(size)
    await page.waitForTimeout(150) // let ResizeObserver and layout settle
    const overlay = page.getByRole('region', { name: 'Page view' })
    if ((await overlay.count()) === 0) continue // no room: hiding it is allowed
    shown.push(`${size.width}x${size.height}`)

    const box = (await overlay.boundingBox())!
    const word = await wordBand(page, 56)
    const where = `${size.width}x${size.height}: overlay ${JSON.stringify(box)}, word ${JSON.stringify(word)}`
    expect(box.y < word.bottom && box.y + box.height > word.top, where).toBe(false)
    // Inside the window, too.
    expect(box.x >= 0 && box.x + box.width <= size.width, where).toBe(true)
    // And it actually shows the page: a drawn canvas inside it.
    await expect
      .poll(() => overlay.locator('canvas').evaluate((c) => (c as { width: number }).width), {
        message: where,
      })
      .toBeGreaterThan(0)
  }
  // Somewhere it must have had room, or this test proved nothing.
  expect(shown.length).toBeGreaterThan(3)
  expect(errors).toEqual([])
})

test('book mode fits the page, and refits after the window changes', async ({ page }) => {
  desktopOnly()
  const errors = collectErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await addBook(page, PDF)
  await page.keyboard.press('b')

  const scroller = page.locator('#book-scroll')
  const pages = scroller.locator('canvas')
  await expect(pages.first()).toBeVisible({ timeout: 20_000 })

  /** Fit page: the whole spread is visible, nothing to scroll. */
  async function expectFitsWhole(label: string) {
    await expect
      .poll(
        () =>
          scroller.evaluate((el) => ({
            x: el.scrollWidth - el.clientWidth,
            y: el.scrollHeight - el.clientHeight,
          })),
        { message: label },
      )
      .toEqual({ x: 0, y: 0 })
    const width = await pages.first().evaluate((c) => (c as { width: number }).width)
    expect(width, `${label}: page drawn`).toBeGreaterThan(0)
  }

  // F toggles the fit between page and width; press until it fits the page
  // whole.
  const fit = { click: () => page.keyboard.press('f') }
  await fit.click()
  try {
    await expectFitsWhole('spread, first fit')
  } catch {
    await fit.click()
    await expectFitsWhole('spread, second fit')
  }

  await page.setViewportSize({ width: 800, height: 500 })
  await page.waitForTimeout(200)
  await fit.click()
  try {
    await expectFitsWhole('smaller window')
  } catch {
    await fit.click()
    await expectFitsWhole('smaller window, second fit')
  }

  // Single page and back: still drawn, nothing blank.
  await page.keyboard.press('d')
  await expect
    .poll(() => pages.first().evaluate((c) => (c as { width: number }).width))
    .toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test('the page comes back after the PDF engine crashes', async ({ page }) => {
  desktopOnly()
  const errors = collectErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await addBook(page, PDF)
  await page.keyboard.press('b')
  const canvas = page.locator('#book-scroll canvas').first()
  await expect(canvas).toBeVisible({ timeout: 20_000 })

  // Crash the real worker: an uncaught error is what a MuPDF abort looks like
  // to the page (worker.onerror), and it is what pdf/client.ts listens for.
  const worker = page.workers().find((w) => w.url().includes('pdf.worker'))
  expect(worker, 'the PDF worker is running').toBeTruthy()
  const died = new Promise<void>((resolve) => worker!.on('close', () => resolve()))
  await worker!.evaluate(() => {
    setTimeout(() => {
      throw new Error('simulated engine crash')
    })
  })
  await died // the client terminated the crashed worker

  // The reader reopens the book in a new worker: pages are drawn again, and
  // turning a page still works.
  await expect
    .poll(() => page.workers().some((w) => w !== worker && w.url().includes('pdf.worker')), {
      timeout: 10_000,
      message: 'a new PDF worker took over',
    })
    .toBe(true)
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('PageDown')
  await expect(page.getByTestId('book-page-label')).toContainText(/3|2/)
  await expect
    .poll(() => canvas.evaluate((c) => (c as { width: number }).width), { timeout: 20_000 })
    .toBeGreaterThan(0)

  // The crash itself, and the error log noting it, are expected.
  expect(errors.filter((e: string) => !/simulated engine crash|\[pdf engine\]/.test(e))).toEqual([])
})

// Book mode with a mouse and keys: the page has the whole window, the header
// comes back at the top edge, and the wheel turns a page that is all in view.
test('book mode on a desktop hides the header, shows it at the top edge, and turns with the wheel', async ({
  page,
}) => {
  desktopOnly()
  const errors = collectErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await addBook(page, PDF)
  await page.keyboard.press('b')
  const scroller = page.locator('#book-scroll')
  await expect(scroller.locator('canvas').first()).toBeVisible({ timeout: 20_000 })
  const label = page.getByTestId('book-page-label')
  const header = page.getByRole('banner')
  await expect(header).toBeVisible()
  await page.keyboard.press('d') // one page at a time, so every turn is one page
  await expect(label).toHaveText(/^page 1 \//)

  // Reading on hides the header.
  await page.keyboard.press('PageDown')
  await expect(label).toHaveText(/^page 2 \//)
  await expect(header).toBeHidden()

  // The mouse at the top edge brings it back, over the page; it goes again
  // once the mouse has left it.
  await page.mouse.move(600, 400)
  await page.mouse.move(600, 10)
  await expect(header).toBeVisible()
  await page.mouse.move(600, 420)
  await page.mouse.move(600, 430)
  await expect(header).toBeHidden()

  // Enter does the same from the keyboard.
  await page.keyboard.press('Enter')
  await expect(header).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(header).toBeHidden()

  // The whole page is in view (F fits it), so the wheel turns it: one page
  // for one spin, however many notches the spin had.
  await page.keyboard.press('f')
  await expect
    .poll(async () => {
      const fits = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight)
      if (fits > 1) await page.keyboard.press('f')
      return fits
    })
    .toBeLessThanOrEqual(1)
  await page.mouse.move(600, 400)
  await page.mouse.wheel(0, -100)
  await page.mouse.wheel(0, -100)
  await expect(label).toHaveText(/^page 1 \//)
  await page.waitForTimeout(300) // the wheel rests
  await page.mouse.wheel(0, 100)
  await expect(label).toHaveText(/^page 2 \//)

  // G opens the jump panel; Alt+Left undoes the jump made from it.
  await page.keyboard.press('g')
  const panel = page.getByRole('dialog', { name: 'Go to' })
  await panel.getByRole('textbox', { name: 'Page number' }).fill('3')
  await page.keyboard.press('Enter')
  await expect(label).toHaveText(/^page 3 \//)
  await expect(panel).toBeHidden()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(label).toHaveText(/^page 2 \//)

  expect(errors).toEqual([])
})

// A zoom is made about the pointer: what was under it stays under it.
test('zooming with Ctrl and the wheel keeps the spot under the pointer in place', async ({
  page,
}) => {
  desktopOnly()
  const errors = collectErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await addBook(page, PDF)
  await page.keyboard.press('b')
  const scroller = page.locator('#book-scroll')
  await expect(scroller.locator('canvas').first()).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('d') // one page: it is the sheet
  const sheet = scroller.locator('> div')
  const box = () =>
    sheet.evaluate((el) => {
      const { top, height } = el.getBoundingClientRect()
      const { style } = el as unknown as { style: { transform: string } }
      return { top, height, stretched: style.transform !== '' }
    })
  // Wait for the page to stop changing size.
  let before = await box()
  await expect
    .poll(async () => {
      const last = before
      before = await box()
      return before.height > 300 && before.height === last.height
    })
    .toBe(true)

  const at = { x: 640, y: 560 }
  const share = (at.y - before.top) / before.height
  expect(share).toBeGreaterThan(0.3)
  expect(share).toBeLessThan(1)
  await page.mouse.move(at.x, at.y)
  await page.keyboard.down('Control')
  for (let notch = 0; notch < 4; notch++) await page.mouse.wheel(0, -100)
  await page.keyboard.up('Control')

  // Drawn bigger, the stretch taken off, and the same part of the page is
  // still under the pointer.
  await expect
    .poll(async () => {
      const now = await box()
      return !now.stretched && now.height > before.height * 1.3
    })
    .toBe(true)
  const after = await box()
  expect(Math.abs(after.top + share * after.height - at.y)).toBeLessThan(3)
  expect(errors).toEqual([])
})

// A page with nothing to read on it can still be looked at: it is shown
// without moving the reader's place, which has no word there to be on.
test('a page with no words can be turned to and away from', async ({ page }) => {
  desktopOnly()
  const errors = collectErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await addBook(page, 'tests/fixtures/blank-middle-page.pdf')
  const place = await wordNumber(page)
  await page.keyboard.press('b')
  await page.keyboard.press('d') // one page at a time
  const label = page.getByTestId('book-page-label')
  await expect(label).toHaveText('page 1 / 3')
  const canvas = page.locator('#book-scroll canvas').first()
  await expect(canvas).toBeVisible({ timeout: 20_000 })

  await page.keyboard.press('PageDown')
  await expect(label).toHaveText('page 2 / 3')
  // The blank page is drawn, with no word marked on it.
  await expect.poll(() => canvas.evaluate((c) => (c as { width: number }).width)).toBeGreaterThan(0)
  await page.keyboard.press('PageDown')
  await expect(label).toHaveText('page 3 / 3')
  await page.keyboard.press('PageUp')
  await expect(label).toHaveText('page 2 / 3')
  await page.keyboard.press('PageUp')
  await expect(label).toHaveText('page 1 / 3')

  // Back in RSVP from the blank page, the place is where it was.
  await page.keyboard.press('PageDown')
  await expect(label).toHaveText('page 2 / 3')
  await page.keyboard.press('b')
  expect(await wordNumber(page)).toBe(place)
  expect(errors).toEqual([])
})

// Turning back lands at the bottom of the page before, where the reader was
// heading, even when that page has to be drawn at another size to fit.
test('turning back to a taller page of another width lands at its bottom', async ({ page }) => {
  desktopOnly()
  const errors = collectErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await addBook(page, 'tests/fixtures/mixed-page-sizes.pdf')
  await page.keyboard.press('b')
  await page.keyboard.press('d') // one page at a time
  const scroller = page.locator('#book-scroll')
  const label = page.getByTestId('book-page-label')
  await expect(scroller.locator('canvas').first()).toBeVisible({ timeout: 20_000 })
  const left = () => scroller.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)
  const tall = () => scroller.evaluate((el) => el.scrollHeight - el.clientHeight)

  // Fit the width: the first page is then far taller than the window.
  await page.keyboard.press('f')
  await expect
    .poll(async () => {
      const room = await tall()
      if (room < 1000) await page.keyboard.press('f')
      return room
    })
    .toBeGreaterThan(1000)

  await page.keyboard.press('PageDown')
  await expect(label).toHaveText('page 2 / 2')
  await expect.poll(tall).toBeLessThan(1000) // drawn to its own width
  await page.keyboard.press('ArrowUp')
  await expect(label).toHaveText('page 1 / 2')
  await expect.poll(tall).toBeGreaterThan(1000)
  await page.waitForTimeout(300)
  expect(await left()).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
