/**
 * The Warehouse tab of Inventory Details: the active company's warehouses,
 * with Create, Edit and Delete.
 *
 * ------------------------------------------------------------------
 * WHAT REACHES THE NETWORK
 * ------------------------------------------------------------------
 *   opening the tab / company change   the list   POST { company_id }, unless
 *                                      another screen has it already (useWarehouses)
 *                                      the Master Details, unless the store
 *                                      already has them (see useMasterDetails)
 *   Refresh / Retry                    the list
 *   Save in the dialog                 POST or PUT, then the list again
 *   Delete, confirmed in its popover   DELETE { warehouse_obj_id }, then the list
 *
 * After every change the list is read again from the backend rather than
 * patched by hand, so the table always shows what is really saved. The save
 * and the delete do that themselves (inventoryService), once for every
 * screen showing the list - so it is never asked for twice here.
 * Searching, filtering, sorting and paging work on the rows already loaded
 * (Hooks/useListView) and cost no request.
 *
 * `company_id` is the company the header is working in, from the store -
 * the same source every other dashboard list uses (useActiveCompany).
 *
 * The rows are the shared list (useWarehouses) - the same one the Product
 * form's and the Sub User screens' warehouse dropdowns read.
 *
 * ------------------------------------------------------------------
 * A PLAN WITH ONE WAREHOUSE
 * ------------------------------------------------------------------
 * A company whose `features` lists "Single Warehouse" (see
 * hasSingleWarehouseLimit) may have one warehouse and no more. Once it has
 * one, Create Warehouse is off and a line above the list says why. That is
 * all it changes: the warehouse it has can still be seen, edited and
 * deleted - and deleting it makes room to create one again.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { AlertCircle, Info, Plus, RefreshCw, Warehouse } from 'lucide-react'

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
import useMasterDetails from '@/Hooks/useMasterDetails'
import useWarehouses from '@/Hooks/useWarehouses'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import {
  deleteWarehouse,
  getWarehouseId,
  hasSingleWarehouseLimit,
} from '@/Services/inventoryService'
import { selectCompanyStatus } from '@/Store/Slices/companySlice'
import { orDash } from '@/Utils/display'
import WarehouseFormModal from './WarehouseFormModal'

const SEARCH_FIELDS = ['name', 'warehouse_address', 'contact', 'email', 'pincode', 'state_name', 'contact_person_name']
const FILTER_FIELDS = {
  state_name: 'State',
  // status_label: 'Status',
}

export default function Warehouses() {
  const { activeCompany, activeCompanyId: companyId } = useActiveCompany()
  const companyStatus = useSelector(selectCompanyStatus)

  // The company's Master Details - their `business_type` decides which
  // fields the warehouse form has. Asked for as this tab opens, so they are
  // normally in long before the form is; shared with the Master Details tab,
  // so having visited it already means no request at all.
  const masterDetails = useMasterDetails()

  /* ---------------- The list ----------------
     The shared one, kept with the company it belongs to: another company's
     rows are never shown. A reload keeps the rows on screen until the new
     ones arrive. */
  const list = useWarehouses()
  const current = { status: list.status, rows: list.warehouses, error: list.error }
  const loading = current.status === 'loading'

  /** Refresh and Retry - a save or a delete reads the list again by itself. */
  const reload = () => {
    list.reload()
  }

  // A failed read says so once, as it fails - the same toast as before.
  const lastStatus = useRef(null)
  useEffect(() => {
    if (lastStatus.current === 'loading' && list.status === 'failed') toast.error(list.error)
    lastStatus.current = list.status
  }, [list.status, list.error])

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

  // The list is read again by the save itself (see the note at the top).
  const handleSaved = () => {
    closeDialog()
  }

  /* ---------------- Delete ----------------
     `confirming` is the row whose "are you sure?" popover is open - one at
     a time, beside that row's Delete button. */
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const isConfirming = (warehouse) =>
    Boolean(confirming) && getWarehouseId(confirming) === getWarehouseId(warehouse)

  const handleDelete = async () => {
    if (!confirming || deleting) return

    setDeleting(true)

    try {
      const response = await deleteWarehouse(getWarehouseId(confirming))
      toast.success(response?.msg || 'Warehouse deleted successfully')
      setConfirming(null)
      // The delete reads the list again by itself (see the note at the top).
      // The pager moves back a page by itself when this was the last row
      // of the last page (see useListView).
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

  // The plan allows one warehouse, and the company has it - see the note
  // at the top. Counted on the rows as loaded, never on a filtered view.
  const atLimit = hasSingleWarehouseLimit(activeCompany) && rows.length > 0

  const createButton = (
    <Button
      type="button"
      size="sm"
      icon={Plus}
      onClick={() => openDialog(null)}
      disabled={!companyId || atLimit}
    >
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
        {/* Why Create Warehouse is off - a plain note, not an error. */}
        {atLimit ? (
          <p className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            Your company&apos;s plan supports only one warehouse, so another cannot be created. You can still edit
            this one.
          </p>
        ) : null}

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
                {/* <SortableHead view={view} field="status_label" width={110}>
                  Status
                </SortableHead> */}
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
                {/* <TableCell>
                  <YesNo value={warehouse.is_active} yes="Active" no="Inactive" />
                </TableCell> */}
                <TableCell className="text-right">
                  {/* Nothing is deleted on the click itself - the popover
                      beside the button asks first. */}
                  <RowActions
                    label={warehouse.name}
                    onEdit={() => openDialog(warehouse)}
                    deleteConfirm={{
                      open: isConfirming(warehouse),
                      onOpenChange: (next) => {
                        // One delete at a time: no other row can be opened
                        // while a request is on its way.
                        if (!deleting) setConfirming(next ? warehouse : null)
                      },
                      title: 'Delete Warehouse?',
                      description: (<>
                        Are you sure you want to delete <strong>{warehouse.name}</strong> ? This cannot be undone.
                      </>),
                      confirmLabel: deleting ? 'Deleting...' : 'Delete',
                      busy: deleting,
                      onConfirm: handleDelete,
                    }}
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
        masterDetails={masterDetails}
        onSaved={handleSaved}
      />
    </>
  )
}
