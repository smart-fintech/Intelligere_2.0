import { RetryButton } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'

/**
 * A view-wide ledger pick above the table - Default Sales Ledger, Default
 * Party Ledger, a charge's ledger - with the states of the list behind it:
 * loading, empty, or failed (with Retry).
 *
 *   choices   { options, status, error, reload } - useSalesLedgerChoice / useCompanyLedgers
 */
export default function DefaultLedgerSelect({ id, label, choices, value, onChange, disabled, required, className = 'w-full sm:w-64' }) {
  const loading = (choices.status === 'loading' || choices.status === 'idle') && choices.options.length === 0
  return (
    <div className={className}>
      <SelectField
        id={id}
        label={label}
        required={required}
        searchable
        searchPlaceholder="Search ledger"
        placeholder={loading ? 'Loading ledgers...' : choices.options.length === 0 ? 'No ledgers found' : 'Select ledger'}
        options={choices.options}
        value={value}
        disabled={disabled || choices.options.length === 0}
        onValueChange={onChange}
        onClear={() => onChange('')}
      />
      {choices.status === 'failed' ? (
        <div className="mt-1 flex items-center gap-2 text-xs text-destructive">
          {choices.error || 'The ledgers could not be loaded.'}
          <RetryButton onClick={choices.reload} />
        </div>
      ) : null}
    </div>
  )
}
