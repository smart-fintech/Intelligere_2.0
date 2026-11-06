import { useRef, useState } from 'react'
import { Plus, Save, Trash2, X } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { CheckboxField, Field, SelectField } from '@/Components/Common/FormFields'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { JV_SIDE } from '@/Constants/journalVoucher'
import { QUERY } from '@/Constants/queryKeys'
import { invalidateQueries } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import {
  checkTemplateForm,
  emptyTemplateForm,
  templateFormFrom,
  toTemplatePayload,
} from '@/Modules/JournalVoucher/journalVoucher'
import { addJvTemplates, updateJvTemplates } from '@/Services/Accounting/journalVoucherService'

/**
 * Adding a template, or changing one (`template` given).
 *
 *   Debit Accounts    chosen from the JV ledgers, as before
 *   Credit Accounts   chosen from all the company's ledgers
 *   Party             at most one of the ledgers: in the Excel its column takes
 *                     the party's own ledger name, so one template serves every
 *                     party
 *
 * A new template is a POST, which the backend refuses for a title already
 * used; a changed one a PUT. The title of a saved template cannot be changed:
 * its vouchers are filed under it.
 */

const SIDE_KEY = { [JV_SIDE.DR]: 'dr', [JV_SIDE.CR]: 'cr' }

/** The choices, plus a saved ledger they no longer hold - a select shows only what it offers. */
const withChosen = (options, value) =>
  value && !options.some((option) => option.value === value) ? [{ value, label: value }, ...options] : options

export default function TemplateForm({ companyId, template, templateNames, jvLedgers, ledgers, onSaved, onCancel, onOpenLedgers }) {
  const editing = Boolean(template)
  const [form, setForm] = useState(() => (template ? templateFormFrom(template) : emptyTemplateForm()))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)

  const jvOptions = (jvLedgers.data ?? []).map((ledger) => ({ value: ledger.name, label: ledger.name }))

  const clearError = (key) =>
    setErrors((previous) => {
      if (!previous[key]) return previous
      const next = { ...previous }
      delete next[key]
      return next
    })

  const setRow = (side, index, ledger) => {
    const key = SIDE_KEY[side]
    setForm((previous) => ({ ...previous, [key]: previous[key].map((value, at) => (at === index ? ledger : value)) }))
    clearError(`${key}-${index}`)
  }

  const addRow = (side) => {
    const key = SIDE_KEY[side]
    setForm((previous) => ({ ...previous, [key]: [...previous[key], ''] }))
  }

  /** The party keeps pointing at its own ledger when a row above it goes. */
  const removeRow = (side, index) => {
    const key = SIDE_KEY[side]
    setForm((previous) => {
      const { party } = previous
      let nextParty = party
      if (party?.side === side) {
        if (party.index === index) nextParty = null
        else if (party.index > index) nextParty = { side, index: party.index - 1 }
      }
      return { ...previous, [key]: previous[key].filter((_, at) => at !== index), party: nextParty }
    })
    // The rows below move up, and so would their messages - the check runs again on Save.
    setErrors((previous) => Object.fromEntries(Object.entries(previous).filter(([name]) => !name.startsWith(`${key}-`))))
  }

  const save = async () => {
    const found = checkTemplateForm(form, templateNames, editing)
    setErrors(found)
    if (Object.keys(found).length > 0 || inFlight.current) return

    inFlight.current = true
    setSaving(true)
    try {
      const payload = toTemplatePayload(form)
      const reply = editing ? await updateJvTemplates(companyId, payload) : await addJvTemplates(companyId, payload)
      toast.success(reply?.msg || (editing ? 'Template updated successfully.' : 'Template added successfully.'))
      invalidateQueries(QUERY.JV_TEMPLATES, { refetchActive: true })
      onSaved(Object.keys(payload)[0])
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const renderSide = (side, title, options, loading) => {
    const key = SIDE_KEY[side]
    const rows = form[key]
    return (
      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h3 className="text-sm font-semibold text-brand">{title}</h3>
          <Button type="button" variant="outline" size="sm" icon={Plus} disabled={saving} onClick={() => addRow(side)}>
            Add Row
          </Button>
        </div>
        <div className="space-y-3 p-3">
          {rows.map((ledger, index) => {
            const isParty = form.party?.side === side && form.party?.index === index
            return (
              <div
                key={`${key}-${index}`}
                className={cn('grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2 rounded-md', isParty && 'bg-brand-soft/60 p-1 dark:bg-brand/10')}
              >
                <SelectField
                  id={`jv-template-${key}-${index}`}
                  ariaLabel={`${title} ledger ${index + 1}`}
                  searchable
                  searchPlaceholder="Search ledger"
                  placeholder={loading ? 'Loading ledgers...' : 'Select account ledger'}
                  options={withChosen(options, ledger)}
                  value={ledger}
                  error={errors[`${key}-${index}`]}
                  disabled={saving}
                  onValueChange={(value) => setRow(side, index, value)}
                />
                <CheckboxField
                  id={`jv-template-${key}-party-${index}`}
                  label="Party"
                  className="h-9"
                  checked={isParty}
                  disabled={!ledger || saving}
                  onCheckedChange={(checked) => setForm((previous) => ({ ...previous, party: checked ? { side, index } : null }))}
                />
                <Button
                  type="button"
                  variant="iconDelete"
                  size="icon"
                  icon={Trash2}
                  tooltip="Remove row"
                  aria-label={`Remove ${title} row ${index + 1}`}
                  disabled={rows.length === 1 || saving}
                  onClick={() => removeRow(side, index)}
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <Panel
      title={editing ? 'Edit Template' : 'Add Template'}
      actions={
        <Button type="button" variant="ghost" size="sm" icon={X} disabled={saving} onClick={onCancel}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="max-w-md space-y-1">
          <Field
            id="jv-template-name"
            label="Template Title"
            required
            placeholder="e.g. Monthly Rent"
            maxLength={100}
            value={form.name}
            error={errors.name}
            disabled={editing || saving}
            onChange={(event) => {
              setForm((previous) => ({ ...previous, name: event.target.value }))
              clearError('name')
            }}
          />
          {editing ? <p className="text-xs text-muted-foreground">A saved template keeps its title - its vouchers are filed under it.</p> : null}
        </div>

        {jvLedgers.error ? <InlineAlert action={<RetryButton onClick={jvLedgers.reload} />}>{jvLedgers.error}</InlineAlert> : null}
        {ledgers.error ? <InlineAlert action={<RetryButton onClick={ledgers.retry} />}>{ledgers.error}</InlineAlert> : null}
        {jvLedgers.data && jvLedgers.data.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1">Debit accounts are chosen from the JV ledgers, and there are none yet.</span>
            <Button type="button" variant="outline" size="sm" onClick={onOpenLedgers}>
              Add JV Ledgers
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {renderSide(JV_SIDE.DR, 'Debit Accounts', jvOptions, jvLedgers.status === 'loading' && !jvLedgers.data)}
          {renderSide(JV_SIDE.CR, 'Credit Accounts', ledgers.options, ledgers.loading)}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setForm(template ? templateFormFrom(template) : emptyTemplateForm())
              setErrors({})
            }}
          >
            {editing ? 'Reset' : 'Clear'}
          </Button>
          <Button type="button" icon={Save} loading={saving} onClick={save}>
            {editing ? 'Update Template' : 'Save Template'}
          </Button>
        </div>
      </div>
    </Panel>
  )
}
