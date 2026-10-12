/**
 * Where stock is kept - one set of warehouse lines of the Product form.
 * Drawn inside each SKU entry for a product with SKUs (that SKU's own
 * stock), and under the main fields of step 1 for a product without.
 * Either way it is handed one list of lines and the one quantity they are
 * held to, and knows nothing of any other.
 *
 * A line per place - a warehouse, how much is there, and (if the user
 * wants to say) the level, shelf and rack it sits on. There can be none (stock does not have to be put
 * anywhere yet), one, or several: the same stock can be split across
 * warehouses, or across racks of one.
 *
 *   <ProductWarehouseAllocation
 *     allocations={allocations} errors={allocationErrors} totalError={totalError}
 *     quantity={quantity} warehouses={warehouses}
 *     onAdd={addAllocation} onChange={changeAllocation} onRemove={removeAllocation} />
 *
 * It holds nothing itself: the lines live in the form, with everything else
 * the user has entered, so they survive going to another step and back. The
 * rules - a line names its warehouse and quantity, and the lines together
 * cannot hold more than the product's quantity - are in ../productForm.
 *
 * A COMPANY WITH ONE WAREHOUSE (`singleWarehouse` - its plan allows no
 * more) does not choose: every line arrives already holding that
 * warehouse (the form sees to it, see lockAllocations), its box is shown
 * but cannot be changed, and a line under the heading says why. Several
 * lines are still fine - they are racks of the one warehouse.
 *
 * Props:
 *   allocations   the lines - see emptyAllocation
 *   errors        { [line id]: { property: message } }, from validateAllocations
 *   totalError    what is wrong with the lines taken together, if anything
 *   quantity      the product's own quantity - see productQuantity
 *   warehouses    useWarehouseOptions()
 *   singleWarehouse   the company's plan allows one warehouse - see above
 *   disabled      the form is saving
 *   onAdd()                          a new, empty line
 *   onChange(id, property, value)    one box of one line changed
 *   onRemove(id)                     a line is taken away
 */

