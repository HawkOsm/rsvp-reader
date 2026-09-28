export interface ContentBlock {
  tag: string
  text: string
}

const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li'

/** A lone `[12]`-style reference marker is a footnote link, not prose. */
const FOOTNOTE_MARKER_RE = /^\[\s*\d+\s*\]$/

/**
 * Walk a spine document's block elements (p, h1-h6, li) in reading order,
 * skipping nav content and footnote-marker links.
 */
export function extractBlocks(doc: Document): ContentBlock[] {
  if (!doc.body) return []
  const blocks: ContentBlock[] = []

  for (const el of Array.from(doc.body.querySelectorAll(BLOCK_SELECTOR))) {
    if (el.closest('nav')) continue
    // Skip a wrapper that contains its own block children (e.g. an <li>
    // wrapping a <p>) — its full text would otherwise duplicate the
    // children's, which get walked as their own, more specific blocks.
    if (el.querySelector(BLOCK_SELECTOR)) continue

    const clone = el.cloneNode(true) as Element
    for (const a of Array.from(clone.querySelectorAll('a'))) {
      if (FOOTNOTE_MARKER_RE.test((a.textContent ?? '').trim())) a.remove()
    }
    // Some Project Gutenberg conversions embed an illustration's caption
    // inside the following chapter heading itself (a <span class="caption">
    // nested in the <h2>) — without this, a chapter's "title" ends up being
    // the caption text glued to the real heading.
    for (const caption of Array.from(clone.querySelectorAll('.caption'))) {
      caption.remove()
    }

    const text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    blocks.push({ tag: el.tagName.toLowerCase(), text })
  }

  return blocks
}
