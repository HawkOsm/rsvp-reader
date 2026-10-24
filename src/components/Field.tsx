import type { ReactNode } from 'react'

/** The look of a text box, select or number box. */
export const CONTROL = 'rounded border border-border bg-bg-raised px-2 py-1 text-text'

/** A label over its control. `inline` puts them side by side (checkboxes,
 * a colour picker). */
export function Field({
  label,
  inline,
  children,
}: {
  label: ReactNode
  inline?: boolean
  children: ReactNode
}) {
  return (
    <label
      className={`flex text-sm ${inline ? 'items-center justify-between gap-3' : 'flex-col gap-1'}`}
    >
      {label}
      {children}
    </label>
  )
}
