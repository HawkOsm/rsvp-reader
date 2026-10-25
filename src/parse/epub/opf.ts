const DC_NS = 'http://purl.org/dc/elements/1.1/'
const CONTAINER_NS = 'urn:oasis:names:tc:opendocument:xmlns:container'

function parseXml(xmlText: string): Document {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  const parserError = doc.getElementsByTagName('parsererror')[0]
  if (parserError) {
    throw new Error(`Malformed XML: ${parserError.textContent ?? 'unknown error'}`)
  }
  return doc
}

/** container.xml -> the OPF's own path inside the zip (e.g. "OEBPS/content.opf"). */
export function parseContainer(xmlText: string): string {
  const doc = parseXml(xmlText)
  const rootfile =
    doc.getElementsByTagNameNS(CONTAINER_NS, 'rootfile')[0] ??
    doc.getElementsByTagName('rootfile')[0]
  const path = rootfile?.getAttribute('full-path')
  if (!path) throw new Error('container.xml has no <rootfile full-path="...">')
  return path
}

export interface OpfResult {
  title: string
  author?: string
  /** Manifest hrefs in spine (reading) order, relative to the OPF's own
   * directory — not yet resolved to a zip path. */
  spineHrefs: string[]
  /** The cover image's manifest href (relative like `spineHrefs`) and type,
   * if the book names one. */
  cover?: { href: string; mediaType?: string }
}

/** content.opf -> title/author metadata and the spine's reading order,
 * resolved from itemref/idref through the manifest to each item's href. */
export function parseOpf(xmlText: string): OpfResult {
  const doc = parseXml(xmlText)

  const title = firstText(doc, DC_NS, 'title') ?? 'Untitled'
  const author = firstText(doc, DC_NS, 'creator')

  const manifest = new Map<string, string>()
  let cover: OpfResult['cover']
  for (const item of Array.from(doc.getElementsByTagName('item'))) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) manifest.set(id, href)
    // EPUB 3 marks the cover on its manifest item.
    const properties = item.getAttribute('properties')?.split(/\s+/) ?? []
    if (href && !cover && properties.includes('cover-image')) {
      cover = { href, mediaType: item.getAttribute('media-type') ?? undefined }
    }
  }
  // EPUB 2 names it in a <meta name="cover" content="<item id>">.
  if (!cover) {
    const meta = Array.from(doc.getElementsByTagName('meta')).find(
      (m) => m.getAttribute('name') === 'cover',
    )
    const item = Array.from(doc.getElementsByTagName('item')).find(
      (i) => i.getAttribute('id') === meta?.getAttribute('content'),
    )
    const href = item?.getAttribute('href')
    const mediaType = item?.getAttribute('media-type') ?? undefined
    if (href && (!mediaType || mediaType.startsWith('image/'))) cover = { href, mediaType }
  }

  const spineHrefs: string[] = []
  for (const itemref of Array.from(doc.getElementsByTagName('itemref'))) {
    if (itemref.getAttribute('linear') === 'no') continue
    const idref = itemref.getAttribute('idref')
    const href = idref ? manifest.get(idref) : undefined
    if (href) spineHrefs.push(href)
  }

  return { title, author: author || undefined, spineHrefs, cover }
}

function firstText(doc: Document, ns: string, localName: string): string | undefined {
  const byNs = doc.getElementsByTagNameNS(ns, localName)[0]
  const el = byNs ?? doc.getElementsByTagName(`dc:${localName}`)[0]
  const text = el?.textContent?.trim()
  return text || undefined
}
