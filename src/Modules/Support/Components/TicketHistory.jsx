import { useEffect, useState } from 'react'
import { AlertCircle, Download, Eye, Inbox, RefreshCw, SearchX } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { DataTable, PlainHead, SortableHead, TableFilters, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { useListView } from '@/Hooks/useListView'
import { useQuery } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { readTicketsReply, statusToneOf, ticketsKey } from '@/Modules/Support/support'
import { getUserTickets } from '@/Services/Support/supportService'
import { orDash } from '@/Utils/display'
import { downloadFileFromUrl } from '@/Utils/fileDownload'

/**
 * LATEST SUPPORT HISTORY - every ticket the user has raised, newest first, as
 * notifications/get_user_tickets/ returns them. The list is in the shared
 * cache under ticketsKey(email), so raising a ticket above reads it again.
 *
 * A description longer than DESCRIPTION_PREVIEW is cut short, with Read More
 * to open it out - one row at a time - and Show Less to close it again.
 */

const NO_ROWS = []
const SEARCH_FIELDS = ['id', 'module_name', 'description', 'status']
const FILTER_FIELDS = { module_name: 'Module', status: 'Status' }

// The pager the old screen had: 5 rows to start with, and these to choose from.
const PAGE_SIZES = [5, 20, 50, 75, 100, 'all']

/** How much of a description a row shows until it is opened out. */
const DESCRIPTION_PREVIEW = 100

const STATUS_TONE_CLASSES = {
  done: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  active: 'bg-brand-soft text-brand dark:bg-brand/15',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  closed: 'bg-destructive/10 text-destructive',
  unknown: 'bg-muted text-muted-foreground',
}

function StatusBadge({ status }) {
  if (!status) return '--'
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        STATUS_TONE_CLASSES[statusToneOf(status)],
      )}
    >
      {status}
    </span>
  )
}

function DescriptionCell({ text, open, onToggle }) {
  const full = String(text ?? '').trim()
  if (!full) return '--'

  const long = full.length > DESCRIPTION_PREVIEW
  return (
    <>
      <p className="break-words whitespace-pre-line">
        {long && !open ? `${full.slice(0, DESCRIPTION_PREVIEW).trimEnd()}...` : full}
      </p>
      {long ? (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="mt-1 h-auto px-0 has-[>svg]:px-0"
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? 'Show Less' : 'Read More'}
        </Button>
      ) : null}
    </>
  )
}

export default function TicketHistory({ email }) {
  const list = useQuery({
    key: email ? ticketsKey(email) : null,
    fetch: () => getUserTickets(email).then(readTicketsReply),
  })
  const rows = list.data ?? NO_ROWS
  const view = useListView(rows, {
    searchFields: SEARCH_FIELDS,
    filterFields: FILTER_FIELDS,
    initialPageSize: PAGE_SIZES[0],
  })

  const [openRow, setOpenRow] = useState(null) // the id whose description is opened out
  const [downloading, setDownloading] = useState(null) // the id being fetched

  // Loading the history - on arrival or from Refresh - failed: say so once.
  useEffect(() => {
    if (list.status === 'failed') toast.error(list.error || 'Could not load your support tickets.')
  }, [list.status, list.error])

  const handleDownload = async (ticket) => {
    setDownloading(ticket.id)
    try {
      await downloadFileFromUrl(ticket.attachmentUrl, ticket.attachmentName || `ticket-${ticket.id}`, {
        keepGivenName: true,
      })
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setDownloading(null)
    }
  }

  const renderList = () => {
    if (!email) {
      return (
        <StateMessage icon={Inbox} title="No email to look tickets up by">
          Raise a ticket above and the tickets for that email will be listed here.
        </StateMessage>
      )
    }

    if (!list.data) {
      if (list.status === 'failed') {
        return (
          <StateMessage
            icon={AlertCircle}
            tone="error"
            title="Could not load your support tickets"
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
        <StateMessage icon={Inbox} title="No tickets found">
          Tickets you raise are listed here, with their status.
        </StateMessage>
      )
    }

    return (
      <>
        {list.status === 'failed' ? (
          <InlineAlert action={<RetryButton onClick={list.reload} />}>{list.error}</InlineAlert>
        ) : null}

        <TableFilters view={view} searchPlaceholder="Search tickets" />

        {view.rows.length === 0 ? (
          <StateMessage icon={SearchX} title="No tickets match">
            Change or clear the filters to see more.
          </StateMessage>
        ) : (
          <>
            <DataTable
              head={
                <>
                  <SortableHead view={view} field="id" width={110}>
                    Ticket ID
                  </SortableHead>
                  <SortableHead view={view} field="module_name" width={170}>
                    Module
                  </SortableHead>
                  <PlainHead width={340}>Description</PlainHead>
                  <PlainHead width={110}>Attachment</PlainHead>
                  <SortableHead view={view} field="status" width={150}>
                    Status
                  </SortableHead>
                  <SortableHead view={view} field="created_time" width={150}>
                    Created
                  </SortableHead>
                  <SortableHead view={view} field="updated_time" width={150}>
                    Updated
                  </SortableHead>
                </>
              }
            >
              {view.rows.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-medium tabular-nums">#{ticket.id}</TableCell>
                  <TableCell title={ticket.module_name || undefined}>{orDash(ticket.module_name)}</TableCell>
                  <TableCell wrap>
                    <DescriptionCell
                      text={ticket.description}
                      open={openRow === ticket.id}
                      onToggle={() => setOpenRow((current) => (current === ticket.id ? null : ticket.id))}
                    />
                  </TableCell>
                  <TableCell>
                    {ticket.attachmentUrl ? (
                      <div className="flex gap-1.5">
                        <Button
                          asChild
                          variant="iconEdit"
                          size="icon-sm"
                          tooltip={ticket.attachmentName ? `View ${ticket.attachmentName}` : 'View file'}
                        >
                          <a
                            href={ticket.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`View the file of ticket #${ticket.id}`}
                          >
                            <Eye />
                          </a>
                        </Button>
                        <Button
                          type="button"
                          variant="iconEdit"
                          size="icon-sm"
                          icon={Download}
                          tooltip="Download"
                          aria-label={`Download the file of ticket #${ticket.id}`}
                          loading={downloading === ticket.id}
                          onClick={() => handleDownload(ticket)}
                        />
                      </div>
                    ) : (
                      '--'
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">{orDash(ticket.created_at)}</TableCell>
                  <TableCell className="tabular-nums">{orDash(ticket.updated_at)}</TableCell>
                </TableRow>
              ))}
            </DataTable>
            <TablePager view={view} pageSizes={PAGE_SIZES} pageNumbers />
          </>
        )}
      </>
    )
  }

  return (
    <Panel
      title="Latest Support History"
      meta={list.data ? ` (Total Count: ${view.total})` : undefined}
      actions={
        email ? (
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
        ) : null
      }
    >
      {renderList()}
    </Panel>
  )
}
