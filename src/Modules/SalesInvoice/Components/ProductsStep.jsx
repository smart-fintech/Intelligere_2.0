import { Check, Plus, Trash2, X } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { CheckboxField, Field, FieldError, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import { GST_RATES } from '@/Constants/gst'
import { formatINR } from '@/Modules/Payment/pricing'
import ChargeLedgerSac from '@/Modules/SalesInvoice/Components/ChargeLedgerSac'
import { InvoiceCard, InvoiceGrid, WIDE_FIELD } from '@/Modules/SalesInvoice/Components/InvoiceGrid'
import GstLedgerMapping from '@/Modules/SalesInvoice/Components/GstLedgerMapping'
import PurchaseLedgerMapping from '@/Modules/SalesInvoice/Components/PurchaseLedgerMapping'
import OrderProducts from '@/Modules/SalesInvoice/Components/OrderProducts'
import { entryFromOrderRow } from '@/Modules/SalesInvoice/orderProducts'
import ProductEntry from '@/Modules/SalesInvoice/Components/ProductEntry'
import { AddedProducts, BuyerProducts } from '@/Modules/SalesInvoice/Components/ProductLists'
import { toast } from '@/Library/toast'
import { getLedgerSac } from '@/Services/ledgerService'
import { MAPPING_DOCUMENT_TYPE } from '@/Services/salesInvoiceService'
import { gstChargesByLedger } from '@/Utils/gstLedgers'
import {
  LINE_KIND,
  entryModeOf,
  documentProfile,
  isEntryDirty,
  isChallan,
  isServiceLine,
  lineFigures,
  lineFromExistingProduct,
  rateText,
  settingsOf,
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
 * Step 4 - Product Details (or, with its box ticked, GST Ledger Mapping in
 * its place), and Other Details under it.
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
 *   showMapping     the document charges GST (every type but Challan) - the mapping box is offered
 *   mappingType     whose mappings they are (MAPPING_DOCUMENT_TYPE): Sales Invoice's are
 *                   GST tax + rate -> ledger (GstLedgerMapping); Purchase Invoice's a
 *                   keyword -> product or ledger (PurchaseLedgerMapping)
 *   chargeSac       Sales Invoice only - an Other Charges ledger without a SAC
 *                   number is marked under its row (ChargeLedgerSac), with Add
 *                   SAC on Intelligere and what to do in Tally on Tally
 *   orders          useOrderProducts(...) - a type that takes its party's order
 *                   products (Challan, Inbound Challan, Purchase Invoice) lists
 *                   them above Product Details (OrderProducts); a + fills the
 *                   entry form, as an earlier product's does
 *   partyLabel      whose orders they are - 'buyer' / 'supplier'
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
 * The GST this invoice charges, one row per ledger it is posted to - worked
 * out by the one rule in Utils/gstLedgers (GST mapping, else the ledger for
 * that rate, else the tax's basic ledger), never chosen here, so it is the
 * same ledger the preview names. Rates on one ledger are one row, their
 * amounts added (CGST 2.5% and 6% on a common "CGST"); a tax and rate with
 * no ledger is a row of its own, marked - the box under this card says what
 * to create, and Save is refused until it exists.
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
            {gstChargesByLedger(entries).map((charge) => (
              <tr key={charge.entries.map((entry) => `${entry.tax}|${entry.rate}`).join(',')} className="border-t border-border" data-testid="gst-ledger-row">
                <td className="px-2 py-1.5">{charge.entries.map((entry) => `${entry.tax} ${rateText(entry.rate)}%`).join(', ')}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatINR(charge.paise)}</td>
                <td className="px-2 py-1.5">
                  {charge.ledger ? (
                    <>
                      {charge.ledger}{' '}
                      <span className="text-[11px] text-muted-foreground">
                        ({[...new Set(charge.entries.map((entry) => SOURCE_LABEL[sourceOf(entry)]))].join(', ')})
                      </span>
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
  mappingType = MAPPING_DOCUMENT_TYPE.SALES,
  // Sales Invoice: { erp, companyId, onSaved(chargeId) } - each charge's ledger needs a SAC; null elsewhere.
  chargeSac = null,
  orders = null,
  partyLabel = 'buyer',
  disabled,
}) {
  const { form, errors, setErrors, setField, updateEntry, commitEntry, editLine, cancelEntry, removeLine, setEntryMode } = invoice
  const { addCharge, updateCharge, removeCharge } = invoice
  const interState = figures.tax.interState
  const challan = isChallan(form)
  // What this document type has (documentProfile): services, With Discount, its Other Details sections.
  const profile = documentProfile(form)
  const settings = settingsOf(form)
  const withDiscount = profile.discount && form.withDiscount
  const has = (section) => profile.other.includes(section)
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
    reverseCharge: settings.reverseCharge,
    withDiscount,
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

  /** A row of the party's order products: into the entry form, at what it still has to deliver. */
  const fillFromOrder = (row) => {
    const next = entryFromOrderRow(row, { ledgers, products: products.list })
    if (!next) {
      toast.error(`${row.productName || 'That product'} is not in the ${row.raw?.product_type === 'Service' ? 'ledger' : 'product'} list.`)
      return
    }
    updateEntry(() => next, ['productKey', 'ledgerId', 'skuValue', 'hsn', 'quantity', 'rate', 'gstRate', 'discount'])
  }

  return (
    <div className="space-y-3">
      {orders?.source && !mappingOpen ? <OrderProducts orders={orders} partyLabel={partyLabel} disabled={disabled} onFill={fillFromOrder} /> : null}
      <InvoiceCard
        title={mappingOpen ? 'GST Ledger Mapping' : 'Product Details'}
        actions={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Product / Service - what a new line is entered as. Not offered
                while Reverse Charge Applicable is ticked (then it is Service), nor
                by a type that takes products only (Challan). */}
            {!mappingOpen && !settings.reverseCharge && profile.services ? (
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
            {/* Every type that charges GST. Switching the view never touches the products. */}
            {showMapping ? (
              <CheckboxField
                id="gst-ledger-mapping"
                label="GST Ledger Mapping"
                checked={form.gstLedgerMapping}
                disabled={disabled}
                onCheckedChange={(checked) => setField('gstLedgerMapping', checked)}
              />
            ) : null}
            {/* The products' own Disc. % only - never the Other Charges discount.
                Only where the type takes discounts (not Challan, Sales / Purchase Order, Quotation). */}
            {!profile.discount ? null : (
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
        {mappingOpen && mappingType === MAPPING_DOCUMENT_TYPE.PURCHASE ? (
          <PurchaseLedgerMapping mappings={mappings} ledgers={ledgers} products={products} disabled={disabled} />
        ) : mappingOpen ? (
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
              withDiscount={withDiscount}
              challan={challan}
              errors={errors}
              disabled={disabled}
              onUpdate={updateEntry}
            />

            <div className="flex flex-wrap items-center justify-end gap-2">
              {editing || isEntryDirty(form.entry) ? (
                <Button type="button" variant="outline" size="sm" icon={X} disabled={disabled} onClick={cancelEntry}>
                  {editing ? 'Cancel Edit' : 'Clear'}
                </Button>
              ) : null}
              <Button type="button" variant="secondary" size="sm" icon={editing ? Check : Plus} disabled={disabled} onClick={commit}>
                {editing ? 'Update Product' : 'Add Product'}
              </Button>
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

      {/* Only the Other Details sections this type has (documentProfile's
          `other`) - a challan has none, so no card at all. */}
      {profile.other.length === 0 ? null : (
        <InvoiceCard
          title="Other Details"
          actions={
            has('charges') ? (
              <Button type="button" variant="outline" size="sm" icon={Plus} disabled={disabled} onClick={addCharge}>
                Add Other Charges
              </Button>
            ) : null
          }
        >
          {ledgers.status === 'failed' ? (
            <InlineAlert action={<RetryButton onClick={ledgers.retry} />}>
              {ledgers.error || 'The ledgers could not be loaded.'}
            </InlineAlert>
          ) : null}

          {/* ---- Other Charges: one compact row each ---- */}
          {(has('charges') ? form.charges : []).map((charge, index) => {
            const tax = figures.charges[charge.id]
            const taxPaise = tax.cgstPaise + tax.sgstPaise + tax.igstPaise
            // Sales Invoice: the chosen ledger must have a SAC number (saved as ledger_sac).
            const chargeLedger = chargeSac && charge.ledgerId ? ledgers.byId.get(String(charge.ledgerId)) : null
            return (
              <div key={charge.id} className="mb-2 flex items-start gap-2 border-b border-border pb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-2 [&>*]:min-w-0">
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
                  {chargeLedger && !getLedgerSac(chargeLedger) ? (
                    <ChargeLedgerSac
                      key={charge.ledgerId}
                      id={charge.id}
                      ledger={chargeLedger}
                      erp={chargeSac.erp}
                      companyId={chargeSac.companyId}
                      disabled={disabled}
                      onSaved={() => chargeSac.onSaved(charge.id)}
                    />
                  ) : null}
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
                taxable value. Here wherever the type has it - the With Discount
                box above is the products' own Disc. % and has no say over it. */}
            {has('discount') ? (
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
            ) : null}

            {has('tcs') ? (
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
            ) : null}
            {/* Round off is worked out, not typed. Its ledger is here, just before
                the Note, whenever the document rounds (settingsOf: Show Round Off
                on a Sales Invoice, always on a Sales Order, the company's setting
                elsewhere) - 0.00 when there is none, and then not required. With
                Show Round Off unticked there is no round off, so no section (a
                challan has no Other Details at all). */}
            {has('roundOff') && settings.roundOff ? (
              <LedgerSection
                name="roundOff"
                ledgerLabel="Round Off Ledger"
                required={figures.roundOffPaise !== 0}
                invoice={invoice}
                ledgerOptions={ledgers.options}
                ledgerPlaceholder={ledgerPlaceholder}
                disabled={disabled}
              >
                <Field id="roundOff-amount" label="Round Off" readOnly disabled value={plainAmount(figures.roundOffPaise)} />
              </LedgerSection>
            ) : null}
            {has('note') ? (
              <TextareaField
                id="invoice-note"
                label="Note"
                rows={2}
                className={WIDE_FIELD}
                value={form.note}
                disabled={disabled}
                onChange={(event) => setField('note', event.target.value)}
              />
            ) : null}
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
