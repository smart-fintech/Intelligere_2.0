/**
 * CNDN - what one note of the b2b_cndn_data/ upload means, and what Tally and
 * the backend are sent for it. Plain functions: no React, no requests.
 *
 *   readCndnUpload(reply)                  the upload's notes -> { notes, similar }
 *   readCndnEntry(note, context)           one note, ready to show
 *   checkCndnEntry(entry, ledger)          why it cannot go to Tally yet, or null
 *   toCndnTallyRow(entry, ledger)          one row of the cndn_data message
 *   toCndnSentRow(entry, ledger, companyId)  one row of the PUT that marks it sent
 *   toCndnMatchedPayload(entry)            new_b2b_cdnr_matched/ - saves an unmatched note
 *   cndnVoucherLines(entry, ledger)        the Dr / Cr lines it becomes
 *
 * The upload SAVES only the notes whose ledger it found (matched); the others
 * are saved one by one once their ledger exists. Only a saved note can be sent
 * and marked: the PUT finds the note by GSTIN, state, ledger, number, date,
 * value and rate as the upload gave them, so those go back unchanged - a note
 * number corrected for Tally goes to Tally only.
 *
 * Its GST ledgers: the cndn mapping's igst_/cgst_/sgst_ keys, else the names
 * the backend found - each checked (shared/gstValidation), a wrong one
 * stopping the note.
 *
 * The ledger a note posts against comes from the cndn mapping by its kind
 * (credit_note_<rate> / debit_note_<rate>, shared/ledgerMapping), a pick on
 * screen going over it. A Debit Note voucher is party Dr, the ledger and GST
 * Cr; a Credit Note the other way round (tally_connector/cndn_data/).
 */

import { B2B_CNDN_SOURCE } from '@/Constants/b2bCndn'
import { readSimilarLedgers } from '@/Modules/B2BCNDN/B2B/b2bEntry'
import { gstLinesOf } from '@/Modules/B2BCNDN/shared/gstValidation'
import { GST_TAX, NOTE_KIND, mappedNoteLedger, mappedTaxLedger, noteKindOf } from '@/Modules/B2BCNDN/shared/ledgerMapping'
import { text, toNumber } from '@/Modules/SalesEntries/shared/ledgerLists'

/**
 * The upload's answer -> { notes: [{ raw, saved, key }], similar }. The last
 * row of matchedList is { duplicate_data }, not a note.
 */
export const readCndnUpload = (reply) => {
  const seen = new Map()
  const keyOf = (raw) => {
    const base = [raw?.gstno, raw?.note_no, raw?.note_date, raw?.note_value].map(text).join('|')
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}#${count}`
  }
  const list = (value, saved) =>
    (Array.isArray(value) ? value : []).filter((raw) => raw && typeof raw === 'object' && 'note_no' in raw).map((raw) => ({ raw, saved, key: keyOf(raw) }))

  return {
    notes: [...list(reply?.matchedList, true), ...list(reply?.unMatchedList, false)],
    similar: readSimilarLedgers(reply?.['similar_ledger_GSTNO.']),
  }
}

/**
 * `note` { raw, saved, key, promoted } - promoted: unmatched at the upload, saved
 * since against the company's ledger of its GSTIN, which is then its party. `context`:
 *   mapping       the flat cndn mapping (flattenMapping)
 *   ledgerNames   Set of the company's ledger names, lower case - empty while loading
 *   ledgerOfGstin (gstin) => the company's ledger with that GSTIN, or ''
 *   tallyNoteNo   the number corrected for Tally, or ''
 */
export const readCndnEntry = ({ raw, saved, key, promoted }, { mapping, ledgerNames, ledgerOfGstin, tallyNoteNo }) => {
  const gstin = text(raw?.gstno)
  const gstinLedger = ledgerOfGstin(gstin)
  const party = (promoted && gstinLedger) || text(raw?.ledgername)
  const kind = noteKindOf(raw?.note_type)
  const amounts = {
    igst: toNumber(raw?.igstLedgerAmount),
    cgst: toNumber(raw?.cgstLedgerAmount),
    sgst: toNumber(raw?.sgstLedgerAmount),
  }
  const rate = raw?.gst_rate
  const gstRate = rate === null || rate === undefined ? '' : text(rate)
  // The cndn mapping's GST keys (igst_<rate>, cgst_<half>, ...) over the names the backend found.
  const taxNames = {
    igst: mappedTaxLedger(mapping, GST_TAX.IGST, { amount: amounts.igst, rate, own: raw?.igstLedgerName }),
    cgst: mappedTaxLedger(mapping, GST_TAX.CGST, { amount: amounts.cgst, rate, own: raw?.cgstLedgerName }),
    sgst: mappedTaxLedger(mapping, GST_TAX.SGST, { amount: amounts.sgst, rate, own: raw?.sgstLedgerName }),
  }
  const taxes = gstLinesOf({ amounts, taxNames, gstRate }, ledgerNames)
  const noteNo = text(raw?.note_no)

  return {
    key,
    saved,
    gstin,
    party,
    // The ledger the company has for this GSTIN - an unmatched note is saved against it.
    gstinLedger,
    notInTally: ledgerNames.size > 0 ? !party || !ledgerNames.has(party.toLowerCase()) : !saved,
    noteNo,
    tallyNoteNo: text(tallyNoteNo) || noteNo,
    noteDate: text(raw?.note_date),
    noteType: text(raw?.note_type) || (kind === NOTE_KIND.DEBIT ? 'Debit note' : 'Credit note'),
    kind,
    supplyType: text(raw?.note_supply_type),
    noteValue: toNumber(raw?.note_value),
    taxable: toNumber(raw?.taxable_value),
    gstRate,
    state: text(raw?.state),
    amounts,
    taxNames,
    // Every GST line with its ledger checked (shared/gstValidation).
    taxes,
    gstIssues: taxes.filter((line) => line.issue),
    mappedLedger: mappedNoteLedger(mapping, kind, raw?.gst_rate),
    raw: raw ?? {},
  }
}

