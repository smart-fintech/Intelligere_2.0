import { memo, useCallback, useMemo, useState } from 'react'
import { Download } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { Table, TableBody, TableHeader, TableRow } from '@/Components/ui/table'
import { toast } from '@/Library/toast'
import {
  AmountCells,
  CompareHeadRow,
  DrawingRows,
  IdentityCells,
  ToneCell,
  UnmatchedHeading,
} from '@/Modules/GstCompare/Components/CompareCells'
import { canTickPortalRow, columnCount, rowsIn, rowsOf, toneOf } from '@/Modules/GstCompare/gstCompareModel'
import useProgressiveCount from '@/Modules/GstCompare/useProgressiveCount'

/** One row - memoised, so a tick redraws that row rather than all of them. */
const PortalRow = memo(function PortalRow({ rowKey, item, ticked, showName, showInvoiceValue, readOnly, onToggle }) {
  const gstTone = toneOf(item, rowKey, 'GST No.')
  return (
    <TableRow>
      {readOnly ? null : (
        <ToneCell tone={gstTone}>
          {canTickPortalRow(rowKey) ? (
            <Checkbox aria-label={`Tick ${rowKey}`} checked={ticked} onCheckedChange={() => onToggle(rowKey)} />
          ) : null}
        </ToneCell>
      )}
      <IdentityCells rowKey={rowKey} item={item} showName={showName} />
      <ToneCell tone={gstTone} className="whitespace-nowrap">
        {item['Invoice Date']}
      </ToneCell>
      <ToneCell tone={toneOf(item, rowKey, 'Invoice No.')}>{item['Invoice No.']}</ToneCell>
      <AmountCells rowKey={rowKey} item={item} showInvoiceValue={showInvoiceValue} />
    </TableRow>
  )
})

/**
 * The GST portal's side of a comparison. Rows can be ticked to go into the
 * GSTR-3B workbook, to be blocked, or to be left out of it - see
 * canTickPortalRow. The parent keys this table on the comparison's version, so
 * ticks go with the rows. `readOnly` (View Past Data) offers none of it.
 * A long table is drawn in batches - see useProgressiveCount.
 *
 *   onGstr3b(keys), onBlock(keys), onNotConsidered(keys)
 *   acting    the action running, if any
 */
export default function PortalCompareTable({ side, showName, showInvoiceValue, readOnly, acting, onGstr3b, onBlock, onNotConsidered }) {
  const [ticked, setTicked] = useState([])

  const rows = useMemo(() => rowsOf(side), [side])
  const matched = useMemo(() => rowsIn(rows, 'M', 'S'), [rows])
  const unmatched = useMemo(() => rowsIn(rows, 'U'), [rows])
  const tickedSet = useMemo(() => new Set(ticked), [ticked])

  const total = matched.length + unmatched.length
  const shown = useProgressiveCount(total)

  const toggle = useCallback(
    (key) => setTicked((current) => (current.includes(key) ? current.filter((one) => one !== key) : [...current, key])),
    [],
  )

  const withTicked = (run) => {
    if (ticked.length === 0) {
      toast.warning('Please tick the entries first.')
      return
    }
    run(ticked)
  }

  const renderRow = ({ key, item }) => (
    <PortalRow
      key={key}
      rowKey={key}
      item={item}
      ticked={tickedSet.has(key)}
      showName={showName}
      showInvoiceValue={showInvoiceValue}
      readOnly={readOnly}
      onToggle={toggle}
    />
  )

  const columns = { lead: readOnly ? 0 : 1, showName, showInvoiceValue }

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
              <UnmatchedHeading colSpan={columnCount(columns)} label="Not in Purchase Register" empty={unmatched.length === 0} />
              {unmatched.slice(0, shown - matched.length).map(renderRow)}
            </>
          ) : null}
        </TableBody>
      </Table>
      <DrawingRows shown={shown} total={total} />

      {readOnly ? null : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={Download} loading={acting === 'gstr3b'} disabled={Boolean(acting)} onClick={() => onGstr3b(ticked)}>
            GSTR3B
          </Button>
          <Button size="sm" loading={acting === 'block'} disabled={Boolean(acting)} onClick={() => withTicked(onBlock)}>
            Block Entries
          </Button>
          <Button size="sm" loading={acting === 'not-considered'} disabled={Boolean(acting)} onClick={() => withTicked(onNotConsidered)}>
            Not to be considered
          </Button>
        </div>
      )}
    </div>
  )
}
