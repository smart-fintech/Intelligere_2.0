/**
 * ADJUST INVENTORY - stock taken out of the warehouses, for a reason:
 *
 *   (one card, no heading) Action, Reusable (and then its Total Price), Doc
 *                          No., Doc Type, Voucher Type
 *   Find Stock             Product, then its SKU (optional - none for all its
 *                          SKUs; chosen with the product when it has one) and
 *                          Search: the product's SKUs, each with its entries
 *                          (sr_no, quantity, rate, expiry) and what each
 *                          warehouse holds of it - a Remove Qty per warehouse.
 *                          A sub user sees only the warehouses they were given.
 *   To Remove              every quantity entered, over every search - another
 *                          product searched keeps the ones before, so one save
 *                          can take several products out of several warehouses.
 *                          A SKU and warehouse is in it once; its quantity is
 *                          changed, or it is removed, here or in the search.
 *   Reason
 *
 * Save checks the whole form first (checkAdjustmentForm): an action, a
 * product searched, and each quantity above 0 and no more than the warehouse
 * holds. It sends POST inventory/update_inventory/ once, however often it is
 * pressed. Saved: the backend's message, and what it changed - each SKU and
 * warehouse's quantity before and after (`updated`) - then onSaved; the
 * history and the products are read again by the save itself. Refused: its
 * message, and everything entered stays.
 *
 *   companyName
 *   products            readProducts(...) of the product list, with its `status`
 *   allowedWarehouses   the warehouse ids (text) a sub user may take from - null for all
 *   warehouseDetails(id)   { address, email } of a warehouse, for the save
 */

import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, PackageSearch, Search, Trash2 } from 'lucide-react'

import { CheckboxField, Field, FieldLabel, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { SkuSelector } from '@/Components/Common/SkuSelector'
import { Button } from '@/Components/ui/button'
import { Input } from '@/Components/ui/input'
import { ADJUSTMENT_ACTIONS, ADJUSTMENT_DOC_TYPES, ADJUSTMENT_VOUCHER_TYPES, toOptions } from '@/Constants/inventory'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import {
  buildAdjustmentBody,
  checkAdjustmentForm,
  lineKeyOf,
  newAdjustmentForm,
  readAdjustmentStock,
  readSaveSummary,
} from '@/Modules/Dashboard/inventoryAdjustments'
import { SkuCode } from '@/Modules/SalesInvoice/Components/RequestQuotation'
import { getAdjustmentStock, saveInventoryAdjustment } from '@/Services/inventoryService'
import { orDash } from '@/Utils/display'

/** One block of the form - a heading only where it says something the fields do not. */
function FormSection({ title, meta, children }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-xs">
      {title ? (
        <h3 className="text-sm font-semibold text-brand">
          {title}
          {meta ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{meta}</span> : null}
        </h3>
      ) : null}
      {children}
    </section>
  )
}

const TH = 'px-2 py-2 text-left'
const HEAD = 'bg-muted/50 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'

/** A SKU option's value - its code, what the search sends. Always passed (see TransferNoteFormModal). */
const skuValueOf = (variant) => String(variant?.sku_code ?? '')

// const skuText = (details) =>
//   Object.entries(details)
//     .filter(([, value]) => String(value ?? '').trim() !== '')
//     .map(([name, value]) => `${name}: ${value}`)
//     .join(', ')

