import { useEffect, useState } from 'react'
import { getCover, type BookRecord } from '@/features/library/api/library'
import { logError } from '@/lib/error-log'

/** The book's cover, or a plain card with its title while there is none. */
export function BookCover({ book }: { book: BookRecord }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    getCover(book.id as number)
      .then((blob) => {
        if (cancelled || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((err) => logError('book cover', err))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [book.id])

  return (
    <div className="aspect-[2/3] overflow-hidden rounded border border-border bg-bg-raised">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div
          aria-hidden
          className="flex h-full flex-col justify-between bg-bg-hover p-3 text-text @container"
        >
          <span className="text-[10px] tracking-widest text-text-dim uppercase">
            {book.formatId}
          </span>
          <span className="line-clamp-5 font-serif text-[clamp(0.75rem,12cqw,1.25rem)] leading-tight">
            {book.title}
          </span>
          <span className="h-px bg-border" />
        </div>
      )}
    </div>
  )
}
