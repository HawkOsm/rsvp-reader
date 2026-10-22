import { DEFAULT_PAGE, type PageSpec } from '../../src/core/page-spec'
import type { ContentLayout, FormatId } from '../../src/core/types'

/** The format fields every `addBook` call needs, for tests that don't care
 * which format the book is. */
export const TEXT_BOOK: { formatId: FormatId; layout: ContentLayout; page: PageSpec } = {
  formatId: 'text',
  layout: { kind: 'reflow' },
  page: DEFAULT_PAGE,
}
