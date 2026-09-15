import { useRef, useState } from 'react'
import { Download } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { generateCsv } from '@/Services/csvService'
import { downloadFileFromUrl } from '@/Utils/fileDownload'

/**
 * The Download button beside a list's filters - the same one on Bank, Ledger
 * and Company Details.
 *
 *   <CsvDownloadButton
 *     payload={{ source: CSV_SOURCES.BANK, company_name: company?.comp_name }}
 *     disabled={!company}
 *   />
 *
 * One click:
 *   1. POST tally/download-csv/ with `payload` (see Services/csvService)
 *   2. take `download_url` from the reply - no link is an error, said so
 *   3. hand it to downloadFileFromUrl (Utils/fileDownload), which saves it
 *
 * While that runs the button is disabled and shows a spinner, and a ref
 * guards the gap before React re-renders - so a double click is one
 * download, not two. Success and failure are both a toast, the project's
 * usual way of saying either.
 *
 * Props:
 *   payload    what to export - the page builds it, since only the page
 *              knows the selected company or the signed-in user
 *   disabled   true when there is nothing to export yet (no company, say)
 */
export function CsvDownloadButton({ payload, disabled = false }) {
  const [downloading, setDownloading] = useState(false)
  // Set synchronously on click, so a second click in the same instant is
  // turned away even before `downloading` has rendered.
  const inFlight = useRef(false)

  const handleDownload = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setDownloading(true)

    try {
      const response = await generateCsv(payload)
      const url = response?.download_url

      if (!url) {
        toast.error('The file could not be generated - no download link came back. Please try again.')
        return
      }

      // Named after `source` in case the link itself carries no file name.
      await downloadFileFromUrl(url, `${payload?.source || 'export'}.csv`)
      toast.success(response?.msg || 'CSV downloaded.')
    } catch (error) {
      // `error.message` is the backend's own text (see authService).
      toast.error(error.message || 'Could not download the file.')
    } finally {
      inFlight.current = false
      setDownloading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      icon={Download}
      loading={downloading}
      disabled={disabled}
      onClick={handleDownload}
    >
      {downloading ? 'Downloading...' : 'Download'}
    </Button>
  )
}
