import { expect, test, type Page } from '@playwright/test'
import { PDF, addBook, collectErrors } from './helpers.ts'

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
