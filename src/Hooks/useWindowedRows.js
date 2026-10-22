import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/**
 * WINDOWING A LONG TABLE - only the rows in sight (and a margin around them)
 * are drawn; the rest are two empty rows of the right height, one above and
 * one below, so the table is as tall and scrolls as far as with every row.
 *
 *   const rows = useWindowedRows({ count: view.rows.length, enabled: view.rows.length > 100 })
 *
 *   <TableRow ref={rows.topRef}><TableCell colSpan={n} style={{ height: rows.padTop }} /></TableRow>
 *   {view.rows.slice(rows.start, rows.end).map((row, offset) => (
 *     <TableRow key={...} ref={offset === 0 ? rows.measureRow : undefined}>...</TableRow>
 *   ))}
 *   <TableRow><TableCell colSpan={n} style={{ height: rows.padBottom }} /></TableRow>
 *
 *   start, end          the rows to draw: [start, end)
 *   padTop, padBottom   the height of the rows left out above and below
 *   topRef              on the top spacer row - where the rows begin
 *   measureRow          on the first drawn row - every row is taken to be as
 *                       tall as it (a table row of one line of text is).
 *                       undefined once one has been measured (and when
 *                       disabled)
 *
 * `extra` is a Map of row index -> px, for what some rows have under them
 * (a row opened onto its details), measured by the caller.
 *
 * WHAT IS IN SIGHT is worked out from where the rows are on the screen, so
 * it works whichever box scrolls them (the app's <main>, the window) without
 * looking for it: any scroll, anywhere, and any resize, are checked - a
 * read of one position and a binary search - and the table is drawn again
 * only when the rows to draw have changed.
 *
 * Disabled, every row is drawn - start 0, end count - and nothing is
 * listened to.
 */

/** A table row of one line, before one has been measured. */
const ESTIMATED_ROW = 41

/** Drawn beyond the edges of the screen, so a scroll never shows a gap. */
const MARGIN = 800

/** The first row whose bottom is below `y` - offsets[i] is where row i starts. */
const rowAt = (offsets, y) => {
  let low = 0
  let high = offsets.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (offsets[middle + 1] > y) high = middle
    else low = middle + 1
  }
  return low
}

export function useWindowedRows({ count, enabled, extra = null }) {
  const topRef = useRef(null)
  // null until a row has been measured (measureRow).
  const [measuredRow, setRowHeight] = useState(null)
  const rowHeight = measuredRow ?? ESTIMATED_ROW
  // Until the first check, the rows of one screen.
  const [range, setRange] = useState({ start: 0, end: 30 })

  /** Where each row starts, and (last) the height of them all. */
  const offsets = useMemo(() => {
    if (!enabled) return null

    const list = new Float64Array(count + 1)
    for (let index = 0; index < count; index += 1) list[index + 1] = list[index] + rowHeight + (extra?.get(index) ?? 0)
    return list
  }, [enabled, count, rowHeight, extra])

  const check = useCallback(() => {
    const top = topRef.current
    if (!offsets || !top) return

    const from = -top.getBoundingClientRect().top
    const start = rowAt(offsets, from - MARGIN)
    const end = Math.min(count, rowAt(offsets, from + window.innerHeight + MARGIN) + 1)
    setRange((previous) => (previous.start === start && previous.end === end ? previous : { start, end }))
  }, [offsets, count])

  // Before the screen is painted: the rows of THIS list, at THIS position.
  useLayoutEffect(check, [check])

  useEffect(() => {
    if (!enabled) return undefined

    const options = { capture: true, passive: true }
    document.addEventListener('scroll', check, options)
    window.addEventListener('resize', check, { passive: true })
    return () => {
      document.removeEventListener('scroll', check, options)
      window.removeEventListener('resize', check)
    }
  }, [enabled, check])

  // Measured once: reading a row's height makes the browser lay the table
  // out there and then, which on every new first row would be on every frame
  // of a scroll. The rows are all one line, so one measurement holds - and
  // once it is in, no row is handed `measureRow` any more.
  const measureRow = useCallback((node) => {
    const height = node?.getBoundingClientRect().height
    if (height > 0) setRowHeight(height)
  }, [])

  if (!offsets) return { start: 0, end: count, padTop: 0, padBottom: 0, topRef, measureRow: undefined }

  const start = Math.min(range.start, count)
  const end = Math.min(Math.max(range.end, start), count)
  return {
    start,
    end,
    padTop: offsets[start],
    padBottom: offsets[count] - offsets[end],
    topRef,
    measureRow: measuredRow === null ? measureRow : undefined,
  }
}

export default useWindowedRows
