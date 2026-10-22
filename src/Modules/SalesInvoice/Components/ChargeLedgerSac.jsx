import { useState } from 'react'
import { AlertCircle, Plus, Save, X } from 'lucide-react'

import { SacSelector } from '@/Components/Common/SacSelector'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { updateLedgerSac } from '@/Services/ledgerService'

/**
 * Under an Other Charges row whose ledger has no SAC number (`ledger_sac`) -
 * Sales Invoice saves each charge with its own ledger's SAC, so the charge
 * cannot be saved until it has one. What it offers follows the company's ERP:
 *
 *   intelligere   Add SAC: the SAC is typed here and saved to the ledger with
 *                 the Ledger Form's own update (PUT tally/create-ledger/,
 *                 updateLedgerSac); the ledger list is then read again, so the
 *                 charge - and its saved ledger_sac - has it
 *   tally         how to fix it in Tally; nothing here changes a Tally ledger
 *   null          (the profile not loaded yet) only that the SAC is missing
 *
 *   id          the charge row's id - the controls' ids
 *   ledger      the charge's ledger record (tally/create-ledger/)
 *   onSaved()   after the SAC is saved - returns once the ledgers are read again
 */
export default function ChargeLedgerSac({ id, ledger, erp, companyId, disabled, onSaved }) {
  const [adding, setAdding] = useState(false)
  const [sac, setSac] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const name = String(ledger?.ledeger_name ?? '').trim() || 'This ledger'

  const save = async () => {
    if (saving) return
    if (!String(sac).trim()) {
      setError('Enter the SAC number')
      return
    }
    setSaving(true)
    try {
      const reply = await updateLedgerSac({ ledger, companyId, sac })
      // Read the ledgers again before this box goes: until then the list still has no SAC.
      await onSaved?.()
      toast.success(reply?.msg || `SAC number saved to ${name}.`)
      setAdding(false)
      setSac('')
    } catch (failure) {
      // `failure.message` is the backend's own text (see authService).
      toast.error(failure.message || 'The SAC number could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="alert"
      data-testid={`charge-${id}-sac`}
      className="mt-1 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
    >
      <div className="flex flex-wrap items-start gap-2">
        <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">{name}</span> has no SAC number.{' '}
          {erp === 'tally'
            ? 'Add the SAC number to this ledger in Tally and sync the ledgers (Ledger Details - Sync Now) before using it for this charge, or choose another ledger that has a SAC number.'
            : erp === 'intelligere'
              ? 'Add it to the ledger to use it for this charge, or choose another ledger.'
              : null}
        </p>
        {erp === 'intelligere' && !adding ? (
          <Button type="button" variant="outline" size="sm" icon={Plus} disabled={disabled} onClick={() => setAdding(true)}>
            Add SAC
          </Button>
        ) : null}
      </div>

      {erp === 'intelligere' && adding ? (
        <div className="flex flex-wrap items-start gap-2 text-foreground">
          <SacSelector
            id={`charge-${id}-sac-code`}
            label={`SAC number for ${name}`}
            required
            className="min-w-0 [flex:1_1_12rem]"
            value={sac}
            error={error}
            disabled={disabled || saving}
            onChange={(code) => {
              setSac(code)
              setError('')
            }}
          />
          <div className="flex gap-2 pt-6">
            <Button type="button" size="sm" icon={Save} loading={saving} disabled={disabled} onClick={save}>
              Save SAC
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={X}
              disabled={saving}
              onClick={() => {
                setAdding(false)
                setSac('')
                setError('')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
