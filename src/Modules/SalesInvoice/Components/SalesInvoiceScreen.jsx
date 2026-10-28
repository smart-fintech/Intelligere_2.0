import { useDeferredValue, useState } from 'react'
import { useSelector } from 'react-redux'

import { ListSkeleton } from '@/Components/Common/DataList'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import SalesInvoiceWorkspace from '@/Modules/SalesInvoice/Components/SalesInvoiceWorkspace'
import DocumentHistory from '@/Modules/SalesInvoice/History/DocumentHistory'
import TallyVouchers from '@/Modules/SalesInvoice/Voucher/TallyVouchers'
import VoucherModes from '@/Modules/SalesInvoice/Voucher/VoucherModes'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'

/**
 * THE SALES INVOICE SCREEN - Create Document (the form and its preview) or
 * History (the saved documents), chosen in the heading; the company it is
 * all about on the right. Purchase Invoice shows the same screen with its own
 * title, flow and history (`title`, `flow`, `history`).
 *
 * Edit on a history row opens that document in Create Document, filled in
 * (the workspace's editRequest); a document saved or updated there reads the
 * history again (`refresh`).
 *
 * Voucher shows the company's Tally vouchers. Every view stays mounted once
 * opened and is only hidden while another is shown, so switching never loses an invoice half typed, the history's
 * filters, or a Tally fetch still running.
 *
 *   company   the active company's record (the page mounts this afresh, by
 *             its id, when the company changes)
 *   title     the heading - "Sales Invoice"
 *   flow      the workspace's flow - Sales Invoice's when not given
 *   history   DocumentHistory's own options (documentTypesOf, defaultType,
 *             partyLabel, tally: false to leave out Fetch from Tally)
 *   vouchers  TallyVouchers' own options (types, labels) - Sales Invoice,
 *             Credit Note and Debit Note when not given; `sharedInvoices: true`
 *             adds Add Voucher (Purchase Invoice) and `aiVoucher` - the
 *             document_type the AI reads for - AI Voucher, beside View Voucher
 *             (VoucherModes)
 */
const VIEWS = [
  { value: 'create', label: 'Create Document' },
  { value: 'history', label: 'History' },
  // The company's Tally vouchers - one shared answer per company (useTallyVouchers).
  { value: 'voucher', label: 'Voucher' },
]

export default function SalesInvoiceScreen({ company, title = 'Sales Invoice', flow, history = {}, vouchers = {} }) {
  const [view, setView] = useState('create')
  const [historyOpened, setHistoryOpened] = useState(false)
  // Mounted - and so asked for - only once opened; kept mounted after, like History.
  const [voucherOpened, setVoucherOpened] = useState(false)
  // A new object per Edit press, so pressing Edit on the same row again reloads it.
  const [editRequest, setEditRequest] = useState(null)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const { tally = true, ...historyOptions } = history
  const { sharedInvoices = false, aiVoucher = null, ...voucherOptions } = vouchers
  const addModes = [...(sharedInvoices ? ['shared'] : []), ...(aiVoucher ? ['ai'] : [])]
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
    if (next === 'voucher') setVoucherOpened(true)
  }

  /** Edit on a history row: Create Document, with that document in the form. */
  const edit = (record) => {
    if (!record) return
    setEditRequest({ record })
    setView('create')
  }

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <h1 className="text-xl font-semibold text-brand">{title}</h1>

        <ViewSwitch options={VIEWS} value={view} onValueChange={choose} label={`${title} view`} idPrefix="view" />

        {/*<p className="truncate text-sm text-muted-foreground sm:text-right">{company.comp_name}</p>*/}
      </div>

      <div hidden={view !== 'create'}>
        {workspaceReady ? (
          <SalesInvoiceWorkspace
            company={company}
            {...(flow ? { flow } : null)}
            editRequest={editRequest}
            onDocumentSaved={() => setHistoryRefresh((count) => count + 1)}
          />
        ) : (
          <ListSkeleton rows={6} />
        )}
      </div>

      {voucherOpened ? (
        <div hidden={view !== 'voucher'}>
          {addModes.length ? (
            <VoucherModes
              company={company}
              parties={flow?.parties}
              options={voucherOptions}
              addModes={addModes}
              aiDocumentType={aiVoucher}
              active={view === 'voucher'}
            />
          ) : (
            <TallyVouchers company={company} parties={flow?.parties} {...voucherOptions} />
          )}
        </div>
      ) : null}

      {historyOpened ? (
        <div hidden={view !== 'history'}>
          <DocumentHistory company={company} isTally={tally && isTally} {...historyOptions} onEdit={edit} refresh={historyRefresh} />
        </div>
      ) : null}
    </div>
  )
}
