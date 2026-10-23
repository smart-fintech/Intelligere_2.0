import {
  amountInWords,
  dispatchLines,
  formatAmount,
  has,
  hasConsignee,
  hasDispatch,
  headerMetaRows,
  partyLines,
  plainLines,
  sellerLines,
  taxAmountInWords,
  transportRows,
} from '@/Modules/SalesInvoice/Document/invoiceFormat'
import { sheetParts } from '@/Modules/SalesInvoice/Document/invoicePagination'

/**
 * THE PRINTED INVOICE - one template for the on-screen preview and the PDF.
 *
 * The PDF engine (invoicePdf.js) captures these very sheets, so there is no
 * second layout to keep in step: what the preview shows is what is printed.
 * Every block reads the invoice model (invoiceModel.js) and its words from
 * invoiceFormat.js; the styles are invoiceSheet.css.
 *
 *   InvoiceSheet   one A4 page - see invoicePagination for what goes where
 *   MeasureHost    every block once, off screen, at the real width, so
 *                  useInvoiceLayout can measure it
 */

/* ------------------------------------------------------------------ */
/* Title and header                                                   */
/* ------------------------------------------------------------------ */

function TitleBlock({ model, pageNo = 1 }) {
  const title = model.invoice.type || 'Tax Invoice'
  return <div className="inv-title">{pageNo > 1 ? `${title} (Page ${pageNo})` : title}</div>
}

/**
 * The e-Invoice band - page 1 only, and only once the invoice has an IRN
 * (`model.einvoice`, set when it is registered): the "Printed on ..." /
 * "e-Invoice" strip, then IRN, Ack No. and Ack Date grouped at the bottom-left
 * with the IRN QR (at least 4cm square) on the right, and page 1's title in
 * the middle of the band. Nothing at all without an IRN.
 */
function IrnBlock({ model }) {
  const e = model.einvoice
  if (!e) return null
  return (
    <div className="inv-irn">
      <div className="inv-irn-strip">
        <span className="inv-printed">{model.printedOn}</span>
        <span className="inv-einv-tag">e-Invoice</span>
      </div>
      <div className="inv-irn-body">
        <TitleBlock model={model} />
        <div className="inv-irn-fields">
          <div className="inv-irn-line">
            <span className="k">IRN</span>
            <span className="c">:</span>
            <span className="v mono">{e.irn}</span>
          </div>
          <div className="inv-irn-line">
            <span className="k">Ack No.</span>
            <span className="c">:</span>
            <span className="v">{e.ackNo}</span>
          </div>
          <div className="inv-irn-line">
            <span className="k">Ack Date</span>
            <span className="c">:</span>
            <span className="v">{e.ackDate}</span>
          </div>
        </div>
        {e.qr ? <img className="inv-irn-qr" src={e.qr} alt="" /> : <div className="inv-irn-qr" />}
      </div>
    </div>
  )
}

/** A cancelled e-invoice: a large red CANCELLED across the sheet. */
function CancelledStamp({ model }) {
  return model.cancelled ? (
    <div className="inv-cancelled" aria-label="Cancelled">
      CANCELLED
    </div>
  ) : null
}

/** A party line's segments - bold where the value is. */
export function Segments({ line }) {
  return line.map((part, index) => (part.b ? <b key={index}>{part.t}</b> : <span key={index}>{part.t}</span>))
}

function MetaCell({ cell }) {
  return (
    <div className="inv-meta-cell">
      <div className="inv-meta-label">{cell.label}</div>
      <div className="inv-meta-value">{cell.value}</div>
    </div>
  )
}

/** One row of the header grid; a lone cell is padded so it stays half-width. */
function MetaRow({ row }) {
  return (
    <div className="inv-meta-row">
      {row.map((cell) => (
        <MetaCell key={cell.label} cell={cell} />
      ))}
      {row.length === 1 ? <div className="inv-meta-cell" /> : null}
    </div>
  )
}

export function PartyBox({ tag, party, plain }) {
  const lines = partyLines(party)
  return (
    <div className="inv-party">
      {tag ? <div className="inv-party-tag">{tag}</div> : null}
      <div className="inv-party-name">{party.name}</div>
      {(plain ? plainLines(lines) : lines).map((line, index) => (
        <div className="inv-party-line" key={index}>
          <Segments line={line} />
        </div>
      ))}
    </div>
  )
}

