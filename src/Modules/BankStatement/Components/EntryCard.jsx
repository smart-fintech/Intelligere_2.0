import { useState } from 'react'
import { Send, Trash2 } from 'lucide-react'

import { SelectField } from '@/Components/Common/FormFields'
import Spinner from '@/Components/Common/Loader/Spinner'
import { Popover, PopoverContent, PopoverTrigger } from '@/Components/ui/popover'
import { Tooltip } from '@/Components/ui/tooltip'
import { cn } from '@/Library/utils'
import InlineConfirm from '@/Modules/BankStatement/Components/InlineConfirm'
import {
  REMAINDER_TYPES,
  amountOf,
  isDebit,
  ledgerOf,
  needsRemainderType,
  remainderOf,
} from '@/Modules/BankStatement/bankStatementModel'
import { box, label, outlineButton, outlineDanger, selectBox, selectBoxPlain } from '@/Modules/BankStatement/bankStatementStyles'
import { formatDate } from '@/Utils/date'

/** One cell of the entry grid: its label and its box. `span` is its width at sm and up. */
function Cell({ span, title, className, children }) {
  return (
    <div className={cn('col-span-12 min-w-0', span, className)}>
      {title ? <span className={label}>{title}</span> : null}
      {children}
    </div>
  )
}

/**
 * A box that keeps what is typed to itself and hands it over on Enter or on
 * leaving it - so typing does not redraw the whole list.
 */
function CommitInput({ value, onCommit, className, ...props }) {
  const [draft, setDraft] = useState(null)
  const commit = () => {
    if (draft !== null && draft !== String(value ?? '')) onCommit(draft)
    setDraft(null)
  }
  return (
    <input
      {...props}
      className={cn(box, className)}
      value={draft ?? String(value ?? '')}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === 'Enter' && commit()}
    />
  )
}

/** An amount with its Dr. / Cr. tag joined on the right. */
function AmountBox({ side, children }) {
  return (
    <div className="flex">
      {children}
      <span
        className={cn(
          'flex h-8 shrink-0 items-center rounded-r-md border border-[#ced4da] bg-[#e9ecef] px-2 text-[10px] font-bold dark:border-border dark:bg-muted',
          side === 'Dr' ? 'text-[#dc3545]' : 'text-[#28a745]',
        )}
      >
        {side}.
      </span>
    </div>
  )
}

