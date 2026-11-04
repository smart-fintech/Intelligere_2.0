import { useState } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'

import { ConfirmDialog } from '@/Components/Common/ConfirmDialog'
import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { SALES_ENTRIES_UPLOAD_MAX_MB } from '@/Constants/salesEntries'
import { toast } from '@/Library/toast'
import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'
import { downloadTextFile } from '@/Utils/fileDownload'

/**
 * "Get Entries" - the same card in every view: one tile per place the
 * entries can come from. "From a file" (Download Format, Upload CSV, a line on
 * the format) is always there; a view adds its own tiles as `children`, each
 * an <EntrySource> - Multi Ledger's Tally and GST portal.
 *
 * Every upload REPLACES what was uploaded before, so when entries are already
 * there it asks first. `upload(file)` is the view's request; on success the
 * view's `onUploaded()` starts it on batch 1 again.
 *
 * Props: format { file, content }, upload, onUploaded, total, disabled, hint, replaces
 */

/** One place entries come from: a heading, a line on what it gives, its buttons. */
export function EntrySource({ icon: Icon, title, description, children }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-start gap-2">
        {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-brand" /> : null}
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">{children}</div>
    </section>
  )
}

export default function GetEntriesPanel({ format, upload, onUploaded, total, disabled, hint, replaces, children }) {
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)

  const run = async (file) => {
    setPendingFile(null)
    setUploading(true)
    try {
      await upload(file)
      toast.success('Sales entries uploaded.')
      onUploaded()
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setUploading(false)
    }
  }

  const choose = (file) => (total > 0 ? setPendingFile(file) : run(file))

  return (
    <Panel title="Get Entries">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
        <EntrySource icon={FileSpreadsheet} title="From a file" description={hint}>
          <Button type="button" variant="outline" size="sm" icon={Download} onClick={() => downloadTextFile(format.file, format.content)}>
            Download Format
          </Button>
          <CsvUploadButton size="sm" maxSizeMb={SALES_ENTRIES_UPLOAD_MAX_MB} loading={uploading} disabled={uploading || disabled} onFileSelect={choose}>
            Upload CSV
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
