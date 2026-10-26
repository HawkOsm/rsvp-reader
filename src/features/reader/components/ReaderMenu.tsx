import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '@/components/Icon'

/** The phone reader's "⋯" button, and the controls it holds that the
 * header has no room for. Choosing one closes it, as do Escape and a tap
 * anywhere else. */
export function ReaderMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Reader menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          open ? 'bg-bg-hover text-text' : 'text-text-dim hover:text-text'
        }`}
      >
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div
          role="group"
          aria-label="Reader controls"
          // Any choice closes the menu; the control has already acted.
          onClick={(e) => (e.target as HTMLElement).closest('button') && setOpen(false)}
          className="absolute top-full right-0 z-40 mt-2 flex w-64 max-w-[calc(100vw-1rem)] flex-wrap items-center gap-2 rounded-xl border border-border bg-bg-raised p-2.5 shadow-xl shadow-black/30"
        >
          {children}
        </div>
      )}
    </div>
  )
}
