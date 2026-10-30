/**
 * CREATE / EDIT TRANSFER NOTE - stock moved from one warehouse to another:
 *
 *   (one card, no heading) Transfer Note No. (fixed once saved, as before),
 *                          Transfer Date, Vehicle Number; From and To
 *                          Warehouse - never the same one, each cleared with
 *                          its x on its own; Declaration. A sub user moves
 *                          only out of the warehouses they were given.
 *   Products               a new note: Product, then its SKU (only those the
 *                          From warehouse holds, with how much), Quantity (at
 *                          most that), Remark - Add Product puts it in the
 *                          list below, where it can be changed or removed.
 *                          Another product starts its SKU (and quantity and
 *                          remark) afresh. Choosing - or clearing - the From
 *                          warehouse empties the list (its stock is another
 *                          warehouse's).
 *                          An edited note keeps its products: only each one's
 *                          quantity and remark change - none is added or
 *                          removed (see transferNotes).
 *
 * Save checks the whole form first (checkTransferForm) and says what is
 * missing beside each field. It sends POST - or, editing, PUT with the note's
 * id - once, however often it is pressed. Saved: the backend's message and
 * onSaved(reply) - the notes and the products are read again by the save
 * itself. Refused: its message, and everything typed stays.
 *
 *   note          the note being edited, or null for a new one (readTransferNotes)
 *   companyName
 *   warehouses    [{ value, label }] - the company's warehouses (useWarehouseOptions)
 *   fromChoices   the values a From warehouse may be - every warehouse, or a sub user's own
 *   products      readProducts(...) of the product list, with its `status`
 */

import { useMemo, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Field, FieldLabel, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { SkuSelector } from '@/Components/Common/SkuSelector'
import { Button } from '@/Components/ui/button'
import { Input } from '@/Components/ui/input'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import {
  buildTransferNoteBody,
  checkTransferForm,
  newTransferForm,
  transferableSkus,
  transferFormOf,
} from '@/Modules/Dashboard/transferNotes'
import { SkuCode } from '@/Modules/SalesInvoice/Components/RequestQuotation'
import { createTransferNote, updateTransferNote } from '@/Services/inventoryService'

/** One block of the form - a heading only where it says something the fields do not. */
function FormSection({ title, children }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-xs">
      {title ? <h3 className="text-sm font-semibold text-brand">{title}</h3> : null}
      {children}
    </section>
  )
}

const NO_ENTRY = { productKey: '', skuValue: '', quantity: '', remark: '' }

/**
 * A SKU option's value - its product_id as text, what `entry.skuValue` holds.
 * Always passed: SkuSelector's own default for `valueOf` never applies, as
 * every props object already has Object.prototype.valueOf (see ProductEntry).
 */
const skuValueOf = (variant) => String(variant?.product_id ?? '')

