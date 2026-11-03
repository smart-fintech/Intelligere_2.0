/**
 * ONE place for making and saving PDFs. Every PDF in the app goes through here:
 *
 *   const bytes = await createPdf(() => import('./MyPdfDocument'), { ...props })
 *   downloadPdf(bytes, 'Report.pdf')
 *
 * @react-pdf/renderer is large, so it and the document are only loaded when a
 * PDF is first made. Keep this file free of static imports of either: a screen
 * can import it without paying for them.
 *
 * Loading can fail - after a new release the old chunk names are gone, and a
 * tab left open still asks for them. The browser's "Failed to fetch dynamically
 * imported module" means nothing to the user, and asking again on the same page
 * does not help (the failed module stays failed), so the screen is handed
 * something it can show. The real error goes to the console.
 */

import { createElement } from 'react'

const LOAD_FAILED = 'The PDF tools could not be loaded. Please reload the page and try again.'

/**
 * A react-pdf document as PDF bytes - refused when it comes out empty.
 *
 *   loadDocument   () => import('...') of a module whose default export is the
 *                  document component
 *   props          what the document is drawn from
 */
export async function createPdf(loadDocument, props) {
  let loaded
  try {
    loaded = await Promise.all([import('@react-pdf/renderer'), loadDocument()])
  } catch (failure) {
    console.error('[PDF] Could not load the PDF renderer or document:', failure)
    throw new Error(LOAD_FAILED, { cause: failure })
  }

  const [{ pdf }, { default: PdfDocument }] = loaded
  const blob = await pdf(createElement(PdfDocument, props)).toBlob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes.length < 500 || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') {
    throw new Error('The PDF came out empty.')
  }
  return bytes
}

/** PDF bytes as a Blob - what a download or an upload carries. */
export const pdfBlob = (bytes) => new Blob([bytes], { type: 'application/pdf' })

/** Saves PDF bytes to the user's disk under `fileName`. */
export function downloadPdf(bytes, fileName) {
  const url = URL.createObjectURL(pdfBlob(bytes))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Long enough for the browser to start the download, then the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** What a file name cannot hold, made safe - a company or ledger name may have any of it. */
export const safeFileName = (name) => String(name).replace(/[\\/:*?"<>|]+/g, '-').trim()

/**
 * react-pdf breaks lines only at spaces, so a long run with none would run out
 * of its column. Any word longer than `max` characters is broken up beforehand.
 */
export const breakLongWords = (text, max) =>
  String(text ?? '')
    .split(/(\s+)/)
    .map((word) => (word.length > max ? word.match(new RegExp(`.{1,${max}}`, 'g')).join('\n') : word))
    .join('')
