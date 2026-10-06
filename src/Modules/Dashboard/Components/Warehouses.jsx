/**
 * The Warehouse tab of Inventory Details: the active company's warehouses,
 * with Create, Edit and Delete.
 *
 * ------------------------------------------------------------------
 * WHAT REACHES THE NETWORK
 * ------------------------------------------------------------------
 *   opening the tab / company change   the list   POST { company_id }
 *   Refresh / Retry                    the list
 *   Save in the dialog                 POST or PUT, then the list again
 *   Delete, confirmed                  DELETE { warehouse_obj_id }, then the list
 *
 * After every change the list is read again from the backend rather than
 * patched by hand, so the table always shows what is really saved.
 * Searching, filtering, sorting and paging work on the rows already loaded
 * (Hooks/useListView) and cost no request.
 *
 * `company_id` is the company the header is working in, from the store -
 * the same source every other dashboard list uses (useActiveCompany).
 *
 * The rows are this tab's alone, so they are kept here rather than in the
 * store.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { AlertCircle, Plus, RefreshCw, Warehouse } from 'lucide-react'

import { ConfirmDialog } from '@/Components/Common/ConfirmDialog'
import { ListSkeleton, InlineAlert, RetryButton, RowActions, StateMessage } from '@/Components/Common/DataList'
import { YesNo } from '@/Components/Common/DetailList'
import { Panel } from '@/Components/Common/Panel'
import {
  DataTable,
  PlainHead,
  SortableHead,
  TableFilters,
  TablePager,
} from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { useListView } from '@/Hooks/useListView'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { deleteWarehouse, getWarehouseId, getWarehouses } from '@/Services/inventoryService'
import { selectCompanyStatus } from '@/Store/Slices/companySlice'
import { orDash } from '@/Utils/display'
import WarehouseFormModal from './WarehouseFormModal'

const SEARCH_FIELDS = ['name', 'warehouse_address', 'contact', 'email', 'pincode', 'state_name', 'contact_person_name']
const FILTER_FIELDS = {
  state_name: 'State',
  status_label: 'Status',
}

/** What a company whose list has not arrived yet shows - one object, so the memos below hold. */
const NOT_LOADED = { status: 'loading', rows: [], error: null }

