import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link2, Plus } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import useSectionAccess from '@/Hooks/useSectionAccess'
import LedgerForm from '@/Modules/Dashboard/Components/LedgerForm'
import { ACCESS_SECTIONS } from '@/Services/accessService'
import { fetchBankOptions, selectBankNames } from '@/Store/Slices/bankSlice'
import { fetchLedgerGroups, fetchLedgers, selectLedgerGroups } from '@/Store/Slices/ledgerSlice'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'
import { gstListText } from '@/Utils/gstLedgers'

/**
 * What stands between the document and Save when a GST ledger it needs is
 * missing - and the way to fix it:
 *
 *   check   { status: 'ok' | 'loading' | 'failed' | 'missing', missing, retry }
 *           (the workspace's gstCheck - Utils/gstLedgers)
 *   onOpenMapping()   opens GST Ledger Mapping, to map an existing ledger
 *
 * "Create ledger" opens the app's own Ledger Form (the one on Ledger Details
 * and behind the header's Add > Add Ledger Creation) in a dialog, its name
 * suggested from the tax and rate - every field still the user's to change,
 * and saved the way that form always saves (the API, or Tally over the
 * WebSocket). Nothing is created without it. Once saved, the ledgers are read
 * again (the same thunk the Ledger page uses), the GST ledgers are matched
 * again from the new list, and Save is allowed once nothing is missing.
 *
 * A sub user without Create on Ledger Details is not offered the button.
 */
export default function GstLedgerCheck({ check, companyId, companyName, disabled, onOpenMapping }) {
  const dispatch = useDispatch()
  const groups = useSelector(selectLedgerGroups)
  const bankNames = useSelector(selectBankNames)
  const isTally = useSelector(selectIsTallyErp)
  const canCreate = useSectionAccess(ACCESS_SECTIONS.LEDGER).create
  // The tax and rate the open dialog is creating a ledger for, or null.
  const [creating, setCreating] = useState(null)

  if (check.status === 'failed') {
    return (
      <InlineAlert action={<RetryButton onClick={check.retry} />}>
        The GST ledgers could not be checked - the ledgers or the GST ledger mappings did not load.
      </InlineAlert>
    )
  }
  if (check.status !== 'missing') return null

  const open = (entry) => {
    // What the form's dropdowns are made of - no-ops when already loaded.
    dispatch(fetchLedgerGroups())
    dispatch(fetchBankOptions())
    setCreating(entry)
  }

  const saved = () => {
    setCreating(null)
    dispatch(fetchLedgers({ companyId, force: true }))
  }

  const rate = (entry) => String(Number(Number(entry.rate).toFixed(4)))

  return (
    <>
      <div role="alert" className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
        <p>
          <span className="font-semibold">No GST ledger found for {gstListText(check.missing)}.</span> The document cannot be
          saved until each has one: map an existing ledger, or create it.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate
            ? check.missing.map((entry) => (
                <Button
                  key={`${entry.tax}|${entry.rate}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={Plus}
                  disabled={disabled}
                  onClick={() => open(entry)}
                >
                  Create {entry.tax} {rate(entry)}% ledger
                </Button>
              ))
            : null}
          <Button type="button" variant="outline" size="sm" icon={Link2} disabled={disabled} onClick={onOpenMapping}>
            GST Ledger Mapping
          </Button>
          <RetryButton label="Check again" onClick={check.retry} />
        </div>
      </div>

      <Modal
        open={Boolean(creating)}
        onOpenChange={(next) => (next ? null : setCreating(null))}
        title={creating ? `Create ${creating.tax} ${rate(creating)}% ledger` : 'Create ledger'}
        size="lg"
      >
        {creating ? (
          <LedgerForm
            key={`${creating.tax}|${creating.rate}`}
            ledger={null}
            defaults={{ ledeger_name: `${creating.tax} @ ${rate(creating)}%` }}
            companyId={companyId}
            companyName={companyName}
            groups={groups}
            bankNames={bankNames}
            onSaved={saved}
            onCancel={() => setCreating(null)}
            isTally={isTally}
            onRefresh={() => dispatch(fetchLedgers({ companyId, force: true }))}
            framed={false}
          />
        ) : null}
      </Modal>
    </>
  )
}
