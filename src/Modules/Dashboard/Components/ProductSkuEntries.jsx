/**
 * The SKU Details of the Product form, in step 1 right under the main
 * fields: one entry per SKU of the product.
 *
 *   SKU Details (2)                                    [+ Add SKU]
 *   ┌ SKU 1 ─────────────────────────────────────────────── [x] ┐
 *   │ Fabric Type   Material   GSM / Count   Color   Size  ...  │
 *   │ Warehouse Allocation                      [+ Add Warehouse]│
 *   │ Quantity   Expiry Date   Unit Rate                        │
 *   └───────────────────────────────────────────────────────────┘
 *   ┌ SKU 2 ...
 *
 * An entry is everything that belongs to one SKU, and one object of the
 * request's `product_details`:
 *
 *   its SKU fields        every customised field marked `sku_field`
 *   its warehouse stock   where this SKU is kept, and how much
 *   its own fields        Quantity, Expiry Date and Unit Rate - whichever
 *                         the company has - with the rate last
 *
 * Which fields those are is worked out in ../productForm (buildProductSteps);
 * this component draws whatever the group holds, once per entry, and names
 * no field. A company with three SKU fields gets entries of three, one with
 * nine gets entries of nine; one with no Expiry Date field has none here.
 *
 * It keeps nothing itself. The entries live in the form, with everything
 * else the user has entered, so they survive going to another step and back
 * - and each has its own values and its own warehouse lines, so typing into
 * one can never reach another.
 *
 * ADDING a SKU appends an empty entry under the last: nothing is copied from
 * the one before. REMOVING one that has anything in it asks first, beside
 * the button; an empty one just goes. The last entry cannot be removed - a
 * product with SKUs has at least one.
 *
 * Props:
 *   group        the SKU group of the step - see buildProductSteps
 *   steps        the whole form (to find the quantity an entry's stock is held to)
 *   sets         [{ id, values, allocations }] - see emptySkuSet
 *   errors       { [entry id]: { fields, lines, total } }, from checkProductStep
 *   vendors, warehouses   useVendorOptions(), useWarehouseOptions()
 *   singleWarehouse   the company's plan allows one warehouse - every
 *                entry's stock is kept in it (see ProductWarehouseAllocation)
 *   disabled     the form is saving
 *   onAdd()                                       a new, empty entry
 *   onRemove(entryId)
 *   onValueChange(entryId, fieldName, value)
 *   onAddLine(entryId)                            a new warehouse line
 *   onChangeLine(entryId, lineId, property, value)
 *   onRemoveLine(entryId, lineId)
 */

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { ConfirmPopover } from '@/Components/Common/ConfirmPopover'
import { Button } from '@/Components/ui/button'
import {
  allocationTotalError,
  emptyProductValue,
  productFieldName,
  productQuantity,
  skuSetHasData,
} from '../productForm'
import ProductFieldInput from './ProductFieldInput'
import ProductWarehouseAllocation from './ProductWarehouseAllocation'

export default function ProductSkuEntries({
  group,
  steps,
  sets,
  errors,
  vendors,
  warehouses,
  singleWarehouse = false,
  disabled,
  onAdd,
  onRemove,
  onValueChange,
  onAddLine,
  onChangeLine,
  onRemoveLine,
}) {
  // The id of the entry whose "remove this SKU?" popover is open, or null.
  const [confirming, setConfirming] = useState(null)

  const removable = sets.length > 1

  return (
    <section className="space-y-2">
      {/* The heading row: what this is on the left, Add SKU at its right end. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <h3 className="text-xs font-semibold text-brand">
          {group.title}
          <span className="font-normal text-muted-foreground"> ({sets.length})</span>
        </h3>

        <Button type="button" variant="outline" size="sm" icon={Plus} disabled={disabled} onClick={onAdd}>
          Add SKU
        </Button>
      </div>

      <div className="space-y-3">
        {sets.map((set, index) => {
          const found = errors[set.id] ?? {}
          const label = `SKU ${index + 1}`
          const filled = skuSetHasData(set)

          // This SKU's stock against this SKU's own quantity - worked out on
          // every draw, so it is right whichever of the two has just changed.
          const quantity = productQuantity(steps, set.values)
          const totalError = allocationTotalError(set.allocations, quantity)

          /** Some of this entry's fields, in the 12-column grid every group of product fields uses. */
          const renderFields = (fields) => (
            <div className="grid grid-cols-12 gap-x-3 gap-y-3">
              {fields.map((field) => {
                const name = productFieldName(field)

                return (
                  <ProductFieldInput
                    key={name}
                    field={field}
                    value={set.values[name] ?? emptyProductValue(field)}
                    error={found.fields?.[name]}
                    disabled={disabled}
                    vendors={vendors}
                    onChange={(value) => onValueChange(set.id, name, value)}
                  />
                )
              })}
            </div>
          )

          const removeButton = (
            <Button
              type="button"
              variant="iconDelete"
              size="icon-sm"
              icon={Trash2}
              tooltip="Remove SKU"
              aria-label={`Remove ${label}`}
              disabled={disabled}
              // With something in it, the click opens the popover instead.
              onClick={filled ? undefined : () => onRemove(set.id)}
            />
          )

          return (
            <div key={set.id} className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex min-h-8 items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">{label}</p>

                {!removable ? null : filled ? (
                  <ConfirmPopover
                    open={confirming === set.id}
                    onOpenChange={(next) => setConfirming(next ? set.id : null)}
                    title={`Remove ${label}?`}
                    description="Everything entered for this SKU will be lost. The other SKUs are not affected."
                    confirmLabel="Remove"
                    cancelLabel="Keep"
                    onConfirm={() => {
                      setConfirming(null)
                      onRemove(set.id)
                    }}
                  >
                    {removeButton}
                  </ConfirmPopover>
                ) : (
                  removeButton
                )}
              </div>

              {/* 1. What makes this SKU this SKU. */}
              {renderFields(group.skuFields)}

              {/* 2. Where it is kept. */}
              {group.withWarehouse ? (
                <ProductWarehouseAllocation
                  allocations={set.allocations}
                  errors={found.lines ?? {}}
                  totalError={totalError}
                  quantity={quantity}
                  warehouses={warehouses}
                  singleWarehouse={singleWarehouse}
                  disabled={disabled}
                  onAdd={() => onAddLine(set.id)}
                  onChange={(lineId, property, value) => onChangeLine(set.id, lineId, property, value)}
                  onRemove={(lineId) => onRemoveLine(set.id, lineId)}
                />
              ) : null}

              {/* 3. Its own quantity, expiry date and - last - rate. */}
              {group.detailFields.length > 0 ? renderFields(group.detailFields) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
