import { CornerDownRight, Link2 } from 'lucide-react'

import { cn } from '@/Library/utils'
import { SkuCode } from '@/Modules/SalesInvoice/Components/RequestQuotation'
import { formatIndianCurrency } from '@/Utils/currency'

/**
 * One product line's columns - Product Name, SKU Code, HSN/SAC, GST (%), Rate,
 * Amount, CGST (%), CGST Amount, SGST (%), SGST Amount - the SAME template for
 * the headings, every line and the totals, so they always line up (as
 * HistoryProductRows does). Below its floors it scrolls sideways in its own box.
 */
const GRID =
  'grid min-w-[64rem] grid-cols-[minmax(10rem,2.2fr)_minmax(7rem,1fr)_minmax(6rem,1fr)_minmax(4.5rem,0.6fr)_minmax(6.5rem,1fr)_minmax(7rem,1.1fr)_minmax(4.5rem,0.6fr)_minmax(6.5rem,1fr)_minmax(4.5rem,0.6fr)_minmax(6.5rem,1fr)] gap-x-3'
const CELL = 'min-w-0 [overflow-wrap:anywhere]'
const HEADINGS = [
  ['Product Name'],
  ['SKU Code'],
  ['HSN/SAC'],
  ['GST (%)', true],
  ['Rate', true],
  ['Amount', true],
  ['CGST (%)', true],
  ['CGST Amount', true],
  ['SGST (%)', true],
  ['SGST Amount', true],
]

// 0 is a value - only a missing one is "--".
const rupees = (paise) => (paise === null ? '--' : formatIndianCurrency(paise / 100))
const rate = (value) => (value === null ? '--' : String(Number(value.toFixed(2))))

/**
 * The documents made from an opened History row (readChildDocuments - its
 * child_documents, whatever types they are), under its own products: each in
 * a bordered card of its own, headed by its document number (its type and
 * date beside it), with its Product Details - its own lines only - and a
 * Total row adding up their Amount, CGST Amount and SGST Amount. A SKU code
 * shows its sku_details on hover. Nothing when it has none.
 *
 *   documents    readChildDocuments(...)
 *   documentNo   the parent's number, for the region's name
 */
export default function HistoryChildDocuments({ documents, documentNo }) {
  if (documents.length === 0) return null
  return (
    <div className="space-y-2 border-t border-border px-3 py-3" role="region" aria-label={`Documents linked to ${documentNo || 'the document'}`} data-testid="history-children">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <Link2 className="size-3.5" aria-hidden="true" />
        Linked documents ({documents.length})
      </p>
      {documents.map((document) => (
        <section
          key={document.key}
          className="overflow-hidden rounded-md border border-l-4 border-border border-l-brand/60 bg-card shadow-xs"
          aria-label={`${document.documentType || 'Document'} ${document.documentNo}`}
          data-testid="history-child"
        >
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-brand-soft/60 px-3 py-2">
            <CornerDownRight className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            <h4 className="text-sm font-semibold break-all text-brand" data-testid="history-child-no">
              {document.documentNo || 'Document'}
            </h4>
            {document.documentType ? (
              <span className="rounded-full border border-brand/30 bg-card px-2 py-0.5 text-[11px] font-medium text-brand">{document.documentType}</span>
            ) : null}
            {document.documentDate ? <span className="text-xs text-muted-foreground">{document.documentDate}</span> : null}
          </header>
          <div className="px-3 py-2">
            <p className="pb-1 text-xs font-semibold text-foreground">Product Details</p>
            {document.products.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">No product details are saved for this document.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className={cn(GRID, 'border-b border-border pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase')}>
                  {HEADINGS.map(([heading, right]) => (
                    <span key={heading} className={cn(CELL, right && 'text-right')}>
                      {heading}
                    </span>
                  ))}
                </div>
                {document.products.map((line, index) => (
                  <div key={line.key} className={cn(GRID, 'items-start py-1.5 text-xs text-foreground', index > 0 && 'border-t border-border/60')} data-testid="history-child-line">
                    <span className={cn(CELL, 'font-medium')}>{line.name || '--'}</span>
                    <span className={CELL}>
                      <SkuCode code={line.skuCode} details={line.skuDetails} />
                    </span>
                    <span className={CELL}>{line.hsn || '--'}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rate(line.gstRate)}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(line.ratePaise)}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(line.amountPaise)}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rate(line.cgstRate)}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(line.cgstPaise)}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rate(line.sgstRate)}</span>
                    <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(line.sgstPaise)}</span>
                  </div>
                ))}
                <div className={cn(GRID, 'items-start border-t-2 border-border bg-muted/50 py-1.5 text-xs font-semibold text-foreground')} data-testid="history-child-total">
                  <span className={CELL}>Total</span>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(document.totals.amountPaise)}</span>
                  <span />
                  <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(document.totals.cgstPaise)}</span>
                  <span />
                  <span className={cn(CELL, 'text-right tabular-nums')}>{rupees(document.totals.sgstPaise)}</span>
                </div>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
