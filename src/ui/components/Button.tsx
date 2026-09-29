import type { ButtonHTMLAttributes } from 'react'

const VARIANTS = {
  /** Bordered — the reader's header and controls. */
  default:
    'rounded border border-[var(--color-border)] bg-[var(--color-bg-raised)] px-3 py-1.5 text-[var(--color-text)]',
  /** Accent-filled — the one action a screen wants you to take. */
  primary: 'rounded bg-[var(--color-accent)] px-3 py-1.5 font-medium text-[var(--color-bg)]',
  /** Dim text, no chrome — navigation and secondary actions. */
  link: 'text-[var(--color-text-dim)] hover:text-[var(--color-text)]',
  /** Like `link`, but warms to the accent on hover — for removing things. */
  danger: 'text-[var(--color-text-dim)] hover:text-[var(--color-accent)]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS
  small?: boolean
}

export function Button({ variant = 'default', small, className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`${VARIANTS[variant]} ${small ? 'text-xs' : 'text-sm'} disabled:opacity-40 ${className}`}
    />
  )
}
