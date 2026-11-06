/**
 * Rich text as RichTextEditor writes it: a small allowlist of formatting tags
 * (bold, italic, underline, lists, paragraphs, left/centre/right alignment).
 *
 * sanitizeHtml rebuilds the markup from that allowlist instead of filtering the
 * input - every tag outside it is dropped (its text kept), every attribute is
 * dropped except an alignment, and script/style-like elements go with their
 * content - so what it returns is safe to set as innerHTML. It needs no DOM,
 * so it behaves the same in the browser and in tests.
 */

const ALLOWED = new Set(['p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li'])
const ALIGNABLE = new Set(['p', 'div', 'li'])
const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify'])
/** Dropped together with everything inside them. */
const DROPPED = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'textarea', 'select', 'title', 'head', 'svg', 'math'])

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g

/** A bare "&" (not starting an entity), "<" and ">" in text, escaped. */
const escapeText = (text) =>
  text
    .replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** text-align from a style="text-align: x" or an align="x" (Firefox's justify commands). */
const alignmentOf = (attributes) => {
  const found =
    /(?:^|[\s;"'])text-align\s*:\s*([a-z]+)/i.exec(attributes) ?? /\balign\s*=\s*["']?([a-z]+)/i.exec(attributes)
  const value = found?.[1]?.toLowerCase()
  return ALIGNMENTS.has(value) && value !== 'left' ? value : null
}

export const sanitizeHtml = (html) => {
  const source = String(html ?? '')
  let out = ''
  let at = 0
  TOKEN.lastIndex = 0
  let match
  while ((match = TOKEN.exec(source))) {
    out += escapeText(source.slice(at, match.index))
    at = TOKEN.lastIndex
    const [, closing, rawName = '', attributes = ''] = match
    const name = rawName.toLowerCase()
    if (!name) continue // a comment

    if (DROPPED.has(name)) {
      if (closing) continue
      const end = new RegExp(`</${name}\\s*>`, 'i').exec(source.slice(at))
      at = end ? at + end.index + end[0].length : source.length
      TOKEN.lastIndex = at
      continue
    }
    if (!ALLOWED.has(name)) continue
    if (name === 'br') {
      if (!closing) out += '<br>'
      continue
    }
    if (closing) {
      out += `</${name}>`
      continue
    }
    const align = ALIGNABLE.has(name) ? alignmentOf(attributes) : null
    out += align ? `<${name} style="text-align: ${align}">` : `<${name}>`
  }
  return out + escapeText(source.slice(at))
}

/** The words in it, tags gone - '' for markup an editor leaves behind when emptied ("<div><br></div>"). */
export const richTextToPlain = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const isHtmlEmpty = (html) => richTextToPlain(html) === ''

/**
 * A saved value made ready for the editor: markup is sanitised, and plain text
 * (saved before the editor existed) keeps its line breaks.
 */
export const toRichText = (value) => {
  const text = String(value ?? '')
  if (/<[a-zA-Z/!]/.test(text)) return sanitizeHtml(text)
  return escapeText(text).replace(/\r?\n/g, '<br>')
}

/** The look of the stored markup, wherever it is shown (lists keep their bullets under Tailwind's reset). */
export const richTextClass =
  'text-sm break-words [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0 [&_ul]:list-disc [&_ul]:pl-5'

