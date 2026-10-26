import { expect, test } from '@playwright/test'
import { addBook, collectErrors } from './helpers.ts'

const LONG = {
  name: 'long-words.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from(
    'Incomprehensibilities notwithstanding, counterrevolutionaries institutionalised ' +
      'electroencephalography and uncharacteristically disproportionate ' +
      'internationalisation.\n',
  ),
}

test('a bookmark made in the reader is listed in the library, and opens there', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await addBook(page, LONG)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  // On a phone the reader's controls sit behind its "⋯" menu.
  const phone = test.info().project.name === 'phone'
  const openMenu = async () => {
    if (phone) await page.getByRole('button', { name: 'Reader menu' }).click()
  }
  await openMenu()
  await page.getByRole('button', { name: 'Add bookmark' }).click()
  await openMenu()
  await expect(page.getByRole('button', { name: 'Remove bookmark' })).toBeVisible()

  await page.getByRole('button', { name: 'Library' }).click()
  // On a phone the side menu is the Shelves tab.
  if (phone) {
    await page
      .getByRole('navigation', { name: 'Tabs' })
      .getByRole('button', { name: 'Shelves' })
      .click()
  }
  await page.getByRole('button', { name: /^Bookmarks/ }).click()
  const marks = page.getByRole('list', { name: 'Bookmarks' })
  await expect(marks).toContainText('counterrevolutionaries institutionalised')

  // A long excerpt is cut short, never widening the page.
  const overflow = await page.locator('html').evaluate((el) => {
    const html = el as unknown as { scrollWidth: number; clientWidth: number }
    return html.scrollWidth - html.clientWidth
  })
  expect(overflow).toBe(0)

  await marks.getByRole('button', { name: /^long-words/ }).click()
  await expect(page.getByTestId('word-counter')).toContainText('word 3 /')
  // The bookmark's address is spent once the book is open.
  await expect(page).toHaveURL(/#\/reader\/\d+$/)
  expect(errors).toEqual([])
})
