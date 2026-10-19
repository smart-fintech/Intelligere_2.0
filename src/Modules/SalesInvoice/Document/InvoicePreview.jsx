import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Download, Maximize2, Minus, Plus } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { InvoiceSheet, MeasureHost } from '@/Modules/SalesInvoice/Document/InvoiceTemplate'
import { A4 } from '@/Modules/SalesInvoice/Document/invoicePagination'
import useInvoiceLayout from '@/Modules/SalesInvoice/Document/useInvoiceLayout'
import '@/Modules/SalesInvoice/Document/invoiceSheet.css'

/**
 * THE LIVE INVOICE - the printed A4 sheets, beside the form.
 *
 *   model        toInvoiceModel(...) - see invoiceModel.js
 *   onLayout(layout)   the sheets' layout once it is measured for this model -
 *                the split and heights the PDF (invoicePdf.js) is drawn to
 *   onDownload   Download PDF was pressed
 *   downloading  a PDF is being made - the button waits
 *   disabled     nothing may start now (a save is running)
 *
 * The sheets are always laid out at their true 794 px and only SCALED to the
 * panel ("Fit", the default) or by - / +, so zooming never re-wraps a line and
 * the screen shows the very layout - pages, rows, heights - the PDF is drawn to. A transform does not
 * change layout, so the box around them is sized to the scaled height by hand.
 */
const MIN_ZOOM = 0.3
const MAX_ZOOM = 1.4
const STEP = 0.1

export default function InvoicePreview({ model, onLayout, onDownload, downloading = false, disabled = false }) {
  const frameRef = useRef(null)
  const innerRef = useRef(null)
  const [frameWidth, setFrameWidth] = useState(0)
  // A hidden panel has no width - its sheets are measured once it shows again.
  const { register, layout } = useInvoiceLayout(model, frameWidth > 0)

  const rowsByKey = useMemo(() => Object.fromEntries(model.rows.map((row) => [row.key, row])), [model])

  // Until the sheets are measured for THIS model, everything is shown on one
  // unsplit sheet - an earlier layout may name rows that are gone.
  const ready = layout?.model === model
  const pages = useMemo(() => {
    if (ready) return layout.pages
    const hsn = { from: 0, to: model.hsn.rows.length, total: true, filler: 0 }
    return [{ keys: model.rows.map((row) => row.key), goods: true, isLast: true, filler: 0, hsn, pay: true }]
  }, [ready, layout, model])

  /* ---- zoom: fit to the panel's width unless the user picks a size ---- */
  const [naturalHeight, setNaturalHeight] = useState(A4.height)
  const [manualZoom, setManualZoom] = useState(null)

  useLayoutEffect(() => {
    const frame = frameRef.current
    const inner = innerRef.current
    if (!frame || !inner) return undefined
    const observer = new ResizeObserver(() => {
      setFrameWidth(frame.clientWidth)
      setNaturalHeight(inner.offsetHeight)
    })
    observer.observe(frame)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  const fitZoom = frameWidth > 0 ? Math.min(1, Math.max(MIN_ZOOM, (frameWidth - 16) / A4.width)) : 1
  const zoom = manualZoom ?? fitZoom
  const changeZoom = (delta) => setManualZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((zoom + delta) * 100) / 100)))

  // The measured layout is what the PDF is drawn to - hand it up once it is this model's.
  useEffect(() => {
    if (ready) onLayout?.(layout)
  }, [ready, layout, onLayout])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-sm font-semibold text-brand">Preview</p>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">
            {pages.length} page{pages.length > 1 ? 's' : ''}
          </span>
          <Button type="button" variant="outline" size="icon-xs" icon={Minus} aria-label="Zoom out" onClick={() => changeZoom(-STEP)} />
          <span className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button type="button" variant="outline" size="icon-xs" icon={Plus} aria-label="Zoom in" onClick={() => changeZoom(STEP)} />
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            icon={Maximize2}
            aria-label="Fit to width"
            tooltip="Fit to width"
            disabled={manualZoom === null}
            onClick={() => setManualZoom(null)}
          />
          {onDownload ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              icon={Download}
              loading={downloading}
              disabled={disabled || !ready}
              onClick={onDownload}
            >
              {downloading ? 'Preparing...' : 'Download PDF'}
            </Button>
          ) : null}
        </div>
      </div>

      <div ref={frameRef} className="relative min-h-0 flex-1 overflow-auto bg-muted/50 p-2">
        {/* Sized to the scaled sheets, so the scroll area is exactly as tall as what is shown. */}
        <div className="mx-auto" style={{ width: A4.width * zoom, height: naturalHeight * zoom }}>
          <div
            ref={innerRef}
            className="flex flex-col gap-4 [&_.inv-sheet]:shadow-md"
            style={{ width: A4.width, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          >
            {pages.map((page, index) => (
              <InvoiceSheet
                key={index}
                model={model}
                page={page}
                pageNo={index + 1}
                pageCount={pages.length}
                rowsByKey={rowsByKey}
              />
            ))}
          </div>
        </div>
        <MeasureHost model={model} register={register} />
      </div>
    </div>
  )
}
