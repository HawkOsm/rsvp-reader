import { pdfClient } from '@/pdf/client'
import type { RenderedPage } from '@/pdf/document'
import { loadCover, saveCover } from '@/storage/covers'
import { loadFile } from '@/storage/files'
import { getBook } from '@/storage/library'
import { getDb } from '@/storage/schema'

/** How wide a drawn cover is, in pixels: a grid tile at 2x. */
export const COVER_WIDTH = 320

/** Covers being made right now, so two tiles asking for one book share the work. */
const making = new Map<number, Promise<Blob | undefined>>()

/** The book's cover image, or `undefined` if it has none (the library then
 * draws one from the title). A paged book without one stored gets its first
 * page drawn and kept, the first time this is asked. */
export async function getCover(bookId: number): Promise<Blob | undefined> {
  const db = getDb()
  const stored = await loadCover(db, bookId)
  if (stored) return stored

  let pending = making.get(bookId)
  if (!pending) {
    pending = (async () => {
      const book = await getBook(db, bookId)
      if (book?.layout.kind !== 'paged') return undefined
      const file = await loadFile(db, bookId)
      if (!file) return undefined // restored from a backup without its file
      const blob = await drawFirstPage(await file.blob.arrayBuffer(), book.page.width)
      await saveCover(db, bookId, blob)
      return blob
    })().finally(() => making.delete(bookId))
    making.set(bookId, pending)
  }
  return pending
}

async function drawFirstPage(data: ArrayBuffer, pageWidth: number): Promise<Blob> {
  const doc = await pdfClient.open(data)
  try {
    return await toImage(await doc.render(0, COVER_WIDTH / pageWidth))
  } finally {
    doc.close()
  }
}

function toImage(page: RenderedPage): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = page.width
  canvas.height = page.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('No 2D canvas to draw the cover on.'))
  ctx.putImageData(new ImageData(page.rgba, page.width, page.height), 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The cover could not be encoded.'))),
      'image/jpeg',
      0.85,
    ),
  )
}
