import { useState } from 'react'
import { Button } from '@/components/Button'
import { Dialog, DialogActions } from '@/components/Dialog'
import { CONTROL, Field } from '@/components/Field'
import { SHELF_COLORS, type ShelfColor } from '@/features/library/api/library'
import { SHELF_DOT } from '@/features/library/shelf'

export interface NewShelfDialogProps {
  /** The colour picked to start with. */
  color: ShelfColor
  onCreate: (name: string, color: ShelfColor) => void
  onCancel: () => void
}

/** Asks for a new shelf's name and colour. */
export function NewShelfDialog({ color: initialColor, onCreate, onCancel }: NewShelfDialogProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(initialColor)
  const trimmed = name.trim()

  return (
    <Dialog label="New shelf" title="New shelf" onCancel={onCancel}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (trimmed) onCreate(trimmed, color)
        }}
      >
        <Field label="Name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className={CONTROL}
          />
        </Field>
        <div role="group" aria-label="Colour" className="flex gap-2">
          {SHELF_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c === 'accent' ? 'accent' : c.replace('shelf-', '')}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                color === c ? 'border-text' : 'border-transparent'
              }`}
            >
              <span aria-hidden className={`h-4 w-4 rounded-full ${SHELF_DOT[c]}`} />
            </button>
          ))}
        </div>
        <DialogActions>
          <Button type="submit" variant="primary" disabled={!trimmed}>
            Create shelf
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
