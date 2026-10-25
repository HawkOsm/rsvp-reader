import { expect, test } from '@playwright/test'
import { EPUB, EPUB_TITLE, addBook, collectErrors, wordNumber } from './helpers.ts'

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
