import { useDeferredValue, useState } from 'react'
import { useSelector } from 'react-redux'

import { ListSkeleton } from '@/Components/Common/DataList'
import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import SalesInvoiceWorkspace from '@/Modules/SalesInvoice/Components/SalesInvoiceWorkspace'
import DocumentHistory from '@/Modules/SalesInvoice/History/DocumentHistory'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'

/**
 * THE SALES INVOICE SCREEN - Create Document (the form and its preview) or
 * History (the saved documents), chosen in the heading; the company it is
 * all about on the right.
 *
 * Both views stay mounted once opened and are only hidden while the other is
 * shown, so switching never loses an invoice half typed, the history's
 * filters, or a Tally fetch still running.
 *
 *   company   the active company's record (the page mounts this afresh, by
 *             its id, when the company changes)
 */
const VIEWS = [
  { value: 'create', label: 'Create Document' },
  { value: 'history', label: 'History' },
]

export default function SalesInvoiceScreen({ company }) {
  const [view, setView] = useState('create')
  const [historyOpened, setHistoryOpened] = useState(false)
  // The screen usually appears the moment the company list arrives - inside
  // that request's handler, where a store update renders synchronously. The
  // heading shows then; the form and its preview (hundreds of elements) are
  // mounted in a background render right after, which React splits into
  // short slices instead of one long task.
  const workspaceReady = useDeferredValue(true, false)
  // Fetch from Tally is for a Tally user - the same answer Ledger and Product Sync use.
  const isTally = useSelector(selectIsTallyErp)

  const choose = (next) => {
    if (!next) return
    setView(next)
    if (next === 'history') setHistoryOpened(true)
  }

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <h1 className="text-xl font-semibold text-brand">Sales Invoice</h1>

        <RadioGroup
          value={view}
          onValueChange={choose}
          aria-label="Sales Invoice view"
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-1 shadow-xs"
        >
          {VIEWS.map((option) => (
            <Label
              key={option.value}
              htmlFor={`view-${option.value}`}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${view === option.value ? 'bg-brand-soft font-semibold text-brand' : 'text-muted-foreground hover:text-brand'
                }`}
            >
              <RadioGroupItem id={`view-${option.value}`} value={option.value} />
              {option.label}
            </Label>
          ))}
        </RadioGroup>

        {/*<p className="truncate text-sm text-muted-foreground sm:text-right">{company.comp_name}</p>*/}
      </div>

      <div hidden={view !== 'create'}>
        {workspaceReady ? <SalesInvoiceWorkspace company={company} /> : <ListSkeleton rows={6} />}
      </div>

      {historyOpened ? (
        <div hidden={view !== 'history'}>
          <DocumentHistory company={company} isTally={isTally} />
        </div>
      ) : null}
    </div>
  )
}
