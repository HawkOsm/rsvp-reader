import { expect, test, type Page } from '@playwright/test'

// The two-minute smoke test from CONTRIBUTING.md. Each test starts with an
// empty library (a fresh browser context has its own IndexedDB).

const PDF = 'tests/fixtures/two-column-text.pdf'
const PDF_TITLE = 'Two-Column Excerpt'
const TEXT = {
  name: 'short-story.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from(
    'The first paragraph has a handful of words in it.\n\n' +
      'The second paragraph follows, and then the story ends.\n',
  ),
}

/** Every console error and uncaught exception, so a test can insist on none. */
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

/** Import a file; the app opens a newly added book straight in the reader. */
async function addBook(page: Page, file: Parameters<Page['setInputFiles']>[1]) {
  await page.getByLabel('Add book').setInputFiles(file)
  await expect(page).toHaveURL(/#\/reader\/\d+/, { timeout: 30_000 })
  await expect(page.getByTestId('word-counter')).toBeVisible()
}

/** The word index shown under the RSVP word ("word 8 / 2,200 · …"). */
async function wordNumber(page: Page): Promise<number> {
  const text = (await page.getByTestId('word-counter').textContent()) ?? ''
  const match = /word ([\d,]+)/.exec(text)
  if (!match) throw new Error(`no word number in "${text}"`)
  return Number(match[1]!.replace(/,/g, ''))
}

test('a PDF imports, reads in both modes, and resumes after a reload', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')

  await addBook(page, PDF)
  await expect(page.getByRole('banner')).toContainText(PDF_TITLE)

  // RSVP: play moves the word on, pause stops it.
  await expect(page.getByTestId('word-counter')).toContainText('word 1 /')
  await page.keyboard.press('Space')
  await expect.poll(() => wordNumber(page)).toBeGreaterThan(3)
  await page.keyboard.press('Space')
  const paused = await wordNumber(page)
  await page.waitForTimeout(500)
  expect(await wordNumber(page)).toBe(paused)

  // Arrow keys step one word.
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => wordNumber(page)).toBe(paused + 1)

  // Book mode draws real pages: a canvas with pixels on it.
  await page.keyboard.press('b')
  await expect(page.getByTestId('book-page-label')).toBeVisible()
  const pageCanvas = page.locator('canvas').first()
  await expect(pageCanvas).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(() => pageCanvas.evaluate((canvas) => (canvas as { width: number }).width))
    .toBeGreaterThan(0)

  // Back to RSVP, at the same word: the two modes share one position.
  await page.keyboard.press('b')
  await expect.poll(() => wordNumber(page)).toBe(paused + 1)

  // Reload: progress was saved on pause, and the reader comes back to it.
  await page.keyboard.press('Space')
  await page.keyboard.press('Space')
  const saved = await wordNumber(page)
  await page.reload()
  await expect.poll(() => wordNumber(page), { timeout: 15_000 }).toBe(saved)

  expect(errors).toEqual([])
})

test('a text file imports and reads, with the reflowed page beside it', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await addBook(page, TEXT)

  await page.keyboard.press('Space')
  await expect.poll(() => wordNumber(page)).toBeGreaterThan(2)
  await page.keyboard.press('Space')

  await page.keyboard.press('b')
  await expect(page.getByText('The second paragraph follows')).toBeVisible()

  expect(errors).toEqual([])
})

test('the page overlay never covers the word', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await addBook(page, PDF)

  await page.keyboard.press('p')
  const overlay = page.getByRole('region', { name: 'Page view' })
  // In a window too small for it, the overlay is not shown at all; that is
  // allowed. What is never allowed is an overlay over the word.
  if ((await overlay.count()) === 0) {
    expect(errors).toEqual([])
    return
  }
  await expect(overlay).toBeVisible()

  // The word is drawn on the RSVP canvas's centre line and reaches
  // `wordZoneHalfHeight` above and below it (rsvp-geometry.ts): at the
  // default 56px font, 56 * 0.75 + 14 = 56px.
  const wordCanvas = page.locator('canvas').first()
  const area = (await wordCanvas.boundingBox())!
  const centre = area.y + area.height / 2
  const half = 56 * 0.75 + 14
  const box = (await overlay.boundingBox())!
  const overlapsWord = box.y < centre + half && box.y + box.height > centre - half
  expect(overlapsWord, `overlay ${JSON.stringify(box)} vs word ${centre}±${half}`).toBe(false)

  expect(errors).toEqual([])
})
