import { Check, Plus, Trash2, X } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { CheckboxField, Field, FieldError, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { GST_RATES } from '@/Constants/gst'
import { formatINR } from '@/Modules/Payment/pricing'
import { InvoiceCard, InvoiceGrid, WIDE_FIELD } from '@/Modules/SalesInvoice/Components/InvoiceGrid'
import GstLedgerMapping from '@/Modules/SalesInvoice/Components/GstLedgerMapping'
import ProductEntry from '@/Modules/SalesInvoice/Components/ProductEntry'
import { AddedProducts, BuyerProducts } from '@/Modules/SalesInvoice/Components/ProductLists'
import { toast } from '@/Library/toast'
import {
  isEntryDirty,
  lineFigures,
  lineFromExistingProduct,
  // rateText,
  toDecimalInput,
  validateEntry,
} from '@/Modules/SalesInvoice/salesInvoiceForm'

const GST_RATE_OPTIONS = GST_RATES.map((rate) => ({ value: rate, label: `${rate}%` }))

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

/**
 * The GST this invoice charges, one row per tax and rate, and the ledger
 * each is posted to - read from the saved GST ledger mappings, never chosen
 * here, so it is the same ledger the preview names. A tax with no mapping is
 * flagged, not refused: the invoice can still be saved, as before.
 */
// function GstLedgers({ entries, mappings, onOpenMapping, disabled }) {
//   const known = mappings.status === 'ready' || (mappings.status === 'loading' && mappings.ledgerMapping)
//   const missing = known ? entries.filter((entry) => !entry.ledger) : []

//   return (
//     <div className="mt-3 space-y-1.5 border-t border-border pt-2.5">
//       <p className="text-xs font-semibold tracking-wide text-brand uppercase">GST ledgers</p>
//       {mappings.status === 'failed' ? (
//         <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
//           The GST ledger mappings could not be loaded. <RetryButton onClick={mappings.reload} />
//         </div>
//       ) : null}
//       <div className="overflow-x-auto rounded-md border border-border">
//         <table className="w-full text-sm">
//           <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
//             <tr>
//               <th className="px-2 py-1.5 font-medium">GST</th>
//               <th className="px-2 py-1.5 text-right font-medium">Amount</th>
//               <th className="px-2 py-1.5 font-medium">Ledger</th>
//             </tr>
//           </thead>
//           <tbody>
//             {entries.map((entry) => (
//               <tr key={`${entry.tax}|${entry.rate}`} className="border-t border-border">
//                 <td className="px-2 py-1.5 whitespace-nowrap">
//                   {entry.tax} {rateText(entry.rate)}%
//                 </td>
//                 <td className="px-2 py-1.5 text-right tabular-nums">{formatINR(entry.paise)}</td>
//                 <td className="px-2 py-1.5">
//                   {entry.ledger ? (
//                     entry.ledger
//                   ) : known ? (
//                     <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Not mapped</span>
//                   ) : (
//                     <span className="text-xs text-muted-foreground">{mappings.status === 'failed' ? '--' : 'Loading...'}</span>
//                   )}
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//       {missing.length > 0 ? (
//         <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
//           No ledger is mapped for {missing.map((entry) => `${entry.tax} ${rateText(entry.rate)}%`).join(', ')}.
//           <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onOpenMapping}>
//             Open GST Ledger Mapping
//           </Button>
//         </div>
//       ) : null}
//     </div>
//   )
// }

export default function ProductsStep({
  invoice,
  products,
  ledgers,
  figures,
  mappings,
  // gstLedgers,
  buyerProducts,
  showMapping,
  disabled,
}) {
  const { form, errors, setErrors, setField, updateEntry, commitEntry, editLine, cancelEntry, removeLine } = invoice
  const { addCharge, updateCharge, removeCharge } = invoice
  const interState = figures.tax.interState
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
    const found = validateEntry(form, { productsByKey: products.byKey })
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
            {/* The products' own Disc. % only - never the Other Charges discount. */}
            <CheckboxField
              id="with-discount"
              label="With Discount"
              checked={form.withDiscount}
              disabled={disabled}
              onCheckedChange={(checked) => setField('withDiscount', checked)}
            />
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
              figures={entryFigures}
              withDiscount={form.withDiscount}
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
              lines={form.lines}
              productsByKey={products.byKey}
              figures={figures.lines}
              editingLineId={form.editingLineId}
              errors={errors}
              disabled={disabled}
              onEdit={editLine}
              onRemove={removeLine}
            />
            <FieldError>{errors.lines}</FieldError>

            <BuyerProducts status={buyerProducts.status} rows={buyerProducts.rows} disabled={disabled} onPick={pick} />
          </div>
        )}
      </InvoiceCard>

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
              label="Amount"
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

        {/* {showMapping && gstLedgers.length > 0 ? (
          <GstLedgers
            entries={gstLedgers}
            mappings={mappings}
            disabled={disabled}
            onOpenMapping={() => {
              setField('gstLedgerMapping', true)
              // The mapping opens in the Product Details card, above.
              window.document.getElementById('gst-ledger-mapping')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
          />
        ) : null} */}
      </InvoiceCard>
    </div>
  )
}