export const noteKindText = (kind) => (kind === NOTE_KIND.DEBIT ? 'Debit Note' : 'Credit Note')

export const checkCndnEntry = (entry, ledger) => {
  if (!entry.saved) return 'Save it as matched first - its ledger was not found when the file was read.'
  if (!entry.tallyNoteNo) return 'It has no note number.'
  if (!entry.noteDate) return 'It has no note date.'
  if (!entry.party) return 'It needs a party ledger.'
  if (!text(ledger)) return `No ${noteKindText(entry.kind).toLowerCase()} ledger is mapped for ${entry.gstRate || 0}%.`
  if (entry.gstIssues.length > 0) return `GST ledger: ${entry.gstIssues.map((line) => line.issue).join(' · ')}.`
  return null
}

/** The agreed cndn_data row (EXE_intelligere.py cndn_data -> tally_connector/cndn_data/). */
export const toCndnTallyRow = (entry, ledger) => ({
  gstno: entry.gstin,
  ledgername: entry.party,
  note_no: entry.tallyNoteNo,
  note_type: entry.noteType,
  note_date: entry.noteDate,
  note_value: entry.raw.note_value,
  taxable_value: entry.raw.taxable_value,
  igstLedgerAmount: entry.amounts.igst,
  cgstLedgerAmount: entry.amounts.cgst,
  sgstLedgerAmount: entry.amounts.sgst,
  igstLedgerName: entry.taxNames.igst,
  cgstLedgerName: entry.taxNames.cgst,
  sgstLedgerName: entry.taxNames.sgst,
  cess: entry.raw.cess ?? '0',
  Voucher_type: text(entry.raw.Voucher_type),
  state: entry.state,
  gst_rate: entry.raw.gst_rate,
  note_supply_type: entry.supplyType,
  purchaseLedgerName: text(ledger),
})

/**
 * The PUT row: the note as the upload gave it - the backend finds the saved
 * note by these values - with the ledger it went to. The GST amounts must be numbers.
 */
export const toCndnSentRow = (entry, ledger, companyId) => ({
  source: B2B_CNDN_SOURCE.CNDN,
  company_id: companyId,
  gstno: entry.raw.gstno,
  ledgername: entry.party,
  note_no: entry.raw.note_no,
  note_date: entry.raw.note_date,
  note_value: entry.raw.note_value,
  state: entry.raw.state,
  gst_rate: entry.raw.gst_rate,
  igstLedgerAmount: entry.amounts.igst,
  cgstLedgerAmount: entry.amounts.cgst,
  sgstLedgerAmount: entry.amounts.sgst,
  igstLedgerName: entry.taxNames.igst,
  cgstLedgerName: entry.taxNames.cgst,
  sgstLedgerName: entry.taxNames.sgst,
  purchaseLedgerName: text(ledger),
})

/** Dates are YYYY-MM-DD, as the upload gives them. */
export const toCndnMatchedPayload = (entry) => ({
  gstno: entry.gstin,
  note_no: entry.noteNo,
  note_date: entry.noteDate,
  note_value: entry.noteValue,
  gst_rate: entry.raw.gst_rate,
})

export const cndnVoucherLines = (entry, ledger) => {
  const debit = entry.kind === NOTE_KIND.DEBIT
  const partySide = debit ? 'Dr' : 'Cr'
  const otherSide = debit ? 'Cr' : 'Dr'
  return [
    {
      side: partySide,
      name: entry.party || '(no party ledger)',
      amount: entry.noteValue,
      kind: 'Party',
    },
    {
      side: otherSide,
      name: text(ledger) || `(no ${noteKindText(entry.kind).toLowerCase()} ledger)`,
      amount: entry.taxable,
      kind: noteKindText(entry.kind),
    },
    ...entry.taxes.map((line) => ({
      side: otherSide,
      name: line.name || `(no ${line.tax} ledger)`,
      amount: line.amount,
      kind: line.tax,
    })),
  ]
}
