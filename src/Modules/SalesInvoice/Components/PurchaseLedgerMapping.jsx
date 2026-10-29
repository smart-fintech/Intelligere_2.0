import { useMemo, useState } from 'react'
import { ArrowDownUp, Trash2 } from 'lucide-react'

import { RetryButton } from '@/Components/Common/DataList'
import { Field, SelectField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import { toast } from '@/Library/toast'

/**
 * PURCHASE INVOICE'S MAPPING - a keyword, and the product or ledger it
 * stands for (Assign Ledger / Assign Product):
 *
 *   Product | Ledger   what the dropdown lists - the company's product names
 *                      (no SKU codes; each name once) or its ledger names.
 *                      Switching empties the choice, so a product is never
 *                      saved as a ledger or the other way round.
 *   keyword            typed as it is - the mapping's key; a GST key ("cgst",
 *                      "sgst_6") is still read as the GST ledger mapping
 *                      (Utils/gstLedgers)
 *
 * Submit saves { keyword: name } (invoice/document-mapping/, as
 * purchase_mapping); the table below - Keyword and the name it is mapped to - is
 * only what the server answered, read again after each save or delete.
 *
 *   mappings   useDocumentMappings(companyId, 'Purchase Invoice')
 *   ledgers    { options, status } - the company's ledgers
 *   products   { options, status } - the company's products (inventory/product/)
 */

const MODE = Object.freeze({ PRODUCT: 'product', LEDGER: 'ledger' })
const MODES = [
  { value: MODE.PRODUCT, label: 'Product' },
  { value: MODE.LEDGER, label: 'Ledger' },
]

/** Names as options - each name once, the name the value (mappings are sent by name). */
const nameOptions = (options) =>
  [...new Set(options.map((option) => String(option.label ?? '').trim()).filter(Boolean))].map((name) => ({ value: name, label: name }))

const loadingOf = (list) => list.status === 'loading' || list.status === 'idle'

export default function PurchaseLedgerMapping({ mappings, ledgers, products, disabled }) {
  const [mode, setMode] = useState(MODE.LEDGER)
  const [keyword, setKeyword] = useState('')
  const [choice, setChoice] = useState('')
  const [errors, setErrors] = useState({})
  const [removing, setRemoving] = useState(null)

  const ledgerOptions = useMemo(() => nameOptions(ledgers.options), [ledgers.options])
  const productOptions = useMemo(() => nameOptions(products.options), [products.options])
  const isProduct = mode === MODE.PRODUCT
  const noun = isProduct ? 'Product' : 'Ledger'
  const list = isProduct ? products : ledgers
  const options = isProduct ? productOptions : ledgerOptions
  const busy = disabled || mappings.busy

  const submit = async () => {
    if (busy) return
    const key = keyword.trim()
    const found = {}
    if (!key) found.keyword = 'Enter the keyword'
    // Only a name the list on screen still has.
    if (!choice || !options.some((option) => option.value === choice)) found.choice = `Select the ${noun.toLowerCase()}`
    setErrors(found)
    if (Object.keys(found).length > 0) return

    try {
      await mappings.save(key, choice)
      setKeyword('')
      setChoice('')
    } catch (failure) {
      toast.error(failure.message)
    }
  }

  const remove = async (row) => {
    setRemoving(row.key)
    try {
      await mappings.remove(row)
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* ---- Assign ---- */}
      <section className="rounded-md border border-border" aria-label={`Assign ${noun}`}>
        <p className="border-b border-border px-3 py-2 text-center text-sm font-semibold text-brand">Assign {noun}</p>
        <div className="space-y-2 p-3">
          <RadioGroup
            value={mode}
            onValueChange={(next) => {
              if (next === mode) return
              setMode(next)
              setChoice('')
              setErrors((previous) => ({ ...previous, choice: undefined }))
            }}
            aria-label="Map the keyword to"
            className="mx-auto flex w-fit items-center gap-1 rounded-md border border-border p-0.5"
          >
            {MODES.map((option) => (
              <Label
                key={option.value}
                htmlFor={`purchase-mapping-${option.value}`}
                className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
                  mode === option.value ? 'bg-brand-soft font-semibold text-brand' : 'text-muted-foreground hover:text-brand'
                }`}
              >
                <RadioGroupItem id={`purchase-mapping-${option.value}`} value={option.value} disabled={busy} />
                {option.label}
              </Label>
            ))}
          </RadioGroup>

          <Field
            id="purchase-mapping-keyword"
            aria-label="Keyword"
            placeholder="Enter Keyword"
            value={keyword}
            error={errors.keyword}
            disabled={busy}
            onChange={(event) => {
              setKeyword(event.target.value)
              setErrors((previous) => ({ ...previous, keyword: undefined }))
            }}
          />
          <div className="flex justify-center text-brand" aria-hidden="true">
            <ArrowDownUp className="size-4" />
          </div>
          <SelectField
            id="purchase-mapping-choice"
            ariaLabel={noun}
            searchable
            searchPlaceholder={`Search ${noun.toLowerCase()}`}
            placeholder={loadingOf(list) ? `Loading ${noun.toLowerCase()}s...` : options.length === 0 ? `No ${noun.toLowerCase()}s` : `Select a ${noun}`}
            options={options}
            value={choice}
            error={errors.choice}
            disabled={busy || options.length === 0}
            onValueChange={(value) => {
              if (!value) return
              setChoice(value)
              setErrors((previous) => ({ ...previous, choice: undefined }))
            }}
          />
          {list.status === 'failed' ? (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              The {noun.toLowerCase()}s could not be loaded. {list.retry ? <RetryButton onClick={list.retry} /> : null}
            </div>
          ) : null}

          <div className="flex justify-center pt-1">
            <Button
              type="button"
              size="sm"
              className="bg-brand text-brand-foreground hover:bg-brand-dark hover:text-brand-foreground"
              loading={mappings.busy}
              disabled={disabled}
              onClick={submit}
            >
              Submit
            </Button>
          </div>
        </div>
      </section>

      {/* ---- What the server holds ---- */}
      <section className="rounded-md border border-border" aria-label="Saved mappings">
        {mappings.status === 'failed' ? (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            The mappings could not be loaded. <RetryButton onClick={mappings.reload} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-brand-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Keyword</th>
                  {/* The answer does not say which a name is - a row may be either. */}
                  <th className="px-3 py-2 font-medium">Ledger / Product</th>
                  <th className="w-10 px-3 py-2">
                    <span className="sr-only">Delete</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {mappings.rows.map((row) => (
                  <tr key={row.key} className="border-t border-border text-brand" data-testid="purchase-mapping-row">
                    <td className="px-3 py-2 break-words">{row.key}</td>
                    <td className="px-3 py-2 break-words">{row.value}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="iconDelete"
                        size="icon-xs"
                        icon={Trash2}
                        tooltip="Delete mapping"
                        aria-label={`Delete mapping ${row.key}`}
                        loading={removing === row.key}
                        disabled={busy}
                        onClick={() => remove(row)}
                      />
                    </td>
                  </tr>
                ))}
                {mappings.rows.length === 0 ? (
                  <tr className="border-t border-border">
                    <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground">
                      {mappings.status === 'ready' ? 'No keywords mapped yet.' : 'Loading...'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
