import { expect, test } from '@playwright/test'
import { PDF, addBook, collectErrors } from './helpers.ts'

// Book mode on a phone: one page, fitted to the screen and centred, turned
// with a swipe. Run on the phone project only.

test('on a phone, book mode shows one fitted page, and a swipe turns it', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone', 'a phone-sized screen only')
  const errors = collectErrors(page)
  await page.goto('/')
  await addBook(page, PDF)
  // The mode switch is behind the reader's menu on a phone.
  await page.getByRole('button', { name: 'Reader menu' }).click()
  await page.getByRole('button', { name: 'Book', exact: true }).click()

  const scroller = page.locator('#book-scroll')
  const pages = scroller.locator('canvas')
  await expect(pages.first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('book-page-label')).toHaveText(/^page 1 \/ \d+$/)
  await expect(pages).toHaveCount(1)
  // No two-page layout or size slider to fiddle with on a small screen.
  await expect(page.getByRole('button', { name: /Single page|Two pages/ })).toHaveCount(0)
  await expect(page.getByRole('slider', { name: 'Page size' })).toHaveCount(0)

  // The page fills the width, with nothing to scroll sideways, and sits in
  // the middle of the space, not against its top.
  await expect
    .poll(async () => {
      const area = (await scroller.boundingBox())!
      const sheet = (await pages.first().boundingBox())!
      return sheet.width / area.width
    })
    .toBeGreaterThan(0.85)
  const area = (await scroller.boundingBox())!
  const sheet = (await pages.first().boundingBox())!
  const place = {
    overflowX: await scroller.evaluate((el) => {
      const box = el as unknown as { scrollWidth: number; clientWidth: number }
      return box.scrollWidth - box.clientWidth
    }),
    above: sheet.y - area.y,
    below: area.y + area.height - (sheet.y + sheet.height),
  }
  expect(place.overflowX).toBeLessThanOrEqual(1)
  if (place.below > 0) expect(Math.abs(place.above - place.below)).toBeLessThan(24)

  // A finger swiping left turns to the next page; right, back again.
  // A string, run in the page: this file has no DOM types to check it against.
  const swipe = (from: number, to: number) =>
    page.evaluate(`(() => {
      const el = document.getElementById('book-scroll')
      const at = (type, x) =>
        el.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: 1,
            pointerType: 'touch',
            clientX: x,
            clientY: 300,
          }),
        )
      at('pointerdown', ${from})
      at('pointermove', ${(from + to) / 2})
      at('pointerup', ${to})
    })()`)
  await swipe(300, 80)
  await expect(page.getByTestId('book-page-label')).toHaveText(/^page 2 \/ \d+$/)
  await swipe(80, 300)
  await expect(page.getByTestId('book-page-label')).toHaveText(/^page 1 \/ \d+$/)

  expect(errors).toEqual([])
})
