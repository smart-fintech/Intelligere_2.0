import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, Download, GripVertical, Inbox, Loader2, Send } from 'lucide-react'

import { RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Field } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { Label } from '@/Components/ui/label'
import { Switch } from '@/Components/ui/switch'
import useProducts from '@/Hooks/useProducts'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { readProducts } from '@/Modules/Dashboard/productList'
import StockBookingModal from '@/Modules/SalesInvoice/Components/StockBookingModal'
import { SkuCode } from '@/Modules/SalesInvoice/Components/RequestQuotation'
import {
  buildProgressBody,
  checkProcesses,
  drawableColour,
  editProcess,
  inventoryAddItems,
  prepareProcesses,
  processChart,
  readProcessItems,
  textColourOn,
  withEqualShare,
} from '@/Modules/SalesInvoice/History/soProcess'
import { getProgressReport, saveProgressReport } from '@/Services/salesInvoiceService'

/**
 * A BOOKED SALES ORDER'S PROCESS - Book Process / Show Process in the
 * Inventory Sales Order history (the earlier screen's SO Process, in this
 * app's controls):
 *
 *   1. its processes are asked for (POST inventory/progress_report/
 *      { company_name, document_no }) as it opens, and listed one card each - its
 *      colour, name and SKU code (its details on hover), % Weightage, Color
 *      (typed or picked), Total and Done; dragged (or the arrows) into order
 *   2. Custom Weightage off: every process the equal share; on: each its own,
 *      adding up to 100%. Loaded weightages that are not all the equal share
 *      open with it on - a saved process is never put back to the defaults
 *   3. Submit & Show Chart checks them (soProcess - checkProcesses), then
 *      PUT inventory/progress_report/ with every process as it came - only
 *      the edited fields changed, in the order on screen - total_process_done
 *      the total complete, inventory_add false
 *   4. a reply with inventory_add ([{ name, sku_code, warehouse_id, add_qty,
 *      category }]): those products' stock added first - one at a time in the
 *      Inbound Challan / Purchase Invoice booking form (StockBookingModal):
 *      each its product and SKU, add_qty, started on its warehouse_id, sent
 *      with the order's so_no; not closable - then the same PUT with
 *      inventory_add true. Empty or missing: none of this. A
 *      failure of that last PUT offers it again (Retry Submit) - the stock is
 *      never added twice
 *   5. done: the chart of what was saved - each process's share done, the one
 *      100% bar of their contributions, the total complete - with Download PDF;
 *      the history read again (onSaved). Any edit hides the chart until the
 *      next submit.
 *
 * One submit at a time, however often pressed; the box cannot be closed while
 * one is on its way.
 *
 *   companyName   the active company's comp_name
 *   order         the history row - { soNo }
 *   onClose()
 *   onSaved()     the processes were saved
 */

const HEADING = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'
const tidy = (value) => String(Number(Number(value).toFixed(2)))

/** A process's SKU details for the tooltip - its Quantity left out, as before. */
const skuDetailsOf = (item) =>
  Object.fromEntries(
    Object.entries(item.sku_details && typeof item.sku_details === 'object' ? item.sku_details : {}).filter(
      ([name, value]) => name !== 'Quantity' && value !== null && String(value).trim() !== '',
    ),
  )

/** `rows` with one moved to another place. */
const moved = (rows, key, toIndex) => {
  const row = rows.find((entry) => entry.key === key)
  const rest = rows.filter((entry) => entry.key !== key)
  rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, row)
  return rest
}

