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
  // Under the page there is one line and no bar; pressing it opens the jump
  // panel, which on a small screen offers no two-page layout.
  await page.getByTestId('book-status').click()
  const panel = page.getByRole('dialog', { name: 'Go to' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: /Single page|Two pages/ })).toHaveCount(0)
  await panel.getByRole('textbox', { name: 'Page number' }).fill('3')
  await panel.getByRole('button', { name: 'Go', exact: true }).click()
  await expect(page.getByTestId('book-page-label')).toHaveText(/^page 3 \/ \d+$/)
  await page.getByTestId('book-status').click()
  await panel.getByRole('button', { name: /Back to page 1/ }).click()
  await expect(page.getByTestId('book-page-label')).toHaveText(/^page 1 \/ \d+$/)
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(pages.first()).toBeVisible()

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
  // Moving through the book gives the page the whole screen: the header
  // goes, and the one line says where the reader is.
  const status = page.getByTestId('book-status')
  await swipe(300, 80)
  await expect(status).toHaveText(/^page 2 \/ \d+ · \d+%$/)
  await expect(page.getByRole('button', { name: 'Reader menu' })).toBeHidden()
  await swipe(80, 300)
  await expect(status).toHaveText(/^page 1 \/ \d+ · \d+%$/)

  // A tap at the right edge turns the page, at
  // the left edge goes back, and in the middle brings the header over the
  // page without moving or resizing it.
  const tap = (x: number) => swipe(x, x)
  await tap(340)
  await expect(status).toHaveText(/^page 2 \//)
  await tap(30)
  await expect(status).toHaveText(/^page 1 \//)
  // (Once the page turned to has been drawn, no longer an empty canvas, and
  // has stopped moving.)
  const box = () => pages.first().boundingBox()
  let before = await box()
  await expect
    .poll(async () => {
      const last = before
      before = await box()
      return before!.width > 301 && JSON.stringify(before) === JSON.stringify(last)
    })
    .toBe(true)
  await tap(187)
  await expect(page.getByRole('button', { name: 'Reader menu' })).toBeVisible()
  expect(await box()).toEqual(before)
  await tap(187)
  await expect(page.getByRole('button', { name: 'Reader menu' })).toBeHidden()

  expect(errors).toEqual([])
})
