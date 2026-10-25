import { Icon, type IconName } from './Icon'

export type PhoneTab = 'library' | 'shelves' | 'settings'

const TABS: { value: PhoneTab; label: string; icon: IconName }[] = [
  { value: 'library', label: 'Library', icon: 'book' },
  { value: 'shelves', label: 'Shelves', icon: 'shelves' },
  { value: 'settings', label: 'Settings', icon: 'settings' },
]

/** The bar along the bottom of a phone's screen, in place of the library's
 * side menu. Screens show it only below the `sm` breakpoint. */
export function PhoneTabBar({
  active,
  onSelect,
}: {
  active: PhoneTab
  onSelect: (tab: PhoneTab) => void
}) {
  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-bg-raised pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          aria-current={active === value ? 'page' : undefined}
          onClick={() => onSelect(value)}
          className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
            active === value ? 'font-medium text-accent' : 'text-text-dim'
          }`}
        >
          <Icon name={icon} size={20} />
          {label}
        </button>
      ))}
    </nav>
  )
}
