import { useMemo } from 'react'
import { Check, TriangleAlert } from 'lucide-react'

import { Field, SelectField } from '@/Components/Common/FormFields'
import { SkuDetailsTooltip } from '@/Components/Common/SkuDetailsTooltip'
import { SkuSelector } from '@/Components/Common/SkuSelector'
import { Input } from '@/Components/ui/input'
import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import { cn } from '@/Library/utils'
import { formatAmount } from '@/Modules/SalesInvoice/Document/invoiceFormat'
import { isSkuManaged, skuOptionValue, toDecimalInput } from '@/Modules/SalesInvoice/salesInvoiceForm'
import { INVOICE_MODE, MAPPING_STATUS, allSkusOf, gstRateOf, isProductMapped, lineTaxKind, productChoice } from '@/Modules/SalesInvoice/Voucher/voucherModel'
import { skuAttributes } from '@/Utils/skuAttributes'

/**
 * ONE VOUCHER - its selections and editable details, in clearly separate
 * sections (the actions and the preview are the Voucher view's, beside it):
 *
 *   Item Invoice | Accounting Invoice   Item Invoice first; Accounting Invoice
 *                                       hides Product Details (and the payload
 *                                       leaves the products out)
 *   A  Document Date | <account> Ledger | Taxable Amount
 *      Document Date | <party> Ledger   | Total Amount (red - the one red figure)
 *      Document No.  | Narration        | Voucher Type (the types of tally/voucher-list/
 *                                         in this document type's voucher_group -
 *                                         its default selected)
 *   Product Details   the product lines - the product and its SKU code CHOSEN
 *                     from the product list (the SKU's details on hover); HSN/SAC,
 *                     quantity, discount, GST %, rate, unit and amount typed over
 *                     in place
 *   Service Details   the service lines, each with its ledger
 *   Charges           Other Charges, discount, TCS, round off - one row each:
 *                     Document Date | its ledger, chosen from the ledger list
 *                     (Ledger Details) when it is there | its amount (editable)
 *   GST Charges       gst_charges - one row per company ledger they are mapped to
 *                     (slabs on the same ledger merged, their amounts added):
 *                     Document Date | the ledger mapped to | the tax amount (editable)
 *
 * TEMPORARILY HIDDEN - commented out in the JSX below, each marked
 * "TEMPORARILY HIDDEN", and restored by uncommenting its <th> and <td>:
 *   Charges       the GST column (the slab an Other Charge was taxed at)
 *   GST Charges   the GST Slab and GST Ledger columns (the slab(s) and the
 *                 voucher's own ledger name(s), with "n slabs on one ledger")
 * Only their display is hidden: the values are still read, mapped and sent.
 *
 * LOCKED BY DEFAULT - only Narration, the Sales / Purchase ledger, the Charges
 * and GST (tax) ledgers and the Voucher Type can be changed; every other box is
 * read-only (its value still shown and sent). A Product / SKU or party ledger
 * that is not matched yet stays choosable, so any voucher can be completed.
 * In EDIT mode (`editing` - a PDF-uploaded voucher's Edit) everything opens,
 * except a merged GST row's total (its slabs are saved apart).
 *
 * The voucher's own values are what the boxes start with; what is typed over
 * them is kept as typed (`edits`) and sent as typed - nothing is worked out
 * again from it. A mapping that is not found shows a dropdown and, under it,
 * a red line saying what is missing. Everything chosen or typed is the
 * screen's (`choices` / onChoose), so it survives paging and switching type.
 *
 *   voucher      readVoucher's - the voucher as it came
 *   mapping      resolveVoucher's - for these choices (mapping.voucher is the
 *                voucher with the edits)
 *   edits        what has been typed: { lines: { [index]: { field: text } },
 *                charges: { [key]: text }, gst: { [key]: text } }
 *   ledgers      { options } - the company's ledgers
 *   products     { list, options, byKey, status } - the company's products
 *                (inventory/product/, read by readProducts - useInvoiceReferenceData)
 *   labels       { account: 'Sales', party: 'Buyer' }
 *   voucherTypes { status, names, group, defaultName, defaultFound, error, reload } -
 *                the names of this document type's voucher_group (the options), and
 *                the default name of this document type and whether it is among them
 *   editing      edit mode - every field open
 *   footer       drawn at the bottom of the card - the voucher's actions
 *   onChoose(change)   change: { account } | { party } | { line: [index, value] } - a service's
 *                      ledger id, or a product's { productKey, skuValue } |
 *                      { charge: [key, ledgerId] } | { narration } | { voucherType } |
 *                      { mode } | { edit: ['lines', index, field, text] | ['charges' | 'gst', key, text] }
 */