import { Plus, Trash2, Warehouse } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { Field, FieldError, SelectField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import { allocatedQuantity, tidyQuantity } from '../productForm'

/** A long list of warehouses gets a search box; a short one does not need it. */
const SEARCHABLE_FROM = 8

/** What a quantity box may hold while it is being typed: "", "12.", ".5" - never a minus. */
const QUANTITY_IN_PROGRESS = /^\d*\.?\d*$/

export default function ProductWarehouseAllocation({
  allocations,
  errors,
  totalError,
  quantity,
  warehouses,
  singleWarehouse = false,
  disabled,
  onAdd,
  onChange,
  onRemove,
}) {
  const loading = warehouses.status === 'loading'
  const noWarehouses = warehouses.status === 'ready' && warehouses.options.length === 0
  const allocated = allocatedQuantity(allocations)
  // The one warehouse of a company held to one - undefined until it is in.
  const onlyWarehouse = singleWarehouse ? warehouses.options[0] : undefined

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="text-xs font-semibold text-brand">Warehouse Allocation</h3>

          {/* How much is placed, against how much there is - red the moment
              it goes over, so the mistake is seen as it is typed. */}
          <p className={cn('text-xs', totalError ? 'text-destructive' : 'text-muted-foreground')}>
            {quantity.exists && quantity.value !== null
              ? `Allocated ${tidyQuantity(allocated)} of ${tidyQuantity(quantity.value)}`
              : `Allocated ${tidyQuantity(allocated)}`}
          </p>

          {onlyWarehouse ? (
            <p className="text-xs text-muted-foreground">
              Your plan supports one warehouse, so all stock is kept in {onlyWarehouse.label}.
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          variant="default"
          size="sm"
          icon={Plus}
          disabled={disabled || loading || noWarehouses || warehouses.status === 'failed'}
          onClick={onAdd}
        >
          {singleWarehouse ? 'Add Stock Location' : 'Add Warehouse'}
        </Button>
      </div>

      {/* Nothing retries on its own; Retry is the only way. */}
      {warehouses.status === 'failed' ? (
        <InlineAlert action={<RetryButton onClick={warehouses.retry} />}>
          Warehouses could not be loaded. {warehouses.error}
        </InlineAlert>
      ) : null}

      {allocations.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          <Warehouse className="size-4 shrink-0" />
          {noWarehouses
            ? 'This company has no warehouses yet. Add one under Inventory Master > Warehouse to allocate stock.'
            : 'No warehouse added. The product is saved without a stock location unless you add one.'}
        </p>
      ) : (
        <div className="space-y-3">
          {allocations.map((allocation, index) => {
            const found = errors[allocation.id] ?? {}
            const fieldId = (property) => `allocation-${allocation.id}-${property}`

            return (
              // The remove button sits level with the boxes, not the labels
              // above them (one label's height: 12px and its 6px gap).
              <div key={allocation.id} className="flex items-start gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4 lg:grid-cols-12">
                  <SelectField
                    id={fieldId('warehouse')}
                    label="Warehouse"
                    required
                    className="col-span-2 sm:col-span-4 lg:col-span-4"
                    placeholder={loading ? 'Loading...' : singleWarehouse ? 'Not available' : 'Select warehouse'}
                    options={warehouses.options}
                    value={allocation.warehouse}
                    error={found.warehouse}
                    // One warehouse: already chosen, and not to be changed.
                    disabled={disabled || loading || singleWarehouse}
                    searchable={warehouses.options.length >= SEARCHABLE_FROM}
                    searchPlaceholder="Search warehouse..."
                    onValueChange={(value) => onChange(allocation.id, 'warehouse', value)}
                  />
                  <Field
                    id={fieldId('warehouse_quantity')}
                    label="Quantity"
                    required
                    className="lg:col-span-2"
                    inputMode="decimal"
                    autoComplete="off"
                    value={allocation.warehouse_quantity}
                    error={found.warehouse_quantity}
                    disabled={disabled}
                    // A keystroke that would stop it being a quantity is not taken.
                    onChange={(event) => {
                      if (QUANTITY_IN_PROGRESS.test(event.target.value)) {
                        onChange(allocation.id, 'warehouse_quantity', event.target.value)
                      }
                    }}
                  />
                  <Field
                    id={fieldId('level')}
                    label="Level"
                    className="lg:col-span-2"
                    autoComplete="off"
                    value={allocation.level}
                    error={found.level}
                    disabled={disabled}
                    onChange={(event) => onChange(allocation.id, 'level', event.target.value)}
                  />
                  <Field
                    id={fieldId('shelf')}
                    label="Shelf"
                    className="lg:col-span-2"
                    autoComplete="off"
                    value={allocation.shelf}
                    error={found.shelf}
                    disabled={disabled}
                    onChange={(event) => onChange(allocation.id, 'shelf', event.target.value)}
                  />
                  <Field
                    id={fieldId('rack_no')}
                    label="Rack No."
                    className="lg:col-span-2"
                    autoComplete="off"
                    value={allocation.rack_no}
                    error={found.rack_no}
                    disabled={disabled}
                    onChange={(event) => onChange(allocation.id, 'rack_no', event.target.value)}
                  />
                </div>

                <Button
                  type="button"
                  variant="iconDelete"
                  size="icon"
                  icon={Trash2}
                  tooltip="Remove"
                  aria-label={`Remove warehouse ${index + 1}`}
                  disabled={disabled}
                  onClick={() => onRemove(allocation.id)}
                  className="mt-4.5 size-10"
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Said under the lines it is about, and announced when it appears. */}
      {totalError ? (
        <div role="alert">
          <FieldError>{totalError}</FieldError>
        </div>
      ) : null}
    </section>
  )
}
