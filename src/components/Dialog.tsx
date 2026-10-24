import { useEffect, type ReactNode } from 'react'

export interface DialogProps {
  /** Read out by screen readers as the dialog's name. */
  label: string
  /** The heading line, e.g. the book's title. */
  title: ReactNode
  /** One short explanation under the title. */
  description?: ReactNode
  /** Escape and the backdrop do the same as the dialog's cancel button. */
  onCancel: () => void
  /** Form controls, then the buttons (first one is the main action). */
  children: ReactNode
}

/** A modal question with a few answers. Every dialog in the app is one of
 * these, so they all look alike and all close on Escape. */
export function Dialog({ label, title, description, onCancel, children }: DialogProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-96 max-w-full rounded-lg border border-border bg-bg-raised p-5 text-text">
        <p className="mb-1 font-medium">{title}</p>
        {description && <p className="mb-4 text-sm text-text-dim">{description}</p>}
        {children}
      </div>
    </div>
  )
}

/** The dialog's answers, stacked: the main one first. */
export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>
}
