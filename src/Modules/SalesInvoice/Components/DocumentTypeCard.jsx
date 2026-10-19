import { SelectField } from '@/Components/Common/FormFields'
import { InvoiceCard, InvoiceGrid } from '@/Modules/SalesInvoice/Components/InvoiceGrid'

/**
 * Step 1's first card - the document being made, chosen before anything
 * else, since the number (invoice/last-document-number/), the GST ledger
 * mapping and the buyer's earlier products all depend on it.
 *
 *   documentTypes   getDocumentTypeAccess(company) - each type and whether
 *                   this company may make it
 *   locked          the document is already saved (only its PDF is still to
 *                   go) - its type can no longer change
 *
 * A type the company's plan does not include is listed but cannot be
 * chosen, and choosing it any other way is refused here too.
 */
export default function DocumentTypeCard({ invoice, documentTypes, locked, disabled }) {
  const { form, errors, setField } = invoice

  return (
    <InvoiceCard title="Document Type">
      <InvoiceGrid>
        <SelectField
          id="document-type"
          // label="Document Type"
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
      </InvoiceGrid>
    </InvoiceCard>
  )
}