/** One process - its card in the list. */
function ProcessCard({ row, index, count, custom, errors, disabled, dragging, onEdit, onMove, dragProps }) {
  const { item } = row
  const name = String(item.name ?? '').trim() || `Process ${index + 1}`
  const colour = drawableColour(item.colour_code)
  const { onHandleDragStart, ...dropProps } = dragProps
  return (
    <li
      {...dropProps}
      className={cn('rounded-md border border-border bg-card p-3 shadow-xs transition-colors', dragging && 'border-brand bg-brand-soft opacity-70')}
      data-testid="process-card"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          draggable={!disabled}
          onDragStart={onHandleDragStart}
          className={cn('inline-flex text-muted-foreground', !disabled && 'cursor-grab active:cursor-grabbing')}
          aria-hidden="true"
        >
          <GripVertical className="size-4" />
        </span>
        <span className="text-sm font-semibold tabular-nums">{index + 1}.</span>
        <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: colour }} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium" data-testid="process-name">
          {name}
        </span>
        {String(item.sku_code ?? '').trim() ? (
          <span className="text-xs text-muted-foreground">
            SKU Code : (<SkuCode code={String(item.sku_code).trim()} details={skuDetailsOf(item)} />)
          </span>
        ) : null}
        <Button type="button" variant="ghost" size="icon-xs" icon={ArrowUp} tooltip="Move up" aria-label={`Move ${name} up`} disabled={disabled || index === 0} onClick={() => onMove(index - 1)} />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          icon={ArrowDown}
          tooltip="Move down"
          aria-label={`Move ${name} down`}
          disabled={disabled || index === count - 1}
          onClick={() => onMove(index + 1)}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-[1fr_1.4fr_1fr_1fr]">
        <Field
          id={`process-${index}-percentage`}
          label="% Weightage"
          inputMode="decimal"
          value={String(item.percentage ?? '')}
          disabled={disabled || !custom}
          error={errors?.percentage}
          onChange={(event) => onEdit('percentage', event.target.value)}
        />
        <Field
          id={`process-${index}-colour`}
          label="Color"
          placeholder="#RRGGBB"
          value={String(item.colour_code ?? '')}
          disabled={disabled}
          error={errors?.colour_code}
          inputClassName="pr-12"
          onChange={(event) => onEdit('colour_code', event.target.value)}
        >
          <input
            type="color"
            aria-label={`Pick the colour of ${name}`}
            value={colour.length === 7 ? colour : '#000000'}
            disabled={disabled}
            onChange={(event) => onEdit('colour_code', event.target.value)}
            className="absolute inset-y-1 right-1 h-auto w-9 cursor-pointer rounded border border-border bg-transparent p-0.5 disabled:cursor-default"
          />
        </Field>
        <Field
          id={`process-${index}-total`}
          label="Total"
          inputMode="decimal"
          value={String(item.total ?? '')}
          disabled={disabled}
          error={errors?.total}
          onChange={(event) => onEdit('total', event.target.value)}
        />
        <Field
          id={`process-${index}-done`}
          label="Done"
          inputMode="decimal"
          value={String(item.totalDone ?? '')}
          disabled={disabled}
          error={errors?.totalDone}
          onChange={(event) => onEdit('totalDone', event.target.value)}
        />
      </div>
    </li>
  )
}

