import { CHALLAN_TERMS } from '@/Constants/salesInvoice'
import {
  challanMetaRows,
  dispatchLines,
  has,
  hasConsignee,
  hasDispatch,
  plainLines,
  sellerLines,
} from '@/Modules/SalesInvoice/Document/invoiceFormat'
import { PartyBox, Segments } from '@/Modules/SalesInvoice/Document/InvoiceTemplate'

/**
 * THE PRINTED CHALLAN - the Delivery Challan's own sheet, after the earlier
 * challan PDFs: "DELIVERY CHALLAN" with the copy's heading at the right; the
 * seller, buyer and consignee on the left and the challan's boxes on the
 * right; a goods table of No. / Description of Goods / [SKU Code] / HSN/SAC /
 * Quantity / Per - no rates, amounts or taxes; and the Terms & Conditions with
 * the two signatures at the foot.
 *
 * It is drawn into the same measured layout as the invoice (useInvoiceLayout
 * + invoicePagination): the blocks a challan has are measured in the same
 * slots - 'title', 'header', 'thead', each row, 'continued', and its foot in
 * 'decl' - and the slots it has not (Total, words, HSN/SAC, bank) measure 0,
 * so a long challan splits across sheets by the same rules. The PDF
 * (ChallanPdfDocument) is drawn to that layout.
 *
 *   ChallanSheet         one A4 page
 *   ChallanMeasureHost   every block once, off screen, at the real width
 */

/* ------------------------------------------------------------------ */
/* Title and header                                                   */
/* ------------------------------------------------------------------ */

function ChallanTitle({ model, copy }) {
  return (
    <div className="inv-ch-title">
      <span className="inv-ch-heading">{model.challan.title}</span>
      <span className="inv-ch-copy">({copy ?? model.challan.copy})</span>
    </div>
  )
}

function ChallanMetaCell({ cell }) {
  return (
    <div className="inv-meta-cell">
      {cell.pair ? (
        // Approx Distance and Delivery Mode share one box, side by side.
        <div className="inv-ch-pair">
          <div>
            <div className="inv-meta-label">{cell.label}</div>
            <div className="inv-meta-value">{cell.value}</div>
          </div>
          <div>
            <div className="inv-meta-label">{cell.pair.label}</div>
            <div className="inv-meta-value">{cell.pair.value}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="inv-meta-label">{cell.label}</div>
          <div className="inv-meta-value">{cell.value}</div>
        </>
      )}
    </div>
  )
}

