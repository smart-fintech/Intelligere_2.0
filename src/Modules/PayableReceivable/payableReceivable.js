/**
 * Payable Receivable's plain logic - no React, no requests.
 *
 *   readLastSync      the first reply -> { lastSync, message }
 *   readOutstanding   a list's reply  -> { parties, message }
 *   filterParties     the filter row, applied to the invoices
 *   invoiceId / pickSelected   what is ticked for a party's PDF
 *   findInvoice       an invoice of the list as it now stands
 *   overdueDays / overdueText   where an invoice stands against today
 *   checkPayment / checkOpeningBalance   what is wrong with a form - {} when fine
 *   checkCreditDays   what is wrong with a credit days entry
 *
 * `amount` on an invoice is what is STILL outstanding: the backend has already
 * taken its partial payments off.
 */

import { compareToToday, toInputDate } from '@/Utils/date'

/* ------------------------------------------------------------------ */
/* Reading the replies                                                */
/* ------------------------------------------------------------------ */

const toAmount = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** The reply's { msg }, when it has one. */
const readMessage = (reply) => (isRecord(reply) && typeof reply.msg === 'string' ? reply.msg : null)

/** "27-10-2026 11:42:05", or { msg: "company name not exist" }. */
export const readLastSync = (reply) => {
  const lastSync = typeof reply === 'string' ? reply.trim() : ''
  return { lastSync: lastSync || null, message: readMessage(reply) }
}

const readPayment = (payment, index) => ({
  key: String(index),
  amount: toAmount(payment.amount),
  billDate: payment.billdate ?? '',
  paymentDate: payment.payment_date ?? '',
  invoiceNo: payment.invoice_no ?? '',
})

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * An invoice is due no earlier than its bill date + credit days. Tally's
 * `duedate` usually includes them already and then stands as sent; saving
 * credit days only changes `credit_days` in the old backend, so a due date left
 * behind by them is moved up here - or the new days would change nothing on screen.
 */
const readDueDate = ({ duedate, billdate, credit_days: creditDays }) => {
  const sent = duedate ?? ''
  const bill = toInputDate(billdate)
  const days = Number(creditDays)
  if (!bill || !(days > 0)) return sent

  const [year, month, day] = bill.split('-').map(Number)
  const earliest = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10)
  const due = toInputDate(sent)
  return due && due >= earliest ? sent : earliest
}

const readInvoice = (invoice, key) => ({
  key,
  invoiceNo: invoice.invoice_no ?? '',
  billDate: invoice.billdate ?? '',
  dueDate: readDueDate(invoice),
  creditDays: invoice.credit_days ?? null,
  amount: toAmount(invoice.amount),
  partial: (Array.isArray(invoice.partial) ? invoice.partial : []).filter(isRecord).map(readPayment),
})

/**
 * A ledger may hold one invoice or many, and an invoice may have no `partial`
 * at all. The key is the number and which time it has come up (nothing says it
 * cannot repeat within a ledger), so a row stays itself when another one leaves.
 */
const readInvoices = (invoices) => {
  const seen = new Map()
  return invoices.filter(isRecord).map((invoice) => {
    const number = invoice.invoice_no ?? ''
    const times = seen.get(number) ?? 0
    seen.set(number, times + 1)
    return readInvoice(invoice, `${number}#${times}`)
  })
}

const toParty = (name, invoices) => ({
  name,
  invoices,
  total: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
})

/**
 * { "<ledger>": [invoice, ...] } as a list of parties. Anything else in the
 * reply - { msg }, or a ledger with no invoices - is not a party.
 */
export const readOutstanding = (reply) => {
  const parties = isRecord(reply)
    ? Object.entries(reply)
        .filter(([, invoices]) => Array.isArray(invoices))
        .map(([name, invoices]) => toParty(name, readInvoices(invoices)))
        .filter((party) => party.invoices.length > 0)
    : []

  return { parties, message: readMessage(reply) }
}

/* ------------------------------------------------------------------ */
/* An invoice against today                                           */
/* ------------------------------------------------------------------ */

/**
 * Days past the due date: above 0 overdue, 0 due today, below 0 still to come,
 * null with no readable date. Compared as calendar days, so the time of day
 * and the timezone never move the answer.
 *
 * The due date already allows for the credit days (readDueDate), so they are
 * not added again.
 */
