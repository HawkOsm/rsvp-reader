import { expect, type Page } from '@playwright/test'

// Shared by the e2e specs. Each test starts with an empty library: a fresh
// browser context has its own IndexedDB.

export const PDF = 'tests/fixtures/two-column-text.pdf'
export const PDF_TITLE = 'Two-Column Excerpt'
export const EPUB = 'tests/fixtures/austen-pride-and-prejudice.epub'
export const EPUB_TITLE = 'Pride and Prejudice'
export const TEXT = {
  name: 'short-story.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from(
    'The first paragraph has a handful of words in it.\n\n' +
      'The second paragraph follows, and then the story ends.\n',
  ),
}

/** Every console error and uncaught exception, so a test can insist on none. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

/** Import a file; the app opens a newly added book straight in the reader. */
export async function addBook(page: Page, file: Parameters<Page['setInputFiles']>[1]) {
  await page.getByLabel('Add book').setInputFiles(file)
  await expect(page).toHaveURL(/#\/reader\/\d+/, { timeout: 30_000 })
  await expect(page.getByTestId('word-counter')).toBeVisible()
}

/** The word index shown under the RSVP word ("word 8 / 2,200 · …"). */
export async function wordNumber(page: Page): Promise<number> {
  const text = (await page.getByTestId('word-counter').textContent()) ?? ''
  const match = /word ([\d,]+)/.exec(text)
  if (!match) throw new Error(`no word number in "${text}"`)
  return Number(match[1]!.replace(/,/g, ''))
}
