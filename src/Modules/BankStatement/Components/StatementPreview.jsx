import { FileSearch } from 'lucide-react'

import { StateMessage } from '@/Components/Common/DataList'
import { DataTable, PlainHead, TablePager } from '@/Components/Common/TableTools'
import { TableCell, TableRow } from '@/Components/ui/table'
import { ENV } from '@/Config/env'
import { useListView } from '@/Hooks/useListView'
import { getActiveCompanyId, getUuid } from '@/Library/secureStorage'
import { cn } from '@/Library/utils'
import { FILE_TYPE } from '@/Modules/BankStatement/bankStatementModel'

/** The CSV's columns at these widths, in the file's own order: Date, Narration, then the amounts. */
const COLUMN_WIDTHS = [110, 320]

const NUMERIC = /^(debit|credit|amount|balance)$/i

const FRAME = 'h-[70vh] min-h-96 w-full rounded-md border border-border'

/** The Tabula reader, for this user and company. */
const tabulaSrc = () => {
  const url = new URL(ENV.TABULA_URL)
  url.searchParams.set('uuid', getUuid() ?? '')
  url.searchParams.set('category', '1')
  url.searchParams.set('company_id', String(getActiveCompanyId() ?? ''))
  return url.toString()
}

function CsvTable({ csv }) {
  const view = useListView(csv.rows, { initialPageSize: 25 })

  if (csv.fields.length === 0) {
    return (
      <StateMessage icon={FileSearch} title="The file is empty">
        There are no rows in this file.
      </StateMessage>
    )
  }

  return (
    <>
      <DataTable
        defaultColumnWidth={110}
        head={csv.fields.map((field, index) => (
          <PlainHead key={field} width={COLUMN_WIDTHS[index]} className={cn(NUMERIC.test(field.trim()) && 'text-right')}>
            {field}
          </PlainHead>
        ))}
      >
        {view.rows.map((row, index) => (
          <TableRow key={index}>
            {csv.fields.map((field) => (
              <TableCell key={field} title={row[field]} className={cn(NUMERIC.test(field.trim()) && 'text-right')}>
                {row[field]}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </DataTable>
      <TablePager view={view} />
    </>
  )
}

/**
 * View Statement: the file being read - the CSV as a table, the PDF itself,
 * or, for PDF before one has been read, the Tabula reader that reads it.
 */
export default function StatementPreview({ statement }) {
  const { fileType, csv, pdfUrl } = statement

  const hint =
    !statement.started && statement.bank ? (
      <p className="mb-3 text-xs text-muted-foreground">
        {fileType === FILE_TYPE.CSV
          ? 'dates format must be dd-mmm-yy (e.g. 01-Dec-23).'
          : fileType === FILE_TYPE.PDF
            ? 'Select the transaction table in PDF.'
            : 'The PDF is read on the server. Beta - check the entries before sending them.'}
      </p>
    ) : null

  let body
  if (fileType === FILE_TYPE.PDF && !pdfUrl && statement.bank) {
    body = ENV.TABULA_URL ? (
      <iframe title="Tabula" src={tabulaSrc()} className={FRAME} />
    ) : (
      <StateMessage icon={FileSearch} tone="error" title="The Tabula reader is not set up">
        VITE_API_TABULA_URL is missing from the environment. Use CSV or AI PDF instead.
      </StateMessage>
    )
  } else if (pdfUrl) {
    body = <iframe title="Statement PDF" src={pdfUrl} className={FRAME} />
  } else if (csv) {
    body = <CsvTable key={statement.file?.name} csv={csv} />
  } else {
    body = (
      <StateMessage icon={FileSearch} title="Statement preview">
        {statement.bank ? 'The file you choose is shown here.' : 'Select a bank to choose the statement file.'}
      </StateMessage>
    )
  }

  return (
    <>
      {hint}
      {body}
    </>
  )
}
