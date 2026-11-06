import { useState } from 'react'
import { Plus } from 'lucide-react'

import { SelectField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { B2B_GST_SLABS } from '@/Constants/b2bCndn'
import { cn } from '@/Library/utils'
import MappingList from '@/Modules/B2BCNDN/shared/MappingList'
import {
  ALL_SLABS,
  GST_TAX,
  GST_TAX_OPTIONS,
  PURCHASE_TYPE_OPTIONS,
  isB2BRuleKey,
  purchaseMappingFor,
  slabOptions,
  taxMappingFor,
} from '@/Modules/B2BCNDN/shared/ledgerMapping'

/**
 * B2B LEDGER MAPPING - the b2b mapping (keyword_b2b/, source b2b) in three tabs:
 *
 *   Purchase Ledger   GST slab x purchase type (Interstate / Local / Both) -> a ledger:
 *                     purchase_interstate_5, purchase_local_5. An entry with IGST takes
 *                     the interstate one, with CGST / SGST the local one.
 *   Party Ledger      a party name from the GST portal -> the company's ledger:
 *                     { "Sharma Traders": "abc" }. Used wherever the entry's party goes.
 *   GST Ledger        the old screen's IGST / CGST / SGST ledger by slab - kept as it was
 *
 * Saving a slab and type already mapped changes its ledger (PUT merges).
 *
 *   mapping   useKeywordMapping(companyId, KEYWORD_SOURCE.B2B)
 *   flat      the flattened mapping (flattenMapping)
 *   ledgers   useLedgerDirectory - every ledger a key can map to
 *   parties   the party names of the batch, for Party Ledger
 *   initial   { tab, party } - where the dialog opens (a row's "Map party")
 *   onSaved(keys)  after a save - the { key: ledger } saved, for the view to check
 *             the entries it touches again
 */

const TAB = Object.freeze({ PURCHASE: 'purchase', PARTY: 'party', TAX: 'tax' })

const TAB_OPTIONS = [
  { value: TAB.PURCHASE, label: 'Purchase Ledger' },
  { value: TAB.PARTY, label: 'Party Ledger' },
  { value: TAB.TAX, label: 'GST Ledger' },
]

const TAB_TEXT = {
  [TAB.PURCHASE]: {
    rule: 'An entry with IGST is an interstate purchase, one with CGST + SGST a local purchase. A slab with nothing of its own takes the "All slabs" ledger.',
    list: 'Saved purchase ledgers',
    kind: 'purchase',
  },
  [TAB.PARTY]: {
    rule: 'An entry whose party IS the name (any case) is posted to the chosen ledger - shown and sent to Tally that way.',
    list: 'Saved party ledgers',
    kind: 'party',
  },
  [TAB.TAX]: {
    rule: 'Replaces the GST ledger the backend chose. CGST and SGST slabs are half the GST rate.',
    list: 'Saved GST ledgers',
    kind: 'tax',
  },
}

const RATE_SLABS = slabOptions(B2B_GST_SLABS)
const HALF_SLABS = slabOptions(
  B2B_GST_SLABS.filter((rate) => rate > 0),
  { half: true },
)

const EMPTY_FORM = {
  slab: '',
  type: '',
  party: '',
  tax: GST_TAX.IGST,
  ledger: '',
}

export default function B2BMappingModal({ open, onOpenChange, mapping, flat, ledgers, parties, initial, onSaved }) {
  const [tab, setTab] = useState(initial?.tab ?? TAB.PURCHASE)
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    party: initial?.party ?? '',
  }))
  const [errors, setErrors] = useState({})
  const copy = TAB_TEXT[tab]

  const set = (field) => (value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value ?? '',
      ...(field === 'tax' ? { slab: '' } : null),
    }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  const changeTab = (next) => {
    setTab(next)
    setErrors({})
  }

  const partyOptions = [...new Set([...parties, form.party].filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name }))

  const save = async () => {
    const found = {}
    if (!form.ledger) found.ledger = 'Please select a ledger'
    if (tab === TAB.PURCHASE) {
      if (!form.slab) found.slab = 'Please select a GST slab'
      if (!form.type) found.type = 'Please select a purchase type'
    }
    if (tab === TAB.TAX && !form.slab) found.slab = 'Please select a GST slab'
    if (tab === TAB.PARTY) {
      if (!form.party) found.party = 'Please select a party'
      else if (isB2BRuleKey(form.party)) found.party = 'This name is kept for the ledger rules - it cannot be a party'
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const keys =
      tab === TAB.PURCHASE
        ? purchaseMappingFor(form.type, form.slab, form.ledger)
        : tab === TAB.TAX
          ? taxMappingFor(form.tax, form.slab, form.ledger)
          : { [form.party]: form.ledger }
    onSaved?.(keys)
    if (await mapping.addMany(keys)) setForm((previous) => ({ ...EMPTY_FORM, tax: previous.tax }))
  }

  const ledgerField = (
    <SelectField
      id="b2b-mapping-ledger"
      label={tab === TAB.PURCHASE ? 'Purchase Ledger' : tab === TAB.PARTY ? 'Tally Ledger' : 'GST Ledger'}
      required
      searchable
      searchPlaceholder="Search ledger"
      placeholder={ledgers.options.length === 0 ? 'Loading ledgers...' : 'Select ledger'}
      options={ledgers.options}
      value={form.ledger}
      error={errors.ledger}
      disabled={mapping.saving}
      onValueChange={set('ledger')}
    />
  )

  return (
    <Modal open={open} onOpenChange={(next) => !mapping.saving && onOpenChange(next)} title="B2B Ledger Mapping" description={copy.rule} size="lg">
      <div className="space-y-4">
        <ViewSwitch options={TAB_OPTIONS} value={tab} onValueChange={changeTab} label="What to map" idPrefix="b2b-mapping-tab" className="w-fit max-w-full" />

        <div
          className={cn(
            'grid grid-cols-1 items-start gap-3',
            tab === TAB.PARTY ? 'sm:grid-cols-[repeat(2,minmax(0,1fr))_auto]' : 'sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]',
          )}
        >
          {tab === TAB.PURCHASE ? (
            <>
              <SelectField
                id="b2b-mapping-slab"
                label="GST Slab"
                required
                options={RATE_SLABS}
                value={form.slab}
                error={errors.slab}
                disabled={mapping.saving}
                placeholder="Select slab"
                onValueChange={set('slab')}
              />
              <SelectField
                id="b2b-mapping-type"
                label="Purchase Type"
                required
                options={PURCHASE_TYPE_OPTIONS}
                value={form.type}
                error={errors.type}
                disabled={mapping.saving}
                placeholder="Select type"
                onValueChange={set('type')}
              />
            </>
          ) : null}

          {tab === TAB.PARTY ? (
            <SelectField
              id="b2b-mapping-party"
              label="Party (from the GST portal)"
              required
              searchable
              searchPlaceholder="Search party"
              placeholder={partyOptions.length === 0 ? 'No parties in this batch' : 'Select party'}
              options={partyOptions}
              value={form.party}
              error={errors.party}
              disabled={mapping.saving}
              onValueChange={set('party')}
            />
          ) : null}

          {tab === TAB.TAX ? (
            <>
              <SelectField
                id="b2b-mapping-tax"
                label="GST"
                required
                options={GST_TAX_OPTIONS}
                value={form.tax}
                disabled={mapping.saving}
                onValueChange={set('tax')}
              />
              <SelectField
                id="b2b-mapping-tax-slab"
                label="GST Slab"
                required
                options={form.tax === GST_TAX.IGST ? RATE_SLABS : HALF_SLABS}
                value={form.slab}
                error={errors.slab}
                disabled={mapping.saving}
                placeholder="Select slab"
                onValueChange={set('slab')}
              />
            </>
          ) : null}

          {ledgerField}
          <Button type="button" className="sm:mt-5" icon={Plus} loading={mapping.saving} onClick={save}>
            Save
          </Button>
        </div>

        {tab === TAB.PURCHASE && form.slab === ALL_SLABS ? (
          <p className="text-xs text-muted-foreground">"All slabs" is used for any slab that has no ledger of its own.</p>
        ) : null}

        <MappingList mapping={mapping} flat={flat} kind={copy.kind} title={copy.list} />
      </div>
    </Modal>
  )
}
