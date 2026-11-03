import { AlertCircle, FolderOpen, RefreshCw, SearchX, Users } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { DataTable, PlainHead, SortableHead, TableFilters, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { Tooltip } from '@/Components/ui/tooltip'
import { useListView } from '@/Hooks/useListView'
import { showMb } from '@/Modules/DocuVault/docuVault'
import { orDash } from '@/Utils/display'

/**
 * THE OWNER'S LIST - the sub users of the active company, each with a way into
 * their documents. A sub user never sees this: they go straight to their own.
 */

const NO_ROWS = []
const SEARCH_FIELDS = ['name', 'email', 'designation']

export default function DocuVaultUsers({ companyName, list, onOpen }) {
  const rows = list.data?.user_details ?? NO_ROWS
  const view = useListView(rows, { searchFields: SEARCH_FIELDS })

  const renderList = () => {
    if (!list.data) {
      if (list.status === 'failed') {
        return (
          <StateMessage
            icon={AlertCircle}
            tone="error"
            title="Could not load the users"
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
        <StateMessage icon={Users} title="No users yet">
          The sub users of {companyName} are listed here.
        </StateMessage>
      )
    }

    return (
      <>
        {list.status === 'failed' ? <InlineAlert action={<RetryButton onClick={list.reload} />}>{list.error}</InlineAlert> : null}

        <TableFilters view={view} searchPlaceholder="Search users" />

        {view.rows.length === 0 ? (
          <StateMessage icon={SearchX} title="No users match">
            Change or clear the search to see more.
          </StateMessage>
        ) : (
          <>
            <DataTable
              head={
                <>
                  <SortableHead view={view} field="name" width={180}>
                    Name
                  </SortableHead>
                  <SortableHead view={view} field="email" width={240}>
                    Email
                  </SortableHead>
                  <SortableHead view={view} field="designation" width={170}>
                    Designation
                  </SortableHead>
                  <PlainHead width={90}>
                    <Tooltip text="Not downloaded / total files">
                      <span>Files</span>
                    </Tooltip>
                  </PlainHead>
                  <SortableHead view={view} field="total_size" width={110}>
                    Used
                  </SortableHead>
                  <PlainHead width={160} className="text-right">
                    Actions
                  </PlainHead>
                </>
              }
            >
              {view.rows.map((user) => (
                <TableRow key={user.email}>
                  <TableCell title={user.name || undefined}>{orDash(user.name)}</TableCell>
                  <TableCell title={user.email}>{orDash(user.email)}</TableCell>
                  <TableCell title={user.designation || undefined}>{orDash(user.designation)}</TableCell>
                  <TableCell className="tabular-nums">{orDash(user.total_file_uploads)}</TableCell>
                  <TableCell className="tabular-nums">{showMb(user.total_size)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button type="button" variant="outline" size="sm" icon={FolderOpen} onClick={() => onOpen(user)}>
                        View Documents
                      </Button>
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
      title={`Users of ${companyName}`}
      meta={list.data ? ` (Total Count: ${view.total})` : undefined}
      actions={
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
      }
    >
      {renderList()}
    </Panel>
  )
}
