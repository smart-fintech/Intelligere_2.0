/**
 * Cheque Printing's plain logic - no React, no requests.
 *
 *   emptyChequeForm     what the form starts with: today's date, nothing else
 *   checkChequeForm     what is wrong with the form - {} when fine
 *   toChequeDate        YYYY-MM-DD -> the DD/MM/YYYY the API reads
 *   readChequeResult    the print reply -> { ok, images, message }
 *   readChequeDetails   the id-keyed list reply -> rows, each with `id` and `images`
 *   filterCheques       the rows inside the date and amount filters
 *   findName            a name in a list, whatever its case
 *   toChequeTallyRow    a cheque and what was chosen -> its row in the message to Tally
 *   toChequeVerifyBody  the same -> the PUT that marks it verified
 *   chequesCsv          rows -> the text of the CSV download
 *   formatTimestamp     an API timestamp -> DD-MM-YYYY HH:MM
 */

import { chequeImageUrl } from '@/Services/Accounting/chequeService'
import { formatDate, isValidDate, toInputDate } from '@/Utils/date'

/** The most the backend's cheque_amount column can hold. */
const MAX_AMOUNT = 99999999.99

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const toList = (value) => (Array.isArray(value) ? value : value ? [value] : [])

export const emptyChequeForm = () => ({
  payeeName: '',
  bankName: '',
  chequeDate: toInputDate(new Date()),
  chequeAmount: '',
})

export const checkChequeForm = ({ payeeName, bankName, chequeDate, chequeAmount }) => {
  const errors = {}
  const amount = Number(chequeAmount)

  if (!payeeName.trim()) errors.payeeName = 'Please enter the payee name.'
  if (!bankName) errors.bankName = 'Please select a bank.'
  if (!isValidDate(chequeDate)) errors.chequeDate = 'Please choose the cheque date.'
  if (!(amount > 0)) errors.chequeAmount = 'Please enter an amount above 0.'
  else if (amount > MAX_AMOUNT) errors.chequeAmount = 'This amount is too large for a cheque.'
  else if (!/^\d+(\.\d{1,2})?$/.test(String(chequeAmount).trim())) errors.chequeAmount = 'Please use at most 2 decimal places.'

  return errors
}

export const toChequeDate = (value) => formatDate(value).replaceAll('-', '/')

/** `ok` needs an image as well: a CSV whose rows were all skipped still answers success. */
export const readChequeResult = (reply) => {
  const images = toList(reply?.image_url).map(chequeImageUrl).filter(Boolean)
  return {
    ok: reply?.status === 'success' && images.length > 0,
    images,
    message: reply?.message || reply?.msg || null,
  }
}

/** The ids are the reply's keys, so they become a field here and everything else reads rows. */
export const readChequeDetails = (reply) => {
  const entries = Array.isArray(reply) ? reply.map((cheque) => [cheque?.id, cheque]) : isRecord(reply) ? Object.entries(reply) : []

  return entries
    .filter(([, cheque]) => isRecord(cheque))
    .map(([id, cheque]) => ({
      ...cheque,
      id: String(id),
      images: toList(cheque.processed_cheque).map(chequeImageUrl).filter(Boolean),
    }))
}

/** `from` and `to` are YYYY-MM-DD, as cheque_date is; amounts are as typed. An empty one is an open end. */
export const filterCheques = (rows, { from, to, minAmount, maxAmount }) =>
  rows.filter((cheque) => {
    const amount = Number(cheque.cheque_amount)
    if (from && cheque.cheque_date < from) return false
    if (to && cheque.cheque_date > to) return false
    if (minAmount !== '' && !(amount >= Number(minAmount))) return false
    if (maxAmount !== '' && !(amount <= Number(maxAmount))) return false
    return true
  })

/** The name as `names` spells it, or '' - a cheque's "hdfc bank" is the list's "HDFC Bank". */
export const findName = (names, value) => {
  const wanted = String(value ?? '').trim().toLowerCase()
  return (wanted && names.find((name) => name.toLowerCase() === wanted)) || ''
}

/**
 * One cheque as a row of the bank statement message to Tally (`data` of
 * buildBankStatementSocketMessage). The keys are tally_connector/bank_voucher/'s,
 * its spelling included; the company and the module are the message's, not the
 * row's. `bankLedger` is the bank's ledger in Tally, and the amount goes as the
 * API sent it.
 */
export const toChequeTallyRow = (cheque, { email, ledger, bankLedger, narration }) => ({
  id: Number(cheque.id),
  Date: cheque.cheque_date,
  Transaction: narration,
  ledger,
  Ref_no: '',
  AccountantNarration: '',
  Credit: cheque.cheque_amount,
  Debit: `-${cheque.cheque_amount}`,
  Vouchetype: 'Payment',
  is_verified: true,
  prevoius_created_on: 'null',
  prevoius_zero_cr_dr: Number(cheque.cheque_amount) > 0 ? 'Debit' : 'Credit',
  created_on: new Date().toISOString(),
  slug: '',
  created_by: email,
  bank: bankLedger,
})

/** What the PUT that marks a cheque verified reads - the cheque's ledger, bank and narration. */
export const toChequeVerifyBody = (cheque, { ledger, bank, narration }) => ({
  id: Number(cheque.id),
  Ledger: ledger,
  bank,
  cheque_date: cheque.cheque_date,
  cheque_amount: cheque.cheque_amount,
  Transaction: narration,
  is_verified: true,
})

/** A value as one CSV cell: quoted when it holds a comma, a quote or a line break. */
const csvCell = (value) => {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const chequesCsv = (rows) =>
  [
    ['Cheque Date', 'Payee Name', 'Bank Name', 'Cheque Amount', 'Narration', 'Created By', 'Created On'],
    ...rows.map((cheque) => [
      formatDate(cheque.cheque_date, ''),
      cheque.payee_name,
      cheque.bank_name,
      cheque.cheque_amount,
      cheque.narration,
      cheque.created_by,
      formatTimestamp(cheque.created_on, ''),
    ]),
  ]
    .map((line) => line.map(csvCell).join(','))
    .join('\r\n')

/** The time as the API wrote it, in the company's own timezone - not moved to the browser's. */
export const formatTimestamp = (value, fallback = '--') => {
  const time = String(value ?? '').match(/T(\d{2}:\d{2})/)?.[1]
  const date = formatDate(value, fallback)
  return time ? `${date} ${time}` : date
}