/** "Select Invoices" - a button opening the entry's open invoices, each with a tick. */
function InvoicePicker({ entry, statement }) {
  const invoices = statement.invoicesFor(entry)
  const chosen = statement.chosenInvoices[entry.sr_no] ?? []

  const toggle = (invoiceNo, on) =>
    statement.chooseInvoices(entry.sr_no, on ? [...chosen, invoiceNo] : chosen.filter((value) => value !== invoiceNo))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(outlineButton, 'w-full truncate')} disabled={invoices.length === 0}>
          {chosen.length ? `${chosen.length} Invoice` : 'Select Invoices'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-auto overflow-auto p-1">
        {invoices.map((invoice) => (
          <label
            key={invoice.invoice_no}
            className="flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm whitespace-nowrap hover:bg-muted"
          >
            <input
              type="checkbox"
              className="accent-brand"
              checked={chosen.includes(invoice.invoice_no)}
              onChange={(event) => toggle(invoice.invoice_no, event.target.checked)}
            />
            <span className="text-brand">{invoice.billdate}</span>
            <span>|</span>
            <span className="text-brand">{invoice.invoice_no}</span>
            <span>|</span>
            <span>&#8377;{invoice.amount}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/**
 * One statement entry as its voucher, laid out as the old screen did: the
 * debit line, the credit line, the narration, then the accountant's
 * narration, the voucher type, Agst Ref and the buttons. The ledger is
 * debited for money the bank paid out and credited for money it received;
 * the bank takes the other side.
 *
 *   ledgerOptions   [{ value: name, label: name }] of the company's ledgers
 *   ledgerNames     a Set of those names
 *   bankLedger      the bank account's ledger
 */
export default function EntryCard({ entry, statement, ledgerOptions, ledgerNames, bankLedger }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const ledger = ledgerOf(entry)
  const sending = statement.sendingIds.includes(entry.sr_no)
  const ref = statement.refs[entry.sr_no]
  const blocked = needsRemainderType(ref)
  const date = formatDate(entry.date).replaceAll('-', '/')
  const withRef = statement.agstOn && statement.hasInvoices(entry)

  // A ledger the statement names that is not in the list is still shown.
  const options = ledger && !ledgerNames.has(ledger) ? [{ value: ledger, label: ledger }, ...ledgerOptions] : ledgerOptions

  const ledgerBox = (
    <SelectField
      id={`bank-statement-ledger-${entry.sr_no}`}
      ariaLabel="Ledger"
      className={selectBoxPlain}
      searchable
      searchPlaceholder="Search ledger..."
      placeholder={statement.remainingLedger || 'Click here to Select Ledger'}
      options={options}
      value={ledger}
      onValueChange={(name) => statement.setLedger(entry.sr_no, name)}
      disabled={sending}
    />
  )
  const bankBox = <input aria-label="Bank" className={box} value={bankLedger} readOnly />

  const amountBox = (
    <CommitInput
      aria-label="Amount"
      type="number"
      min="0"
      step="0.01"
      title="Press Enter to set the value"
      className="rounded-r-none"
      value={amountOf(entry)}
      onCommit={(value) => statement.setAmount(entry.sr_no, value)}
      disabled={sending}
    />
  )
  const sameAmount = <input aria-label="Amount" type="number" className={cn(box, 'rounded-r-none')} value={amountOf(entry)} readOnly />

  // A debit: the ledger is debited. A credit: the bank is.
  const debit = isDebit(entry)
  const lines = [
    { side: 'Dr', title: debit ? 'Ledger' : 'Bank', account: debit ? ledgerBox : bankBox, amount: debit ? amountBox : sameAmount },
    { side: 'Cr', title: debit ? 'Bank' : 'Ledger', account: debit ? bankBox : ledgerBox, amount: debit ? sameAmount : amountBox },
  ]

  const remainder = remainderOf(ref)

  return (
    <div className={cn('mt-2 rounded-md border bg-card p-2', blocked ? 'border-[#dc3545]' : 'border-[#2c5f8f] dark:border-brand')}>
      {lines.map((line, index) => (
        <div key={line.side} className="grid grid-cols-12 gap-x-3 gap-y-1 pb-1">
          <div className="col-span-12 sm:col-span-1">
            {index === 0 ? <h3 className="text-lg font-medium text-brand sm:mt-5 sm:ml-4">{entry.sr_no}</h3> : null}
          </div>
          <Cell span="sm:col-span-2" title="Date">
            <input aria-label="Date" className={box} value={date} readOnly />
          </Cell>
          <Cell span="sm:col-span-6" title={line.title}>
            {line.account}
          </Cell>
          <Cell span="sm:col-span-3" title="Amount">
            <AmountBox side={line.side}>{line.amount}</AmountBox>
          </Cell>
        </div>
      ))}

      <div className="grid grid-cols-12 pb-1">
        <Cell title="Narration">
          <input aria-label="Narration" className={cn(box, 'text-xs')} value={entry.transaction ?? ''} title={entry.transaction} readOnly />
        </Cell>
      </div>

      <div className="grid grid-cols-12 items-end gap-x-3 gap-y-2">
        <Cell span="sm:col-span-3" title="Accountant Narration">
          <CommitInput
            aria-label="Accountant Narration"
            title="Press Enter to set the value"
            value={entry.AccountantNarration}
            onCommit={(value) => statement.setNarration(entry.sr_no, value)}
            disabled={sending}
          />
        </Cell>
        <Cell span="sm:col-span-2" title="Voucher Type">
          <input aria-label="Voucher Type" className={box} value={entry.Vouchetype ?? ''} readOnly />
        </Cell>

        <Cell span="sm:col-span-2" title={withRef ? 'Select Invoice' : null}>
          {withRef ? <InvoicePicker entry={entry} statement={statement} /> : null}
        </Cell>

        <Cell span="sm:col-span-3" className="sm:text-right">
          {withRef && blocked ? (
            <SelectField
              id={`bank-statement-remainder-${entry.sr_no}`}
              ariaLabel="Remaining Amount"
              className={cn(selectBox, '[&_[data-slot=select-trigger]]:ring-1 [&_[data-slot=select-trigger]]:ring-[#dc3545]')}
              placeholder="Remaining Amount"
              options={REMAINDER_TYPES}
              value={remainder?.Bill_type ?? ''}
              onValueChange={(type) => statement.setRemainderType(entry.sr_no, type)}
            />
          ) : withRef ? (
            <button type="button" className={outlineButton} onClick={() => statement.applyRef(entry)}>
              Set Agst Ref
            </button>
          ) : null}
        </Cell>

        <Cell span="sm:col-span-2" className="flex justify-end gap-2">
          <Tooltip text="Send" side="bottom">
            <button
              type="button"
              className={cn(outlineButton, 'h-[30px] w-9 px-0')}
              disabled={statement.sending}
              aria-label={`Send entry ${entry.sr_no}`}
              onClick={() => statement.send([entry])}
            >
              {sending ? <Spinner size="xs" className="text-current" /> : <Send className="size-4" />}
            </button>
          </Tooltip>
          <Tooltip text="Delete" side="bottom">
            <button
              type="button"
              className={cn(outlineDanger, 'h-[30px] w-9 px-0')}
              disabled={sending}
              aria-label={`Delete entry ${entry.sr_no}`}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="size-4" />
            </button>
          </Tooltip>
        </Cell>
      </div>

      {confirmingDelete ? (
        <InlineConfirm
          message="Are you sure! You want to Delete this entry"
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false)
            statement.deleteEntry(entry.sr_no)
          }}
        />
      ) : null}
    </div>
  )
}
