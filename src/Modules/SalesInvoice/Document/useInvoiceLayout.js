import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { paginate } from '@/Modules/SalesInvoice/Document/invoicePagination'

/** The blocks measured as a whole. */
const SLOTS = ['irn', 'title', 'header', 'thead', 'totalRow', 'continued', 'words', 'hsn', 'pay', 'decl', 'foot', 'footSingle']

/**
 * Measures every block of the invoice off screen (MeasureHost) and works out
 * the sheets:
 *
 *   const { register, layout } = useInvoiceLayout(model)
 *   <MeasureHost model={model} register={register} />
 *
 *   layout   { model, pages, metrics, rowPx } - `model` is the one it was
 *            measured for, so a caller can tell a layout that has caught up
 *            from one that has not; `metrics` / `rowPx` are the measured block
 *            and goods-row heights, which the PDF document is drawn to
 *
 * `active` is false while the sheets are hidden: nothing is measured then,
 * and they are measured as soon as they show again.
 *
 * It measures again whenever the model changes, and once more when an image
 * inside the host finishes loading - a logo or QR that arrives after the
 * first measurement must not leave a sheet split for the wrong heights.
 */
export default function useInvoiceLayout(model, active = true) {
  const refs = useRef({ rows: new Map() })
  const [layout, setLayout] = useState(null)
  const [imagesLoaded, setImagesLoaded] = useState(0)

  /** register('header') for a block, register('row', key) for a goods row. */
  const register = useCallback(
    (slot, key) => (element) => {
      if (slot === 'row') {
        if (element) refs.current.rows.set(key, element)
        else refs.current.rows.delete(key)
      } else {
        refs.current[slot] = element
      }
    },
    [],
  )

  useLayoutEffect(() => {
    // Hidden (the History view is showing), every block measures 0 - the
    // sheets are measured when they are on screen again.
    if (!active) return undefined
    const blocks = refs.current
    const height = (element) => (element ? element.getBoundingClientRect().height : 0)
    const heightsOf = (element, selector) => (element ? [...element.querySelectorAll(selector)].map(height) : [])

    const metrics = Object.fromEntries(SLOTS.map((slot) => [slot, height(blocks[slot])]))
    // The HSN/SAC summary can continue on the next sheet row by row, so its
    // head, rows and Total row are measured one by one as well.
    metrics.hsnHead = height(blocks.hsn?.querySelector('thead'))
    metrics.hsnRows = heightsOf(blocks.hsn, 'tbody tr:not(.tot)')
    metrics.hsnTot = height(blocks.hsn?.querySelector('tbody tr.tot'))

    const rows = model.rows.map((row) => ({ key: row.key, h: height(blocks.rows.get(row.key)) }))
    setLayout({
      model,
      pages: paginate(rows, metrics),
      metrics,
      rowPx: Object.fromEntries(rows.map((row) => [row.key, row.h])),
    })

    // Measure again when an image still on its way lands.
    const pending = [...(blocks.header?.ownerDocument ?? document).querySelectorAll('.measure-host img')].filter(
      (image) => !image.complete,
    )
    if (pending.length === 0) return undefined
    const settle = () => setImagesLoaded((count) => count + 1)
    pending.forEach((image) => {
      image.addEventListener('load', settle, { once: true })
      image.addEventListener('error', settle, { once: true })
    })
    return () =>
      pending.forEach((image) => {
        image.removeEventListener('load', settle)
        image.removeEventListener('error', settle)
      })
  }, [model, imagesLoaded, active])

  return { register, layout }
}