const resolved = (status) => status === MAPPING_STATUS.MATCHED || status === MAPPING_STATUS.SELECTED

/** A charge's key as part of an element id - "round_off:Round Off" -> "round_off-Round-Off". */
const idPart = (value) => String(value).replace(/[^A-Za-z0-9_-]+/g, '-')

const amountText = (value) => (value === null || value === undefined ? '--' : formatAmount(value))
const numberText = (value) => (value === null || value === undefined ? '--' : String(value))
const percentText = (value) => (value === null || value === undefined ? '--' : `${value}%`)

/** A number as an input starts with it - amounts to two places, "" for none. */
const boxNumber = (value, places = null) => (value === null || value === undefined ? '' : places === null ? String(value) : Number(value).toFixed(places))

/** A line's tax as sent - "18%" (IGST) or "9% + 9%" (CGST + SGST); "--" for none. */
const taxText = (row) => {
  if (row.igst !== null) return `${row.igst}%`
  if (row.cgst !== null || row.sgst !== null) return `${row.cgst ?? 0}% + ${row.sgst ?? 0}%`
  return '--'
}

/**
 * The tax columns of Product Details - what the lines are actually taxed with
 * (lineTaxKind): CGST and SGST when any line charges them, IGST when any line
 * charges it; a single "GST" when no line charges GST at all.
 */
const TAX_COLUMNS = {
  cgst_sgst: [
    { field: 'cgst', amount: 'cgstAmount', label: 'CGST' },
    { field: 'sgst', amount: 'sgstAmount', label: 'SGST' },
  ],
  igst: [{ field: 'igst', amount: 'igstAmount', label: 'IGST' }],
}
const taxColumnsOf = (lines) => {
  const kinds = new Set(lines.map(lineTaxKind).filter(Boolean))
  return [...(kinds.has('cgst_sgst') ? TAX_COLUMNS.cgst_sgst.map((column) => ({ ...column, kind: 'cgst_sgst' })) : []), ...(kinds.has('igst') ? TAX_COLUMNS.igst.map((column) => ({ ...column, kind: 'igst' })) : [])]
}

/** The tax column's heading - what the lines actually carry. */
const taxHeading = (rows) => {
  const igst = rows.some((row) => row.igst !== null)
  const split = rows.some((row) => row.cgst !== null || row.sgst !== null)
  return igst && !split ? 'IGST %' : split && !igst ? 'CGST + SGST %' : 'GST %'
}

const th = 'px-2 py-1.5 text-left text-[11px] font-semibold whitespace-nowrap text-brand'
const td = 'px-2 py-1.5 align-top text-xs'
const tdBox = 'px-1 py-1 align-top text-xs'
const num = 'text-right tabular-nums'

const MODES = [
  { value: INVOICE_MODE.ITEM, label: 'Item Invoice' },
  { value: INVOICE_MODE.ACCOUNTING, label: 'Accounting Invoice' },
]

function SectionTitle({ children, count }) {
  return (
    <p className="text-xs font-semibold tracking-wide text-brand uppercase">
      {children}
      {count !== undefined ? <span className="ml-1 font-normal text-muted-foreground">({count})</span> : null}
    </p>
  )
}

/** A found mapping - the green tick and the name it was found as. */
function Found({ children, title }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400" title={title}>
      <Check className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  )
}