function ChallanHeader({ model }) {
  const { seller, buyer, shipping, dispatch } = model

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
        {challanMetaRows(model).map((row, index) => (
          <div className="inv-meta-row" key={index}>
            {row.map((cell) => (
              <ChallanMetaCell key={cell.label} cell={cell} />
            ))}
            {/* an odd last box keeps its half width, as on the invoice */}
            {row.length === 1 ? <div className="inv-meta-cell" /> : null}
          </div>
        ))}
        {/* Only when a dispatch address was entered, as on the invoice. */}
        {hasDispatch(dispatch) ? (
          <div className="inv-meta-row">
            <div className="inv-meta-cell">
              <div className="inv-meta-label">Terms of delivery/Dispatch From</div>
              {has(dispatch.company) ? <div className="inv-party-line inv-strong">{dispatch.company}</div> : null}
              {[dispatch.address, dispatch.gstin, dispatch.state, dispatch.pincode].some(has)
                ? dispatchLines(dispatch).map((line, index) => (
                    <div className="inv-party-line" key={index}>
                      <Segments line={line} />
                    </div>
                  ))
                : null}
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

/** The columns, in order - SKU Code only when a line has one. */
const columnsOf = (model) => ['c-no', 'c-desc', ...(model.challan.anySku ? ['c-sku'] : []), 'c-hsn', 'c-qty', 'c-per']

function ChallanHead({ model }) {
  return (
    <thead>
      <tr>
        <th className="c-no">No.</th>
        <th className="c-desc">Description of Goods</th>
        {model.challan.anySku ? <th className="c-sku">SKU Code</th> : null}
        <th className="c-hsn">HSN/SAC</th>
        <th className="c-qty">Quantity</th>
        <th className="c-per">Per</th>
      </tr>
    </thead>
  )
}

function ChallanRow({ model, row }) {
  if (!row) return null
  const line = row.data
  return (
    <tr className="inv-item-row">
      <td className="c-no">{row.sr}</td>
      <td className="c-desc">
        <div className="inv-ch-item">{line.productName}</div>
        {has(line.description) ? <div className="inv-item-desc">{line.description}</div> : null}
      </td>
      {model.challan.anySku ? <td className="c-sku">{line.skuCode}</td> : null}
      <td className="c-hsn">{line.hsn}</td>
      <td className="c-qty">{line.quantity}</td>
      <td className="c-per">{line.per}</td>
    </tr>
  )
}

function ChallanFiller({ model, height }) {
  return (
    <tr className="inv-filler">
      {columnsOf(model).map((column, index) => (
        <td key={column} className={column} style={index === 0 ? { height } : undefined} />
      ))}
    </tr>
  )
}

function ChallanContinued({ model, nextPage }) {
  return (
    <tr className="inv-continued">
      <td colSpan={columnsOf(model).length}>Continue Page No. {nextPage}</td>
    </tr>
  )
}

/* ------------------------------------------------------------------ */
/* Foot                                                               */
/* ------------------------------------------------------------------ */

function ChallanFoot({ model }) {
  return (
    <div className="inv-ch-foot">
      <div className="inv-ch-terms">
        <div className="inv-strong">Terms &amp; Conditions :</div>
        <ul>
          {CHALLAN_TERMS.map((term) => (
            <li key={term}>{term}</li>
          ))}
        </ul>
        <div>Receiver&apos;s Signature _____________________</div>
      </div>
      <div className="inv-ch-sign">
        {model.seller.signature ? <img className="sig-img" src={model.seller.signature} alt="" /> : null}
        <div className="inv-ch-sign-label">Signature</div>
      </div>
    </div>
  )
}

function ChallanPageNo({ page, total }) {
  return total > 1 ? (
    <div className="inv-pageno">
      Page {page} of {total}
    </div>
  ) : null
}

/* ------------------------------------------------------------------ */
/* A sheet, and the measuring host                                    */
/* ------------------------------------------------------------------ */

/** One A4 challan sheet - `page` is one entry of paginate()'s answer. */
export function ChallanSheet({ model, page, pageNo, pageCount, rowsByKey }) {
  return (
    <div className="inv-sheet inv-ch" data-page={pageNo}>
      <ChallanTitle model={model} />
      <ChallanHeader model={model} />
      <table className="inv-goods inv-ch-goods">
        <ChallanHead model={model} />
        <tbody>
          {page.keys
            .filter((key) => rowsByKey[key])
            .map((key) => (
              <ChallanRow key={key} model={model} row={rowsByKey[key]} />
            ))}
          <ChallanFiller model={model} height={page.filler} />
          {page.isLast ? null : <ChallanContinued model={model} nextPage={pageNo + 1} />}
        </tbody>
      </table>
      {page.isLast ? <ChallanFoot model={model} /> : null}
      <ChallanPageNo page={pageNo} total={pageCount} />
    </div>
  )
}

/** One goods-table fragment, in its own table so the fixed column widths hold. */
function Fragment({ measure, children }) {
  return (
    <div ref={measure}>
      <table className="inv-goods inv-ch-goods">{children}</table>
    </div>
  )
}

/** Every challan block once, at the sheet's real width, kept out of view - see the top of this file for the slots. */
export function ChallanMeasureHost({ model, register }) {
  return (
    <div className="measure-host" aria-hidden="true">
      <div className="inv-sheet inv-ch" style={{ minHeight: 0 }}>
        <div ref={register('title')}>
          <ChallanTitle model={model} />
        </div>
        <div ref={register('header')}>
          <ChallanHeader model={model} />
        </div>
        <Fragment measure={register('thead')}>
          <ChallanHead model={model} />
        </Fragment>
        {model.rows.map((row) => (
          <Fragment key={row.key} measure={register('row', row.key)}>
            <tbody>
              <ChallanRow model={model} row={row} />
            </tbody>
          </Fragment>
        ))}
        <Fragment measure={register('continued')}>
          <tbody>
            <ChallanContinued model={model} nextPage={2} />
          </tbody>
        </Fragment>
        <div ref={register('decl')}>
          <ChallanFoot model={model} />
        </div>
        <div ref={register('foot')}>
          <ChallanPageNo page={1} total={2} />
        </div>
      </div>
    </div>
  )
}
