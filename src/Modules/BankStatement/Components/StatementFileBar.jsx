import { Download, Upload } from 'lucide-react'

import bankStatementFormatUrl from '@/Assets/format/BankStatementFormat.csv?url'

import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { PasswordField, SelectField } from '@/Components/Common/FormFields'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { FILE_TYPE, FILE_TYPE_OPTIONS } from '@/Modules/BankStatement/bankStatementModel'

/**
 * The controls in the header of the statement card. Before the statement is
 * submitted: the file type, the file, the CSV format, the AI PDF password and
 * Submit File. After it: View Statement / Mapping Ledger. These are toolbar
 * controls, so they use the compact `sm` size.
 */
export default function StatementFileBar({ statement, view, views, onViewChange }) {
  const { fileType, started } = statement

  if (started) {
    return <ViewSwitch options={views} value={view} onValueChange={onViewChange} label="Bank Statement view" idPrefix="bank-statement-view" />
  }

  if (!statement.bank) return null

  const busy = statement.uploading

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <SelectField
        id="bank-statement-file-type"
        ariaLabel="File Type"
        size="sm"
        className="w-36"
        value={fileType}
        onValueChange={statement.setFileType}
        disabled={busy}
        options={FILE_TYPE_OPTIONS}
      />

      {fileType === FILE_TYPE.CSV ? (
        <Button asChild variant="outline" size="sm">
          <a href={bankStatementFormatUrl} download="BankStatementCSVFormat.csv">
            <Download />
            Download Format
          </a>
        </Button>
      ) : null}

      {fileType !== FILE_TYPE.PDF ? (
        <CsvUploadButton
          size="sm"
          variant="outline"
          accept={fileType === FILE_TYPE.CSV ? '.csv' : '.pdf'}
          disabled={busy}
          onFileSelect={statement.setFile}
        >
          {statement.file ? 'Change File' : 'Select File'}
        </CsvUploadButton>
      ) : null}

      {fileType === FILE_TYPE.AI_PDF ? (
        <PasswordField
          id="bank-statement-pdf-password"
          aria-label="PDF Password"
          className="w-56"
          inputClassName="h-8"
          placeholder="PDF Password (if any)"
          autoComplete="off"
          value={statement.password}
          onChange={(event) => statement.setPassword(event.target.value)}
          disabled={busy}
        />
      ) : null}

      {statement.file ? (
        <Button size="sm" icon={Upload} loading={busy} onClick={statement.submit}>
          Submit File
        </Button>
      ) : null}
    </div>
  )
}
