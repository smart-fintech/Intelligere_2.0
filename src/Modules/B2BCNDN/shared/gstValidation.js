/**
 * THE GST LEDGERS OF ONE ENTRY, checked before anything goes to Tally - the
 * same for a B2B row and a CNDN note. Plain functions: no React, no requests.
 *
 *   gstLinesOf(entry, ledgerNames)   [{ tax, amount, name, issue }] - one per GST
 *                                    the entry carries (amount not 0); `issue` is
 *                                    why its ledger cannot take it, or null
 *
 * A GST line's ledger is wrong when:
 *   - there is none                       "No CGST ledger"
 *   - the company has no ledger by that name (once the ledgers are in)
 *   - its name says another tax or rate   "CGST 9%" on a CGST 2.5% line - the
 *     rule of Utils/gstLedgers (ledgerFitsGst), the one every module uses.
 *     The backend falls back to the FIRST ledger of the tax when none fits the
 *     rate, so this is a real case, not a guess.
 *
 * CGST and SGST are checked at half the entry's GST rate, IGST at the rate.
 * A purchase's GST ledgers are often "Input CGST 9%": the word "Input" is read
 * past here, as ledgerFitsGst - written for the sales side - would refuse it.
 */

import { text, toNumber } from '@/Modules/SalesEntries/shared/ledgerLists'
import { ledgerFitsGst } from '@/Utils/gstLedgers'

const TAXES = Object.freeze([
  ['IGST', 'igst', 1],
  ['CGST', 'cgst', 0.5],
  ['SGST', 'sgst', 0.5],
])

const rateText = (rate) => `${Math.round(rate * 100) / 100}%`

/** Why `name` cannot carry this tax at this rate, or null. */
export const gstLedgerIssue = (tax, name, rate, ledgerNames) => {
  const ledger = text(name)
  if (!ledger) return `No ${tax} ledger`
  if (ledgerNames.size > 0 && !ledgerNames.has(ledger.toLowerCase())) return `${ledger} is not a ledger of the company`
  const known = rate !== null && Number.isFinite(rate)
  if (!ledgerFitsGst(ledger.replace(/\binput\b/gi, ' '), tax, known ? rate : null)) {
    return `${ledger} is not a ${tax}${known ? ` ${rateText(rate)}` : ''} ledger`
  }
  return null
}

/**
 * `entry` { amounts: { igst, cgst, sgst }, taxNames: { igst, cgst, sgst }, gstRate };
 * `ledgerNames` Set of the company's ledger names, lower case (empty while loading).
 */
export const gstLinesOf = ({ amounts, taxNames, gstRate }, ledgerNames) => {
  const rate = text(gstRate) === '' ? null : toNumber(gstRate)
  return TAXES.filter(([, field]) => toNumber(amounts[field]) !== 0).map(([tax, field, share]) => ({
    tax,
    amount: toNumber(amounts[field]),
    name: text(taxNames[field]),
    issue: gstLedgerIssue(tax, taxNames[field], rate === null ? null : rate * share, ledgerNames),
  }))
}

/** "CGST: No CGST ledger · SGST: ..." - every GST issue of an entry, for one line of text. */
export const gstIssuesText = (lines) =>
  lines
    .filter((line) => line.issue)
    .map((line) => line.issue)
    .join(' · ')
