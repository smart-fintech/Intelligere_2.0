/**
 * The Add Opening Stock tab of Inventory Master: the company's Excel
 * template down, filled in, and back up.
 *
 *   1  Download Format   the company's own template (getOpeningStockTemplate)
 *   2  Upload            choose the filled-in .xlsx - shown by name, with x
 *                        to take it away again. Nothing is sent on choosing.
 *   3  Submit            sends it (uploadOpeningStock: company_name + `filed`)
 *
 * The template's link is asked for as the tab opens - once per company: the
 * tab is kept, hidden, while another is showing (see InventoryDetails), so
 * coming back costs nothing. Download Format then fetches the file from that
 * link with the app's one download helper.
 *
 * AFTER SUBMIT
 *   success   the backend's own `msg`, and the form empty again
 *   failure   the backend's own message - and the file STAYS chosen, to send
 *             again or to swap for another
 *
 * The products a file adds, and their stock, reach every screen at once: a
 * confirmed upload reads the shared product list again (uploadOpeningStock).
 * The warehouses it adds are read by their own tab the next time it loads
 * its list (Refresh).
 */

import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload, X } from 'lucide-react'

import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { InlineAlert, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { formatBytes } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { toast } from '@/Library/toast'
import { getOpeningStockTemplate, uploadOpeningStock } from '@/Services/inventoryService'
import { downloadFileFromUrl } from '@/Utils/fileDownload'

const EXCEL = '.xlsx'

/** One numbered step: its heading and what it holds. */
function Step({ number, title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-brand">
        <span className="flex size-5 items-center justify-center rounded-full bg-brand-soft text-[11px] dark:bg-brand/15">
          {number}
        </span>
        {title}
      </h3>
      <div className="pl-7">{children}</div>
    </section>
  )
}

export default function OpeningStock() {
  const { activeCompanyName: companyName } = useActiveCompany()

  /* ---------------- The template's link ----------------
     Kept with the company it belongs to, as every list is: a link for a
     company the header has left is not this one's. */
  const [template, setTemplate] = useState({ status: 'loading', url: '', error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  useEffect(() => {
    if (!companyName) return

    const requestKey = `${companyName}#${attempt}`
    if (request.current === requestKey) return
    request.current = requestKey

    getOpeningStockTemplate(companyName)
      .then((url) => {
        if (request.current !== requestKey) return
        setTemplate({
          status: url ? 'ready' : 'failed',
          url,
          error: url ? null : 'No template link came back.',
          forKey: companyName,
        })
      })
      .catch((failure) => {
        if (request.current !== requestKey) return
        toast.error(failure.message)
        setTemplate({ status: 'failed', url: '', error: failure.message, forKey: companyName })
      })
  }, [companyName, attempt])

  const mine = template.forKey === companyName
  const templateStatus = !companyName ? 'idle' : mine ? template.status : 'loading'
  const templateUrl = mine ? template.url : ''

  const retryTemplate = () => {
    setTemplate((previous) => ({ ...previous, forKey: null }))
    setAttempt((count) => count + 1)
  }

  /* ---------------- Download Format ---------------- */
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    if (!templateUrl || downloading) return
    setDownloading(true)

    try {
      await downloadFileFromUrl(templateUrl, `${companyName}_inventory_template.xlsx`)
    } catch (failure) {
      toast.error(failure.message || 'The template could not be downloaded.')
    } finally {
      setDownloading(false)
    }
  }

  /* ---------------- The file, and Submit ---------------- */
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  // Set at once, so a second click before the re-render is turned away.
  const inFlight = useRef(false)

  const handleSubmit = async () => {
    if (inFlight.current) return

    if (!file) {
      toast.error('Choose the filled-in Excel file first.')
      return
    }
    if (!file.name.toLowerCase().endsWith(EXCEL)) {
      toast.error('Please choose an XLSX file.')
      return
    }
    if (!companyName) {
      toast.error('Select a company before uploading opening stock.')
      return
    }

    inFlight.current = true
    setSubmitting(true)

    try {
      const response = await uploadOpeningStock(companyName, file)
      toast.success(response?.msg || 'Opening stock uploaded successfully.')
      // Only now: the upload is confirmed.
      setFile(null)
    } catch (failure) {
      // `failure.message` is the backend's own text (see authService). The
      // file stays chosen - to send again, or to replace.
      toast.error(failure.message || 'The file could not be uploaded.')
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  if (!companyName) {
    return (
      <Panel title="Add Opening Stock">
        <StateMessage icon={FileSpreadsheet} title="No company selected">
          Choose a company in the header to add its opening stock.
        </StateMessage>
      </Panel>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Panel title="Add Opening Stock">
        <div className="space-y-5">
          <Step number={1} title="Download the format">
            {templateStatus === 'failed' ? (
              <InlineAlert action={<RetryButton onClick={retryTemplate} />}>
                The template could not be prepared. {template.error}
              </InlineAlert>
            ) : null}

            <Button
              type="button"
              size="sm"
              icon={Download}
              loading={templateStatus === 'loading' || downloading}
              disabled={!templateUrl}
              onClick={handleDownload}
            >
              {templateStatus === 'loading' ? 'Preparing...' : downloading ? 'Downloading...' : 'Download Format'}
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              The Excel template for {companyName}. Fill in its warehouses and products, then upload it below.
            </p>
          </Step>

          <Step number={2} title="Upload the Excel file">
            {file ? (
              // The chosen file, by name, with x to take it away again.
              <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-card pr-1 pl-3 text-sm shadow-xs">
                <FileSpreadsheet className="size-4 shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  icon={X}
                  tooltip="Remove"
                  aria-label={`Remove ${file.name}`}
                  disabled={submitting}
                  onClick={() => setFile(null)}
                />
              </div>
            ) : (
              <>
                {/* The shared picker: it only hands the file back, and turns
                    away anything that is not .xlsx. */}
                <CsvUploadButton size="sm" variant="outline" icon={Upload} accept={EXCEL} onFileSelect={setFile}>
                  Choose Excel File
                </CsvUploadButton>
                <p className="mt-1.5 text-xs text-muted-foreground">An .xlsx file. Nothing is sent until you submit.</p>
              </>
            )}
          </Step>

          <div className="flex justify-end border-t border-border pt-3">
            <Button type="button" loading={submitting} disabled={!file} onClick={handleSubmit}>
              {submitting ? 'Uploading...' : 'Submit'}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  )
}
