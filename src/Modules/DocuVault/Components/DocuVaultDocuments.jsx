import { useState } from 'react'
import { AlertCircle, ArrowLeft, Download, FileText, RefreshCw, SearchX, Upload } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, RowActions, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { DataTable, PlainHead, SortableHead, TableFilters, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { STORAGE_FULL_MESSAGE } from '@/Constants/docuVault'
import { MASTER_DATA_STALE_MS } from '@/Constants/queryKeys'
import { useListView } from '@/Hooks/useListView'
import { useQuery } from '@/Library/queryCache'
import { getEmail } from '@/Library/secureStorage'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import DocumentUploadModal from '@/Modules/DocuVault/Components/DocumentUploadModal'
import { documentsKey, isStorageFull, readDocumentsReply, refreshDocuVault, sameEmail, showMb } from '@/Modules/DocuVault/docuVault'
import { deleteDocument, getDocuVaultDocuments, markDocumentDownloaded } from '@/Services/DocuVault/docuVaultService'
import { orDash } from '@/Utils/display'
import { downloadFileFromUrl } from '@/Utils/fileDownload'

/**
 * ONE USER'S DOCUMENTS - the same screen for the Owner looking at a sub user and
 * for a sub user looking at their own. `email` says whose; the data is in the
 * shared cache under documentsKey(companyName, email).
 *
 * A download counts only when it is somebody else's upload, as in the old module:
 * those are the rows still in bold, and the only ones marked downloaded.
 */

const NO_ROWS = []
const SEARCH_FIELDS = ['document_name', 'document_description', 'uploaded_by']

function DownloadBadge({ downloaded }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium',
        downloaded
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
      )}
    >
      {downloaded ? 'Downloaded' : 'Not downloaded'}
    </span>
  )
}

export default function DocuVaultDocuments({ companyName, email, title, storageStatus, onBack }) {
  const myEmail = getEmail()
  const list = useQuery({
    key: documentsKey(companyName, email),
    fetch: () => getDocuVaultDocuments(companyName, email).then(readDocumentsReply),
    staleTime: MASTER_DATA_STALE_MS,
  })
  const rows = list.data?.documents ?? NO_ROWS
  const view = useListView(rows, { searchFields: SEARCH_FIELDS })

  const [uploadOpen, setUploadOpen] = useState(false)
  const [downloading, setDownloading] = useState(null) // the id being fetched
  const [confirming, setConfirming] = useState(null) // the id being asked about
  const [deleting, setDeleting] = useState(false)

  const isNewToMe = (document) => document.is_downloaded !== true && !sameEmail(document.uploaded_by, myEmail)

  const handleUploadClick = () => {
    if (isStorageFull(storageStatus, list.data?.storage_status)) {
      toast.error(STORAGE_FULL_MESSAGE)
      return
    }
    setUploadOpen(true)
  }

  const handleDownload = async (document) => {
    if (!document.file_upload) {
      toast.error('This document has no file to download.')
      return
    }
    setDownloading(document.id)
    try {
      await downloadFileFromUrl(document.file_upload, document.document_name, { keepGivenName: true })
      if (isNewToMe(document)) {
        await markDocumentDownloaded(document.id)
        refreshDocuVault(companyName, email)
      }
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setDownloading(null)
    }
  }

  const handleDelete = async (document) => {
    setDeleting(true)
    try {
      const reply = await deleteDocument(document.id)
      toast.success(reply?.msg || 'Document deleted successfully.')
      setConfirming(null)
      refreshDocuVault(companyName, email)
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setDeleting(false)
    }
  }

  const renderList = () => {
    if (!list.data) {
      if (list.status === 'failed') {
        return (
          <StateMessage
            icon={AlertCircle}
            tone="error"
            title="Could not load the documents"
            action={<RetryButton onClick={list.reload} />}
          >
            {list.error}
          </StateMessage>
        )
      }
      return <ListSkeleton rows={5} />
    }

    if (rows.length === 0) {
      return (
        <StateMessage icon={FileText} title="No documents yet">
          Uploaded documents are kept here.
        </StateMessage>
      )
    }

    return (
      <>
        {list.status === 'failed' ? <InlineAlert action={<RetryButton onClick={list.reload} />}>{list.error}</InlineAlert> : null}

        <TableFilters view={view} searchPlaceholder="Search documents" />

        {view.rows.length === 0 ? (
          <StateMessage icon={SearchX} title="No documents match">
            Change or clear the search to see more.
          </StateMessage>
        ) : (
          <>
            <DataTable
              head={
                <>
                  <SortableHead view={view} field="document_name" width={220}>
                    Document Name
                  </SortableHead>
                  <SortableHead view={view} field="document_description" width={220}>
                    Description
                  </SortableHead>
                  <SortableHead view={view} field="uploaded_at" width={140}>
                    Upload Date
                  </SortableHead>
                  <SortableHead view={view} field="uploaded_by" width={200}>
                    Uploaded By
                  </SortableHead>
                  <SortableHead view={view} field="file_size" width={100}>
                    File Size
                  </SortableHead>
                  <PlainHead width={120}>Status</PlainHead>
                  <PlainHead width={100} className="text-right">
                    Actions
                  </PlainHead>
                </>
              }
            >
              {view.rows.map((document) => (
                <TableRow key={document.id} className={cn(isNewToMe(document) && 'font-semibold')}>
                  <TableCell title={document.document_name}>{orDash(document.document_name)}</TableCell>
                  <TableCell title={document.document_description || undefined}>{orDash(document.document_description)}</TableCell>
                  <TableCell>{orDash(document.date)}</TableCell>
                  <TableCell title={document.uploaded_by || undefined}>{orDash(document.uploaded_by)}</TableCell>
                  <TableCell className="tabular-nums">{showMb(document.file_size)}</TableCell>
                  <TableCell>
                    <DownloadBadge downloaded={document.is_downloaded === true} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="iconEdit"
                        size="icon-sm"
                        icon={Download}
                        tooltip="Download"
                        aria-label={`Download ${orDash(document.document_name)}`}
                        loading={downloading === document.id}
                        onClick={() => handleDownload(document)}
                      />
                      <RowActions
                        label={orDash(document.document_name)}
                        deleteConfirm={{
                          open: confirming === document.id,
                          onOpenChange: (next) => setConfirming(next ? document.id : null),
                          title: 'Delete document?',
                          description: `Delete ${orDash(document.document_name)}? This cannot be undone.`,
                          confirmLabel: 'Delete',
                          busy: deleting,
                          onConfirm: () => handleDelete(document),
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </DataTable>
            <TablePager view={view} />
          </>
        )}
      </>
    )
  }

  return (
    <Panel
      title={title}
      meta={list.data ? ` (Total Count: ${view.total}, ${showMb(list.data.currently_total_size_use)} used)` : undefined}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {onBack ? (
            <Button type="button" variant="outline" size="sm" icon={ArrowLeft} onClick={onBack}>
              Back
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={RefreshCw}
            loading={list.status === 'loading'}
            onClick={list.reload}
          >
            Refresh
          </Button>
          <Button type="button" size="sm" icon={Upload} onClick={handleUploadClick}>
            Upload
          </Button>
        </div>
      }
    >
      {renderList()}

      {uploadOpen ? <DocumentUploadModal companyName={companyName} email={email} onClose={() => setUploadOpen(false)} /> : null}
    </Panel>
  )
}
