import { Check, Plus, Trash2, X } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { CheckboxField, Field, FieldError, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import { GST_RATES } from '@/Constants/gst'
import { formatINR } from '@/Modules/Payment/pricing'
import { InvoiceCard, InvoiceGrid, WIDE_FIELD } from '@/Modules/SalesInvoice/Components/InvoiceGrid'
import GstLedgerMapping from '@/Modules/SalesInvoice/Components/GstLedgerMapping'
import ProductEntry from '@/Modules/SalesInvoice/Components/ProductEntry'
import { AddedProducts, BuyerProducts } from '@/Modules/SalesInvoice/Components/ProductLists'
import { toast } from '@/Library/toast'
import {
  LINE_KIND,
  entryModeOf,
  isEntryDirty,
  isChallan,
  isServiceLine,
  lineFigures,
  lineFromExistingProduct,
  rateText,
  toDecimalInput,
  validateEntry,
} from '@/Modules/SalesInvoice/salesInvoiceForm'

const GST_RATE_OPTIONS = GST_RATES.map((rate) => ({ value: rate, label: `${rate}%` }))

/** The Product / Service choice in the Product Details heading. */
const ENTRY_MODES = [
  { value: LINE_KIND.PRODUCT, label: 'Product' },
  { value: LINE_KIND.SERVICE, label: 'Service' },
]

/**
 * Step 4 - Product Details (or, for Sales Invoice with its box ticked, GST
 * Ledger Mapping in its place), and Other Details under it.
 *
 * Products are typed into ONE entry form; Add Product makes it a line of the
 * invoice and empties the form for the next. The lines are what the preview,
 * the totals and the saved document read - the entry form never is.
 *
 *   products   { list, options, byKey, status, error, retry } - inventory/
 *              product/ through useProducts, read by readProducts
 *   ledgers    { options, status, error, retry } - the company's ledgers,
 *              the same list the buyer is chosen from
 *   figures    invoiceFigures(form)
 *   mappings   useDocumentMappings(...) - the GST ledger mappings
 *   gstLedgers gstByRate(figures) with each entry's ledger
 *              (resolveGstLedgers, Utils/gstLedgers) - the GST this invoice charges, listed under
 *              Other Details with the ledger each is posted to
 *   buyerProducts   useBuyerProducts(...) - the buyer's earlier products
 *   showMapping     the document is a Sales Invoice - the mapping box is offered
 */

/** Paise as a plain "1234.50" - for a read-only amount box. */
const plainAmount = (paise) => (Math.round(paise || 0) / 100).toFixed(2)

/**
 * A "ledger + value" section of Other Details - Discount, Round Off, TCS - as
 * one column: the ledger, and under it what that ledger is for (`children`).
 */
function LedgerSection({ name, ledgerLabel, required, invoice, ledgerOptions, ledgerPlaceholder, disabled, children }) {
  const { form, errors, setField } = invoice

  return (
    <div className="space-y-2">
      <SelectField
        id={`${name}-ledger`}
        label={ledgerLabel}
        required={required}
        searchable
        searchPlaceholder="Search ledger"
        placeholder={ledgerPlaceholder}
        options={ledgerOptions}
        value={form[name].ledgerId}
        error={errors[`${name}.ledgerId`]}
        disabled={disabled || ledgerOptions.length === 0}
        onValueChange={(value) => setField(`${name}.ledgerId`, value)}
      />
      {children}
    </div>
  )
}

/** Where a row's ledger came from (Utils/gstLedgers' order). */
const SOURCE_LABEL = { mapping: 'GST mapping', matched: 'matched by rate', basic: 'basic ledger' }
const sourceOf = (entry) => (entry.source === 'mapping' ? 'mapping' : entry.basic ? 'basic' : 'matched')

/**
 * The GST this invoice charges, one row per tax and rate, and the ledger
 * each is posted to - worked out by the one rule in Utils/gstLedgers (GST
 * mapping, else the ledger for that rate, else the tax's basic ledger), never
 * chosen here, so it is the same ledger the preview names. A row with none is
 * marked; the box under this card says what to create, and Save is refused
 * until it exists.
 *
 *   entries   resolveGstLedgers(...) - [] while nothing is charged
 *   check     the workspace's gstCheck - { status } of the two lists it needs
 */
function GstLedgers({ entries, check, showMapping, onOpenMapping, disabled }) {
  const status = check?.status ?? 'loading'
  const known = status === 'ok' || status === 'missing'

  return (
    <div className="mt-3 space-y-1.5 border-t border-border pt-2.5">
      <p className="text-xs font-semibold tracking-wide text-brand uppercase">GST ledgers</p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-medium">GST</th>
              <th className="px-2 py-1.5 text-right font-medium">Amount</th>
              <th className="px-2 py-1.5 font-medium">Ledger</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={`${entry.tax}|${entry.rate}`} className="border-t border-border">
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {entry.tax} {rateText(entry.rate)}%
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatINR(entry.paise)}</td>
                <td className="px-2 py-1.5">
                  {entry.ledger ? (
                    <>
                      {entry.ledger}{' '}
                      <span className="text-[11px] text-muted-foreground">({SOURCE_LABEL[sourceOf(entry)]})</span>
                    </>
                  ) : known ? (
                    <span className="text-xs font-medium text-destructive">No ledger - create it first</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{status === 'failed' ? '--' : 'Loading...'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showMapping ? (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onOpenMapping}>
            Open GST Ledger Mapping
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default function ProductsStep({
  invoice,
  products,
  ledgers,
  figures,
  mappings,
  // [] when the workspace has nothing charged yet (or does not pass them).
  gstLedgers = [],
  gstCheck,
  buyerProducts,
  showMapping,
  disabled,
}) {
  const { form, errors, setErrors, setField, updateEntry, commitEntry, editLine, cancelEntry, removeLine, setEntryMode } = invoice
  const { addCharge, updateCharge, removeCharge } = invoice
  const interState = figures.tax.interState
  const challan = isChallan(form)
  const editing = Boolean(form.editingLineId)
  const mappingOpen = showMapping && form.gstLedgerMapping

  const ledgerPlaceholder =
    ledgers.status === 'loading' || ledgers.status === 'idle'
      ? 'Loading ledgers...'
      : ledgers.options.length === 0
        ? 'No ledgers'
        : 'Select Ledger'

  // The Amount box of the entry form - the same line rule the invoice uses.
  const entryFigures = lineFigures(form.entry, {
    interState,
    reverseCharge: form.settings.reverseCharge,
    withDiscount: form.withDiscount,
  })

  /** Add Product / Update: check the entry, then make it a line; the form empties for the next. */
  const commit = () => {
    const found = validateEntry(form, { productsByKey: products.byKey, ledgersById: ledgers.byId })
    if (Object.keys(found).length > 0) {
      setErrors((previous) => ({ ...previous, ...found }))
      return
    }
    commitEntry()
  }

  /** A row of the buyer's earlier products: into the entry form, never straight onto the invoice. */
  const pick = (row) => {
    const next = lineFromExistingProduct(form.entry, row, products.list)
    if (!next) {
      toast.error('That product is no longer in the product list.')
      return
    }
    updateEntry(() => next, ['productKey', 'skuValue', 'hsn', 'rate', 'gstRate'])
  }

  return (
    <div className="space-y-3">
      <InvoiceCard
        title={mappingOpen ? 'GST Ledger Mapping' : 'Product Details'}
        actions={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Product / Service - what a new line is entered as. Not offered
                while Reverse Charge Applicable is ticked: then it is Service. */}
            {!mappingOpen && !form.settings.reverseCharge && !challan ? (
              <RadioGroup
                value={entryModeOf(form)}
                onValueChange={setEntryMode}
                aria-label="Line type"
                className="flex items-center gap-1 rounded-md border border-border p-0.5"
              >
                {ENTRY_MODES.map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`entry-mode-${option.value}`}
                    className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
                      entryModeOf(form) === option.value ? 'bg-brand-soft font-semibold text-brand' : 'text-muted-foreground hover:text-brand'
                    }`}
                  >
                    <RadioGroupItem id={`entry-mode-${option.value}`} value={option.value} disabled={disabled} />
                    {option.label}
                  </Label>
                ))}
              </RadioGroup>
            ) : null}
            {/* Sales Invoice only. Switching the view never touches the products. */}
            {showMapping ? (
              <CheckboxField
                id="gst-ledger-mapping"
                label="GST Ledger Mapping"
                checked={form.gstLedgerMapping}
                disabled={disabled}
                onCheckedChange={(checked) => setField('gstLedgerMapping', checked)}
              />
            ) : null}
            {/* The products' own Disc. % only - never the Other Charges discount. A challan has no discount. */}
            {challan ? null : (
              <CheckboxField
                id="with-discount"
                label="With Discount"
                checked={form.withDiscount}
                disabled={disabled}
                onCheckedChange={(checked) => setField('withDiscount', checked)}
              />
            )}
          </div>
        }
      >
        {mappingOpen ? (
          <GstLedgerMapping mappings={mappings} ledgers={ledgers} disabled={disabled} />
        ) : (
          <div className="space-y-3">
            {products.status === 'failed' ? (
              <InlineAlert action={<RetryButton onClick={products.retry} />}>
                {products.error || 'The products could not be loaded.'}
              </InlineAlert>
            ) : null}

            <ProductEntry
              entry={form.entry}
              product={products.byKey.get(form.entry.productKey) ?? null}
              productOptions={products.options}
              productsByKey={products.byKey}
              productsLoading={products.status === 'loading'}
              ledgerOptions={ledgers.options}
              ledgersById={ledgers.byId}
              ledgersLoading={ledgers.status === 'loading' || ledgers.status === 'idle'}
              figures={entryFigures}
              withDiscount={!challan && form.withDiscount}
              challan={challan}
              errors={errors}
              disabled={disabled}
              onUpdate={updateEntry}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" icon={editing ? Check : Plus} disabled={disabled} onClick={commit}>
                {editing ? 'Update Product' : 'Add Product'}
              </Button>
              {editing || isEntryDirty(form.entry) ? (
                <Button type="button" variant="outline" size="sm" icon={X} disabled={disabled} onClick={cancelEntry}>
                  {editing ? 'Cancel Edit' : 'Clear'}
                </Button>
              ) : null}
            </div>

            <AddedProducts
              challan={challan}
              lines={form.lines}
              productsByKey={products.byKey}
              ledgersById={ledgers.byId}
              figures={figures.lines}
              editingLineId={form.editingLineId}
              errors={errors}
              disabled={disabled}
              onEdit={editLine}
              onRemove={removeLine}
            />
            <FieldError>{errors.lines}</FieldError>

            {/* The buyer's earlier products fill the product form - not offered for a service. */}
            {isServiceLine(form.entry) ? null : (
              <BuyerProducts status={buyerProducts.status} rows={buyerProducts.rows} disabled={disabled} onPick={pick} />
            )}
          </div>
        )}
      </InvoiceCard>

      {/* A challan has no Other Details - no charges, discount, round off, TCS or note. */}
      {challan ? null : (
        <InvoiceCard
          title="Other Details"
          actions={
            <Button type="button" variant="outline" size="sm" icon={Plus} disabled={disabled} onClick={addCharge}>
              Add Other Charges
            </Button>
          }
        >
          {ledgers.status === 'failed' ? (
            <InlineAlert action={<RetryButton onClick={ledgers.retry} />}>
              {ledgers.error || 'The ledgers could not be loaded.'}
            </InlineAlert>
          ) : null}

          {/* ---- Other Charges: one compact row each ---- */}
          {form.charges.map((charge, index) => {
            const tax = figures.charges[charge.id]
            const taxPaise = tax.cgstPaise + tax.sgstPaise + tax.igstPaise
            return (
              <div key={charge.id} className="mb-2 flex items-start gap-2 border-b border-border pb-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-2 gap-y-2 [&>*]:min-w-0">
                  <SelectField
                    id={`charge-${charge.id}-ledger`}
                    label={`Other Charges ${index + 1}`}
                    required
                    searchable
                    searchPlaceholder="Search ledger"
                    className="[flex:2_1_11rem]"
                    placeholder={ledgerPlaceholder}
                    options={ledgers.options}
                    value={charge.ledgerId}
                    error={errors[`charges.${charge.id}.ledgerId`]}
                    disabled={disabled || ledgers.options.length === 0}
                    onValueChange={(value) => updateCharge(charge.id, { ledgerId: value })}
                  />
                  <Field
                    id={`charge-${charge.id}-amount`}
                    label="Amount"
                    required
                    inputMode="decimal"
                    placeholder="0.00"
                    className="[flex:1_1_6rem]"
                    value={charge.amount}
                    error={errors[`charges.${charge.id}.amount`]}
                    disabled={disabled}
                    onChange={(event) => updateCharge(charge.id, { amount: toDecimalInput(event.target.value) })}
                  />
                  <SelectField
                    id={`charge-${charge.id}-gst`}
                    label="GST Slab"
                    placeholder="None"
                    className="[flex:1_1_6rem]"
                    options={GST_RATE_OPTIONS}
                    value={charge.gstRate}
                    disabled={disabled}
                    onValueChange={(value) => updateCharge(charge.id, { gstRate: value })}
                  />
                  <div className="[flex:1_1_6rem] pt-6 text-xs text-muted-foreground">
                    {taxPaise > 0
                      ? `${interState ? `IGST ${tax.igst}%` : `CGST ${tax.cgst}% + SGST ${tax.sgst}%`}: ${formatINR(taxPaise)}`
                      : null}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="iconDelete"
                  size="icon-sm"
                  icon={Trash2}
                  className="mt-5 shrink-0"
                  tooltip="Remove charge"
                  aria-label={`Remove other charges ${index + 1}`}
                  disabled={disabled}
                  onClick={() => removeCharge(charge.id)}
                />
              </div>
            )
          })}

          <InvoiceGrid>
            {/* The Other Charges discount: one overall amount off the products'
                taxable value. Always here - the With Discount box above is the
                products' own Disc. % and has no say over it. */}
            <LedgerSection
              name="discount"
              ledgerLabel="Discount Ledger"
              required={figures.discountPaise > 0}
              invoice={invoice}
              ledgerOptions={ledgers.options}
              ledgerPlaceholder={ledgerPlaceholder}
              disabled={disabled}
            >
              <Field
                id="discount-amount"
                label="Discount Amount"
                inputMode="decimal"
                placeholder="0.00"
                value={form.discount.amount}
                error={errors['discount.amount']}
                disabled={disabled}
                onChange={(event) => setField('discount.amount', toDecimalInput(event.target.value))}
              />
            </LedgerSection>

            {/* Round off is worked out, not typed - and a ledger is asked for
                only when there is one. */}
            {figures.roundOffPaise !== 0 ? (
              <LedgerSection
                name="roundOff"
                ledgerLabel="Round Off Ledger"
                required
                invoice={invoice}
                ledgerOptions={ledgers.options}
                ledgerPlaceholder={ledgerPlaceholder}
                disabled={disabled}
              >
                <Field id="roundOff-amount" label="Round Off" readOnly disabled value={plainAmount(figures.roundOffPaise)} />
              </LedgerSection>
            ) : null}

            <LedgerSection
              name="tcs"
              ledgerLabel="TCS Ledger"
              invoice={invoice}
              ledgerOptions={ledgers.options}
              ledgerPlaceholder={ledgerPlaceholder}
              disabled={disabled}
            >
              <Field
                id="tcs-amount"
                label="TCS Amount"
                inputMode="decimal"
                placeholder="0.00"
                value={form.tcs.amount}
                error={errors['tcs.amount']}
                disabled={disabled}
                onChange={(event) => setField('tcs.amount', toDecimalInput(event.target.value))}
              />
            </LedgerSection>
            <TextareaField
              id="invoice-note"
              label="Note"
              rows={2}
              className={WIDE_FIELD}
              value={form.note}
              disabled={disabled}
              onChange={(event) => setField('note', event.target.value)}
            />
          </InvoiceGrid>

          {gstLedgers.length > 0 ? (
            <GstLedgers
              entries={gstLedgers}
              check={gstCheck}
              showMapping={showMapping}
              disabled={disabled}
              onOpenMapping={() => {
                setField('gstLedgerMapping', true)
                // The mapping opens in the Product Details card, above.
                window.document.getElementById('gst-ledger-mapping')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
            />
          ) : null}
        </InvoiceCard>
      )}
    </div>
  )
}
