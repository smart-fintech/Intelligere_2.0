import { memo, useCallback, useMemo, useState } from 'react'

import { SelectField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { Input } from '@/Components/ui/input'
import { Table, TableBody, TableHeader, TableRow } from '@/Components/ui/table'
import { toast } from '@/Library/toast'
import {
  CompareHeadRow,
  AmountCells,
  DrawingRows,
  IdentityCells,
  ToneCell,
  UnmatchedHeading,
} from '@/Modules/GstCompare/Components/CompareCells'
import {
  GST_RATE_OPTIONS,
  GST_TYPE_OPTIONS,
  canTickLedgerRow,
  columnCount,
  fromDateInput,
  needsTaxChoice,
  rowsIn,
  rowsOf,
  toDateInput,
  toneOf,
} from '@/Modules/GstCompare/gstCompareModel'
import useProgressiveCount from '@/Modules/GstCompare/useProgressiveCount'

/**
 * One row. Memoised, and handed only its own edit, tick and picks, so typing
 * in one box or ticking one row redraws that row rather than all of them.
 */
const LedgerRow = memo(function LedgerRow({ row, edit, ticked, pick, showName, showInvoiceValue, readOnly, onEdit, onToggle, onPick }) {
  const { key, item } = row
  const gstTone = toneOf(item, key, 'GST No.')
  const dateTone = toneOf(item, key, 'Invoice Date')
  const numberTone = toneOf(item, key, 'Invoice No.')

  return (
    <TableRow>
      <IdentityCells rowKey={key} item={item} showName={showName} />

      <ToneCell tone={dateTone} className="whitespace-nowrap">
        {item.Status?.['Invoice Date'] === 'False' && !readOnly ? (
          <Input
            type="date"
            aria-label={`Invoice date of ${key}`}
            className="h-7 w-34 px-1.5 text-xs"
            value={toDateInput(edit?.['Invoice Date'] ?? item['Invoice Date'])}
            onChange={(event) => {
              const date = fromDateInput(event.target.value)
              if (date) onEdit(key, 'Invoice Date', date, item)
            }}
          />
        ) : (
          item['Invoice Date']
        )}
      </ToneCell>

      <ToneCell tone={numberTone}>
        {item.Status?.['Invoice No.'] === 'False' && !readOnly ? (
          <Input
            aria-label={`Invoice number of ${key}`}
            className="h-7 w-32 px-1.5 text-xs"
            value={edit?.['Invoice No.'] ?? item['Invoice No.'] ?? ''}
            onChange={(event) => onEdit(key, 'Invoice No.', event.target.value, item)}
          />
        ) : (
          item['Invoice No.']
        )}
      </ToneCell>

      <AmountCells rowKey={key} item={item} showInvoiceValue={showInvoiceValue} />

      {readOnly ? null : (
        <>
          <ToneCell tone={gstTone}>
            {canTickLedgerRow(row) ? (
              <Checkbox aria-label={`Tick ${key}`} checked={ticked} onCheckedChange={() => onToggle(key)} />
            ) : null}
          </ToneCell>
          <ToneCell tone={gstTone}>
            {needsTaxChoice(row) ? (
              <div className="flex gap-1">
                <SelectField
                  size="sm"
                  className="w-20"
                  ariaLabel={`GST rate of ${key}`}
                  placeholder="%"
                  options={GST_RATE_OPTIONS}
                  value={pick?.rate !== undefined ? String(pick.rate) : ''}
                  onValueChange={(value) => onPick(key, 'rate', Number(value))}
                />
                <SelectField
                  size="sm"
                  className="w-28"
                  ariaLabel={`GST type of ${key}`}
                  placeholder="GST"
                  options={GST_TYPE_OPTIONS}
                  value={pick?.type ?? ''}
                  onValueChange={(value) => onPick(key, 'type', value)}
                />
              </div>
            ) : null}
          </ToneCell>
        </>
      )}
    </TableRow>
  )
})

/**
 * The books' side of a comparison. A field that did not match can be corrected
 * right in its cell (invoice date, invoice no.); a row whose GST No. did not
 * match can be ticked for RCM or Move to Match, and, when it carries no tax,
 * given a rate and GST type first.
 *
 * Ticks and typing live here, and go with the rows: the parent keys this table
 * on the comparison's version. `readOnly` (View Past Data) offers none of it.
 * A long table is drawn in batches - see useProgressiveCount.
 *
 *   onUpdate(edits)       { "<key>": { "Invoice No.", "Invoice Date" } }
 *   onRcm(keys, picks)    picks: { "<key>": { rate, type } }
 *   onMoveToMatch(keys)
 *   acting                the action running, if any
 */
export default function LedgerCompareTable({ side, showName, showInvoiceValue, readOnly, acting, busyWriting, onUpdate, onRcm, onMoveToMatch }) {
  const [edits, setEdits] = useState({})
  const [ticked, setTicked] = useState([])
  const [picks, setPicks] = useState({})

  const rows = useMemo(() => rowsOf(side), [side])
  const matched = useMemo(() => rowsIn(rows, 'M', 'S'), [rows])
  const unmatched = useMemo(() => rowsIn(rows, 'U'), [rows])
  const tickedSet = useMemo(() => new Set(ticked), [ticked])

  const total = matched.length + unmatched.length
  const shown = useProgressiveCount(total)

  /** The backend reads both fields of an edited row, so the one left alone goes with its own value. */
  const changeEntry = useCallback((key, field, value, item) => {
    setEdits((current) => ({
      ...current,
      [key]: {
        'Invoice No.': item['Invoice No.'],
        'Invoice Date': item['Invoice Date'],
        ...current[key],
        [field]: value,
      },
    }))
  }, [])

  const toggle = useCallback(
    (key) => setTicked((current) => (current.includes(key) ? current.filter((one) => one !== key) : [...current, key])),
    [],
  )

  const pick = useCallback((key, field, value) => setPicks((current) => ({ ...current, [key]: { ...current[key], [field]: value } })), [])

  const withTicked = (run) => {
    if (ticked.length === 0) {
      toast.warning('Please tick the entries first.')
      return
    }
    run()
  }

  const renderRow = (row) => (
    <LedgerRow
      key={row.key}
      row={row}
      edit={edits[row.key]}
      ticked={tickedSet.has(row.key)}
      pick={picks[row.key]}
      showName={showName}
      showInvoiceValue={showInvoiceValue}
      readOnly={readOnly}
      onEdit={changeEntry}
      onToggle={toggle}
      onPick={pick}
    />
  )

  const columns = { trail: readOnly ? 0 : 2, showName, showInvoiceValue }

  return (
    <div className="space-y-3">
      <Table containerClassName="max-h-[65vh] overflow-y-auto">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <CompareHeadRow {...columns} />
        </TableHeader>
        <TableBody>
          {matched.slice(0, shown).map(renderRow)}
          {shown >= matched.length ? (
            <>
              <UnmatchedHeading colSpan={columnCount(columns)} label="Not in GST Portal" empty={unmatched.length === 0} />
              {unmatched.slice(0, shown - matched.length).map(renderRow)}
            </>
          ) : null}
        </TableBody>
      </Table>
      <DrawingRows shown={shown} total={total} />

      {readOnly ? null : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={acting === 'update' || busyWriting} disabled={Boolean(acting)} onClick={() => onUpdate(edits)}>
            {busyWriting ? 'Writing to Tally...' : 'Update Entries'}
          </Button>
          <Button size="sm" loading={acting === 'rcm'} disabled={Boolean(acting)} onClick={() => withTicked(() => onRcm(ticked, picks))}>
            RCM
          </Button>
          <Button size="sm" loading={acting === 'match'} disabled={Boolean(acting)} onClick={() => withTicked(() => onMoveToMatch(ticked))}>
            Move to Match
          </Button>
        </div>
      )}
    </div>
  )
}
