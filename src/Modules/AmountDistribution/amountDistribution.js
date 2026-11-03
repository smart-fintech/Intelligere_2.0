/**
 * Amount Distribution's plain logic - no React, no requests.
 *
 *   EMPTY_FORM                what the form starts with
 *   checkDistribution         what is wrong with the form - {} when fine
 *   buildDistributionPayload  the form -> the generate request
 *   readDistribution          the generate reply -> { rows, file, id, message }
 *   entriesOf                 one row's parallel lists -> one object per entry
 */

import { isValidDate, toInputDate } from '@/Utils/date'

export const EMPTY_FORM = Object.freeze({
  oppositeLedger: '',
  ledgers: [],
  narrations: {},
  mode: '',
  voucherType: '',
  totalAmount: '',
  entries: '',
  date: '',
  endDate: '',
})

export const checkDistribution = ({ oppositeLedger, ledgers, mode, voucherType, totalAmount, entries, date, endDate }) => {
  const errors = {}
  const count = Number(entries)

  if (!oppositeLedger) errors.oppositeLedger = 'Please select the ledger to distribute from.'
  if (ledgers.length === 0) errors.ledgers = 'Please select at least one ledger.'
  if (!mode) errors.mode = 'Please select a mode.'
  if (!voucherType) errors.voucherType = 'Please select a voucher type.'
  if (!(Number(totalAmount) > 0)) errors.totalAmount = 'Please enter an amount above 0.'
  if (!Number.isInteger(count) || count < 1) errors.entries = 'Please enter a whole number of entries, 1 or more.'
  if (!isValidDate(date)) errors.date = 'Please choose a start date.'
  if (!isValidDate(endDate)) errors.endDate = 'Please choose an end date.'
  else if (isValidDate(date) && toInputDate(endDate) < toInputDate(date)) errors.endDate = 'The end date cannot be before the start date.'

  return errors
}

/**
 * The generate request. `total_amount` and `entries` go as the text typed, as
 * the API's own example does. `narration` holds only the ledgers still chosen
 * that were given one - a narration typed for a ledger since removed is not sent.
 */
export const buildDistributionPayload = (form, source, companyId) => ({
  source,
  mode: form.mode,
  total_amount: String(form.totalAmount).trim(),
  entries: String(form.entries).trim(),
  date: form.date,
  opposite_ledger: form.oppositeLedger,
  Voucher_type: form.voucherType,
  end_date: form.endDate,
  narration: Object.fromEntries(
    form.ledgers.map((ledger) => [ledger, String(form.narrations[ledger] ?? '').trim()]).filter(([, text]) => text),
  ),
  company_id: companyId,
  ledger: form.ledgers,
})

/**
 * The reply, with a list that is always a list. Saving names the generated
 * distribution by the reply's `id`; `file` is the complete URL of its CSV.
 */
export const readDistribution = (reply) => {
  const rows = Array.isArray(reply?.data) ? reply.data : []
  return {
    rows,
    file: reply?.file || null,
    id: reply?.id ?? null,
    message: typeof reply?.msg === 'string' ? reply.msg : null,
  }
}

/**
 * A row keeps its entries as lists that run side by side. As long as the longer
 * of them, so an entry with no date still shows its amount, not nothing.
 */
export const entriesOf = (row) => {
  const amounts = Array.isArray(row?.amount) ? row.amount : []
  const dates = Array.isArray(row?.date) ? row.date : []
  const days = Array.isArray(row?.ind_days) ? row.ind_days : []

  return Array.from({ length: Math.max(amounts.length, dates.length) }, (_, index) => ({
    amount: amounts[index] ?? null,
    date: dates[index] ?? null,
    day: days[index] ?? null,
  }))
}