export default function TransferNoteFormModal({ open, onOpenChange, note, companyName, warehouses, fromChoices, products, onSaved }) {
  const editing = Boolean(note)
  const [form, setForm] = useState(() => (note ? transferFormOf(note) : newTransferForm()))
  const [errors, setErrors] = useState({})
  const [entry, setEntry] = useState(NO_ENTRY)
  const [saving, setSaving] = useState(false)
  // Set at once, so a second click before the re-render is turned away.
  const inFlight = useRef(false)

  const set = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  /* ---------------- What the From warehouse holds ---------------- */
  const stock = useMemo(() => (editing ? [] : transferableSkus(products.list, form.fromId)), [editing, products.list, form.fromId])
  // The dropdown's values are text; a product's key may be a number (its first SKU's id).
  const product = stock.find((entryProduct) => String(entryProduct.key) === entry.productKey) ?? null
  const sku = product?.skus.find((option) => String(option.productId) === entry.skuValue) ?? null
  // The quantity a new line may still take: what the warehouse holds, less what is already in the list for it.
  const listed = (productId) => form.lines.filter((line) => String(line.productId) === String(productId)).reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)

  const chooseFrom = (value) => {
    if (value === form.fromId) return
    // A new note's lines are the From warehouse's stock - another warehouse starts them again.
    if (!editing && form.lines.length > 0) toast.info('The products were cleared - they were the other warehouse\'s stock.')
    setForm((current) => ({ ...current, fromId: value, toId: current.toId === value ? '' : current.toId, lines: editing ? current.lines : [] }))
    setErrors((current) => ({ ...current, fromId: undefined, lines: undefined }))
    setEntry(NO_ENTRY)
  }

  const chooseProduct = (key) => {
    const chosen = stock.find((option) => String(option.key) === key)
    // Another product: its own SKUs, nothing of the last one's. One SKU: chosen with the product.
    setEntry({ ...NO_ENTRY, productKey: key, skuValue: chosen?.skus.length === 1 ? String(chosen.skus[0].productId) : '' })
  }

  const addLine = () => {
    if (!product || !sku) {
      toast.error('Select the product and its SKU.')
      return
    }
    const quantity = Number(entry.quantity)
    const left = sku.available - listed(sku.productId)
    if (!entry.quantity || !Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Enter a quantity above 0.')
      return
    }
    if (quantity > left) {
      toast.error(`Only ${left} of ${sku.skuCode || product.name} is left to move from this warehouse.`)
      return
    }
    if (form.lines.some((line) => String(line.productId) === String(sku.productId))) {
      toast.error(`${sku.skuCode || product.name} is already in the list - change its quantity there.`)
      return
    }
    setForm((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          key: `new#${sku.productId}`,
          productId: sku.productId,
          name: product.name,
          skuCode: sku.skuCode,
          skuDetails: sku.skuDetails,
          hsn: product.hsn,
          unit: product.unit,
          available: sku.available,
          quantity: entry.quantity,
          remark: entry.remark.trim(),
        },
      ],
    }))
    setErrors((current) => ({ ...current, lines: undefined }))
    setEntry(NO_ENTRY)
  }

  const changeLine = (key, field, value) => {
    setForm((current) => ({ ...current, lines: current.lines.map((line) => (line.key === key ? { ...line, [field]: value } : line)) }))
    setErrors((current) => ({ ...current, [`lines.${key}.${field}`]: undefined }))
  }

  const handleSave = async () => {
    if (inFlight.current) return
    const found = checkTransferForm(form)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      toast.error(Object.values(found)[0])
      return
    }

    inFlight.current = true
    setSaving(true)
    try {
      const body = buildTransferNoteBody(form, { companyName, id: editing ? note.id : null })
      const reply = editing ? await updateTransferNote(body) : await createTransferNote(body)
      toast.success(reply?.msg || (editing ? 'Transfer Note updated successfully' : 'Transfer Note created successfully'))
      onSaved?.(reply, form)
    } catch (failure) {
      // The backend's own message (see authService); everything typed stays.
      toast.error(failure.message || 'The Transfer Note could not be saved.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const fromOptions = warehouses.filter((option) => fromChoices.includes(option.value)).map((option) => ({ ...option, disabled: option.value === form.toId }))
  const toOptions = warehouses.map((option) => ({ ...option, disabled: option.value === form.fromId }))
  const left = sku ? sku.available - listed(sku.productId) : null

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next)
      }}
      size="xxl"
      title={editing ? 'Edit Transfer Note' : 'Create Transfer Note'}
      description={editing ? `Transfer No. ${note.transferNo || '--'}` : 'Move stock from one warehouse to another.'}
      closeOnBackdropClick={false}
      autoFocus={false}
      footer={
        <>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" loading={saving} onClick={handleSave}>
            {saving ? 'Saving...' : editing ? 'Update' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormSection>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field
              id="transfer-no"
              label="Transfer Note No."
              required
              className="lg:col-span-2"
              value={form.transferNo}
              placeholder="Transfer Note No."
              // Fixed once saved, as before.
              disabled={editing}
              error={errors.transferNo}
              onChange={(event) => set('transferNo', event.target.value)}
            />
            <Field
              id="transfer-date"
              label="Transfer Date"
              type="date"
              required
              className="lg:col-span-2"
              value={form.transferDate}
              error={errors.transferDate}
              onChange={(event) => set('transferDate', event.target.value)}
            />
            <Field
              id="transfer-vehicle"
              label="Vehicle Number"
              className="sm:col-span-2"
              value={form.vehicleNo}
              placeholder="e.g. GJ-01-AB-1234"
              inputClassName="uppercase"
              onChange={(event) => set('vehicleNo', event.target.value.toUpperCase())}
            />
            <SelectField
              id="transfer-from"
              label="From Warehouse"
              required
              className="lg:col-span-3"
              value={form.fromId}
              onValueChange={chooseFrom}
              onClear={() => chooseFrom('')}
              placeholder="Select From Warehouse"
              options={fromOptions}
              searchable
              error={errors.fromId}
            />
            <SelectField
              id="transfer-to"
              label="To Warehouse"
              required
              className="lg:col-span-3"
              value={form.toId}
              onValueChange={(value) => set('toId', value)}
              onClear={() => set('toId', '')}
              placeholder="Select To Warehouse"
              options={toOptions}
              searchable
              error={errors.toId}
            />
            <TextareaField
              id="transfer-declaration"
              label="Declaration"
              rows={2}
              className="sm:col-span-2 lg:col-span-6"
              value={form.declaration}
              placeholder="Declaration"
              onChange={(event) => set('declaration', event.target.value)}
            />
          </div>
        </FormSection>

        <FormSection title="Products">
          {editing ? (
            <p className="text-xs text-muted-foreground">A saved note keeps its products - change their quantity or remark below.</p>
          ) : !form.fromId ? (
            <p className="text-xs text-muted-foreground">Select the From Warehouse to see the products it holds.</p>
          ) : products.status === 'loading' && products.list.length === 0 ? (
            <p className="text-xs text-muted-foreground">Loading the products...</p>
          ) : stock.length === 0 ? (
            <p className="text-xs text-muted-foreground">This warehouse holds no stock to move.</p>
          ) : (
            <div className="grid grid-cols-1 items-start gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_minmax(0,1fr)_auto]">
              <SelectField
                id="transfer-product"
                label="Product"
                value={entry.productKey}
                onValueChange={chooseProduct}
                placeholder="Select Product"
                options={stock.map((option) => ({ value: String(option.key), label: option.name || 'Unnamed product' }))}
                searchable
              />
              <SkuSelector
                id="transfer-sku"
                label="SKU Code"
                skuVariants={product ? product.skus.map((option) => option.source) : []}
                valueOf={skuValueOf}
                value={entry.skuValue}
                onChange={(value) => setEntry((current) => ({ ...current, skuValue: value }))}
                disabled={!product}
                showChosenDetails
              />
              <div className="space-y-1">
                <Field
                  id="transfer-quantity"
                  label="Quantity"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={entry.quantity}
                  disabled={!sku}
                  onChange={(event) => setEntry((current) => ({ ...current, quantity: event.target.value }))}
                />
                {sku ? <p className="text-[11px] text-muted-foreground">Available: <span className="font-semibold text-foreground tabular-nums">{left}</span></p> : null}
              </div>
              <Field
                id="transfer-remark"
                label="Remark"
                value={entry.remark}
                placeholder="Remark"
                disabled={!sku}
                onChange={(event) => setEntry((current) => ({ ...current, remark: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  addLine()
                }}
              />
              <div className="space-y-1.5">
                <FieldLabel className="invisible hidden lg:block">Add</FieldLabel>
                <Button type="button" icon={Plus} disabled={!sku} onClick={addLine}>
                  Add Product
                </Button>
              </div>
            </div>
          )}

          {errors.lines ? <p className="text-xs text-destructive">{errors.lines}</p> : null}

          {form.lines.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="bg-muted/50 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="w-10 px-2 py-2 text-left">Sr</th>
                    <th className="px-2 py-2 text-left">Product Name</th>
                    <th className="px-2 py-2 text-left">SKU Code</th>
                    <th className="w-20 px-2 py-2 text-left">HSN</th>
                    <th className="w-16 px-2 py-2 text-left">Unit</th>
                    {editing ? null : <th className="w-20 px-2 py-2 text-right">Available</th>}
                    <th className="w-28 px-2 py-2 text-right">Quantity</th>
                    <th className="px-2 py-2 text-left">Remark</th>
                    {editing ? null : <th className="w-12 px-2 py-2" aria-label="Remove" />}
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((line, index) => {
                    const error = errors[`lines.${line.key}.quantity`]
                    return (
                      <tr key={line.key} className="animate-in border-t border-border align-top duration-200 fade-in-0 slide-in-from-top-1">
                        <td className="px-2 py-2 text-muted-foreground tabular-nums">{index + 1}</td>
                        <td className="px-2 py-2 font-medium [overflow-wrap:anywhere]">{line.name || '--'}</td>
                        <td className="px-2 py-2">
                          <SkuCode code={line.skuCode} details={line.skuDetails} />
                        </td>
                        <td className="px-2 py-2">{line.hsn || '--'}</td>
                        <td className="px-2 py-2">{line.unit || '--'}</td>
                        {editing ? null : <td className="px-2 py-2 text-right tabular-nums">{line.available}</td>}
                        <td className="px-1 py-1">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            className={cn('h-8 text-right tabular-nums', error && 'border-destructive')}
                            aria-label={`Quantity of ${line.skuCode || line.name || `line ${index + 1}`}`}
                            aria-invalid={Boolean(error) || undefined}
                            value={line.quantity}
                            onChange={(event) => changeLine(line.key, 'quantity', event.target.value)}
                          />
                          {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
                        </td>
                        <td className="px-1 py-1">
                          <Input className="h-8" aria-label={`Remark of ${line.skuCode || line.name || `line ${index + 1}`}`} value={line.remark} onChange={(event) => changeLine(line.key, 'remark', event.target.value)} />
                        </td>
                        {editing ? null : (
                          <td className="px-1 py-1 text-center">
                            <Button
                              type="button"
                              variant="iconDelete"
                              size="icon-sm"
                              icon={Trash2}
                              tooltip="Remove"
                              aria-label={`Remove ${line.skuCode || line.name}`}
                              onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((entryLine) => entryLine.key !== line.key) }))}
                            />
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </FormSection>
      </div>
    </Modal>
  )
}