export default function Warehouses() {
  const { activeCompanyId: companyId } = useActiveCompany()
  const companyStatus = useSelector(selectCompanyStatus)

  /* ---------------- The list ----------------
     Kept with the company it belongs to: a result for an older company (the
     header changed while it was on its way) is not shown. A reload keeps the
     rows on screen until the new ones arrive. */
  const [state, setState] = useState({ status: 'loading', rows: [], error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  useEffect(() => {
    if (!companyId) return

    const requestKey = `${companyId}#${attempt}`
    if (request.current === requestKey) return
    request.current = requestKey

    getWarehouses(companyId)
      .then((rows) => {
        if (request.current === requestKey) setState({ status: 'ready', rows, error: null, forKey: companyId })
      })
      .catch((failure) => {
        if (request.current !== requestKey) return
        toast.error(failure.message)
        setState((previous) => ({
          status: 'failed',
          // The rows already on screen stay if they are this company's.
          rows: previous.forKey === companyId ? previous.rows : [],
          error: failure.message,
          forKey: companyId,
        }))
      })
  }, [companyId, attempt])

  /** One controlled reload - Refresh, Retry, and after every change. */
  const reload = () => {
    setState((previous) => ({ ...previous, status: 'loading' }))
    setAttempt((count) => count + 1)
  }

  const current = state.forKey === companyId ? state : NOT_LOADED
  const loading = current.status === 'loading'

  /* Each row with its two flags worked out once as text, so the Status
     filter, the sort and the column all read the same value. */
  const rows = useMemo(
    () =>
      current.rows.map((row) => ({
        ...row,
        status_label: row.is_active ? 'Active' : 'Inactive',
        plant_label: row.is_manufacturing_plant ? 'Yes' : 'No',
      })),
    [current.rows],
  )

  const view = useListView(rows, { searchFields: SEARCH_FIELDS, filterFields: FILTER_FIELDS })

  /* ---------------- The dialog ----------------
     `session` changes on every opening and is the dialog's `key`, so each
     one starts from fresh values. `warehouse` is kept through the closing
     animation so the dialog does not change mode as it fades out. */
  const [dialog, setDialog] = useState({ open: false, warehouse: null, session: 0 })

  const openDialog = (warehouse) =>
    setDialog((previous) => ({ open: true, warehouse, session: previous.session + 1 }))

  const closeDialog = () => setDialog((previous) => ({ ...previous, open: false }))

  const handleSaved = () => {
    closeDialog()
    reload()
  }

  /* ---------------- Delete ---------------- */
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirming || deleting) return

    setDeleting(true)

    try {
      const response = await deleteWarehouse(getWarehouseId(confirming))
      toast.success(response?.msg || 'Warehouse deleted successfully')
      setConfirming(null)
      // The pager moves back a page by itself when this was the last row
      // of the last page (see useListView).
      reload()
    } catch (failure) {
      toast.error(failure.message)
      // A 404 means it is already gone, so the list is stale either way.
      if (failure.status === 404) {
        setConfirming(null)
        reload()
      }
    } finally {
      setDeleting(false)
    }
  }

  const createButton = (
    <Button type="button" size="sm" icon={Plus} onClick={() => openDialog(null)} disabled={!companyId}>
      Create Warehouse
    </Button>
  )

  /* ---------------- What fills the card ---------------- */
  const renderList = () => {
    if (!companyId) {
      if (companyStatus === 'idle' || companyStatus === 'loading') return <ListSkeleton />

      return (
        <StateMessage icon={Warehouse} title="No company selected">
          Choose a company in the header to see its warehouses.
        </StateMessage>
      )
    }

    if (loading && rows.length === 0) return <ListSkeleton />

    // Nothing tries again on its own; Retry is the only way.
    if (current.status === 'failed' && rows.length === 0) {
      return (
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load warehouses"
          action={<RetryButton onClick={reload} />}
        >
          {current.error}
        </StateMessage>
      )
    }

    // An empty list is an answer, not a failure.
    if (rows.length === 0) {
      return (
        <StateMessage icon={Warehouse} title="No warehouses found" action={createButton}>
          Create your first warehouse to start managing inventory.
        </StateMessage>
      )
    }

    return (
      <>
        <TableFilters view={view} searchPlaceholder="Search name, contact or address" actions={createButton} />

        {view.total === 0 ? (
          <StateMessage icon={Warehouse} title="No matching warehouses">
            Nothing matches the current filters.
          </StateMessage>
        ) : (
          // Wide: it scrolls sideways inside its own box, never the page, and
          // the Actions column stays pinned on the right while it does.
          <DataTable
            head={
              <>
                <SortableHead view={view} field="name" width={180}>
                  Warehouse Name
                </SortableHead>
                <SortableHead view={view} field="warehouse_address" width={220}>
                  Address
                </SortableHead>
                <SortableHead view={view} field="contact" width={130}>
                  Contact
                </SortableHead>
                <SortableHead view={view} field="email" width={200}>
                  Email
                </SortableHead>
                <SortableHead view={view} field="pincode" width={100}>
                  Pincode
                </SortableHead>
                <SortableHead view={view} field="state_name" width={140}>
                  State
                </SortableHead>
                <SortableHead view={view} field="contact_person_name" width={150}>
                  Contact Person
                </SortableHead>
                <SortableHead view={view} field="plant_label" width={130}>
                  Mfg. Plant
                </SortableHead>
                <SortableHead view={view} field="status_label" width={110}>
                  Status
                </SortableHead>
                <PlainHead width={96} className="text-right">
                  Actions
                </PlainHead>
              </>
            }
          >
            {view.rows.map((warehouse) => (
              <TableRow key={getWarehouseId(warehouse)} className="text-brand">
                <TableCell className="font-medium" title={warehouse.name}>
                  {orDash(warehouse.name)}
                </TableCell>
                <TableCell title={warehouse.warehouse_address}>{orDash(warehouse.warehouse_address)}</TableCell>
                <TableCell>{orDash(warehouse.contact)}</TableCell>
                <TableCell title={warehouse.email}>{orDash(warehouse.email)}</TableCell>
                <TableCell>{orDash(warehouse.pincode)}</TableCell>
                <TableCell>{orDash(warehouse.state_name)}</TableCell>
                <TableCell>{orDash(warehouse.contact_person_name)}</TableCell>
                <TableCell>
                  <YesNo value={warehouse.is_manufacturing_plant} />
                </TableCell>
                <TableCell>
                  <YesNo value={warehouse.is_active} yes="Active" no="Inactive" />
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    label={warehouse.name}
                    onEdit={() => openDialog(warehouse)}
                    onDelete={() => setConfirming(warehouse)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        )}

        <TablePager view={view} />
      </>
    )
  }

  return (
    <>
      <Panel
        title="Warehouse List"
        meta={companyId && rows.length > 0 ? `(Total Count: ${rows.length})` : undefined}
        actions={
          <Button
            type="button"
            size="sm"
            onClick={reload}
            disabled={!companyId || loading}
            aria-label="Refresh warehouse list"
          >
            <RefreshCw className={cn(loading && companyId && 'animate-spin')} />
            Refresh
          </Button>
        }
      >
        {/* A failed refresh with rows still on screen: they stay, and this
            says why they have not changed. */}
        {current.status === 'failed' && rows.length > 0 ? (
          <InlineAlert action={<RetryButton onClick={reload} />}>{current.error}</InlineAlert>
        ) : null}

        {renderList()}
      </Panel>

      <WarehouseFormModal
        key={dialog.session}
        open={dialog.open}
        onOpenChange={(next) => {
          if (!next) closeDialog()
        }}
        warehouse={dialog.warehouse}
        companyId={companyId}
        onSaved={handleSaved}
      />

      {/* Nothing is deleted on the click itself - this asks first. */}
      <ConfirmDialog
        open={Boolean(confirming)}
        onOpenChange={(next) => {
          if (!next && !deleting) setConfirming(null)
        }}
        title="Delete Warehouse?"
        description={
          confirming ? `Are you sure you want to delete "${confirming.name}"? This cannot be undone.` : undefined
        }
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        busy={deleting}
        onConfirm={handleDelete}
      />
    </>
  )
}
