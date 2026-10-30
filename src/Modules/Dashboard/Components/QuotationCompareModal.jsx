/**
 * COMPARE QUOTATIONS - one Sales Order's quotations side by side
 * (inventory/compare_quotation/ { document_no, company_name }, asked each time
 * it opens - see readQuotationComparison):
 *
 *   each vendor   its name (and Overall Rating out of 10, when it has one),
 *                 Raise a PO, and its quoted lines - Description (SKU details
 *                 on hover), SKU Code, Delivery Time, HSN, Per, Qty, MOQ, Unit
 *                 Rate, Disc %, GST %, Total, Quotation No., Quotation Date
 *   Past Quote    a line the vendor quoted before has an arrow that opens
 *                 those earlier quotations under it - each with its OWN GST %
 *
 * RAISE A PO opens Purchase Invoice on a new Outbound Purchase Order filled
 * from that vendor's quotation (see PurchaseInvoicePage and
 * quotationPurchaseOrder) - the quotation goes along in the router state,
 * with the company it was raised in.
 *
 *   documentNo    the order
 *   companyName, companyId   the active company's
 */

import { Fragment, useEffect, useState } from 'react'
import { AlertCircle, ChevronRight, FileText, ShoppingCart, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { PRODUCT_MODULES } from '@/Constants/dashboardModules'
import { PURCHASE_INVOICE_MODULE } from '@/Constants/purchaseInvoice'
import { cn } from '@/Library/utils'
import { SkuCode } from '@/Modules/SalesInvoice/Components/RequestQuotation'
import { gstPercentOf, readQuotationComparison } from '@/Modules/Dashboard/quotationRequests'
import { compareQuotations } from '@/Services/procurementService'
import { formatIndianCurrency } from '@/Utils/currency'

const PURCHASE_PATH = PRODUCT_MODULES.find((module) => module.key === PURCHASE_INVOICE_MODULE)?.path

const HEAD = 'px-2 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'
const CELL = 'px-2 py-1.5 align-top'

const orDash = (value) => (value === null || value === undefined || String(value).trim() === '' ? '--' : value)
const percent = (value) => `${Number(value) || 0}%`

/** A line's description, with its specification under it. */
function Description({ row }) {
  return (
    <>
      <span className="font-medium">{orDash(row.Description)}</span>
      {row.specification ? <span className="block text-xs text-muted-foreground">{row.specification}</span> : null}
    </>
  )
}

/** The earlier quotations of one line, opened under it. */
function PastQuotations({ rows }) {
  return (
    <div className="animate-in rounded-md border border-border bg-muted/40 p-2 duration-200 fade-in-0 slide-in-from-top-1">
      <p className="mb-1.5 text-xs font-semibold text-brand">Past Quotations</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-xs">
          <thead>
            <tr className="border-b border-border">
              {['Sr', 'Description / Specs', 'SO No.', 'HSN', 'Per', 'Qty', 'MOQ', 'Unit Rate', 'Disc %', 'GST %', 'Quotation No.', 'Quotation Date'].map((head) => (
                <th key={head} className={cn(HEAD, 'text-left')}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((past, index) => (
              <tr key={`${past.quotation_no ?? ''}#${index}`} className="border-t border-border/60">
                <td className={cn(CELL, 'tabular-nums')}>{index + 1}</td>
                <td className={CELL}>
                  <Description row={past} />
                </td>
                <td className={CELL}>{orDash(past.so_no)}</td>
                <td className={CELL}>{orDash(past.Hsn_code)}</td>
                <td className={CELL}>{orDash(past.Per)}</td>
                <td className={cn(CELL, 'text-right tabular-nums')}>{orDash(past.Qty)}</td>
                <td className={cn(CELL, 'text-right tabular-nums')}>{orDash(past.moq)}</td>
                <td className={cn(CELL, 'text-right tabular-nums')}>{formatIndianCurrency(past.unit_rate)}</td>
                <td className={cn(CELL, 'text-right tabular-nums')}>{percent(past.discount)}</td>
                {/* Its own GST - not the line's it sits under. */}
                <td className={cn(CELL, 'text-right tabular-nums')}>{percent(gstPercentOf(past))}</td>
                <td className={CELL}>{orDash(past.quotation_no)}</td>
                <td className={CELL}>{orDash(past.quotation_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** One vendor's quotation - its heading with Raise a PO, then its lines. */
function VendorComparison({ vendor, onRaisePo }) {
  const [openPast, setOpenPast] = useState(() => new Set())
  const togglePast = (key) =>
    setOpenPast((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const showPast = vendor.products.some((row) => row.past.length > 0)
  const columns = 14 + (showPast ? 1 : 0)

  return (
    <section className="animate-in space-y-2 rounded-lg border border-border bg-card p-3 shadow-xs duration-300 fade-in-0 slide-in-from-bottom-2" aria-label={vendor.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-brand">
          {vendor.name}
          {vendor.rating > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
              <Star className="size-3 fill-current" />
              {vendor.rating} / 10
            </span>
          ) : null}
        </h3>
        <Button type="button" size="sm" icon={ShoppingCart} onClick={() => onRaisePo(vendor)} disabled={!PURCHASE_PATH}>
          Raise a PO
        </Button>
      </div>

      {vendor.products.length === 0 ? (
        <p className="text-xs text-muted-foreground">No products came with this quotation.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[72rem] text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Sr', 'Description / Specs', 'SKU Code', 'Delivery Time', 'HSN', 'Per', 'Qty', 'MOQ', 'Unit Rate', 'Disc %', 'GST %', 'Total', 'Quotation No.', 'Quotation Date'].map((head) => (
                  <th key={head} className={cn(HEAD, ['Qty', 'MOQ', 'Unit Rate', 'Disc %', 'GST %', 'Total'].includes(head) ? 'text-right' : 'text-left')}>
                    {head}
                  </th>
                ))}
                {showPast ? <th className={cn(HEAD, 'text-center')}>Past Quote</th> : null}
              </tr>
            </thead>
            <tbody>
              {vendor.products.map((row, index) => {
                const open = openPast.has(row.key)
                return (
                  <Fragment key={row.key}>
                    <tr className="border-t border-border transition-colors hover:bg-muted/30">
                      <td className={cn(CELL, 'text-muted-foreground tabular-nums')}>{index + 1}</td>
                      <td className={CELL}>
                        <Description row={row} />
                      </td>
                      <td className={CELL}>
                        <SkuCode code={row.sku_code} details={row.sku_details} />
                      </td>
                      <td className={CELL}>{orDash(vendor.master.delivery_time)}</td>
                      <td className={CELL}>{orDash(row.Hsn_code)}</td>
                      <td className={CELL}>{orDash(row.Per)}</td>
                      <td className={cn(CELL, 'text-right tabular-nums')}>{orDash(row.Qty)}</td>
                      <td className={cn(CELL, 'text-right tabular-nums')}>{orDash(row.moq)}</td>
                      <td className={cn(CELL, 'text-right tabular-nums')}>{formatIndianCurrency(row.unit_rate)}</td>
                      <td className={cn(CELL, 'text-right tabular-nums')}>{percent(row.discount)}</td>
                      <td className={cn(CELL, 'text-right tabular-nums')}>{percent(gstPercentOf(row))}</td>
                      <td className={cn(CELL, 'text-right font-semibold tabular-nums')}>{formatIndianCurrency(row.total)}</td>
                      <td className={cn(CELL, 'text-muted-foreground')}>{orDash(vendor.master.quotation_no)}</td>
                      <td className={cn(CELL, 'text-muted-foreground')}>{orDash(vendor.master.quotation_date)}</td>
                      {showPast ? (
                        <td className={cn(CELL, 'text-center')}>
                          {row.past.length > 0 ? (
                            <Button
                              type="button"
                              variant="iconEdit"
                              size="icon-sm"
                              icon={ChevronRight}
                              className={cn('[&_svg]:transition-transform [&_svg]:duration-200', open && '[&_svg]:rotate-90')}
                              tooltip={open ? 'Hide past quotations' : 'Show past quotations'}
                              aria-label={`${open ? 'Hide' : 'Show'} past quotations of ${row.Description || `line ${index + 1}`}`}
                              aria-expanded={open}
                              onClick={() => togglePast(row.key)}
                            />
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                    {open ? (
                      <tr>
                        <td colSpan={columns} className="px-2 pb-2">
                          <PastQuotations rows={row.past} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function QuotationCompareModal({ open, onOpenChange, documentNo, companyName, companyId }) {
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading', vendors: [], error: null })
  const [attempt, setAttempt] = useState(0)

  // Asked as it opens (the dialog is mounted afresh each time), and on Retry.
  useEffect(() => {
    if (!open || !documentNo || !companyName) return undefined
    let current = true
    compareQuotations({ companyName, documentNo })
      .then((reply) => current && setState({ status: 'ready', vendors: readQuotationComparison(reply), error: null }))
      .catch((failure) => current && setState({ status: 'failed', vendors: [], error: failure.message || 'The quotations could not be compared.' }))
    return () => {
      current = false
    }
  }, [open, documentNo, companyName, attempt])

  const retry = () => {
    setState({ status: 'loading', vendors: [], error: null })
    setAttempt((count) => count + 1)
  }

  const raisePo = (vendor) => {
    onOpenChange(false)
    navigate(PURCHASE_PATH, { state: { raisePurchaseOrder: { companyId, documentNo, quotation: vendor.raw } } })
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="full" title="Compare Quotations" description={`SO No: ${documentNo || '--'}`} autoFocus={false}>
      {state.status === 'loading' ? (
        <ListSkeleton rows={5} />
      ) : state.status === 'failed' ? (
        <StateMessage icon={AlertCircle} tone="error" title="Could not compare the quotations" action={<RetryButton onClick={retry} />}>
          {state.error}
        </StateMessage>
      ) : state.vendors.length === 0 ? (
        <StateMessage icon={FileText} title="No quotation data returned">
          No vendor has quoted for this Sales Order yet.
        </StateMessage>
      ) : (
        <div className="space-y-3">
          {state.vendors.map((vendor) => (
            <VendorComparison key={vendor.key} vendor={vendor} onRaisePo={raisePo} />
          ))}
        </div>
      )}
    </Modal>
  )
}
