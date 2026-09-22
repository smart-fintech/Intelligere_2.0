import { useState } from 'react'
import { Building2 } from 'lucide-react'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { cn } from '@/Library/utils'

/**
 * "Select Companies to Remove" - asked when the user clicks Payment and has
 * companies. Every company starts UNticked; the ones the user ticks are
 * removed from the package as part of this payment.
 *
 * The ids are each company's `company_id` from the store (companySlice),
 * kept as whole numbers. Continue hands them to `onConfirm`, which sends them
 * as `remove_company` in payment/paymentDetail/ - [] when none are ticked,
 * which is allowed. Mount it with a `key` (or conditionally) so each opening
 * starts with nothing ticked.
 */
export function CompanySelectDialog({ open, onOpenChange, companies, paying, onConfirm }) {
  const [selected, setSelected] = useState([])

  const toggle = (id) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]))

  const nameOf = (company) => company.comp_name || `Company ${company.company_id}`
  const selectedCompanies = companies.filter((company) => selected.includes(Number(company.company_id)))

  return (
    <Modal
      open={open}
      onOpenChange={paying ? () => {} : onOpenChange}
      size="lg"
      title="Select Companies to Remove"
      description="Tick any companies to remove from your existing package as part of this payment. Leave all unticked to keep every company."
      footer={
        <>
          <Button type="button" variant="ghost" disabled={paying} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" loading={paying} onClick={() => onConfirm(selected)}>
            Continue
          </Button>
        </>
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {companies.map((company) => {
          const companyId = Number(company.company_id)
          const id = `remove-company-${company.company_id}`
          const checked = selected.includes(companyId)
          return (
            <li key={company.company_id}>
              <label
                htmlFor={id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                  checked ? 'border-destructive/50 bg-destructive/5' : 'border-border/70 hover:border-brand/40',
                )}
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  disabled={paying}
                  onCheckedChange={() => toggle(companyId)}
                />
                <Building2 className="size-4 shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate">{nameOf(company)}</span>
              </label>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 rounded-md bg-muted/60 px-3 py-2 text-sm">
        <p className="font-medium text-foreground">Selected: {selectedCompanies.length}</p>
        {selectedCompanies.length ? (
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {selectedCompanies.map((company) => (
              <li key={company.company_id}>{nameOf(company)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No company will be removed.</p>
        )}
      </div>
    </Modal>
  )
}
