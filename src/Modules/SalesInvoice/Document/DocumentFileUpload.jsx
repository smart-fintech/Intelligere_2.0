import { useEffect, useMemo } from 'react'
import { FileText, FileUp, Trash2 } from 'lucide-react'

import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'

/** The files a document can be uploaded as - checked by name (CsvUploadButton), as the picker's filter is only a hint. */
const DOCUMENT_FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg'

const kindOf = (file) => {
  const name = String(file?.name ?? '').toLowerCase()
  if (file?.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (/^image\//.test(file?.type ?? '') || /\.(png|jpe?g)$/.test(name)) return 'image'
  return 'other'
}

const sizeText = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/**
 * THE DOCUMENT'S OWN FILE - in the preview panel of a type that does not
 * make its PDF from the form (Purchase Invoice, Inbound Challan: the
 * profile's `uploadsFile`). The user picks the supplier's document - a PDF or
 * an image (DOCUMENT_FILE_ACCEPT) - and sees it here: a PDF in the browser's
 * own viewer, an image as it is, anything else by its name. Replace and
 * Remove change it until the document is saved; nothing is uploaded here -
 * the save does that, and only when a file was chosen.
 *
 *   file        the chosen File, or null
 *   onChange(file | null)
 *   disabled    a save is running
 */
export default function DocumentFileUpload({ file, onChange, disabled = false }) {
  const kind = file ? kindOf(file) : null
  // One object URL per file, let go when the file changes or the panel goes.
  const url = useMemo(() => (file && kind !== 'other' ? URL.createObjectURL(file) : null), [file, kind])
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url])

  return (
    <div className="flex h-full flex-col" aria-label="Document file">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand">Document File</p>
          <p className="truncate text-xs text-muted-foreground" title={file?.name} data-testid="document-file-name">
            {file ? `${file.name} - ${sizeText(file.size)}` : 'No file chosen - the document is saved without one.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {file ? (
            <Button type="button" variant="ghost" size="sm" icon={Trash2} disabled={disabled} onClick={() => onChange(null)}>
              Remove
            </Button>
          ) : null}
          <CsvUploadButton size="sm" variant={file ? 'outline' : 'default'} icon={FileUp} accept={DOCUMENT_FILE_ACCEPT}
            disabled={disabled}
            onFileSelect={onChange}
            // Turned away by name, in plain words (the button's own message lists every extension).
            onInvalid={(why) => toast.error(why.startsWith('Please choose') ? 'Please choose a PDF or an image (PNG, JPG).' : why)}
          >
            {file ? 'Replace File' : 'Upload File'}
          </CsvUploadButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-muted/30">
        {kind === 'pdf' ? (
          <iframe title={`${file.name} preview`} src={url} className="h-full w-full" />
        ) : kind === 'image' ? (
          <div className="flex h-full items-start justify-center overflow-auto p-3">
            <img src={url} alt={file.name} className="max-w-full rounded border border-border bg-card shadow-xs" />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground" data-testid="document-file-placeholder">
            <FileText className="size-8 text-brand/40" aria-hidden="true" />
            {file ? (
              <p>
                <span className="font-semibold text-foreground">{file.name}</span> cannot be previewed here, but it will be uploaded with the document.
              </p>
            ) : (
              <>
                <p>Upload the supplier&rsquo;s document - a PDF or an image (PNG, JPG).</p>
                <p className="text-xs">It is saved with the document. No PDF is made from the form for this document type.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