function HeaderBlock({ model }) {
  const { seller, buyer, shipping, dispatch, invoice } = model

  return (
    <div className="inv-header">
      <div className="inv-header-left">
        <div className="inv-party">
          <div className="inv-seller-head">
            {seller.logo ? <img className="inv-logo" src={seller.logo} alt="" /> : null}
            <div>
              <div className="inv-party-name inv-seller-name">{seller.name}</div>
              {plainLines(sellerLines(seller)).map((line, index) => (
                <div className="inv-party-line" key={index}>
                  <Segments line={line} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <PartyBox tag="Buyer (Bill to)" party={buyer} plain />
        {hasConsignee(shipping) ? <PartyBox tag="Consignee (Ship to)" party={shipping} /> : null}
      </div>

      <div className="inv-header-right">
        {headerMetaRows(invoice).map((row, index) => (
          <MetaRow key={`m${index}`} row={row} />
        ))}
        {transportRows(invoice).map((row, index) => (
          <MetaRow key={`t${index}`} row={row} />
        ))}
        {hasDispatch(dispatch) ? (
          <div className="inv-meta-row">
            <div className="inv-meta-cell">
              <div className="inv-meta-label">Terms of delivery / Dispatch From</div>
              {has(dispatch.company) ? <div className="inv-party-line inv-strong">{dispatch.company}</div> : null}
              {dispatchLines(dispatch).map((line, index) => (
                <div className="inv-party-line" key={index}>
                  <Segments line={line} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Goods table                                                        */
/* ------------------------------------------------------------------ */

/** A figure too wide for its column breaks after a comma, never mid-digit. */
function Figure({ value }) {
  const parts = formatAmount(value).split(',')
  return parts.map((part, index) => (
    <span key={index}>
      {part}
      {index < parts.length - 1 ? (
        <>
          ,<wbr />
        </>
      ) : null}
    </span>
  ))
}

/** The empty cells of a row, by column - so every row draws the same column rules. */
const COLUMNS = ['c-no', 'c-desc', 'c-hsn', 'c-qty', 'c-rate', 'c-per', 'c-amt']

function GoodsHead() {
  return (
    <thead>
      <tr>
        <th className="c-no">No.</th>
        <th className="c-desc">Description of Goods</th>
        <th className="c-hsn">HSN/SAC</th>
        <th className="c-qty">Quantity</th>
        <th className="c-rate">Rate</th>
        <th className="c-per">Per</th>
        <th className="c-amt">Amount</th>
      </tr>
    </thead>
  )
}

function GoodsRow({ row }) {
  if (!row) return null

  if (row.type === 'product') {
    const line = row.data
    return (
      <tr className="inv-item-row">
        <td className="c-no">{row.sr}</td>
        <td className="c-desc">
          <div className="inv-item-name">{line.name}</div>
          {has(line.description) ? <div className="inv-item-desc">{line.description}</div> : null}
        </td>
        <td className="c-hsn">{line.hsn}</td>
        <td className="c-qty">{line.quantity}</td>
        <td className="c-rate">
          <Figure value={line.rate} />
        </td>
        <td className="c-per">{line.per}</td>
        <td className="c-amt">
          <Figure value={line.taxable} />
        </td>
      </tr>
    )
  }

  // A charge, the discount, a GST line, TCS or round off: its name and amount.
  return (
    <tr className="inv-meta-line">
      <td className="c-no" />
      <td className="c-desc">
        {row.label}
        {/* A GST row with no ledger for this company: said in red, on the sheet itself. */}
        {row.missingLedger ? (
          <>
            {' - '}
            <span className="inv-no-ledger">No Ledger</span>
          </>
        ) : null}
      </td>
      <td className="c-hsn" />
      <td className="c-qty" />
      <td className="c-rate" />
      <td className="c-per" />
      <td className="c-amt">
        <Figure value={row.amount} />
      </td>
    </tr>
  )
}

/** The empty stretch that carries the goods box to the foot of its sheet. */
function FillerRow({ height }) {
  return (
    <tr className="inv-filler">
      {COLUMNS.map((column, index) => (
        <td key={column} className={column} style={index === 0 ? { height } : undefined} />
      ))}
    </tr>
  )
}

/** The foot of a non-final sheet. */
function ContinuedRow({ nextPage }) {
  return (
    <tr className="inv-continued">
      <td colSpan={COLUMNS.length}>Continue Page No. {nextPage}</td>
    </tr>
  )
}

function TotalRow({ model }) {
  const quantity = model.lines.filter((line) => line.kind === 'product').reduce((total, line) => total + line.quantity, 0)
  return (
    <tr className="inv-total-row">
      <td className="c-no" />
      <td className="c-desc lbl">Total</td>
      <td className="c-hsn" />
      <td className="c-qty">{quantity}</td>
      <td className="c-rate" />
      <td className="c-per" />
      <td className="c-amt">{formatAmount(model.totals.grandTotal)}</td>
    </tr>
  )
}

/* ------------------------------------------------------------------ */
/* Closing stack                                                      */
/* ------------------------------------------------------------------ */

function WordsBlock({ model }) {
  return (
    <div className="inv-words">
      <div className="top">
        <span className="lbl">Amount Chargeable (in Words)</span>
        <span>E.&amp;O.E</span>
      </div>
      <div className="val">{amountInWords(model.totals.grandTotal)}</div>
    </div>
  )
}

/**
 * The HSN/SAC summary. `part` = { from, to, total, filler } prints rows
 * [from, to) - how a long summary continues on the next sheet; only the
 * closing part carries the Total row. Without a part the whole table prints.
 */
function HsnBlock({ model, part }) {
  const { rows, totals, anySplit, anyIgst } = model.hsn
  if (!rows.length) return null

  const columns = 2 + (anySplit ? 4 : 0) + (anyIgst ? 2 : 0) + 1
  const { from = 0, to = rows.length, total = true, filler = 0 } = part ?? {}
  const rateCells = (rate, amount) => (
    <>
      <td className="center">{rate ?? ''}</td>
      <td>{amount ? formatAmount(amount) : ''}</td>
    </>
  )

  return (
    <table className="inv-hsn" data-cols={columns}>
      <thead>
        <tr>
          <th rowSpan={2} style={{ width: '18%' }}>
            HSN/SAC
          </th>
          <th rowSpan={2} style={{ width: '20%' }}>
            Taxable Value
          </th>
          {anySplit ? <th colSpan={2}>CGST</th> : null}
          {anySplit ? <th colSpan={2}>SGST</th> : null}
          {anyIgst ? <th colSpan={2}>IGST</th> : null}
          <th rowSpan={2} style={{ width: '17%' }}>
            Total TAX Amount
          </th>
        </tr>
        <tr>
          {anySplit ? (
            <>
              <th>Rate(%)</th>
              <th>Amount</th>
              <th>Rate(%)</th>
              <th>Amount</th>
            </>
          ) : null}
          {anyIgst ? (
            <>
              <th>Rate(%)</th>
              <th>Amount</th>
            </>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.slice(from, to).map((row, index) => (
          <tr key={from + index}>
            <td className="center">{row.hsn}</td>
            <td>{formatAmount(row.taxable)}</td>
            {anySplit ? rateCells(row.cgstRate, row.cgst) : null}
            {anySplit ? rateCells(row.sgstRate, row.sgst) : null}
            {anyIgst ? rateCells(row.igstRate, row.igst) : null}
            <td>{formatAmount(row.total)}</td>
          </tr>
        ))}
        {filler > 0 ? (
          <tr className="filler">
            {Array.from({ length: columns }, (_, index) => (
              <td key={index} style={index ? undefined : { height: filler }} />
            ))}
          </tr>
        ) : null}
        {total ? (
          <tr className="tot">
            <td className="center">Total</td>
            <td>{formatAmount(totals.taxable)}</td>
            {anySplit ? (
              <>
                <td />
                <td>{formatAmount(totals.cgst)}</td>
                <td />
                <td>{formatAmount(totals.sgst)}</td>
              </>
            ) : null}
            {anyIgst ? (
              <>
                <td />
                <td>{formatAmount(totals.igst)}</td>
              </>
            ) : null}
            <td>{formatAmount(totals.total)}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}

/** Tax in words, bank and note on the left; the Payment QR spanning them on the right. */
function PaySummaryBlock({ model }) {
  const { invoice, bank, other, totals } = model
  return (
    <div className="inv-pay">
      <div className="inv-pay-left">
        <div className="inv-pay-row">
          Tax Amount (in words) : <b>{taxAmountInWords(totals.totalTax)}</b>
        </div>
        {bank ? (
          <div className="inv-pay-row inv-pay-bank">
            <span>
              Bank Name : <b>{bank.bankName}</b>
            </span>
            <span>
              IFSC Code : <b>{bank.ifsc}</b>
            </span>
            <span>
              Account No. : <b>{bank.accountNo}</b>
            </span>
          </div>
        ) : null}
        {has(other.note) ? <div className="inv-pay-row inv-pay-note">Note : {other.note}</div> : null}
      </div>
      {invoice.paymentQr ? (
        <div className="inv-pay-qr">
          <div className="inv-pay-qr-label">Payment QR</div>
          <img src={invoice.paymentQr} alt="" />
        </div>
      ) : null}
    </div>
  )
}

function DeclarationBlock({ model }) {
  return (
    <div className="inv-decl">
      <div className="inv-decl-left">
        <div>Declaration :</div>
        <div className="strong">
          We declare that this {(model.invoice.word || 'Invoice').toLowerCase()} shows the actual price of the goods
          described and that all particulars are true and correct.
        </div>
      </div>
      <div className="inv-decl-right">
        <div className="sig-top">
          <span>For</span>
          <span>{model.seller.name}</span>
        </div>
        {model.seller.signature ? <img className="sig-img" src={model.seller.signature} alt="" /> : <div className="sig-space" />}
        <div className="sig-label">Authorised Signatory</div>
      </div>
    </div>
  )
}

function SheetFoot({ page, total, word = 'Invoice' }) {
  return (
    <>
      <div className="inv-genfoot">This is a Computer Generated {word}</div>
      {total > 1 ? (
        <div className="inv-pageno">
          Page {page} of {total}
        </div>
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* A sheet, and the measuring host                                    */
/* ------------------------------------------------------------------ */

/** One A4 sheet - `page` is one entry of paginate()'s answer. */
export function InvoiceSheet({ model, page, pageNo, pageCount, rowsByKey }) {
  const parts = sheetParts(page)
  return (
    <div className="inv-sheet" data-page={pageNo}>
      {pageNo === 1 ? <IrnBlock model={model} /> : null}
      {/* With an IRN, page 1's title is inside the e-Invoice band. */}
      {pageNo === 1 && model.einvoice ? null : <TitleBlock model={model} pageNo={pageNo} />}
      <HeaderBlock model={model} />
      {parts.goods ? (
        <table className="inv-goods">
          <GoodsHead />
          <tbody>
            {page.keys
              .filter((key) => rowsByKey[key])
              .map((key) => (
                <GoodsRow key={key} row={rowsByKey[key]} />
              ))}
            <FillerRow height={page.filler} />
            {page.isLast ? <TotalRow model={model} /> : <ContinuedRow nextPage={pageNo + 1} />}
          </tbody>
        </table>
      ) : null}
      {page.isLast ? <WordsBlock model={model} /> : null}
      {parts.hsn ? <HsnBlock model={model} part={parts.hsn} /> : null}
      {parts.pay ? (
        <>
          <PaySummaryBlock model={model} />
          <DeclarationBlock model={model} />
        </>
      ) : null}
      <SheetFoot page={pageNo} total={pageCount} word={model.invoice.word} />
      <CancelledStamp model={model} />
    </div>
  )
}

/** One goods-table fragment, in its own table so the fixed column widths hold. */
function Fragment({ measure, children }) {
  return (
    <div ref={measure}>
      <table className="inv-goods">{children}</table>
    </div>
  )
}

/**
 * Every block once, at the sheet's real width, kept out of view (visibility,
 * not display: none - that would measure everything as 0).
 *
 *   register(slot)        a block's ref   ('title', 'header', ...)
 *   register('row', key)  a goods row's ref
 */
export function MeasureHost({ model, register }) {
  return (
    <div className="measure-host" aria-hidden="true">
      <div className="inv-sheet" style={{ minHeight: 0 }}>
        <div ref={register('irn')}>
          <IrnBlock model={model} />
        </div>
        <div ref={register('title')}>
          <TitleBlock model={model} />
        </div>
        <div ref={register('header')}>
          <HeaderBlock model={model} />
        </div>
        <Fragment measure={register('thead')}>
          <GoodsHead />
        </Fragment>
        {model.rows.map((row) => (
          <Fragment key={row.key} measure={register('row', row.key)}>
            <tbody>
              <GoodsRow row={row} />
            </tbody>
          </Fragment>
        ))}
        <Fragment measure={register('totalRow')}>
          <tbody>
            <TotalRow model={model} />
          </tbody>
        </Fragment>
        <Fragment measure={register('continued')}>
          <tbody>
            <ContinuedRow nextPage={2} />
          </tbody>
        </Fragment>
        <div ref={register('words')}>
          <WordsBlock model={model} />
        </div>
        <div ref={register('hsn')}>
          <HsnBlock model={model} />
        </div>
        <div ref={register('pay')}>
          <PaySummaryBlock model={model} />
        </div>
        <div ref={register('decl')}>
          <DeclarationBlock model={model} />
        </div>
        <div ref={register('foot')}>
          <SheetFoot page={1} total={2} word={model.invoice.word} />
        </div>
        <div ref={register('footSingle')}>
          <SheetFoot page={1} total={1} word={model.invoice.word} />
        </div>
      </div>
    </div>
  )
}
