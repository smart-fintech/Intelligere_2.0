import { useRef } from 'react'
import { Upload } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'

/**
 * "Choose a CSV", as an ordinary button - the upload counterpart of
 * CsvDownloadButton beside it.
 *
 *   <CsvUploadButton onFileSelect={handleUpload} loading={uploading} />
 *
 *   const handleUpload = (file) => { ...the screen's own request... }
 *
 * It is the app's <Button> with a hidden <input type="file"> behind it, so
 * it looks and behaves like every other button on the screen - same
 * variants, same sizes, same spinner. Clicking it opens the normal file
 * picker, and that is the whole interaction: no drop zone, no upload box,
 * no file preview.
 *
 * ------------------------------------------------------------------
 * IT HANDS THE FILE OVER AND STOPS THERE
 * ------------------------------------------------------------------
 * It uploads nothing, knows no endpoint, and keeps no state. The chosen
 * File goes straight to `onFileSelect` and the screen does the rest, which
 * is what lets the same button serve ledgers today and products, inventory
 * or vendors tomorrow:
 *
 *   <CsvUploadButton onFileSelect={importProducts}>Import Products</CsvUploadButton>
 *
 * Props of its own:
 *   onFileSelect  (file) => void, once a CSV has been chosen
 *   accept        the native accept string. Default ".csv"
 *   maxSizeMb     turned away above this. No limit unless you set one
 *   onInvalid     (message) => void when a file is turned away. Without it
 *                 the message is shown as an error toast
 *   children      the label. Default "Upload CSV"
 *
 * Everything else goes to <Button>: `variant`, `size`, `icon`, `loading`,
 * `disabled`, `tooltip`, `className`.
 */
export function CsvUploadButton({
  onFileSelect,
  accept = '.csv',
  maxSizeMb,
  onInvalid,
  icon = Upload,
  children = 'Upload CSV',
  ...buttonProps
}) {
  const inputRef = useRef(null)

  const handleChange = (event) => {
    const picked = event.target.files?.[0]

    // Cleared first, so choosing the SAME file again still fires `change` -
    // otherwise re-picking a file the user has just corrected does nothing.
    event.target.value = ''

    if (!picked) return

    const refuse = (why) => (onInvalid ? onInvalid(why) : toast.error(why))

    /* `accept` on the input only filters the file dialog - it is a hint, not
       a rule: "All files" in the picker walks straight past it, so the name
       is checked here for real. By extension rather than by type, because
       Windows reports a .csv as "application/vnd.ms-excel" when Excel is
       installed - trusting the browser's type would turn away the very file
       the user was asked for. */
    const allowed = accept
      .split(',')
      .map((rule) => rule.trim().toLowerCase())
      .filter((rule) => rule.startsWith('.'))

    if (allowed.length > 0 && !allowed.some((rule) => picked.name.toLowerCase().endsWith(rule))) {
      refuse(`Please choose a ${allowed.join(' or ').replaceAll('.', '').toUpperCase()} file.`)
      return
    }

    if (maxSizeMb && picked.size > maxSizeMb * 1024 * 1024) {
      refuse(`This file is larger than ${maxSizeMb} MB.`)
      return
    }

    onFileSelect?.(picked)
  }

  return (
    <>
      <Button type="button" icon={icon} {...buttonProps} onClick={() => inputRef.current?.click()}>
        {children}
      </Button>

      {/* The real control. Reached only through the button above - `sr-only`
          rather than `hidden`, so a screen reader can still announce it. */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={handleChange}
      />
    </>
  )
}

export default CsvUploadButton
