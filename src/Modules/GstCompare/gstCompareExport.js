/**
 * The GST Compare download: one coloured Excel file per side, laid out as
 *
 *   header, matched and similar rows, Total, "Unmatched Entries", header, unmatched rows
 *
 * The Total leaves out the notes that reduce the side - debit notes in the
 * books, credit notes on the portal.
 *
 * The library is loaded on the first download: nothing else in the app needs it.
 */

import { rowsIn, rowsOf } from '@/Modules/GstCompare/gstCompareModel'

const COLOUR = { white: '#FFFFFF', green: '#E5FFE8', red: '#FFDDDB', yellow: '#FAFACF' }

const COLUMNS = ['No.', 'Supplier Name', 'GST No.', 'Type', 'Invoice Date', 'Invoice No.', 'Invoice Value', 'Taxable Value', 'IGST', 'CGST', 'SGST']

/** The row field behind each column; "No." is a running number. */
const FIELD_OF = { Type: 'v_type' }

const boldCell = (value, backgroundColor = COLOUR.white) => ({
  value,
  backgroundColor,
  borderStyle: 'thin',
  fontWeight: 'bold',
})

const headerRow = () => COLUMNS.map((column) => boldCell(column))

const number = (value) => Number.parseFloat(value) || 0

/** A row's cells; the colour of each comes from `colourOf(column)`. */
const dataRow = (item, rowNumber, colourOf) =>
  COLUMNS.map((column) => ({
    value: column === 'No.' ? rowNumber : (item[FIELD_OF[column] ?? column] ?? ''),
    backgroundColor: colourOf(column),
    borderStyle: 'thin',
  }))

const totalRow = (rows, excludedType) => {
  const counted = rows.filter(({ item }) => item.v_type !== excludedType)
  const sum = (field) => counted.reduce((total, { item }) => total + number(item[field]), 0).toFixed(2)
  const totals = { 'No.': 'Total', 'Taxable Value': sum('Taxable Value'), IGST: sum('IGST'), CGST: sum('CGST'), SGST: sum('SGST') }
  return COLUMNS.map((column) => boldCell(totals[column] ?? ''))
}

const buildSheet = (side, excludedType) => {
  const rows = rowsOf(side)
  const matched = rowsIn(rows, 'M', 'S')
  const unmatched = rowsIn(rows, 'U')
  let rowNumber = 0

  return [
    headerRow(),
    ...matched.map(({ item }) => {
      rowNumber += 1
      return dataRow(item, rowNumber, (column) => (item.Status?.[column] === 'False' ? COLOUR.red : COLOUR.green))
    }),
    [],
    totalRow(matched, excludedType),
    [],
    [boldCell('Unmatched Entries', COLOUR.red)],
    [],
    headerRow(),
    ...unmatched.map(({ item }) => {
      rowNumber += 1
      const colour = item.Status?.['GST No.'] === 'False' ? COLOUR.red : COLOUR.yellow
      return dataRow(item, rowNumber, () => colour)
    }),
  ]
}

/** Saves PurchaseLedger-Entries.xlsx and GSTPortal-Entries.xlsx. */
export const downloadComparison = async (comparison) => {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  await writeExcelFile(buildSheet(comparison.rightdata, 'credit note')).toFile('GSTPortal-Entries.xlsx')
  await writeExcelFile(buildSheet(comparison.leftdata, 'debit note')).toFile('PurchaseLedger-Entries.xlsx')
}
