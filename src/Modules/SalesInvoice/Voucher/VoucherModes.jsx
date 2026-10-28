import { useState } from 'react'

import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/Components/ui/select'
import AiVoucher from '@/Modules/SalesInvoice/Voucher/AiVoucher'
import SharedInvoices from '@/Modules/SalesInvoice/Voucher/SharedInvoices'
import TallyVouchers from '@/Modules/SalesInvoice/Voucher/TallyVouchers'

/**
 * THE VOUCHER VIEW'S CHOICES, in the voucher card's own radio style:
 *
 *   View Voucher   the company's vouchers, exactly as before (TallyVouchers)
 *   Add Voucher    a dropdown of the ways to add one (`addModes`) - Add Voucher
 *                  first and chosen by default:
 *                    Add Voucher   invoices other companies shared with this
 *                                  one, to accept or decline (SharedInvoices)
 *                    AI Voucher    invoice files read by the AI (AiVoucher)
 *                  With only one way to add (Sales Invoice: AI Voucher), it is a
 *                  plain choice of its own name.
 *
 * Each stays mounted once opened and is only hidden while another shows, so
 * switching keeps a voucher being edited, the files picked, the page and the
 * choice made.
 *
 *   company, parties, options   what TallyVouchers takes (`options` its types and labels)
 *   addModes        ['shared', 'ai'] (Purchase Invoice) or ['ai'] (Sales Invoice)
 *   aiDocumentType  AI Voucher's document_type - 'Purchase Invoice' | 'Sales Invoice'
 *   active          the voucher view is on screen (AI Voucher's progress is asked for only then)
 */
const ADD_MODES = Object.freeze({ shared: 'Add Voucher', ai: 'AI Voucher' })

const segmentClass = (chosen) =>
  `flex cursor-pointer items-center gap-2 rounded-md px-3 py-1 text-xs transition-colors ${chosen ? 'bg-brand-soft font-semibold text-brand' : 'text-muted-foreground hover:text-brand'}`

export default function VoucherModes({ company, parties, options, addModes = ['shared'], aiDocumentType, active = true }) {
  const [mode, setMode] = useState('view')
  const [addMode, setAddMode] = useState(addModes[0])
  const [opened, setOpened] = useState({})

  const open = (next) => {
    setAddMode(next)
    setMode('add')
    setOpened((current) => (current[next] ? current : { ...current, [next]: true }))
  }
  const choose = (next) => {
    if (!next) return
    if (next === 'add') open(addMode)
    else setMode(next)
  }
  const showing = (kind) => mode === 'add' && addMode === kind

  return (
    <div className="space-y-3">
      <RadioGroup
        value={mode}
        onValueChange={choose}
        aria-label="Voucher mode"
        className="flex w-fit flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-xs"
      >
        <Label htmlFor="voucher-mode-view" className={segmentClass(mode === 'view')}>
          <RadioGroupItem id="voucher-mode-view" value="view" />
          View Voucher
        </Label>
        {addModes.length > 1 ? (
          <div className={segmentClass(mode === 'add')}>
            <RadioGroupItem id="voucher-mode-add" value="add" aria-label={ADD_MODES[addMode]} />
            {/* Nothing shown as chosen while View Voucher is - so picking even the
                same entry again is a change, and opens it. */}
            <Select value={mode === 'add' ? addMode : ''} onValueChange={(next) => next && open(next)}>
              <SelectTrigger
                size="sm"
                aria-label="Add voucher type"
                className="h-6! border-0 bg-transparent px-1 text-xs font-[inherit] text-inherit shadow-none data-[placeholder]:text-inherit"
              >
                <SelectValue placeholder={ADD_MODES[addMode]} />
              </SelectTrigger>
              <SelectContent>
                {addModes.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {ADD_MODES[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <Label htmlFor="voucher-mode-add" className={segmentClass(mode === 'add')}>
            <RadioGroupItem id="voucher-mode-add" value="add" />
            {ADD_MODES[addModes[0]]}
          </Label>
        )}
      </RadioGroup>

      <div hidden={mode !== 'view'}>
        <TallyVouchers company={company} parties={parties} {...options} />
      </div>
      {opened.shared ? (
        <div hidden={!showing('shared')}>
          <SharedInvoices company={company} />
        </div>
      ) : null}
      {opened.ai ? (
        <div hidden={!showing('ai')}>
          <AiVoucher company={company} documentType={aiDocumentType} active={active && showing('ai')} />
        </div>
      ) : null}
    </div>
  )
}
