/**
 * The Bank Statement downloads - three Excel files, from the summary the
 * backend returns once the statement is sent (getVoucherSummary):
 *
 *   Bankreport.xlsx             one row per ledger, and a grand total
 *   <ledger>_EntriesData.xlsx   one ledger's rows
 *   EntriesData.xlsx            every verified row - for an ERP other than Tally
 *
 * The library is loaded on the first download: nothing else on the page needs it.
 */

import { summaryRows } from '@/Modules/BankStatement/bankStatementModel'

const COLOUR = { white: '#FFFFFF', header: '#DDDDDD', total: '#CCCCCC' }

const cell = (value, backgroundColor = COLOUR.white, bold = false) => ({
  value: value === null || value === undefined ? '' : value,
  backgroundColor,
  borderStyle: 'thin',
  ...(bold ? { fontWeight: 'bold' } : {}),
})

const header = (columns) => columns.map((column) => cell(column, COLOUR.header, true))

const save = async (sheet, fileName) => {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  await writeExcelFile(sheet).toFile(fileName)
}

/** Bankreport.xlsx - Ledger, Payment, Receipt, Contra (counts), Debit, Credit, Difference. */
export const downloadSummary = (byLedger) => {
  const { rows, total } = summaryRows(byLedger)
  const columns = ['Ledger', 'Payment', 'Receipt', 'Contra', 'Debit', 'Credit', 'Difference']
  const line = (values, colour, bold) => values.map((value) => cell(value, colour, bold))

  return save(
    [
      header(columns),
      ...rows.map((row) =>
        line([row.ledger, row.counts.Payment, row.counts.Receipt, row.counts.Contra, row.debit, row.credit, row.difference]),
      ),
      columns.map(() => cell('')),
      line(
        ['GRAND TOTAL', total.counts.Payment, total.counts.Receipt, total.counts.Contra, total.debit, total.credit, total.difference],
        COLOUR.total,
        true,
      ),
    ],
    'Bankreport.xlsx',
  )
}

const ENTRY_COLUMNS = ['Date', 'Transaction', 'Ledger', 'Debit', 'Credit', 'Voucher Type']

const entryRow = (entry) =>
  [entry.date, entry.transaction, entry.ledger, Number(entry.debit) || 0, Number(entry.credit) || 0, entry.Vouchetype].map((value) =>
    cell(value),
  )

/** <ledger>_EntriesData.xlsx - one ledger's rows. */
export const downloadLedgerEntries = (ledger, entries) =>
  save([header(ENTRY_COLUMNS), ...entries.map(entryRow)], `${ledger}_EntriesData.xlsx`)

/** EntriesData.xlsx - every verified row of the statement. */
export const downloadVoucherEntries = (rows) => save([header(ENTRY_COLUMNS), ...rows.map(entryRow)], 'EntriesData.xlsx')
