/**
 * Prints one cheque image, and nothing of the page around it, from a hidden
 * iframe. The promise resolves once the print dialog has been called for, and
 * rejects when the image cannot be loaded - nothing is printed then.
 *
 * Whether the user went on to print or cancelled is not something a browser
 * tells a page. The iframe goes when the dialog closes.
 */

const PRINT_STYLE = `
  @page { size: auto; margin: 0.2in 0 0 0; }
  html, body { margin: 0; padding: 0; }
  img { display: block; width: 100%; height: auto; }
`

export const printChequeImage = (url) =>
  new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.position = 'absolute'
    frame.style.top = '-10000px'
    document.body.appendChild(frame)

    const page = frame.contentDocument
    page.open()
    page.write(`<!doctype html><html><head><title>Print Cheque</title><style>${PRINT_STYLE}</style></head><body></body></html>`)
    page.close()

    const image = page.createElement('img')
    image.alt = 'Cheque'
    image.onload = () => {
      const view = frame.contentWindow
      view.addEventListener('afterprint', () => frame.remove(), { once: true })
      view.focus()
      view.print()
      resolve()
    }
    image.onerror = () => {
      frame.remove()
      reject(new Error('The cheque image could not be loaded, so nothing was printed.'))
    }
    image.src = url
    page.body.appendChild(image)
  })
