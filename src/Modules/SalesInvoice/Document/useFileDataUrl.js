import { useEffect, useState } from 'react'

/**
 * An uploaded image as a data URL, for the invoice sheet - null until it is
 * read, or when there is no file.
 *
 * A data URL rather than a blob: URL because the PDF engine's browser
 * renderer serialises each sheet into an SVG foreignObject, and an image
 * inside one cannot load anything from outside it - a data URL travels with
 * the markup.
 */
export default function useFileDataUrl(file) {
  const [read, setRead] = useState({ file: null, url: null })

  useEffect(() => {
    if (!file) return undefined
    let alive = true
    const reader = new FileReader()
    reader.onload = () => {
      if (alive) setRead({ file, url: typeof reader.result === 'string' ? reader.result : null })
    }
    reader.readAsDataURL(file)
    return () => {
      alive = false
      reader.abort()
    }
  }, [file])

  // A result for an earlier file (or after the file was removed) is not this one's.
  return file && read.file === file ? read.url : null
}
