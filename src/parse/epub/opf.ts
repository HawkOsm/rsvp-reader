import { parseXml } from './dom'

const DC_NS = 'http://purl.org/dc/elements/1.1/'

/** container.xml -> the OPF's own path inside the zip (e.g. "OEBPS/content.opf"). */
export function parseContainer(xmlText: string): string {
  const doc = parseXml(xmlText)
  const rootfile = doc.getElementsByTagName('rootfile')[0]
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
}

/** content.opf -> title/author metadata and the spine's reading order,
 * resolved from itemref/idref through the manifest to each item's href. */
export function parseOpf(xmlText: string): OpfResult {
  const doc = parseXml(xmlText)

  const title = firstText(doc, DC_NS, 'title') ?? 'Untitled'
  const author = firstText(doc, DC_NS, 'creator')

  const manifest = new Map<string, string>()
  for (const item of Array.from(doc.getElementsByTagName('item'))) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) manifest.set(id, href)
  }

  const spineHrefs: string[] = []
  for (const itemref of Array.from(doc.getElementsByTagName('itemref'))) {
    if (itemref.getAttribute('linear') === 'no') continue
    const idref = itemref.getAttribute('idref')
    const href = idref ? manifest.get(idref) : undefined
    if (href) spineHrefs.push(href)
  }

  return { title, author: author || undefined, spineHrefs }
}

/** The parser has no namespaces, so find the namespace's element by the
 * prefix (or default namespace) the document declares for it. */
function firstText(doc: Document, ns: string, localName: string): string | undefined {
  const names = new Set([`dc:${localName}`])
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.value !== ns) continue
      if (attr.name === 'xmlns') names.add(localName)
      else if (attr.name.startsWith('xmlns:')) names.add(`${attr.name.slice(6)}:${localName}`)
    }
  }
  const el = Array.from(doc.querySelectorAll('*')).find((e) => names.has(e.tagName))
  const text = el?.textContent?.trim()
  return text || undefined
}
