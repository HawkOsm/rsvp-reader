import type { HTMLAttributes, ReactNode } from 'react'

export interface PageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode
  /** A line under the title, e.g. how many books there are. */
  subtitle?: ReactNode
  /** Left of the title, e.g. a "← Library" link. */
  back?: ReactNode
  /** Right of the title: the screen's actions. */
  actions?: ReactNode
  /** A side menu left of the content; if it is given on a phone, it stacks above it. */
  sidebar?: ReactNode
  /** A phone's bottom tab bar, if the screen has one; room is left for it. */
  tabBar?: ReactNode
  children: ReactNode
}

/** A full screen with a title row: the library and settings screens. (The
 * reader has its own chrome, built around the word.) */
export function Page({
  title,
  subtitle,
  back,
  actions,
  sidebar,
  tabBar,
  children,
  ...rest
}: PageProps) {
  const content = (
    <>
      <div className="flex flex-wrap items-center gap-4">
        {back}
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
          {subtitle && <span className="text-[13px] text-text-dim">{subtitle}</span>}
        </div>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </>
  )
  const room = tabBar ? 'pb-24' : ''
  if (!sidebar) {
    return (
      <div {...rest} className={`flex min-h-screen flex-col gap-4 bg-bg p-6 text-text ${room}`}>
        {content}
        {tabBar}
      </div>
    )
  }
  return (
    <div {...rest} className={`flex min-h-screen flex-wrap content-start bg-bg text-text ${room}`}>
      {sidebar}
      <div className="flex min-w-0 flex-[999_1_32rem] flex-col gap-6 px-5 pt-7 pb-12 sm:gap-8 sm:px-9">
        {content}
      </div>
      {tabBar}
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
