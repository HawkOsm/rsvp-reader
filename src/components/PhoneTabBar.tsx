import { Icon, type IconName } from './Icon'

export type PhoneTab = 'library' | 'shelves' | 'settings'

const TABS: { value: PhoneTab; label: string; icon: IconName }[] = [
  { value: 'library', label: 'Library', icon: 'book' },
  { value: 'shelves', label: 'Shelves', icon: 'bookmark' },
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
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-bg-raised px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {TABS.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          aria-current={active === value ? 'page' : undefined}
          onClick={() => onSelect(value)}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] ${
            active === value ? 'font-semibold text-text' : 'text-text-dim'
          }`}
        >
          <Icon name={icon} size={22} />
          {label}
        </button>
      ))}
    </nav>
  )
}