/** The red line under a mapping that is still needed. */
function Missing({ children }) {
  return (
    <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-destructive" role="alert">
      <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

/** A ledger slot: found (with the dropdown to change it), or the dropdown and - when it is needed - why. */
function LedgerChoice({ id, slot, ledgers, onChange, missingText, label, ariaLabel = 'Ledger', needed = true, disabled = false }) {
  const ok = resolved(slot.status) || !needed
  return (
    <div className="min-w-0">
      <SelectField
        id={id}
        label={label}
        ariaLabel={label ? undefined : ariaLabel}
        size="sm"
        searchable
        searchPlaceholder="Search ledgers"
        placeholder="Select ledger"
        options={ledgers.options}
        value={slot.ledgerId}
        disabled={disabled}
        onValueChange={onChange}
      />
      {ok ? null : <Missing>{missingText}</Missing>}
    </div>
  )
}

function ReadOnly({ id, label, value, className, inputClassName }) {
  return <Field id={id} label={label} readOnly value={value} className={className} inputClassName={cn('h-8 bg-muted/40 text-xs', inputClassName)} />
}

/** A value typed over in a table cell - a number keeps to digits and one point. Read-only while `locked`. */
function CellInput({ id, label, value, onChange, numeric = false, locked = false, title, className }) {
  return (
    <Input
      id={id}
      aria-label={label}
      value={value}
      readOnly={locked}
      title={title}
      inputMode={numeric ? 'decimal' : undefined}
      onChange={(event) => onChange(numeric ? toDecimalInput(event.target.value) : event.target.value)}
      className={cn('h-8 px-2 text-xs md:text-xs', numeric && 'text-right tabular-nums', locked && 'cursor-default bg-muted/40 focus-visible:ring-0', className)}
    />
  )
}

/** The Document Date in a table row - read-only, the height of the row's other controls. */
function DateCell({ id, value }) {
  return (
    <Input
      id={id}
      aria-label="Document Date"
      readOnly
      tabIndex={-1}
      value={value || '--'}
      className="h-8 bg-muted/40 px-2 text-xs whitespace-nowrap md:text-xs"
    />
  )
}

/**
 * A product line's Product Name: matched by name, then by SKU code under that
 * product (resolveVoucher) - or chosen from the product list. When either
 * does not match, neither is selected and the reason is said under the box;
 * choosing a product keeps the line's SKU only when that product has a SKU of
 * exactly that code (productChoice). Nothing else of the line changes.
 */
const productMissingText = (slot) => {
  const { name, skuCode } = slot.sourceLine
  if (!name) return 'Select the product.'
  if (slot.reason === 'sku') {
    return skuCode
      ? `"${name}" has no SKU "${skuCode}" in the product list - select the product and its SKU.`
      : `"${name}" needs a SKU code - select the product and its SKU.`
  }
  return `"${name}" is not in the product list - select a product.`
}

function ProductChoice({ id, slot, products, onChoose, disabled = false }) {
  const source = slot.sourceLine
  const loading = products.status === 'loading' || products.status === 'idle'
  console.info(source);
  console.info("slot: ", slot.product?.name);
  return (
    <div className="min-w-0" title={slot.product?.name || source.name || undefined}>
      <SelectField
        id={id}
        ariaLabel={`Product Name - ${source.name || slot.product?.name || 'product'}`}
        size="sm"
        searchable
        searchPlaceholder="Search products"
        placeholder={loading ? 'Loading products...' : products.options.length === 0 ? 'No products' : 'Select product'}
        options={products.options}
        value={slot.productKey}
        disabled={disabled || products.options.length === 0}
        onValueChange={(productKey) => {
          // Radix can report '' on its own, and re-choosing the same product changes nothing.
          if (!productKey || productKey === slot.productKey) return
          onChoose(productChoice(products.byKey.get(productKey), slot.line.skuCode || source.skuCode))
        }}
      />
      {slot.product ? null : <Missing>{productMissingText(slot)}</Missing>}
    </div>
  )
}

/**
 * A product line's SKU Code - only a code here; the SKU's own sku_details
 * (from the product list) on hover.
 *
 *   product kept by SKU      that product's SKUs only
 *   product without SKUs     nothing to choose ("--")
 *   not mapped               every SKU of the list, when the voucher names a
 *                            SKU or its product needs one - choosing one
 *                            chooses its product with it
 */
function SkuChoice({ id, slot, allSkus, onChoose, disabled = false }) {
  const { product, variant } = slot
  const source = slot.sourceLine
  if (product ? !isSkuManaged(product) : !source.skuCode && slot.reason !== 'sku') return <span className="block px-1.5 py-1 text-muted-foreground">--</span>

  const own = Boolean(product)
  const label = `SKU Code - ${product?.name || source.name || 'product'}`
  const missing = own
    ? variant
      ? null
      : `Select the SKU of ${product.name}.`
    : slot.reason === 'sku'
      ? source.skuCode
        ? `SKU "${source.skuCode}" is not a SKU of "${source.name}" - select one.`
        : 'Select the SKU.'
      : `SKU "${source.skuCode}" is not in the product list - select one.`

  return (
    <div className="min-w-0">
      <SkuDetailsTooltip details={variant ? skuAttributes(variant.source) : []} side="top">
        <div data-testid={`${id}-hover`}>
          <SkuSelector
            id={id}
            size="sm"
            ariaLabel={label}
            skuVariants={own ? product.variants.map((entry) => entry.source) : allSkus.map((entry) => entry.variant.source)}
            valueOf={own ? skuOptionValue : (raw, index) => allSkus[index]?.value ?? String(index)}
            value={own ? slot.skuValue : ''}
            disabled={disabled}
            onChange={(value) => {
              if (!value) return
              if (own) {
                if (value !== slot.skuValue) onChoose({ productKey: slot.productKey, skuValue: value })
                return
              }
              const picked = allSkus.find((entry) => entry.value === value)
              if (picked) onChoose({ productKey: String(picked.product.key), skuValue: picked.skuValue })
            }}
          />
        </div>
      </SkuDetailsTooltip>
      {missing ? <Missing>{missing}</Missing> : null}
    </div>
  )
}

export default function VoucherCard({ voucher, mapping, edits, ledgers, products, labels, voucherTypes, editing = false, footer = null, onChoose }) {
  const key = `voucher-${voucher.id ?? voucher.documentNo}`
  // Every SKU of the product list, each with its product - for a line whose product is not found.
  const allSkus = useMemo(() => allSkusOf(products.list ?? []), [products.list])
  const items = mapping.mode !== INVOICE_MODE.ACCOUNTING
  const showSku =
    voucher.products.some((line) => line.skuCode) ||
    mapping.products.some(({ product, reason }) => (product && isSkuManaged(product)) || reason === 'sku')
  // CGST / SGST and / or IGST - as the voucher's lines are taxed (lineTaxKind, on the values it
  // came with, so a rate typed over never moves the columns), never a zero field shown as a tax.
  const taxColumns = taxColumnsOf(voucher.products)
  const serviceTax = taxHeading(voucher.services)

  /** What a product box shows: what was typed, else the voucher's own value. */
  const lineBox = (line, field) => {
    const typed = edits.lines?.[line.index]?.[field]
    if (typed !== undefined) return typed
    if (field === 'gstRate') return boxNumber(gstRateOf(line))
    if (field === 'cgst' || field === 'sgst' || field === 'igst') return boxNumber(line[field])
    if (field === 'rate' || field === 'amount') return boxNumber(line[field], 2)
    if (field === 'quantity' || field === 'discount') return boxNumber(line[field])
    return line[field] ?? ''
  }
  const editLine = (line, field) => (value) => onChoose({ edit: ['lines', line.index, field, value] })
  const amountBox = (section, entryKey, amount) => edits[section]?.[entryKey] ?? boxNumber(amount, 2)

  return (
    <article className="@container space-y-3 rounded-lg border border-border bg-card p-3 shadow-xs" aria-label={`Voucher ${voucher.documentNo}`}>
      {/* ---- Item Invoice / Accounting Invoice ---- */}
      <RadioGroup
        value={mapping.mode}
        onValueChange={(value) => value && onChoose({ mode: value })}
        disabled={!editing}
        aria-label="Invoice mode"
        className="flex w-fit flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-xs"
      >
        {MODES.map((option) => {
          const id = `${key}-mode-${option.value}`
          return (
            <Label
              key={option.value}
              htmlFor={id}
              className={`flex items-center gap-2 rounded-md px-3 py-1 text-xs transition-colors ${editing ? 'cursor-pointer' : 'cursor-default'} ${mapping.mode === option.value ? 'bg-brand-soft font-semibold text-brand' : `text-muted-foreground ${editing ? 'hover:text-brand' : ''}`}`}
            >
              <RadioGroupItem id={id} value={option.value} />
              {option.label}
            </Label>
          )
        })}
      </RadioGroup>

      {/* ---- A: the document, and its two ledgers ---- */}
      <div className="grid grid-cols-1 gap-x-3 gap-y-2 @md:grid-cols-3">
        <ReadOnly id={`${key}-date`} label="Document Date" value={voucher.documentDate || '--'} />
        <LedgerChoice
          id={`${key}-account`}
          label={`${labels.account} Ledger`}
          slot={mapping.account}
          ledgers={ledgers}
          onChange={(value) => onChoose({ account: value })}
          missingText={`Select the ${labels.account} ledger.`}
          // Products are posted to it; a voucher of services alone has their own ledgers.
          needed={voucher.products.length > 0}
        />
        <ReadOnly id={`${key}-taxable`} label="Taxable Amount" value={amountText(voucher.taxableAmount)} inputClassName="text-right tabular-nums" />
        <ReadOnly id={`${key}-date-party`} label="Document Date" value={voucher.documentDate || '--'} />
        <LedgerChoice
          id={`${key}-party`}
          label={`${labels.party} Ledger`}
          slot={mapping.party}
          ledgers={ledgers}
          onChange={(value) => onChoose({ party: value })}
          // Locked once matched (open in edit mode, or while it still needs choosing).
          disabled={!editing && resolved(mapping.party.status)}
          missingText={voucher.party.name ? `"${voucher.party.name}" is not in the ledger list - select the ${labels.party.toLowerCase()} ledger.` : `Select the ${labels.party.toLowerCase()} ledger.`}
        />
        <ReadOnly
          id={`${key}-total`}
          label="Total Amount"
          value={amountText(voucher.totalAmount)}
          inputClassName="text-right font-semibold tabular-nums text-destructive"
        />
      </div>

      {/* ---- the voucher's own details: number, narration, voucher type ---- */}
      <div className="grid grid-cols-1 gap-x-3 gap-y-2 border-t border-border pt-2 @md:grid-cols-3">
        <ReadOnly id={`${key}-number`} label="Document No." value={voucher.documentNo || '--'} />
        <Field
          id={`${key}-narration`}
          label="Narration"
          placeholder="Narration"
          maxLength={500}
          value={mapping.narration}
          onChange={(event) => onChoose({ narration: event.target.value })}
          inputClassName="h-8 text-xs"
        />
        <div className="min-w-0">
          <SelectField
            id={`${key}-voucher-type`}
            label="Voucher Type"
            size="sm"
            searchable
            searchPlaceholder="Search voucher types"
            placeholder={
              voucherTypes.status === 'loading'
                ? 'Loading voucher types...'
                : voucherTypes.status === 'ready' && voucherTypes.names.length === 0
                  ? `No ${voucherTypes.group} voucher types`
                  : 'Select voucher type'
            }
            options={voucherTypes.names.map((name) => ({ value: name, label: name }))}
            value={mapping.voucherType}
            disabled={voucherTypes.names.length === 0}
            onValueChange={(value) => value && onChoose({ voucherType: value })}
          />
          {voucherTypes.status === 'failed' ? (
            <Missing>
              Voucher types could not be loaded: {voucherTypes.error}{' '}
              <button type="button" className="font-semibold underline" onClick={voucherTypes.reload}>
                Retry
              </button>
            </Missing>
          ) : voucherTypes.status === 'ready' && voucherTypes.names.length === 0 ? (
            <Missing>Tally has no voucher type in the &ldquo;{voucherTypes.group}&rdquo; group.</Missing>
          ) : voucherTypes.status === 'ready' && !mapping.voucherType ? (
            <Missing>
              {voucherTypes.defaultName && !voucherTypes.defaultFound
                ? `Tally has no "${voucherTypes.defaultName}" voucher type - select one.`
                : 'Select the voucher type.'}
            </Missing>
          ) : null}
        </div>
      </div>

      {/* ---- Product Details - Item Invoice only ---- */}
      {items && voucher.products.length > 0 ? (
        <section className="space-y-1.5 border-t border-border pt-3" aria-label="Product Details">
          <SectionTitle count={voucher.products.length}>Product Details</SectionTitle>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[1040px] border-collapse">
              <thead className="bg-brand-soft/60">
                <tr>
                  <th className={th}>Product Name</th>
                  {showSku ? <th className={th}>SKU Code</th> : null}
                  <th className={th}>HSN/SAC</th>
                  <th className={cn(th, num)}>Qty</th>
                  <th className={cn(th, num)}>Disc %</th>
                  {taxColumns.length > 0 ? (
                    taxColumns.map((column) => (
                      <th key={column.field} className={cn(th, num)}>
                        {column.label}
                      </th>
                    ))
                  ) : (
                    <th className={cn(th, num)}>GST</th>
                  )}
                  <th className={cn(th, num)}>Rate</th>
                  <th className={th}>Unit</th>
                  <th className={cn(th, num)}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {mapping.products.map((slot) => {
                  const line = slot.sourceLine
                  // The line as shown and sent - its taxes as sent, or as typed over.
                  const shown = slot.line
                  const kind = lineTaxKind(voucher.products.find((entry) => entry.index === line.index) ?? shown)
                  const choose = (choice) => onChoose({ line: [line.index, choice] })
                  const box = (field, label, options = {}) => (
                    <CellInput id={`${key}-line-${line.index}-${field}`} label={`${label} - ${line.name}`} value={lineBox(line, field)} onChange={editLine(line, field)} locked={!editing} {...options} />
                  )
                  // Product and SKU: locked once both are matched - open in edit mode, or while still to choose.
                  const productLocked = !editing && isProductMapped(slot)
                  return (
                    <tr key={line.index} className="border-t border-border">
                      <td className={cn(tdBox, 'min-w-48')}>
                        <ProductChoice id={`${key}-line-${line.index}-product`} slot={slot} products={products} onChoose={choose} disabled={productLocked} />
                      </td>
                      {showSku ? (
                        <td className={cn(tdBox, 'min-w-36')}>
                          <SkuChoice id={`${key}-line-${line.index}-sku`} slot={slot} allSkus={allSkus} onChoose={choose} disabled={productLocked} />
                        </td>
                      ) : null}
                      <td className={cn(tdBox, 'min-w-24')}>{box('hsn', 'HSN/SAC')}</td>
                      <td className={cn(tdBox, 'min-w-20')}>{box('quantity', 'Quantity', { numeric: true })}</td>
                      <td className={cn(tdBox, 'min-w-20')}>{box('discount', 'Discount %', { numeric: true })}</td>
                      {taxColumns.length > 0 ? (
                        taxColumns.map((column) =>
                          // Only the tax this line is charged with; the other is not applicable to it.
                          column.kind === kind ? (
                            <td key={column.field} className={cn(tdBox, 'min-w-24')}>
                              {box(column.field, `${column.label} %`, { numeric: true })}
                              <span className="mt-0.5 block text-right text-[11px] text-muted-foreground tabular-nums" data-testid={`${key}-line-${line.index}-${column.field}-amount`}>
                                {amountText(shown[column.amount])}
                              </span>
                            </td>
                          ) : (
                            <td key={column.field} className={cn(td, num, 'text-muted-foreground')}>
                              --
                            </td>
                          ),
                        )
                      ) : (
                        <td className={cn(td, num, 'text-muted-foreground')}>--</td>
                      )}
                      <td className={cn(tdBox, 'min-w-24')}>{box('rate', 'Rate', { numeric: true })}</td>
                      <td className={cn(tdBox, 'min-w-20')}>{box('unit', 'Unit')}</td>
                      <td className={cn(tdBox, 'min-w-28')}>{box('amount', 'Amount', { numeric: true })}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ---- Service Details ---- */}
      {voucher.services.length > 0 ? (
        <section className="space-y-1.5 border-t border-border pt-3" aria-label="Service Details">
          <SectionTitle count={voucher.services.length}>Service Details</SectionTitle>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="bg-brand-soft/60">
                <tr>
                  <th className={th}>Service Name</th>
                  <th className={th}>HSN/SAC</th>
                  <th className={cn(th, num)}>Qty</th>
                  <th className={cn(th, num)}>Disc %</th>
                  <th className={cn(th, num)}>{serviceTax}</th>
                  <th className={cn(th, num)}>Rate</th>
                  <th className={cn(th, num)}>Amount</th>
                  <th className={cn(th, 'min-w-48')}>Service Ledger</th>
                </tr>
              </thead>
              <tbody>
                {mapping.services.map((slot) => (
                  <tr key={slot.line.index} className="border-t border-border">
                    <td className={cn(td, 'max-w-44')}>
                      <span className="block truncate font-medium" title={slot.line.name}>
                        {slot.line.name || '--'}
                      </span>
                      {slot.line.description ? (
                        <span className="block truncate text-[11px] text-muted-foreground" title={slot.line.description}>
                          {slot.line.description}
                        </span>
                      ) : null}
                    </td>
                    <td className={td}>{slot.line.hsn || '--'}</td>
                    <td className={cn(td, num)}>{numberText(slot.line.quantity)}</td>
                    <td className={cn(td, num)}>{percentText(slot.line.discount)}</td>
                    <td className={cn(td, num, 'whitespace-nowrap')}>{taxText(slot.line)}</td>
                    <td className={cn(td, num)}>{amountText(slot.line.rate)}</td>
                    <td className={cn(td, num)}>{amountText(slot.line.amount)}</td>
                    <td className={slot.status === MAPPING_STATUS.MATCHED ? td : tdBox}>
                      {slot.status === MAPPING_STATUS.MATCHED ? (
                        <Found title={slot.ledgerName}>{slot.ledgerName}</Found>
                      ) : (
                        <LedgerChoice
                          id={`${key}-service-${slot.line.index}`}
                          slot={slot}
                          ledgers={ledgers}
                          onChange={(value) => onChoose({ line: [slot.line.index, value] })}
                          disabled={!editing && resolved(slot.status)}
                          missingText={`Ledger "${slot.line.name}" is not in the ledger list - select one.`}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ---- Charges, then the GST charges - kept apart ---- */}
      {voucher.charges.length > 0 ? (
        <section className="space-y-1.5 border-t border-border pt-3" aria-label="Charges">
          <SectionTitle>Charges</SectionTitle>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[460px] border-collapse">
              <thead className="bg-brand-soft/60">
                <tr>
                  <th className={cn(th, 'w-32')}>Document Date</th>
                  <th className={cn(th, 'min-w-44')}>Charges Ledger</th>
                  {/* TEMPORARILY HIDDEN - GST column (restore with its <td> below):
                  <th className={th}>GST</th> */}
                  <th className={cn(th, num, 'w-36')}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {mapping.charges.map((slot) => (
                  <tr key={slot.charge.key} className="border-t border-border">
                    <td className={tdBox}>
                      <DateCell id={`${key}-charge-date-${idPart(slot.charge.key)}`} value={voucher.documentDate} />
                    </td>
                    <td className={tdBox}>
                      {/* The ledger the charge is under, found in the ledger list and
                          chosen; one that is not there is left for the user, never
                          swapped for another. */}
                      <LedgerChoice
                        id={`${key}-charge-${idPart(slot.charge.key)}`}
                        ariaLabel={`Ledger for ${slot.charge.label} ${slot.charge.ledgerName}`}
                        slot={slot}
                        ledgers={ledgers}
                        onChange={(value) => onChoose({ charge: [slot.charge.key, value] })}
                        missingText={`Ledger "${slot.charge.ledgerName}" is not in the ledger list - select one.`}
                      />
                    </td>
                    {/* TEMPORARILY HIDDEN - GST column (restore with its <th> above):
                    <td className={td}>
                      {slot.charge.gstRate !== null ? (
                        <span className="inline-flex rounded-full border border-brand/30 bg-brand-soft px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-brand">
                          GST {slot.charge.gstRate}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </td> */}
                    <td className={cn(tdBox, 'w-36')}>
                      <CellInput
                        id={`${key}-charge-amount-${idPart(slot.charge.key)}`}
                        label={`Amount - ${slot.charge.label} ${slot.charge.ledgerName}`}
                        numeric
                        locked={!editing}
                        className="font-semibold text-brand"
                        value={amountBox('charges', slot.charge.key, slot.charge.amount)}
                        onChange={(value) => onChoose({ edit: ['charges', slot.charge.key, value] })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {voucher.gstLedgers.length > 0 ? (
        <section className="space-y-1.5 border-t border-border pt-3" aria-label="GST Charges">
          <SectionTitle>GST Charges</SectionTitle>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[460px] border-collapse">
              <thead className="bg-brand-soft/60">
                <tr>
                  <th className={cn(th, 'w-32')}>Document Date</th>
                  {/* TEMPORARILY HIDDEN - GST Slab and GST Ledger columns (restore with their <td>s below):
                  <th className={th}>GST Slab</th>
                  <th className={th}>GST Ledger</th> */}
                  <th className={cn(th, 'min-w-44')}>Tax Ledger</th>
                  <th className={cn(th, num, 'w-36')}>Tax Amount</th>
                </tr>
              </thead>
              <tbody>
                {mapping.gstGroups.map((group) => {
                  const first = group.slots[0].entry
                  const sources = group.sourceNames.join(', ')
                  return (
                    <tr key={group.key} className="border-t border-border">
                      <td className={tdBox}>
                        <DateCell id={`${key}-gst-date-${idPart(first.key)}`} value={voucher.documentDate} />
                      </td>
                      {/* TEMPORARILY HIDDEN - GST Slab and GST Ledger columns (restore with their <th>s above):
                      <td className={cn(td, 'whitespace-nowrap')}>{group.slabs.length > 0 ? group.slabs.map((slab) => `${slab}%`).join(', ') : '--'}</td>
                      <td className={cn(td, 'max-w-36')}>
                        <span className="block truncate font-medium" title={sources}>
                          {sources}
                        </span>
                        {group.slots.length > 1 ? <span className="block text-[11px] text-muted-foreground">{group.slots.length} slabs on one ledger</span> : null}
                      </td> */}
                      <td className={tdBox}>
                        {/* Merged rows share one ledger - a new one applies to every slab of the row. */}
                        <LedgerChoice
                          id={`${key}-gst-${idPart(first.key)}`}
                          ariaLabel={`Ledger for ${sources}`}
                          slot={group}
                          ledgers={ledgers}
                          onChange={(value) => group.slots.forEach((slot) => onChoose({ charge: [slot.entry.key, value] }))}
                          missingText={`Ledger "${first.ledgerName}" is not in the ledger list - select one.`}
                        />
                      </td>
                      <td className={cn(tdBox, 'w-36')}>
                        <CellInput
                          id={`${key}-gst-amount-${idPart(first.key)}`}
                          label={`Tax amount - ${sources}`}
                          numeric
                          // A merged row's total is its slabs' amounts, saved slab by slab - not typed as one.
                          locked={!editing || group.slots.length > 1}
                          title={editing && group.slots.length > 1 ? 'The total of several slabs on one ledger - it cannot be edited as one amount' : undefined}
                          value={amountBox('gst', group.key, group.amount)}
                          onChange={(value) => onChoose({ edit: ['gst', group.key, value] })}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {voucher.note ? (
        <p className="truncate text-xs text-muted-foreground" title={voucher.note}>
          <span className="font-semibold text-brand">Note: </span>
          {voucher.note}
        </p>
      ) : null}

      {/* ---- the voucher's actions - at the bottom of the card ---- */}
      {footer ? <div className="border-t border-border pt-3">{footer}</div> : null}
    </article>
  )
}
