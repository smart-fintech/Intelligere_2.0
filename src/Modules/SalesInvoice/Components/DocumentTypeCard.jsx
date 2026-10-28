import { Loader2 } from 'lucide-react'

import { RetryButton } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'
import { findDocumentType } from '@/Constants/salesInvoice'
import { InvoiceCard, InvoiceGrid } from '@/Modules/SalesInvoice/Components/InvoiceGrid'

/** Prefill From's "nothing" entry - Radix forbids "". */
const NO_SOURCE = '__none__'

const labelOf = (type) => findDocumentType(type)?.label ?? type

/**
 * Step 1's first card - the document being made, chosen before anything
 * else, since the number (invoice/last-document-number/), the GST ledger
 * mapping and the buyer's earlier products all depend on it.
 *
 *   documentTypes   getDocumentTypeAccess(company) - each type and whether
 *                   this company may make it
 *   locked          the document is already saved (only its PDF is still to
 *                   go) - its type can no longer change
 *   prefill         useDocumentPrefill(...) - Prefill From and Document No.,
 *                   shown only for a type that has sources (none: Debit Note,
 *                   the purchase types; nor while editing or once saved)
 *
 * A type the company's plan does not include is listed but cannot be
 * chosen, and choosing it any other way is refused here too.
 */
export default function DocumentTypeCard({ invoice, documentTypes, locked, disabled, prefill = null }) {
  const { form, errors, setField } = invoice
  const offersPrefill = Boolean(prefill) && prefill.sources.length > 0 && !locked
  const list = prefill?.list
  const sourceLabel = prefill?.sourceType ? labelOf(prefill.sourceType) : ''

  return (
    <InvoiceCard title="Document Type">
      <InvoiceGrid className="items-end">
        <SelectField
          id="document-type"
          label="Document Type"
          required
          placeholder="Select Document Type"
          options={documentTypes.map((type) => ({
            value: type.value,
            label: type.enabled ? type.label : `${type.label} (not in plan)`,
            disabled: !type.enabled,
            title: type.enabled ? undefined : "Not included in this company's premium modules",
          }))}
          value={form.documentType}
          error={errors.documentType}
          disabled={disabled || locked}
          onValueChange={(next) => {
            if (documentTypes.some((type) => type.value === next && type.enabled)) setField('documentType', next)
          }}
        />
        {offersPrefill ? (
          <>
            <SelectField
              id="prefill-source"
              label="Prefill From"
              placeholder="Select source document"
              options={[{ value: NO_SOURCE, label: 'None' }, ...prefill.sources.map((type) => ({ value: type, label: labelOf(type) }))]}
              value={prefill.sourceType}
              disabled={disabled}
              onValueChange={(next) => next && prefill.chooseSource(next === NO_SOURCE ? '' : next)}
            />
            {prefill.sourceType ? (
              <SelectField
                id="prefill-document"
                label="Document No."
                searchable
                searchPlaceholder={`Search ${sourceLabel}`}
                placeholder={
                  list.status === 'loading'
                    ? 'Loading documents...'
                    : list.status === 'failed'
                      ? 'Could not load the documents'
                      : list.rows.length === 0
                        ? `No ${sourceLabel} documents`
                        : `Select ${sourceLabel}`
                }
                options={list.rows.map((row) => ({
                  value: String(row.documentId),
                  label: row.buyerName ? `${row.documentNo} - ${row.buyerName}` : row.documentNo,
                }))}
                value={prefill.documentId}
                error={list.status === 'failed' ? list.error : undefined}
                // Another choice while one is loading is fine - the late answer is dropped (useDocumentPrefill).
                disabled={disabled || list.status !== 'ready' || list.rows.length === 0}
                onValueChange={(next) => next && prefill.chooseDocument(next)}
              />
            ) : null}
          </>
        ) : null}
      </InvoiceGrid>
      {offersPrefill && list.status === 'failed' ? (
        <div className="mt-2 flex justify-end">
          <RetryButton onClick={prefill.retryList} />
        </div>
      ) : null}
      {offersPrefill && prefill.loadingDocument ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" role="status" data-testid="prefill-loading">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Loading the {sourceLabel} to fill in the form...
        </p>
      ) : null}
    </InvoiceCard>
  )
}
