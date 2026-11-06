import { useState } from 'react'
import { Plus } from 'lucide-react'

import { SelectField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { CNDN_GST_SLABS } from '@/Constants/b2bCndn'
import MappingList from '@/Modules/B2BCNDN/shared/MappingList'
import { GST_TAX, GST_TAX_OPTIONS, NOTE_KIND_OPTIONS, noteMappingFor, slabOptions, taxMappingFor } from '@/Modules/B2BCNDN/shared/ledgerMapping'

/**
 * CNDN LEDGER MAPPING - the cndn mapping (keyword_b2b/, source cndn), in two tabs:
 *
 *   Note Ledger   the ledger a credit note and a debit note post against, by GST
 *                 slab - credit_note_18, debit_note_18, or credit_note / debit_note
 *                 for all slabs. The B2B purchase mapping is never used for notes.
 *   GST Ledger    IGST / CGST / SGST ledger by slab - igst_18, cgst_9 - over the one
 *                 the backend chose, as B2B's; how a note's wrong GST ledger is put right
 *
 *   mapping   useKeywordMapping(companyId, KEYWORD_SOURCE.CNDN)
 *   flat      the flattened mapping (flattenMapping)
 *   ledgers   useLedgerDirectory - every ledger a key can map to
 *   onSaved(keys)  as a save starts - the { key: ledger } saved, for the view to check the notes again
 */

const TAB = Object.freeze({ NOTE: 'note', TAX: 'tax' })

const TAB_OPTIONS = [
  { value: TAB.NOTE, label: 'Note Ledger' },
  { value: TAB.TAX, label: 'GST Ledger' },
]

const TAB_TEXT = {
  [TAB.NOTE]: {
    rule: 'The ledger each credit note and debit note is posted against. A slab with nothing of its own takes the "All slabs" ledger.',
    list: 'Saved note ledgers',
  },
  [TAB.TAX]: {
    rule: 'Replaces the GST ledger the backend chose. CGST and SGST slabs are half the GST rate.',
    list: 'Saved GST ledgers',
  },
}

const SLABS = slabOptions(CNDN_GST_SLABS)
const HALF_SLABS = slabOptions(
  CNDN_GST_SLABS.filter((rate) => rate > 0),
  { half: true },
)

const EMPTY_FORM = { kind: '', slab: '', tax: GST_TAX.IGST, ledger: '' }

export default function CndnMappingModal({ open, onOpenChange, mapping, flat, ledgers, onSaved }) {
  const [tab, setTab] = useState(TAB.NOTE)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const copy = TAB_TEXT[tab]

  const set = (field) => (value) => {
    setForm((previous) => ({ ...previous, [field]: value ?? '', ...(field === 'tax' ? { slab: '' } : null) }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  const changeTab = (next) => {
    setTab(next)
    setForm(EMPTY_FORM)
    setErrors({})
  }

  const save = async () => {
    const found = {}
    if (tab === TAB.NOTE && !form.kind) found.kind = 'Please select the note type'
    if (!form.slab) found.slab = 'Please select a GST slab'
    if (!form.ledger) found.ledger = 'Please select a ledger'
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const keys = tab === TAB.NOTE ? noteMappingFor(form.kind, form.slab, form.ledger) : taxMappingFor(form.tax, form.slab, form.ledger)
    onSaved?.(keys)
    if (await mapping.addMany(keys)) setForm((previous) => ({ ...EMPTY_FORM, tax: previous.tax }))
  }

  return (
    <Modal open={open} onOpenChange={(next) => !mapping.saving && onOpenChange(next)} title="CNDN Ledger Mapping" description={copy.rule} size="lg">
      <div className="space-y-4">
        <ViewSwitch options={TAB_OPTIONS} value={tab} onValueChange={changeTab} label="What to map" idPrefix="cndn-mapping-tab" className="w-fit max-w-full" />

        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          {tab === TAB.NOTE ? (
            <SelectField
              id="cndn-mapping-kind"
              label="Ledger For"
              required
              options={NOTE_KIND_OPTIONS}
              value={form.kind}
              error={errors.kind}
              disabled={mapping.saving}
              placeholder="Select note type"
              onValueChange={set('kind')}
            />
          ) : (
            <SelectField
              id="cndn-mapping-tax"
              label="GST"
              required
              options={GST_TAX_OPTIONS}
              value={form.tax}
              disabled={mapping.saving}
              onValueChange={set('tax')}
            />
          )}
          <SelectField
            id="cndn-mapping-slab"
            label="GST Slab"
            required
            options={tab === TAB.TAX && form.tax !== GST_TAX.IGST ? HALF_SLABS : SLABS}
            value={form.slab}
            error={errors.slab}
            disabled={mapping.saving}
            placeholder="Select slab"
            onValueChange={set('slab')}
          />
          <SelectField
            id="cndn-mapping-ledger"
            label={tab === TAB.NOTE ? 'Ledger' : 'GST Ledger'}
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
          <Button type="button" className="sm:mt-5" icon={Plus} loading={mapping.saving} onClick={save}>
            Save
          </Button>
        </div>

        <MappingList mapping={mapping} flat={flat} kind={tab === TAB.NOTE ? 'note' : 'tax'} title={copy.list} />
      </div>
    </Modal>
  )
}
