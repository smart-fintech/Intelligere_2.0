/**
 * ADJUST INVENTORY - stock taken out of the warehouses, for a reason:
 *
 *   (one card, no heading) Action, Reusable (and then its Total Price), Doc
 *                          No., Doc Type, Voucher Type
 *   Find Stock             Product, then its SKU (optional - none for all its
 *                          SKUs; chosen with the product when it has one) and
 *                          Search: a table of one row per warehouse of each
 *                          entry of each SKU (AdjustmentStockTable), each with
 *                          its tick and Remove Qty. A sub user sees only the
 *                          warehouses they were given.
 *   To Remove              every row ticked, over every search - another
 *                          product searched keeps the ones before, so one save
 *                          can take several products out of several warehouses.
 *                          Its quantity is changed, or it is removed, here or
 *                          in the table. A Remove Qty on a row not ticked is
 *                          kept, not saved - the table says so.
 *   Reason
 *
 * Save checks the whole form first (checkAdjustmentForm): an action, a
 * product searched, and each ticked row's quantity above 0 and no more than
 * that row's warehouse_quantity. It sends POST inventory/update_inventory/ once, however often it is
 * pressed. Saved: the backend's message, and what it changed - each SKU and
 * warehouse's quantity before and after (`updated`) - then onSaved; the
 * history and the products are read again by the save itself. Refused: its
 * message, and everything entered stays.
 *
 *   companyName
 *   products            readProducts(...) of the product list, with its `status`
 *   allowedWarehouses   the warehouse ids (text) a sub user may take from - null for all
 *   warehouseDetails(id)   { address, email } of a warehouse, for the table and the save
 */

import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, PackageSearch, Search, Trash2 } from 'lucide-react'

