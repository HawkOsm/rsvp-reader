import { expect, test } from '@playwright/test'
import {
  EPUB,
  EPUB_TITLE,
  addBook,
  collectErrors,
  savedWordIndexes,
  wordNumber,
} from './helpers.ts'

// EPUBs are parsed in parse.worker.ts, where there is no DOMParser. The unit
// tests run the parser on jsdom's main thread, so only a real browser
// catches a parser that needs the DOM.

test('an EPUB imports in the worker and reads', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await addBook(page, EPUB)
  await expect(page.getByRole('banner')).toContainText(EPUB_TITLE)

  await page.keyboard.press('Space')
  await expect.poll(() => wordNumber(page)).toBeGreaterThan(2)
  await page.keyboard.press('Space')

  expect(errors).toEqual([])
})

// Reading an EPUB in book mode is scrolling. The place has to follow the
// scroll, or the book reopens where the sitting began; and following it
// must not move the text under the reader.
test('in book mode over an EPUB, the place follows the scrolling', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await addBook(page, EPUB)
  await page.keyboard.press('b')
  const scroller = page.locator('#book-scroll')
  await expect(scroller).toBeVisible()
  // A string, run in the page: this file has no DOM types to check it against.
  const scrollTop = () => page.evaluate<number>(`document.getElementById('book-scroll').scrollTop`)
  // Scroll well into the book, a stretch at a time as more of it is laid out.
  await expect
    .poll(async () => {
      await page.evaluate(`document.getElementById('book-scroll').scrollBy({ top: 2000 })`)
      return scrollTop()
    })
    .toBeGreaterThan(6000)
  // Space scrolls on by most of a screen.
  const before = await scrollTop()
  await page.keyboard.press('Space')
  await expect.poll(scrollTop).toBeGreaterThan(before)
  const rested = await scrollTop()

  // The place saved is one in the part scrolled to…
  await expect
    .poll(() => savedWordIndexes(page).then((all) => Math.max(0, ...all)))
    .toBeGreaterThan(300)
  // …and following the scroll moved nothing.
  expect(await scrollTop()).toBe(rested)
  // …and RSVP goes on from there.
  await page.keyboard.press('b')
  await expect.poll(() => wordNumber(page)).toBeGreaterThan(300)

  // A jump (here End, to the last word) scrolls the page itself. The place
  // must not then follow that scroll back to the top of the screen.
  await page.keyboard.press('b')
  await page.keyboard.press('End')
  await page.waitForTimeout(600) // longer than a scroll takes to settle
  await page.keyboard.press('b')
  const counter = (await page.getByTestId('word-counter').textContent())!
  const [, at, of] = /word ([\d,]+) \/ ([\d,]+)/.exec(counter)!
  expect(at).toBe(of)

  expect(errors).toEqual([])
})