/** The chart of the processes saved - as the earlier screen drew it. */
function ProcessChart({ chart, onDownload, downloading }) {
  const segments = [
    ...chart.processes.filter((process) => process.contribution > 0).map((process) => ({ key: process.key, name: process.name, colour: process.colour, value: process.contribution })),
    ...(chart.remainder > 0.000001 ? [{ key: '__remainder', name: 'Remainder', colour: '#e0e0e0', value: chart.remainder }] : []),
  ]
  return (
    <section className="space-y-3 rounded-md border border-border p-3" aria-label="Process chart" data-testid="process-chart">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-brand">{chart.title || 'Process Report'}</p>
        <p className="ml-auto text-sm font-bold" data-testid="process-total">
          Total complete: {tidy(chart.overall)}%
        </p>
        <Button type="button" size="sm" icon={Download} loading={downloading} onClick={onDownload}>
          Download PDF
        </Button>
      </div>

      <div className="space-y-2">
        {chart.processes.map((process) => (
          <div key={process.key} className="space-y-1.5 rounded-md bg-muted/40 p-2.5" data-testid="process-chart-row">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-sm font-semibold">{process.name}</span>
              <span className="text-muted-foreground">
                {process.total !== null && process.done !== null ? `${tidy(process.done)}/${tidy(process.total)} • ` : ''}
                {Math.round(process.donePct)}% done • Weightage {tidy(process.weight)}%
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${process.donePct}%`, backgroundColor: process.colour }} />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <p className={HEADING}>All processes (100%)</p>
        <div className="flex h-9 overflow-hidden rounded border border-border" role="img" aria-label={`Total complete ${tidy(chart.overall)}%`}>
          {segments.map((segment) => (
            <div
              key={segment.key}
              className="flex items-center justify-center text-xs font-bold"
              style={{ width: `${segment.value}%`, backgroundColor: segment.colour, color: segment.key === '__remainder' ? '#222222' : textColourOn(segment.colour) }}
              title={`${segment.name}: ${tidy(segment.value)}%`}
              data-testid="process-segment"
            >
              {segment.value >= 5 ? `${Math.round(segment.value)}%` : null}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          {[0, 25, 50, 75, 100].map((tick) => (
            <span key={tick}>{tick}%</span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {segments.concat(chart.processes.filter((process) => process.contribution <= 0).map((process) => ({ key: process.key, name: process.name, colour: process.colour }))).map((entry) => (
          <span key={entry.key} className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ backgroundColor: entry.colour }} aria-hidden="true" />
            <span className="font-medium">{entry.name}</span>
          </span>
        ))}
      </div>
    </section>
  )
}

/**
 * The inventory_add products, matched in the product list, then booked one by
 * one (StockBookingModal) - or, when one is not in the list, what to do.
 */
function ProcessStock({ soNo, entries, onDone, onCancel }) {
  const products = useProducts()
  const list = useMemo(() => (products.status === 'ready' ? readProducts(products.rows) : null), [products.status, products.rows])
  const matched = useMemo(() => (list ? inventoryAddItems(entries, list) : null), [list, entries])

  if (matched && matched.items.length > 0 && matched.unmatched.length === 0) {
    return <StockBookingModal items={matched.items} documentId={soNo} documentNo={soNo} extra={{ so_no: soNo }} onDone={onDone} />
  }
  return (
    <Modal open onOpenChange={() => {}} title={`Add stock - ${soNo}`} size="md" closeOnBackdropClick={false} closeOnEsc={false} showCloseButton={false}>
      {products.status === 'failed' ? (
        <StateMessage icon={AlertCircle} tone="error" title="The product list could not be loaded" action={<RetryButton onClick={products.reload} />}>
          {products.error}
        </StateMessage>
      ) : !matched ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading the product list...
        </p>
      ) : (
        <div className="space-y-3" data-testid="process-stock-unmatched">
          <p className="text-sm">
            {matched.unmatched.length > 0
              ? `Not in the product list: ${matched.unmatched.join(', ')}. Add ${matched.unmatched.length === 1 ? 'it' : 'them'} on the Products page, then submit the process again.`
              : 'The products to add stock for were not sent.'}
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function SalesOrderProcessModal({ companyName, order, onClose, onSaved }) {
  const soNo = order.soNo
  // { status: 'loading' | 'ready' | 'failed', error }
  const [load, setLoad] = useState({ status: 'loading', error: null })
  const [attempt, setAttempt] = useState(0)
  const [rows, setRows] = useState([])
  const [custom, setCustom] = useState(false)
  const [errors, setErrors] = useState({})
  // The chart of what was last saved - null until a submit succeeds, and again after any edit.
  const [chart, setChart] = useState(null)
  // 'idle' | 'saving' | 'stock' (inventory_add being booked) | 'finishing' (the PUT after it)
  const [phase, setPhase] = useState('idle')
  // { entries, items } - the products whose stock is added, and the processes submitted with them.
  const [stock, setStock] = useState(null)
  // The processes whose stock is in, waiting for the PUT that failed after it (Retry Submit).
  const [pendingFinal, setPendingFinal] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const busy = useRef(false)
  const chartRef = useRef(null)

  useEffect(() => {
    let current = true
    getProgressReport({ companyName, soNo })
      .then((reply) => {
        if (!current) return
        const prepared = prepareProcesses(readProcessItems(reply))
        setRows(prepared.rows)
        setCustom(prepared.custom)
        setLoad({ status: 'ready', error: null })
      })
      .catch((failure) => current && setLoad({ status: 'failed', error: failure.message || 'The processes could not be loaded.' }))
    return () => {
      current = false
    }
  }, [companyName, soNo, attempt])

  useEffect(() => {
    if (chart) chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [chart])

  const locked = phase !== 'idle' || Boolean(pendingFinal)
  const items = rows.map((row) => row.item)

  /** Any change: the chart (of what was saved) goes until the next submit. */
  const changed = (next) => {
    setRows(next)
    setChart(null)
  }

  const edit = (index, field, value) => {
    const result = editProcess(rows[index].item, field, value)
    if (result.warning) {
      toast.warning(result.warning)
      return
    }
    changed(rows.map((row, at) => (at === index ? { ...row, item: result.item } : row)))
    setErrors((current) => (current[index]?.[field] ? { ...current, [index]: { ...current[index], [field]: undefined } } : current))
  }

  const toggleCustom = (on) => {
    setCustom(on)
    // Off: every process the equal share again; on: the shares as they are, to edit.
    if (!on) changed(withEqualShare(rows))
    else setChart(null)
    setErrors({})
  }

  /** Done - the chart of what was saved, and the history read again. */
  const finish = (submitted, reply) => {
    setChart(processChart(submitted, soNo))
    setPendingFinal(null)
    setStock(null)
    setPhase('idle')
    busy.current = false
    toast.success(typeof reply?.msg === 'string' && reply.msg ? reply.msg : 'The process was saved.')
    onSaved?.()
  }

  /** The PUT after the stock is in - inventory_add true; refused, it is offered again, never the stock. */
  const submitFinal = async (submitted) => {
    if (busy.current && phase !== 'stock') return
    busy.current = true
    setStock(null)
    setPhase('finishing')
    try {
      const reply = await saveProgressReport(buildProgressBody({ companyName, soNo, items: submitted.map((row) => row.item), inventoryAdd: true }))
      finish(submitted, reply)
    } catch (failure) {
      toast.error(failure.message || 'The process could not be saved.')
      setPendingFinal(submitted)
      setPhase('idle')
      busy.current = false
    }
  }

  const submit = async () => {
    if (pendingFinal) {
      submitFinal(pendingFinal)
      return
    }
    if (busy.current) return
    const problem = checkProcesses(items, custom)
    if (problem) {
      setErrors(problem.rows)
      toast.warning(problem.message)
      return
    }
    setErrors({})
    busy.current = true
    setPhase('saving')
    setChart(null)
    const submitted = rows
    try {
      const reply = await saveProgressReport(buildProgressBody({ companyName, soNo, items: submitted.map((row) => row.item), inventoryAdd: false }))
      const entries = Array.isArray(reply?.inventory_add) ? reply.inventory_add : []
      if (entries.length > 0) {
        // Its stock first - the workflow is done only once that, and the PUT after it, are.
        setStock({ entries, submitted })
        setPhase('stock')
        return
      }
      finish(submitted, reply)
    } catch (failure) {
      toast.error(failure.message || 'The process could not be saved.')
      setPhase('idle')
      busy.current = false
    }
  }

  const download = async () => {
    if (!chart || downloading) return
    setDownloading(true)
    try {
      const [{ createProcessChartPdf }, { downloadPdf }] = await Promise.all([
        import('@/Modules/SalesInvoice/History/processChartPdf'),
        import('@/Modules/SalesInvoice/Document/invoicePdf'),
      ])
      downloadPdf(await createProcessChartPdf(chart), `${String(soNo || 'process-report').replace(/[\\/:*?"<>|]+/g, '-')}-process.pdf`)
    } catch (failure) {
      toast.error(failure.message || 'The PDF could not be made.')
    } finally {
      setDownloading(false)
    }
  }

  const dragPropsOf = (row, index) => ({
    onHandleDragStart: (event) => {
      setDragging(row.key)
      event.dataTransfer.effectAllowed = 'move'
      // Some browsers start no drag without data.
      event.dataTransfer.setData('text/plain', row.key)
      const card = event.currentTarget.closest('li')
      if (card) event.dataTransfer.setDragImage(card, 24, 24)
    },
    onDragOver: (event) => {
      if (!dragging) return
      event.preventDefault()
      if (dragging !== row.key) changed(moved(rows, dragging, index))
    },
    onDrop: (event) => event.preventDefault(),
    onDragEnd: () => setDragging(null),
  })

  const closable = phase === 'idle'
  const submitLabel = phase === 'saving' || phase === 'finishing' ? 'Saving...' : pendingFinal ? 'Retry Submit' : 'Submit & Show Chart'
  return (
    <>
      <Modal
        open
        onOpenChange={(next) => !next && closable && onClose()}
        title={`Process - ${soNo || 'Sales Order'}`}
        size="lg"
        closeOnBackdropClick={closable}
        closeOnEsc={closable}
        showCloseButton={closable}
        autoFocus={false}
        footer={
          load.status === 'ready' && rows.length > 0 ? (
            <Button type="button" icon={Send} loading={phase === 'saving' || phase === 'finishing'} disabled={phase !== 'idle'} onClick={submit}>
              {submitLabel}
            </Button>
          ) : null
        }
      >
        {load.status === 'loading' ? (
          <p className="flex items-center gap-2 p-2 text-sm text-muted-foreground" role="status" data-testid="process-loading">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading the processes...
          </p>
        ) : load.status === 'failed' ? (
          <StateMessage icon={AlertCircle} tone="error" title="Could not load the processes" action={<RetryButton onClick={() => { setLoad({ status: 'loading', error: null }); setAttempt((count) => count + 1) }} />}>
            {load.error}
          </StateMessage>
        ) : rows.length === 0 ? (
          <StateMessage icon={Inbox} title="No processes">
            No processes came for {soNo}.
          </StateMessage>
        ) : (
          <div className="space-y-3 p-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm font-medium" data-testid="process-so">
                {soNo}
              </span>
              <span className="flex items-center gap-2">
                <Switch id="process-custom-weightage" checked={custom} disabled={locked} onCheckedChange={toggleCustom} />
                <Label htmlFor="process-custom-weightage" className="text-sm font-semibold">
                  Custom Weightage
                </Label>
              </span>
            </div>
            {pendingFinal ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" role="status">
                The stock is added. The process itself could not be saved - Retry Submit sends it again (the stock is not added twice).
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">Drag the cards, or use the arrows, to set the order of the processes.</p>
            <ol className="space-y-2">
              {rows.map((row, index) => (
                <ProcessCard
                  key={row.key}
                  row={row}
                  index={index}
                  count={rows.length}
                  custom={custom}
                  errors={errors[index]}
                  disabled={locked}
                  dragging={dragging === row.key}
                  onEdit={(field, value) => edit(index, field, value)}
                  onMove={(toIndex) => changed(moved(rows, row.key, toIndex))}
                  dragProps={dragPropsOf(row, index)}
                />
              ))}
            </ol>
            {chart ? (
              <div ref={chartRef}>
                <ProcessChart chart={chart} onDownload={download} downloading={downloading} />
              </div>
            ) : null}
          </div>
        )}
      </Modal>
      {/* The stock inventory_add asked for - mounted only while the submit waits for it. */}
      {phase === 'stock' && stock ? (
        <ProcessStock
          soNo={soNo}
          entries={stock.entries}
          onDone={() => submitFinal(stock.submitted)}
          onCancel={() => {
            setStock(null)
            setPhase('idle')
            busy.current = false
          }}
        />
      ) : null}
    </>
  )
}
