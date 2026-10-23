import { useState } from 'react'

import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import SharedInvoices from '@/Modules/SalesInvoice/Voucher/SharedInvoices'
import TallyVouchers from '@/Modules/SalesInvoice/Voucher/TallyVouchers'

/**
 * PURCHASE INVOICE'S VOUCHER VIEW - two choices, in the voucher card's own
 * radio style:
 *
 *   View Voucher   the company's vouchers, exactly as before (TallyVouchers)
 *   Add Voucher    invoices other companies shared with this one, to accept
 *                  or decline (SharedInvoices)
 *
 * Each stays mounted once opened and is only hidden while the other shows, so
 * switching keeps a voucher being edited, the page and the choice made.
 *
 *   company, parties, options   what TallyVouchers takes (`options` its types and labels)
 */
const MODES = [
  { value: 'view', label: 'View Voucher' },
  { value: 'add', label: 'Add Voucher' },
]

export default function VoucherModes({ company, parties, options }) {
  const [mode, setMode] = useState('view')
  const [addOpened, setAddOpened] = useState(false)

  const choose = (next) => {
    if (!next) return
    setMode(next)
    if (next === 'add') setAddOpened(true)
  }

  return (
    <div className="space-y-3">
      <RadioGroup
        value={mode}
        onValueChange={choose}
        aria-label="Voucher mode"
        className="flex w-fit flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-xs"
      >
        {MODES.map((option) => (
          <Label
            key={option.value}
            htmlFor={`voucher-mode-${option.value}`}
            className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1 text-xs transition-colors ${mode === option.value ? 'bg-brand-soft font-semibold text-brand' : 'text-muted-foreground hover:text-brand'}`}
          >
            <RadioGroupItem id={`voucher-mode-${option.value}`} value={option.value} />
            {option.label}
          </Label>
        ))}
      </RadioGroup>

      <div hidden={mode !== 'view'}>
        <TallyVouchers company={company} parties={parties} {...options} />
      </div>
      {addOpened ? (
        <div hidden={mode !== 'add'}>
          <SharedInvoices company={company} />
        </div>
      ) : null}
    </div>
  )
}