export const overdueDays = (dueDate, now = new Date()) => {
  const due = toInputDate(dueDate)
  if (!due) return null

  const [year, month, day] = due.split('-').map(Number)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today - Date.UTC(year, month - 1, day)) / DAY_MS)
}

export const overdueText = (days) => {
  if (days === null) return '--'
  if (days === 0) return 'Due today'
  if (days < 0) return `Due in ${-days} day${days === -1 ? '' : 's'}`
  return `${days} day${days === 1 ? '' : 's'} overdue`
}

/* ------------------------------------------------------------------ */
/* The filter row                                                     */
/* ------------------------------------------------------------------ */

export const NO_FILTERS = Object.freeze({ parties: [], dueFrom: '', dueTo: '', minOverdue: '', minAmount: '' })

/** Text or the list of parties: either way, set when it has a length. */
export const hasFilters = (filters) => Object.values(filters).some((value) => value.length > 0)

const matchesFilters = (invoice, { dueFrom, dueTo, minOverdue, minAmount }) => {
  const due = toInputDate(invoice.dueDate)
  if (dueFrom && (!due || due < dueFrom)) return false
  if (dueTo && (!due || due > dueTo)) return false

  if (minOverdue !== '') {
    const days = overdueDays(invoice.dueDate)
    if (days === null || days < Number(minOverdue)) return false
  }

  return minAmount === '' || invoice.amount >= Number(minAmount)
}

/** Only the invoices the filters leave, and only the parties that still have one. */
export const filterParties = (parties, filters) => {
  if (!hasFilters(filters)) return parties

  return parties
    .filter((party) => filters.parties.length === 0 || filters.parties.includes(party.name))
    .map((party) => toParty(party.name, party.invoices.filter((invoice) => matchesFilters(invoice, filters))))
    .filter((party) => party.invoices.length > 0)
}

/* ------------------------------------------------------------------ */
/* What is ticked for the PDF                                         */
/* ------------------------------------------------------------------ */

export const invoiceId = (partyName, invoice) => `${partyName}|${invoice.key}`

/** Only the ticked invoices, and only the parties that still have one. */
export const pickSelected = (parties, selected) =>
  parties
    .map((party) => toParty(party.name, party.invoices.filter((invoice) => selected.has(invoiceId(party.name, invoice)))))
    .filter((party) => party.invoices.length > 0)

/** An invoice of the list as it now stands - null when it has left it. */
export const findInvoice = (parties, partyName, key) =>
  parties.find((party) => party.name === partyName)?.invoices.find((invoice) => invoice.key === key) ?? null

/* ------------------------------------------------------------------ */
/* The forms                                                          */
/* ------------------------------------------------------------------ */

const checkPastDate = (value) => {
  if (!value) return 'Select the date'
  return compareToToday(value) === 1 ? 'The date cannot be in the future' : undefined
}

/** Compared in paise, so a total of float rounding never refuses the exact amount. */
const toPaise = (value) => Math.round(Number(value) * 100)

export const checkPayment = ({ amount, paymentDate }, outstanding) => {
  const found = {}
  const dateError = checkPastDate(paymentDate)
  if (dateError) found.paymentDate = dateError

  if (String(amount).trim() === '') found.amount = 'Enter the amount'
  else if (!(Number(amount) > 0)) found.amount = 'The amount must be greater than 0'
  else if (toPaise(amount) > toPaise(outstanding)) found.amount = 'The amount cannot be more than the outstanding amount'

  return found
}

/** What is wrong with the credit days - undefined when fine. The backend only saves more than 0. */
export const checkCreditDays = (value) => {
  const days = Number(value)
  return String(value).trim() !== '' && Number.isInteger(days) && days > 0 ? undefined : 'Credit days must be a whole number above 0'
}

export const checkOpeningBalance = ({ ledgerName, openingBalance, date }) => {
  const found = {}
  if (!ledgerName) found.ledgerName = 'Select the ledger'

  if (String(openingBalance).trim() === '') found.openingBalance = 'Enter the opening balance'
  else if (!Number.isFinite(Number(openingBalance))) found.openingBalance = 'The opening balance must be a number'

  const dateError = checkPastDate(date)
  if (dateError) found.date = dateError

  return found
}
