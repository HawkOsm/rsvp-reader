/** An on/off switch. The label names what it switches, for screen readers
 * and tests; the row around it shows it to everyone else. */
export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex h-[26px] w-11 shrink-0 rounded-full p-[3px] transition-colors ${
        checked ? 'bg-accent' : 'bg-guide'
      }`}
    >
      <span
        aria-hidden
        className={`h-5 w-5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[18px]' : ''
        }`}
      />
    </button>
  )
}
