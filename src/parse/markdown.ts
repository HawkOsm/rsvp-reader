/** A pragmatic Markdown-syntax stripper — not a full CommonMark parser,
 * just enough that RSVP playback doesn't flash `#`, `**`, `[]()`, etc. as
 * words. Order matters: links/images before emphasis, since `*` inside a
 * link target shouldn't be read as emphasis markup. */
export function stripMarkdown(text: string): string {
  let out = text

  // Fenced code blocks: drop the fence line, keep the code as plain words.
  out = out.replace(/^```.*$/gm, '')
  out = out.replace(/^~~~.*$/gm, '')
  // Inline code: keep the content, drop the backticks.
  out = out.replace(/`([^`]+)`/g, '$1')
  // Images: ![alt](url) -> alt
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  // Links: [text](url) -> text
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  // ATX headers: leading #'s
  out = out.replace(/^#{1,6}\s+/gm, '')
  // Blockquotes
  out = out.replace(/^>\s?/gm, '')
  // Horizontal rules
  out = out.replace(/^(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '')
  // List markers
  out = out.replace(/^(\s*)[-*+]\s+/gm, '$1')
  out = out.replace(/^(\s*)\d+\.\s+/gm, '$1')
  // Emphasis/strong (*** ** * ___ __ _) and strikethrough (~~)
  out = out.replace(/(\*\*\*|___)(.+?)\1/g, '$2')
  out = out.replace(/(\*\*|__)(.+?)\1/g, '$2')
  out = out.replace(/(\*|_)(.+?)\1/g, '$2')
  out = out.replace(/~~(.+?)~~/g, '$1')

  return out
}
