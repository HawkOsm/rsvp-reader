import { getDb } from '@/storage/schema'
import * as offers from '@/sync/offers'

// What the reader asks of sync: whether another device has a newer place in
// this book, and moving there when the reader says so.

export type { ProgressOffer } from '@/sync/offers'

export async function progressOfferFor(bookId: number): Promise<offers.ProgressOffer | null> {
  return (await offers.progressOffers(getDb())).find((o) => o.bookId === bookId) ?? null
}

export const acceptProgressOffer = (offer: offers.ProgressOffer) =>
  offers.acceptProgressOffer(getDb(), offer)
