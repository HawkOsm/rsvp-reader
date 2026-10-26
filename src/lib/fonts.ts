/** The typefaces offered for the RSVP word, in settings and the reader. */
export const FONT_CHOICES = [
  {
    label: 'Inter (default)',
    short: 'Inter',
    value: 'Inter, "Noto Sans", "Liberation Sans", Arial, sans-serif',
  },
  { label: 'Georgia (serif)', short: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'System UI', short: 'System', value: 'system-ui, sans-serif' },
]

const firstFamily = (stack: string) => stack.split(',')[0]?.trim().replace(/"/g, '') ?? ''

/** The choice a stored typeface setting is, matched by its first family: the
 * default setting's fallback list differs from the choice's. */
export function fontChoiceOf(value: string): (typeof FONT_CHOICES)[number] | undefined {
  return FONT_CHOICES.find((choice) => firstFamily(choice.value) === firstFamily(value))
}

/** The short name of a typeface setting, for a summary line; one that is no
 * current choice reads as "Custom". */
export function fontName(value: string): string {
  return fontChoiceOf(value)?.short ?? 'Custom'
}

/** The smallest and largest RSVP word size, in px. */
export const MIN_FONT_SIZE = 28
export const MAX_FONT_SIZE = 96
