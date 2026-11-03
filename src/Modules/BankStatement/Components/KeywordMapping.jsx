import { useState } from 'react'
import { KeyRound, Trash2 } from 'lucide-react'

import { Field, SelectField } from '@/Components/Common/FormFields'
import { DataTable, PlainHead } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'

/**
 * Mapping Ledger: a keyword found in a narration gives the entry a ledger -
 * "UPI/SWIGGY" -> Staff Welfare. The keywords are kept per bank account, and
 * every entry on the page is matched again as soon as one is added.
 */
export default function KeywordMapping({ statement, ledgerOptions }) {
  const [keyword, setKeyword] = useState('')
  const [ledger, setLedger] = useState('')
  const keywords = Object.entries(statement.mappings)

  const add = async (event) => {
    event.preventDefault()
    if (await statement.addKeyword(keyword, ledger)) {
      setKeyword('')
      setLedger('')
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field
          id="bank-statement-keyword"
          label="Keyword"
          icon={KeyRound}
          placeholder="Enter Keyword"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <SelectField
          id="bank-statement-keyword-ledger"
          label="Ledger"
          placeholder="Select a Ledger"
          searchable
          searchPlaceholder="Search ledger..."
          options={ledgerOptions}
          value={ledger}
          onValueChange={setLedger}
          onClear={() => setLedger('')}
        />
        <Button type="submit" loading={statement.savingKeyword} disabled={!keyword.trim() || !ledger}>
          Submit
        </Button>
      </form>

      <DataTable
        head={
          <>
            <PlainHead width={220}>Keyword</PlainHead>
            <PlainHead width={220}>Ledger</PlainHead>
            <PlainHead width={72}>Actions</PlainHead>
          </>
        }
      >
        {keywords.length === 0 ? (
          <TableRow>
            <TableCell colSpan={3} className="text-center text-muted-foreground">
              No keywords yet
            </TableCell>
          </TableRow>
        ) : (
          keywords.map(([word, name]) => (
            <TableRow key={word}>
              <TableCell title={word}>{word}</TableCell>
              <TableCell title={name}>{name}</TableCell>
              <TableCell>
                <Button
                  variant="iconDelete"
                  size="icon-sm"
                  icon={Trash2}
                  aria-label={`Delete keyword ${word}`}
                  tooltip="Delete"
                  onClick={() => statement.removeKeyword(word)}
                />
              </TableCell>
            </TableRow>
          ))
        )}
      </DataTable>
    </div>
  )
}
