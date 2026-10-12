/**
 * The Customised Fields tab of Inventory Master: the fields that make up an
 * inventory item for the active company, with Add and Edit.
 *
 * Every row is a field the backend sent - standard ones (Item Name, HSN
 * Code) and the company's own alike. Nothing here knows any field by name:
 * the table, the filters and the form are all drawn from the reply.
 *
 * ------------------------------------------------------------------
 * WHAT REACHES THE NETWORK
 * ------------------------------------------------------------------
 *   opening the tab / company change   the list   POST { company_name }
 *   Refresh / Retry                    the list
 *   Save in the dialog                 POST { company_name, custom_fields }, then the list again
 *   Save Sequence                      the same POST, once for each field whose
 *                                      field_order moved, then the list again
 *                                      (see CustomFieldSequenceModal)
 *
 * After a save the list is read again from the backend rather than patched
 * by hand, so the table always shows what is really saved. Searching,
 * filtering, sorting and paging work on the rows already loaded
 * (Hooks/useListView) and cost no request.
 *
 * `company_name` is the company the header is working in, from the store -
 * the same source every other dashboard list uses (useActiveCompany).
 *
 * THERE IS NO DELETE: the endpoint's way of removing a field has not been
 * confirmed (see the note in inventoryService), so a row has Edit only.
 *
 * The list itself is in the store (Hooks/useCustomFields), because the
 * Product form is built from the same fields.
 */

import { useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { AlertCircle, ArrowUpDown, Pencil, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
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
import { Tooltip } from '@/Components/ui/tooltip'
import { customFieldTypeLabel } from '@/Constants/inventory'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import useCustomFields from '@/Hooks/useCustomFields'
import { useListView } from '@/Hooks/useListView'
import { cn } from '@/Library/utils'
import { selectCompanyStatus } from '@/Store/Slices/companySlice'
import { orDash } from '@/Utils/display'
import CustomFieldFormModal from './CustomFieldFormModal'
import CustomFieldSequenceModal from './CustomFieldSequenceModal'

const SEARCH_FIELDS = ['field_name']

/* Each filter reads a label worked out for the row below, so its dropdown
   offers words ("Required", "Not Required") and never true / false. */
const FILTER_FIELDS = {
  type_label: 'Type',
  required_label: 'Required',
  hidden_label: 'Hidden',
  sku_label: 'SKU Field',
  report_label: 'Customized Report',
  invoice_label: 'Invoice Description',
}

/** All but Type sit behind "More Filters" - six dropdowns would fill two rows. */
const MORE_FILTERS = ['required_label', 'hidden_label', 'sku_label', 'report_label', 'invoice_label']

/** The order the fields are used in everywhere else, so the one they open in. */
const INITIAL_SORT = { field: 'field_order', direction: 'asc' }

/** A field's options, whatever the backend sent in their place. */
const optionsOf = (field) => (Array.isArray(field?.options) ? field.options : [])

export default function CustomFields() {
  const { activeCompanyName: companyName } = useActiveCompany()
  const companyStatus = useSelector(selectCompanyStatus)

  /* ---------------- The list ----------------
     Shared with the Product form, which is built from these same fields, so
     it is kept in the store and read through useCustomFields: one request
     for both, and a field saved here is in that form as soon as this list
     has been read again. The hook keeps it with the company it belongs to,
     keeps the rows on screen while a reload is on its way, and announces a
     failed request itself.

     `reload` is one controlled reload - Refresh, Retry, and after every save. */
  const current = useCustomFields()
  const { reload } = current
  const loading = current.status === 'loading'

  /* What the table draws: each field with its flags worked out once as
     words, so a filter, a sort and a column all read the same value.
     `source` is the field exactly as the backend sent it - what Edit opens,
     and so what is sent back - kept apart from these display-only labels.
     A property a field does not have (`sku_field`, on most) reads as "no". */
  const rows = useMemo(
    () =>
      current.rows.map((field, index) => ({
        source: field,
        // `sr_no` is the field's own number; the position covers a reply without one.
        key: field.sr_no ?? `row-${index}`,
        field_name: field.field_name,
        field_size: field.field_size,
        field_order: field.field_order,
        options: optionsOf(field),
        options_count: optionsOf(field).length,
        sku_no: field.sku_field ? field.sku_no : null,
        type_label: customFieldTypeLabel(field.field_type),
        required_label: field.is_required ? 'Required' : 'Not Required',
        hidden_label: field.hide_field ? 'Hidden' : 'Visible',
        sku_label: field.sku_field ? 'SKU Field' : 'Non-SKU Field',
        report_label: field.customizedReport ? 'Included' : 'Not Included',
        invoice_label: field.invoice_description ? 'Included' : 'Not Included',
      })),
    [current.rows],
  )

  const view = useListView(rows, {
    searchFields: SEARCH_FIELDS,
    filterFields: FILTER_FIELDS,
    initialSort: INITIAL_SORT,
  })

  /* ---------------- The dialog ----------------
     `session` changes on every opening and is the dialog's `key`, so each
     one starts from fresh values. `field` is kept through the closing
     animation so the dialog does not change mode as it fades out. */
  const [dialog, setDialog] = useState({ open: false, field: null, session: 0 })

  const openDialog = (field) => setDialog((previous) => ({ open: true, field, session: previous.session + 1 }))

  const closeDialog = () => setDialog((previous) => ({ ...previous, open: false }))

  const handleSaved = () => {
    closeDialog()
    reload()
  }

  /* ---------------- The Sequence dialog ----------------
     Its own `session` key for the same reason: each opening starts from the
     order the fields are in now. */
  const [sequence, setSequence] = useState({ open: false, session: 0 })

  const openSequence = () => setSequence((previous) => ({ open: true, session: previous.session + 1 }))
  const closeSequence = () => setSequence((previous) => ({ ...previous, open: false }))

  const addButton = (
    <Button type="button" size="sm" icon={Plus} onClick={() => openDialog(null)} disabled={!companyName}>
      Add Custom Field
    </Button>
  )

  // Beside Add Custom Field once there is something to put in order.
  const listActions = (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="default"
        icon={ArrowUpDown}
        onClick={openSequence}
        disabled={!companyName || loading || current.rows.length < 2}
      >
        Sequence Fields
      </Button>
      {addButton}
    </div>
  )

  /* ---------------- What fills the card ---------------- */
  const renderList = () => {
    if (!companyName) {
      if (companyStatus === 'idle' || companyStatus === 'loading') return <ListSkeleton />

      return (
        <StateMessage icon={SlidersHorizontal} title="No company selected">
          Choose a company in the header to see its customised fields.
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
          title="Could not load customised fields"
          action={<RetryButton onClick={reload} />}
        >
          {current.error}
        </StateMessage>
      )
    }

    // An empty list is an answer, not a failure.
    if (rows.length === 0) {
      return (
        <StateMessage icon={SlidersHorizontal} title="No Customised Fields" action={addButton}>
          Create your first custom field to configure your inventory.
        </StateMessage>
      )
    }

    return (
      <>
        <TableFilters
          view={view}
          searchPlaceholder="Search field name"
          moreFilters={MORE_FILTERS}
          actions={listActions}
        />

        {view.total === 0 ? (
          <StateMessage icon={SlidersHorizontal} title="No matching fields">
            Nothing matches the current filters.
          </StateMessage>
        ) : (
          // Wide: it scrolls sideways inside its own box, never the page, and
          // the Actions column stays pinned on the right while it does.
          <DataTable
            defaultColumnWidth={110}
            head={
              <>
                <SortableHead view={view} field="field_name" width={190}>
                  Field Name
                </SortableHead>
                <SortableHead view={view} field="type_label">
                  Type
                </SortableHead>
                <SortableHead view={view} field="field_size" width={80}>
                  Size
                </SortableHead>
                <SortableHead view={view} field="required_label">
                  Required
                </SortableHead>
                <SortableHead view={view} field="hidden_label" width={100}>
                  Hidden
                </SortableHead>
                <SortableHead view={view} field="options_count" width={120}>
                  Options
                </SortableHead>
                <SortableHead view={view} field="sku_no" width={120}>
                  SKU Field
                </SortableHead>
                <SortableHead view={view} field="report_label" width={130}>
                  Cust. Report
                </SortableHead>
                <SortableHead view={view} field="invoice_label" width={130}>
                  Invoice Desc.
                </SortableHead>
                <SortableHead view={view} field="field_order" width={90}>
                  Order
                </SortableHead>
                <PlainHead width={72} className="text-right">
                  Actions
                </PlainHead>
              </>
            }
          >
            {view.rows.map((row) => (
              <TableRow key={row.key} className="text-brand">
                <TableCell className="font-medium" title={row.field_name}>
                  {orDash(row.field_name)}
                </TableCell>
                <TableCell>{orDash(row.type_label)}</TableCell>
                <TableCell>{orDash(row.field_size)}</TableCell>
                <TableCell>
                  <YesNo value={row.source.is_required} />
                </TableCell>
                <TableCell>
                  <YesNo value={row.source.hide_field} />
                </TableCell>
                <TableCell>
                  <OptionsCount options={row.options} />
                </TableCell>
                <TableCell>
                  {/* A SKU field also says where in the SKU it comes. */}
                  <YesNo
                    value={row.source.sku_field}
                    yes={row.sku_no == null || row.sku_no === '' ? 'Yes' : `Yes · SKU ${row.sku_no}`}
                  />
                </TableCell>
                <TableCell>
                  <YesNo value={row.source.customizedReport} />
                </TableCell>
                <TableCell>
                  <YesNo value={row.source.invoice_description} />
                </TableCell>
                <TableCell>{orDash(row.field_order)}</TableCell>
                <TableCell className="text-right">
                  {/* Edit alone, in the look RowActions gives it - see the
                      note at the top on why there is no Delete beside it. */}
                  <Button
                    type="button"
                    variant="iconEdit"
                    size="icon-sm"
                    icon={Pencil}
                    tooltip="Edit"
                    aria-label={`Edit ${row.field_name}`}
                    onClick={() => openDialog(row.source)}
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
        title="Customised Fields"
        meta={companyName && rows.length > 0 ? `(Total Count: ${rows.length})` : undefined}
        actions={
          <Button
            type="button"
            size="sm"
            onClick={reload}
            disabled={!companyName || loading}
            aria-label="Refresh customised fields"
          >
            <RefreshCw className={cn(loading && companyName && 'animate-spin')} />
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

      <CustomFieldFormModal
        key={dialog.session}
        open={dialog.open}
        onOpenChange={(next) => {
          if (!next) closeDialog()
        }}
        field={dialog.field}
        fields={current.rows}
        companyName={companyName}
        onSaved={handleSaved}
      />

      <CustomFieldSequenceModal
        key={`sequence-${sequence.session}`}
        open={sequence.open}
        onOpenChange={(next) => {
          if (!next) closeSequence()
        }}
        fields={current.rows}
        companyName={companyName}
        onSaved={() => {
          closeSequence()
          reload()
        }}
        onPartlySaved={reload}
      />
    </>
  )
}

/**
 * A field's options in one short cell: how many there are, with the list
 * itself in a tooltip - so a field with seventeen options is as tall as one
 * with none.
 */
function OptionsCount({ options }) {
  if (options.length === 0) return '--'

  return (
    <Tooltip text={options.join(', ')}>
      {/* Focusable, so the list can be reached without a mouse. */}
      <span tabIndex={0} className="cursor-help rounded-sm underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        {options.length} {options.length === 1 ? 'option' : 'options'}
      </span>
    </Tooltip>
  )
}
