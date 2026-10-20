import { useEffect, useState } from 'react'

/**
 * An image for the invoice sheet as a data URL - null until it is read, or
 * when there is none. It is either
 *
 *   a File          picked by the user - read from the disk
 *   { url }         a file already on the server (a bank's payment QR,
 *                   paymentQrOfBank) - fetched and read; if the server does
 *                   not allow that (CORS), the link itself is used, which
 *                   the sheet can still show
 *
 * A data URL rather than a blob: URL because the PDF engine's browser
 * renderer serialises each sheet into an SVG foreignObject, and an image
 * inside one cannot load anything from outside it - a data URL travels with
 * the markup.
 */
const readAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

export default function useFileDataUrl(file) {
  const [read, setRead] = useState({ file: null, url: null })

  useEffect(() => {
    if (!file) return undefined
    let alive = true
    const done = (url) => {
      if (alive) setRead({ file, url })
    }

    if (file instanceof Blob) {
      readAsDataUrl(file).then(done, () => done(null))
    } else if (file.url) {
      fetch(file.url)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.blob()
        })
        .then(readAsDataUrl)
        .then(done, () => done(file.url))
    }
    return () => {
      alive = false
    }
  }, [file])

  // A result for an earlier file (or after the file was removed) is not this one's.
  return file && read.file === file ? read.url : null
}