import { CheckboxField, Field, FieldLabel, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { SkuSelector } from '@/Components/Common/SkuSelector'
import { Button } from '@/Components/ui/button'
import { ADJUSTMENT_ACTIONS, ADJUSTMENT_DOC_TYPES, ADJUSTMENT_VOUCHER_TYPES, toOptions } from '@/Constants/inventory'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import {
  buildAdjustmentBody,
  checkAdjustmentForm,
  newAdjustmentForm,
  readSaveSummary,
  readStockRows,
  removeQtyProblem,
} from '@/Modules/Dashboard/inventoryAdjustments'
import { getAdjustmentStock, saveInventoryAdjustment } from '@/Services/Inventory/inventoryAdjustmentService'
import { orDash } from '@/Utils/display'
import AdjustmentStockTable, { QuantityInput, RowSku } from './AdjustmentStockTable'

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

const NO_SEARCH = { status: 'idle', rows: [], error: '', productName: '', skuCode: '' }

export default function InventoryAdjustmentFormModal({ open, onOpenChange, companyName, products, allowedWarehouses, warehouseDetails, onSaved }) {
  const [form, setForm] = useState(newAdjustmentForm)
  const [errors, setErrors] = useState({})
  const [pick, setPick] = useState({ productName: '', skuCode: '' })
  // The last search, and what it was for - the master names it.
  const [search, setSearch] = useState(NO_SEARCH)
  const searchCount = useRef(0)
  // { [row.key]: { row, selected, removeQty } } - a row's tick and quantity, over pages and searches.
  const [picks, setPicks] = useState({})
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
      const rows = readStockRows(reply)
      setSearch({ status: 'ready', rows, error: '', ...pick })
      // A row searched again keeps its tick and quantity, against what it holds now.
      setPicks((current) => {
        const next = { ...current }
        rows.forEach((row) => {
          if (next[row.key]) next[row.key] = { ...next[row.key], row }
        })
        return next
      })
      setErrors((current) => ({ ...current, product: undefined }))
    } catch (failure) {
      if (ticket !== searchCount.current) return
      setSearch((current) => ({ ...current, status: 'failed', error: failure.message || 'The stock could not be found.' }))
    }
  }

  /* ---------------- What is removed ---------------- */
  const shownRows = useMemo(
    () => (allowedWarehouses ? search.rows.filter((row) => !row.warehouseId || allowedWarehouses.includes(row.warehouseId)) : search.rows),
    [search.rows, allowedWarehouses],
  )
  const entries = Object.values(picks)
  const lines = entries.filter((entry) => entry.selected).map((entry) => ({ ...entry.row, removeQty: entry.removeQty }))
  const typedOnly = entries.filter((entry) => !entry.selected && entry.removeQty !== '').length
  const savedForm = { ...form, lines }

  /** A row's tick or quantity changed - only that row's. One with neither is forgotten. */
  const changePick = (row, change) => {
    setPicks((current) => {
      const next = { ...current, [row.key]: { row, selected: false, removeQty: '', ...current[row.key], ...change } }
      if (!next[row.key].selected && next[row.key].removeQty === '') delete next[row.key]
      return next
    })
    setErrors((current) => ({ ...current, [`lines.${row.key}`]: undefined, lines: undefined }))
  }

  /* ---------------- Save ---------------- */
  const handleSave = async () => {
    if (inFlight.current) return
    const found = checkAdjustmentForm(savedForm, { product: search.productName })
    setErrors(found)
    if (Object.keys(found).length > 0) {
      toast.error(Object.values(found)[0])
      return
    }

    inFlight.current = true
    setSaving(true)
    try {
      const body = buildAdjustmentBody(savedForm, { companyName, product: search.productName, skuCode: search.skuCode, warehouseDetails })
      const reply = await saveInventoryAdjustment(body)
      toast.success(reply?.msg || 'Inventory updated successfully')
      setSummary(readSaveSummary(reply, lines))
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
    if (shownRows.length === 0) return <p className="text-xs text-muted-foreground">No stock was found for {search.productName}.</p>

    return (
      <>
        <AdjustmentStockTable rows={shownRows} picks={picks} onChange={changePick} warehouseDetails={warehouseDetails} errors={errors} />
        {typedOnly > 0 ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {typedOnly} row{typedOnly === 1 ? ' has' : 's have'} a Remove Qty but {typedOnly === 1 ? 'is' : 'are'} not ticked - only ticked rows are saved.
          </p>
        ) : null}
      </>
    )
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      size="full"
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

          <FormSection title="To Remove" meta={lines.length > 0 ? `(${lines.length})` : undefined}>
            {lines.length === 0 ? (
              <p className={cn('text-xs', errors.lines ? 'text-destructive' : 'text-muted-foreground')}>
                {errors.lines || 'Tick a row above and enter its Remove Qty - rows from several searches add up here.'}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[46rem] text-sm">
                  <thead className={HEAD}>
                    <tr>
                      <th className={cn(TH, 'w-16')}>Sr No.</th>
                      <th className={TH}>Product Name</th>
                      <th className={TH}>SKU Code</th>
                      <th className={TH}>Warehouse</th>
                      <th className={cn(TH, 'text-right')}>Available</th>
                      <th className={cn(TH, 'w-36 text-right')}>Remove Qty</th>
                      <th className="w-12 px-2 py-2" aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.key} className="animate-in border-t border-border align-top duration-200 fade-in-0 slide-in-from-top-1">
                        <td className="px-2 py-2 text-muted-foreground tabular-nums">{orDash(line.srNo)}</td>
                        <td className="px-2 py-2 font-medium [overflow-wrap:anywhere]">{orDash(line.name)}</td>
                        <td className="px-2 py-2">
                          <RowSku code={line.skuCode} details={line.skuDetails} />
                        </td>
                        <td className="px-2 py-2">{orDash(line.warehouseName)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{line.available}</td>
                        <td className="px-1 py-1">
                          <QuantityInput
                            value={line.removeQty}
                            max={line.available}
                            error={removeQtyProblem(line.removeQty, line.available) || errors[`lines.${line.key}`]}
                            label={`Quantity to remove of ${line.skuCode || line.name} from ${line.warehouseName || 'this warehouse'}`}
                            onChange={(value) => changePick(picks[line.key].row, { removeQty: value })}
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
                            onClick={() => changePick(picks[line.key].row, { selected: false, removeQty: '' })}
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