/** A Remove Qty box - the same in the search and in To Remove. */
function QuantityInput({ value, error, label, onChange }) {
  return (
    <>
      <Input
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        placeholder="0"
        className={cn('h-8 text-right tabular-nums', error && 'border-destructive')}
        aria-label={label}
        aria-invalid={Boolean(error) || undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
    </>
  )
}

/** What the save changed - each SKU and warehouse's quantity before and after. */
function SaveSummary({ rows }) {
  return (
    <div className="animate-in space-y-3 duration-300 fade-in-0 zoom-in-95">
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-4 shrink-0" />
        The stock was updated.
      </div>
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className={HEAD}>
              <tr>
                <th className={TH}>Product Name</th>
                <th className={TH}>SKU Code</th>
                <th className={TH}>Warehouse</th>
                <th className={cn(TH, 'text-right')}>Old Qty</th>
                <th className={cn(TH, 'text-right')}>Removed</th>
                <th className={cn(TH, 'text-right')}>New Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <td className="px-2 py-2 font-medium">{orDash(row.name)}</td>
                  <td className="px-2 py-2">{orDash(row.skuCode)}</td>
                  <td className="px-2 py-2">{orDash(row.warehouse)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{orDash(row.oldQty)}</td>
                  <td className="px-2 py-2 text-right text-destructive tabular-nums">{row.removedQty ? `-${row.removedQty}` : '--'}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{orDash(row.newQty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

const NO_SEARCH = { status: 'idle', products: [], error: '', productName: '', skuCode: '' }

export default function InventoryAdjustmentFormModal({ open, onOpenChange, companyName, products, allowedWarehouses, warehouseDetails, onSaved }) {
  const [form, setForm] = useState(newAdjustmentForm)
  const [errors, setErrors] = useState({})
  const [pick, setPick] = useState({ productName: '', skuCode: '' })
  // The last search, and what it was for - the master names it.
  const [search, setSearch] = useState(NO_SEARCH)
  const searchCount = useRef(0)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  // Once saved: what changed, shown until Done.
  const [summary, setSummary] = useState(null)

  const set = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  /* ---------------- Choosing a product ---------------- */
  const productOptions = useMemo(() => {
    const names = [...new Set(products.list.map((product) => product.name).filter(Boolean))]
    return names.map((name) => ({ value: name, label: name }))
  }, [products.list])
  const chosen = products.list.find((product) => product.name === pick.productName) ?? null
  // Only the SKUs with a code are offered - a product without SKUs has none to pick.
  const skuVariants = useMemo(() => (chosen ? chosen.variants.filter((variant) => variant.skuCode).map((variant) => variant.source) : []), [chosen])

  const chooseProduct = (name) => {
    const product = products.list.find((entry) => entry.name === name)
    const codes = product ? product.variants.map((variant) => variant.skuCode).filter(Boolean) : []
    setPick({ productName: name, skuCode: codes.length === 1 ? codes[0] : '' })
    setErrors((current) => ({ ...current, product: undefined }))
  }

  const runSearch = async () => {
    if (!pick.productName) {
      toast.error('Select the product first.')
      return
    }
    const ticket = ++searchCount.current
    setSearch((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const reply = await getAdjustmentStock({ companyName, productName: pick.productName, skuCode: pick.skuCode })
      // Only the latest search is shown - one answered late is dropped.
      if (ticket !== searchCount.current) return
      setSearch({ status: 'ready', products: readAdjustmentStock(reply), error: '', ...pick })
      setErrors((current) => ({ ...current, product: undefined }))
    } catch (failure) {
      if (ticket !== searchCount.current) return
      setSearch((current) => ({ ...current, status: 'failed', error: failure.message || 'The stock could not be found.' }))
    }
  }

  /* ---------------- What is removed ---------------- */
  const lineOf = (key) => form.lines.find((line) => line.key === key)
  const allowed = (warehouse) => !allowedWarehouses || allowedWarehouses.includes(warehouse.id)

  /** A Remove Qty typed in the search: the line added, changed - or, emptied, taken out. */
  const changeRemoval = (product, sku, warehouse, value) => {
    const key = lineKeyOf(sku.productId, warehouse.id)
    setForm((current) => {
      const others = current.lines.filter((line) => line.key !== key)
      if (value === '') return { ...current, lines: others }
      const known = current.lines.find((line) => line.key === key)
      const line = known
        ? { ...known, removeQty: value }
        : {
            key,
            productId: sku.productId,
            name: product.name,
            skuCode: sku.skuCode,
            skuDetails: sku.skuDetails,
            hsn: product.hsn,
            unit: product.unit,
            unitRate: warehouse.unitRate,
            warehouseId: warehouse.id,
            warehouseName: warehouse.name,
            shelf: warehouse.shelf,
            level: warehouse.level,
            rackNo: warehouse.rackNo,
            available: warehouse.available,
            removeQty: value,
          }
      // Kept in the order they were first entered.
      return { ...current, lines: known ? current.lines.map((entry) => (entry.key === key ? line : entry)) : [...current.lines, line] }
    })
    setErrors((current) => ({ ...current, [`lines.${key}`]: undefined, lines: undefined }))
  }

  const changeLine = (key, value) => {
    setForm((current) => ({ ...current, lines: current.lines.map((line) => (line.key === key ? { ...line, removeQty: value } : line)) }))
    setErrors((current) => ({ ...current, [`lines.${key}`]: undefined }))
  }
  const removeLine = (key) => setForm((current) => ({ ...current, lines: current.lines.filter((line) => line.key !== key) }))

  /** A quantity's problem as it is typed - above 0 and no more than the warehouse holds - or the save's. */
  const lineError = (line) => {
    if (!line) return undefined
    const quantity = Number(line.removeQty)
    if (line.removeQty !== '' && Number.isFinite(quantity) && quantity > line.available) return `Only ${line.available} available`
    if (line.removeQty !== '' && (!Number.isFinite(quantity) || quantity <= 0)) return 'Enter above 0'
    return errors[`lines.${line.key}`]
  }

  /* ---------------- Save ---------------- */
  const handleSave = async () => {
    if (inFlight.current) return
    const found = checkAdjustmentForm(form, { product: search.productName })
    setErrors(found)
    if (Object.keys(found).length > 0) {
      toast.error(Object.values(found)[0])
      return
    }

    inFlight.current = true
    setSaving(true)
    try {
      const body = buildAdjustmentBody(form, { companyName, product: search.productName, skuCode: search.skuCode, warehouseDetails })
      const reply = await saveInventoryAdjustment(body)
      toast.success(reply?.msg || 'Inventory updated successfully')
      setSummary(readSaveSummary(reply, form.lines))
    } catch (failure) {
      // The backend's own message (see authService); everything entered stays.
      toast.error(failure.message || 'The inventory could not be updated.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const close = () => {
    if (saving) return
    if (summary) onSaved?.()
    else onOpenChange(false)
  }

  const footer = summary ? (
    <Button type="button" onClick={close}>
      Done
    </Button>
  ) : (
    <>
      <Button type="button" variant="outline" disabled={saving} onClick={close}>
        Cancel
      </Button>
      <Button type="button" loading={saving} onClick={handleSave}>
        {saving ? 'Saving...' : 'Save'}
      </Button>
    </>
  )

  const renderResults = () => {
    if (search.status === 'idle') return null
    if (search.status === 'loading') return <p className="animate-pulse text-xs text-muted-foreground">Finding the stock...</p>
    if (search.status === 'failed') return <p className="text-xs text-destructive">{search.error}</p>
    const skus = search.products.flatMap((product) => product.skus.map((sku) => ({ product, sku, warehouses: sku.warehouses.filter(allowed) })))
    if (skus.length === 0) return <p className="text-xs text-muted-foreground">No stock was found for {search.productName}.</p>

    return (
      <div className="animate-in space-y-3 duration-200 fade-in-0 slide-in-from-top-1">
        {skus.map(({ product, sku, warehouses }) => {
          const stocked = warehouses.filter((warehouse) => warehouse.available > 0)
          // const details = skuText(sku.skuDetails)
          return (
            <div key={`${product.key}|${sku.productId}`} className="rounded-md border border-border">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/30 px-3 py-2 text-xs">
                <span className="font-semibold text-foreground">{product.name || 'Unnamed product'}</span>
                <span>
                  <span className="text-muted-foreground">SKU: </span>
                  {sku.skuCode ? <SkuCode code={sku.skuCode} details={sku.skuDetails} /> : <span className="text-muted-foreground">No SKU</span>}
                </span>
                {/* {details ? <span className="text-muted-foreground">{details}</span> : null} */}
                <span className="text-muted-foreground">
                  HSN: <span className="text-foreground">{orDash(product.hsn)}</span> · Per: <span className="text-foreground">{orDash(product.unit)}</span>
                </span>
                <span className="ml-auto text-muted-foreground">
                  Total Qty: <span className="font-semibold text-foreground tabular-nums">{orDash(sku.totalQty)}</span>
                </span>
              </div>

              {/* {sku.entries.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
                  {sku.entries.map((entry, index) => (
                    <span key={`${entry.srNo}#${index}`} className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                      Sr {orDash(entry.srNo)} · Qty <span className="text-foreground tabular-nums">{orDash(entry.quantity)}</span> · Rate{' '}
                      <span className="text-foreground tabular-nums">{orDash(entry.unitRate)}</span>
                      {entry.expiryDate ? (
                        <>
                          {' '}
                          · Expiry <span className="text-foreground">{entry.expiryDate}</span>
                        </>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : null} */}

              {stocked.length === 0 ? (
                <p className="px-3 py-2 text-xs text-destructive">No warehouse holds stock of this {sku.skuCode ? 'SKU' : 'product'}.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[44rem] text-sm">
                    <thead className={HEAD}>
                      <tr>
                        <th className={TH}>Warehouse</th>
                        <th className={TH}>Shelf</th>
                        <th className={TH}>Level</th>
                        <th className={TH}>Rack No.</th>
                        <th className={cn(TH, 'text-right')}>Unit Rate</th>
                        <th className={cn(TH, 'text-right')}>Available</th>
                        <th className={cn(TH, 'w-32 text-right')}>Remove Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stocked.map((warehouse) => {
                        const line = lineOf(lineKeyOf(sku.productId, warehouse.id))
                        return (
                          <tr key={warehouse.id} className={cn('border-t border-border align-top transition-colors', line && 'bg-brand/5')}>
                            <td className="px-2 py-2 font-medium">{orDash(warehouse.name)}</td>
                            <td className="px-2 py-2">{orDash(warehouse.shelf)}</td>
                            <td className="px-2 py-2">{orDash(warehouse.level)}</td>
                            <td className="px-2 py-2">{orDash(warehouse.rackNo)}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{orDash(warehouse.unitRate)}</td>
                            <td className="px-2 py-2 text-right font-semibold tabular-nums">{warehouse.available}</td>
                            <td className="px-1 py-1">
                              <QuantityInput
                                value={line?.removeQty ?? ''}
                                error={lineError(line)}
                                label={`Quantity to remove of ${sku.skuCode || product.name} from ${warehouse.name || 'this warehouse'}`}
                                onChange={(value) => changeRemoval(product, sku, warehouse, value)}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      size="xxl"
      title={summary ? 'Inventory Updated' : 'Adjust Inventory'}
      description={summary ? 'What each warehouse holds now.' : 'Take damaged, rejected, expired or returned stock out of the warehouses.'}
      closeOnBackdropClick={false}
      autoFocus={false}
      footer={footer}
    >
      {summary ? (
        <SaveSummary rows={summary} />
      ) : (
        <div className="space-y-4">
          <FormSection>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-6">
              <SelectField
                id="adjustment-action"
                label="Action"
                required
                className="lg:col-span-2"
                value={form.action}
                onValueChange={(value) => set('action', value)}
                placeholder="Select Action"
                options={toOptions(ADJUSTMENT_ACTIONS)}
                error={errors.action}
              />
              <div className="space-y-1.5 lg:col-span-2">
                <FieldLabel htmlFor="adjustment-price">Total Price</FieldLabel>
                <div className="flex items-center gap-3">
                  <CheckboxField
                    id="adjustment-reuse"
                    label="Reusable"
                    checked={form.reuse}
                    onCheckedChange={(next) => {
                      setForm((current) => ({ ...current, reuse: next, totalPrice: next ? current.totalPrice : '' }))
                      setErrors((current) => ({ ...current, totalPrice: undefined }))
                    }}
                    className="shrink-0"
                  />
                  <Field
                    id="adjustment-price"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    className="flex-1"
                    value={form.totalPrice}
                    placeholder={form.reuse ? 'Enter Total Price' : 'Only when reusable'}
                    // Only reusable stock has a price, as before.
                    disabled={!form.reuse}
                    error={errors.totalPrice}
                    onChange={(event) => set('totalPrice', event.target.value)}
                  />
                </div>
              </div>
              <Field
                id="adjustment-doc-no"
                label="Doc No."
                className="lg:col-span-2"
                value={form.docNo}
                placeholder="Enter Doc No."
                onChange={(event) => set('docNo', event.target.value)}
              />
              <SelectField
                id="adjustment-doc-type"
                label="Doc Type"
                className="lg:col-span-3"
                value={form.docType}
                onValueChange={(value) => set('docType', value)}
                onClear={() => set('docType', '')}
                placeholder="Select Doc Type"
                options={ADJUSTMENT_DOC_TYPES}
              />
              <SelectField
                id="adjustment-voucher-type"
                label="Voucher Type"
                className="lg:col-span-3"
                value={form.voucherType}
                onValueChange={(value) => set('voucherType', value)}
                onClear={() => set('voucherType', '')}
                placeholder="Select Voucher Type"
                options={ADJUSTMENT_VOUCHER_TYPES}
              />
            </div>
          </FormSection>

          <FormSection title="Find Stock">
            {products.status === 'loading' && products.list.length === 0 ? (
              <p className="text-xs text-muted-foreground">Loading the products...</p>
            ) : productOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">There are no products to adjust.</p>
            ) : (
              <div className="grid grid-cols-1 items-start gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                <SelectField
                  id="adjustment-product"
                  label="Product"
                  required
                  value={pick.productName}
                  onValueChange={chooseProduct}
                  placeholder="Select Product"
                  options={productOptions}
                  searchable
                  error={errors.product}
                />
                <SkuSelector
                  id="adjustment-sku"
                  label="SKU Code"
                  skuVariants={skuVariants}
                  valueOf={skuValueOf}
                  value={pick.skuCode}
                  onChange={(value) => setPick((current) => ({ ...current, skuCode: value }))}
                  placeholder={skuVariants.length > 1 ? 'All SKUs' : 'Select SKU'}
                  emptyText={chosen ? 'No SKUs' : 'Select a product'}
                  disabled={skuVariants.length === 0}
                  showChosenDetails
                />
                <div className="space-y-1.5">
                  <FieldLabel className="invisible hidden lg:block">Search</FieldLabel>
                  <Button type="button" icon={Search} loading={search.status === 'loading'} disabled={!pick.productName} onClick={runSearch}>
                    Search
                  </Button>
                </div>
              </div>
            )}
            {search.status === 'idle' && productOptions.length > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <PackageSearch className="size-3.5" />
                Search a product to see what each warehouse holds of it.
              </p>
            ) : null}
            {renderResults()}
          </FormSection>

          <FormSection title="To Remove" meta={form.lines.length > 0 ? `(${form.lines.length})` : undefined}>
            {form.lines.length === 0 ? (
              <p className={cn('text-xs', errors.lines ? 'text-destructive' : 'text-muted-foreground')}>
                {errors.lines || 'Enter a Remove Qty against a warehouse above - quantities from several searches add up here.'}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[46rem] text-sm">
                  <thead className={HEAD}>
                    <tr>
                      <th className={cn(TH, 'w-10')}>Sr</th>
                      <th className={TH}>Product Name</th>
                      <th className={TH}>SKU Code</th>
                      <th className={TH}>Warehouse</th>
                      <th className={cn(TH, 'text-right')}>Available</th>
                      <th className={cn(TH, 'w-32 text-right')}>Remove Qty</th>
                      <th className="w-12 px-2 py-2" aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.lines.map((line, index) => (
                        <tr key={line.key} className="animate-in border-t border-border align-top duration-200 fade-in-0 slide-in-from-top-1">
                          <td className="px-2 py-2 text-muted-foreground tabular-nums">{index + 1}</td>
                          <td className="px-2 py-2 font-medium [overflow-wrap:anywhere]">{orDash(line.name)}</td>
                          <td className="px-2 py-2">
                            <SkuCode code={line.skuCode} details={line.skuDetails} />
                          </td>
                          <td className="px-2 py-2">{orDash(line.warehouseName)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{line.available}</td>
                          <td className="px-1 py-1">
                            <QuantityInput
                              value={line.removeQty}
                              error={lineError(line)}
                              label={`Quantity to remove of ${line.skuCode || line.name} from ${line.warehouseName || 'this warehouse'}`}
                              onChange={(value) => changeLine(line.key, value)}
                            />
                          </td>
                          <td className="px-1 py-1 text-center">
                            <Button
                              type="button"
                              variant="iconDelete"
                              size="icon-sm"
                              icon={Trash2}
                              tooltip="Remove"
                              aria-label={`Remove ${line.skuCode || line.name} from ${line.warehouseName || 'this warehouse'}`}
                              onClick={() => removeLine(line.key)}
                            />
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </FormSection>

          <TextareaField
            id="adjustment-reason"
            label="Reason"
            rows={2}
            value={form.reason}
            placeholder="Write the reason"
            onChange={(event) => set('reason', event.target.value)}
          />
        </div>
      )}
    </Modal>
  )
}
