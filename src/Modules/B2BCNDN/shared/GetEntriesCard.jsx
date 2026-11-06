import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'

import { ConfirmDialog } from '@/Components/Common/ConfirmDialog'
import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { Panel } from '@/Components/Common/Panel'
import { B2B_CNDN_UPLOAD_MAX_MB } from '@/Constants/b2bCndn'
import { toast } from '@/Library/toast'
import { failureText } from '@/Modules/B2BCNDN/shared/failureText'
import { EntrySource } from '@/Modules/SalesEntries/shared/GetEntriesPanel'
import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'

/**
 * "Get Entries" of B2B and CNDN - the GSTR-2B workbook from the GST portal,
 * uploaded as a file, and (B2B) more sources as `children`, each an
 * <EntrySource>.
 *
 * An upload REPLACES every entry of this kind uploaded before, sent ones
 * too, so with entries on screen it asks first.
 *
 *   upload(file)        the view's request - resolves with the upload's answer
 *   onUploaded(reply)   on success
 *   sheet               the workbook's sheet that is read, for the hint
 *   total, replaces     how many entries the upload would replace, and what they are
 *   disabled, failedText   while a send runs; the message for a failure with none
 */
export default function GetEntriesCard({ upload, onUploaded, sheet, total, replaces, disabled, failedText, children }) {
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)

  const run = async (file) => {
    setPendingFile(null)
    setUploading(true)
    try {
      const reply = await upload(file)
      toast.success(reply?.msg ? `File uploaded: ${reply.msg}.` : 'File uploaded.')
      onUploaded(reply)
    } catch (failure) {
      toast.error(failureText(failure, failedText))
    } finally {
      setUploading(false)
    }
  }

  const choose = (file) => (total > 0 ? setPendingFile(file) : run(file))

  return (
    <Panel title="Get Entries">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
        <EntrySource
          icon={FileSpreadsheet}
          title="GSTR-2B file from the GST portal"
          description={`The Excel file downloaded from the portal (.xlsx). Its "${sheet}" sheet is read.`}
        >
          <CsvUploadButton
            size="sm"
            accept=".xlsx,.xls"
            maxSizeMb={B2B_CNDN_UPLOAD_MAX_MB}
            loading={uploading}
            disabled={uploading || disabled}
            onFileSelect={choose}
          >
            {uploading ? 'Reading the file...' : 'Upload File'}
          </CsvUploadButton>
        </EntrySource>
        {children}
      </div>

      <ConfirmDialog
        open={Boolean(pendingFile)}
        onOpenChange={() => setPendingFile(null)}
        title="Replace the entries?"
        description={`Uploading replaces ${replaces} (${plural(total, 'entry', 'entries')} now). Entries already sent stay in Tally.`}
        confirmLabel="Upload"
        variant="default"
        busy={uploading}
        onConfirm={() => run(pendingFile)}
      />
    </Panel>
  )
}
