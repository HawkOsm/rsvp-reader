import type { HTMLAttributes, ReactNode } from 'react'

export interface PageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode
  /** Left of the title, e.g. a "← Library" link. */
  back?: ReactNode
  /** Right of the title: the screen's actions. */
  actions?: ReactNode
  children: ReactNode
}

/** A full screen with a title row: the library and settings screens. (The
 * reader has its own chrome, built around the word.) */
export function Page({ title, back, actions, children, ...rest }: PageProps) {
  return (
    <div {...rest} className="flex min-h-screen flex-col gap-4 bg-bg p-6 text-text">
      <div className="flex flex-wrap items-center gap-4">
        {back}
        <h1 className="text-xl font-semibold">{title}</h1>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

/** A full screen with one message in the middle: loading, or an error. */
export function Centered({ children, dim }: { children: ReactNode; dim?: boolean }) {
  return (
    <div
      className={`flex min-h-screen flex-col items-center justify-center gap-4 bg-bg p-6 ${dim ? 'text-text-dim' : 'text-text'}`}
    >
      {children}
    </div>
  )
}
