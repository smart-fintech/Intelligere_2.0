import { useState } from 'react'
import { FileImage, FileText, FileUp, Sparkles, Trash2 } from 'lucide-react'

import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { Loader, formatBytes } from '@/Components/Common/Loader'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import AiVoucherProgress, { RefreshButton } from '@/Modules/SalesInvoice/Voucher/AiVoucherProgress'
import { useAiVoucherProcessing } from '@/Modules/SalesInvoice/Voucher/useAiVoucherProcessing'
import { AI_INVOICE_ACCEPT } from '@/Services/aiInvoiceService'

const fileKey = (file) => `${file.name}:${file.size}:${file.lastModified}`
const isPdf = (file) => file.name.toLowerCase().endsWith('.pdf')

/**
 * AI VOUCHER - invoice files (PDF, JPG, JPEG, PNG) sent together to the AI,
 * which makes a voucher of each in the background (useAiVoucherProcessing):
 *
 *   choosing   the files picked, each with its name, size and Remove, in the
 *              look of the document's own file (DocumentFileUpload); Process
 *              sends them all in one request
 *   running    the progress the backend reports - counts, percentage and each
 *              file's status and message (AiVoucherProgress) - as of the last
 *              read: on coming to the view, or Refresh; when nothing is pending
 *              or processing, its message and OK
 *
 * The same view serves Purchase Invoice and Sales Invoice - only `documentType`
 * differs.
 *
 *   company        the active company's record (comp_name is what the backend is told)
 *   documentType   'Purchase Invoice' | 'Sales Invoice'
 *   active         the view is on screen - progress is asked for only then
 */
export default function AiVoucher({ company, documentType, active }) {
  const [files, setFiles] = useState([])
  const ai = useAiVoucherProcessing({ companyName: company.comp_name, companyId: company.company_id, documentType, active })
  const uploading = ai.phase === 'uploading'

  if (ai.phase === 'checking') return <Loader variant="section" label="Checking for invoices being processed..." />
  if (ai.phase === 'processing' || ai.phase === 'finished') {
    return <AiVoucherProgress ai={ai} documentType={documentType} />
  }

  const add = (picked) =>
    setFiles((current) => {
      const known = new Set(current.map(fileKey))
      return [...current, ...picked.filter((file) => !known.has(fileKey(file)))]
    })
  const process = async () => {
    if (await ai.upload(files)) setFiles([])
  }

  return (
    <div className="flex min-h-[60vh] flex-col rounded-lg border border-border bg-card" aria-label="AI Voucher">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand">AI Voucher - {documentType}</p>
          <p className="text-xs text-muted-foreground" data-testid="ai-voucher-count">
            {files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'No files selected'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton ai={ai} />
          {files.length ? (
            <Button type="button" variant="ghost" size="sm" icon={Trash2} disabled={uploading} onClick={() => setFiles([])}>
              Clear All
            </Button>
          ) : null}
          <CsvUploadButton
            size="sm"
            variant={files.length ? 'outline' : 'default'}
            icon={FileUp}
            accept={AI_INVOICE_ACCEPT}
            multiple
            disabled={uploading}
            onFileSelect={add}
            onInvalid={(why) => toast.error(why.replace(/Please choose a .* file\.$/, 'Please choose a PDF or an image (JPG, JPEG, PNG).'))}
          >
            {files.length ? 'Add Files' : 'Upload Files'}
          </CsvUploadButton>
          {files.length ? (
            <Button type="button" size="sm" icon={Sparkles} loading={uploading} disabled={uploading} onClick={process}>
              {uploading ? 'Sending...' : `Process ${files.length} File${files.length === 1 ? '' : 's'}`}
            </Button>
          ) : null}
        </div>
      </div>

      {files.length ? (
        <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto px-3" aria-label="Selected files">
          {files.map((file) => {
            const Icon = isPdf(file) ? FileText : FileImage
            return (
              <li key={fileKey(file)} className="flex items-center gap-3 py-2">
                <Icon className="size-5 shrink-0 text-brand" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="iconEdit"
                  size="icon-sm"
                  icon={Trash2}
                  tooltip="Remove"
                  aria-label={`Remove ${file.name}`}
                  disabled={uploading}
                  onClick={() => setFiles((current) => current.filter((other) => other !== file))}
                />
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground" data-testid="ai-voucher-placeholder">
          <Sparkles className="size-8 text-brand/40" aria-hidden="true" />
          <p>Upload the invoices - PDFs or images (JPG, JPEG, PNG). Several can go together.</p>
          <p className="text-xs">The AI reads each one and creates its {documentType} voucher in the background.</p>
        </div>
      )}
    </div>
  )
}
