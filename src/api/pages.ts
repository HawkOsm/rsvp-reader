import { DEFAULT_PAGE, makePageSpec, type PageSpec } from '../core/page-spec'

// The in-process API between the "backend" (parsing, PDF, storage) and the
// UI. There is no server in this app, by design, so this is a typed boundary,
// not a network one, and it carries values, not database rows: the UI never
// needs to know how a book is stored.

/** The page the UI should draw: frozen, and the default if there is none. */
export function resolvePage(page: { width: number; height: number } | undefined | null): PageSpec {
  return page ? makePageSpec(page.width, page.height) : DEFAULT_PAGE
}
