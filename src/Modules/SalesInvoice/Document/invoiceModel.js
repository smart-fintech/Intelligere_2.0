/**
 * THE FORM, AS THE PRINTED INVOICE READS IT.
 *
 * The template (InvoiceTemplate.jsx) - and so the preview and the PDF, which
 * is captured from it - reads one `model`:
 *
 *   { seller, buyer, shipping, dispatch, invoice, other, bank,
 *     lines, rows, totals, hsn }
 *
 * built here from the Sales Invoice form and from the module's own figures
 * (invoiceFigures, gstByRate) - so every amount printed is the amount the form
 * shows and the amount saved. Nothing here calculates tax.
 *
 * No IRN, Ack No. or IRN QR is printed: they only exist once the invoice is
 * registered with the IRP.
 */

import { TRANSPORT_REASONS, DELIVERY_MODES, documentTitle } from '@/Constants/salesInvoice'
import {
  effectiveDispatch,
  effectiveShipping,
  invoiceNumberOf,
  lineVariant,
  rateText,
  stateCodeOf,
  supplyTypesOf,
} from '@/Modules/SalesInvoice/salesInvoiceForm'
import { nameSaysGst } from '@/Utils/gstLedgers'

const rupees = (paise) => Math.round(paise || 0) / 100
const labelOf = (options, value) => options.find((option) => option.value === value)?.label ?? value ?? ''

/**
 * @param form           the Sales Invoice form
 * @param figures        invoiceFigures(form)
 * @param gst            gstByRate(figures) - with `ledger` on each entry when
 *                       it has one (resolveGstLedgers, Utils/gstLedgers)
 * @param productsByKey  Map of the products (readProducts)
 * @param ledgersById    Map of the ledgers, for charge names and SAC codes
 * @param bank           the chosen bank account record, or null
 * @param images         { logo, signature, paymentQr } - data URLs, or null
 */
export function toInvoiceModel({ form, figures, gst, productsByKey, ledgersById, bank, images }) {
  const { seller, buyer, document } = form
  const interState = figures.tax.interState
  const ledgerOf = (id) => (id ? ledgersById.get(String(id)) : null)
  const dispatch = effectiveDispatch(form)
  const shipping = effectiveShipping(form)

  /* ---- product lines - only those with a product chosen ---- */
  const lines = form.lines
    .filter((line) => line.productKey)
    .map((line, index) => {
      const product = productsByKey.get(line.productKey)
      const variant = lineVariant(product, line)
      const row = figures.lines[line.id]
      return {
        kind: 'product',
        sr: index + 1,
        id: line.id,
        name: [product?.name, variant?.skuCode].filter(Boolean).join(' - '),
        description: line.description,
        hsn: line.hsn,
        quantity: Number(line.quantity) || 0,
        rate: Number(line.rate) || 0,
        per: line.per,
        gst: interState ? row.igst : row.cgst + row.sgst,
        taxable: rupees(row.taxablePaise),
        cgst: rupees(row.cgstPaise),
        sgst: rupees(row.sgstPaise),
        igst: rupees(row.igstPaise),
      }
    })

  /* ---- other charges - only those with a ledger and an amount ---- */
  const charges = form.charges
    .filter((charge) => charge.ledgerId && figures.charges[charge.id].amountPaise > 0)
    .map((charge) => {
      const row = figures.charges[charge.id]
      return {
        kind: 'charge',
        id: charge.id,
        name: ledgerOf(charge.ledgerId)?.ledeger_name ?? '',
        hsn: ledgerOf(charge.ledgerId)?.ledger_sac ?? '',
        gst: interState ? row.igst : row.cgst + row.sgst,
        taxable: rupees(row.amountPaise),
        cgst: rupees(row.cgstPaise),
        sgst: rupees(row.sgstPaise),
        igst: rupees(row.igstPaise),
      }
    })

  const ledgerName = (section, fallback) => ledgerOf(form[section].ledgerId)?.ledeger_name || fallback

  /* ---- the goods table's row stream ---- */
  const rows = [
    ...lines.map((line) => ({ type: 'product', key: `prod-${line.id}`, sr: line.sr, data: line, amount: line.taxable })),
    ...charges.map((charge) => ({ type: 'charge', key: `chg-${charge.id}`, label: charge.name, amount: charge.taxable })),
  ]
  if (figures.discountPaise) {
    rows.push({ type: 'meta', key: 'discount', label: ledgerName('discount', 'Discount'), amount: -rupees(figures.discountPaise) })
  }
  // A GST row is named by the ledger it is posted to (Utils/gstLedgers - as
  // the discount, TCS and round off rows are named by theirs): "CGST @ 9%" as
  // it is, "Output CGST" with its rate added - "Output CGST @ 9%". With no
  // ledger, by the tax and rate.
  gst.forEach((entry) => {
    const rate = rateText(entry.rate)
    rows.push({
      type: 'meta',
      key: `${entry.tax.toLowerCase()}-${entry.rate}`,
      label: entry.ledger && nameSaysGst(entry.ledger, entry.tax, entry.rate) ? entry.ledger : `${entry.ledger || entry.tax} @ ${rate}%`,
      amount: rupees(entry.paise),
    })
  })
  if (figures.tcsPaise) rows.push({ type: 'meta', key: 'tcs', label: ledgerName('tcs', 'TCS'), amount: rupees(figures.tcsPaise) })
  if (figures.roundOffPaise) {
    rows.push({ type: 'meta', key: 'roundoff', label: ledgerName('roundOff', 'Round Off'), amount: rupees(figures.roundOffPaise) })
  }

  /* ---- HSN / SAC summary: one row per code and rate ----
     EVERY taxable line is in it, so its totals are always the invoice's tax.
     A line with no code is not left out: a charge whose ledger has no SAC is
     listed under the ledger's name, and a product line still being filled in
     under "-", until the code is entered. */
  const hsnMap = new Map()
  ;[...lines, ...charges].forEach((line) => {
    const code = line.hsn || (line.kind === 'charge' ? line.name : '') || '-'
    const key = `${code}|${line.gst}`
    const entry = hsnMap.get(key) ?? {
      hsn: code,
      taxable: 0,
      cgstRate: interState ? null : Number(rateText(line.gst / 2)),
      sgstRate: interState ? null : Number(rateText(line.gst / 2)),
      igstRate: interState ? Number(rateText(line.gst)) : null,
      cgst: 0,
      sgst: 0,
      igst: 0,
    }
    entry.taxable += line.taxable
    entry.cgst += line.cgst
    entry.sgst += line.sgst
    entry.igst += line.igst
    hsnMap.set(key, entry)
  })
  const round = (value) => Math.round(value * 100) / 100
  const hsnRows = [...hsnMap.values()].map((row) => ({
    ...row,
    taxable: round(row.taxable),
    cgst: round(row.cgst),
    sgst: round(row.sgst),
    igst: round(row.igst),
    total: round(row.cgst + row.sgst + row.igst),
  }))
  const total = (key) => round(hsnRows.reduce((sum, row) => sum + row[key], 0))

  const anyIgst = figures.igstPaise > 0
  const anySplit = figures.cgstPaise > 0 || figures.sgstPaise > 0

  return {
    seller: {
      name: seller.name,
      address: seller.address,
      email: seller.email,
      phone: seller.phone,
      website: seller.website,
      gstin: seller.gstin,
      pan: seller.pan,
      udyam: seller.udyam,
      category: seller.category,
      state: seller.state,
      stateCode: stateCodeOf(seller.state),
      pincode: seller.pincode,
      logo: images.logo,
      signature: images.signature,
    },
    buyer: {
      name: buyer.name,
      address: buyer.address,
      email: buyer.email,
      phone: buyer.phone,
      website: buyer.website,
      gstin: buyer.gstin,
      state: buyer.state,
      stateCode: stateCodeOf(buyer.state),
      pincode: buyer.pincode,
    },
    shipping: {
      name: shipping.name,
      address: shipping.address,
      gstin: shipping.gstin,
      state: shipping.state,
      stateCode: stateCodeOf(shipping.state),
      pincode: shipping.pincode,
    },
    dispatch: {
      company: dispatch.name,
      address: dispatch.address,
      gstin: dispatch.gstin,
      state: dispatch.state,
      stateCode: stateCodeOf(dispatch.state),
      pincode: dispatch.pincode,
    },
    invoice: {
      type: documentTitle(form.documentType),
      invoiceNo: invoiceNumberOf(document),
      invoiceDate: document.invoiceDate,
      referenceNo: document.referenceNo,
      referenceDate: document.referenceDate,
      poNo: document.poNo,
      poDate: document.poDate,
      deliveryNote: document.deliveryNote,
      deliveryNoteDate: document.deliveryNoteDate,
      transportReason: labelOf(TRANSPORT_REASONS, document.transportReason),
      dispatchThrough: document.transporter,
      paymentTerms: document.termsOfPayment,
      freightTerms: document.freightTerms,
      lrNo: document.lrNo,
      lrDate: document.lrDate,
      transporterId: document.transporterId,
      vehicleNo: document.vehicleNo,
      distance: document.distance ? `${document.distance} km` : '',
      supply: labelOf(supplyTypesOf(document.supply), document.supplyType) || document.supply,
      deliveryMode: labelOf(DELIVERY_MODES, document.deliveryMode),
      paymentQr: images.paymentQr,
    },
    other: { note: form.note },
    bank: bank ? { bankName: bank.bank_name ?? '', ifsc: bank.ifsc_code ?? '', accountNo: bank.account_no ?? '' } : null,
    lines: [...lines, ...charges],
    rows,
    totals: {
      grandTotal: rupees(figures.totalPaise),
      totalTax: rupees(figures.gstPaise),
      totalCgst: rupees(figures.cgstPaise),
      totalSgst: rupees(figures.sgstPaise),
      totalIgst: rupees(figures.igstPaise),
      discount: rupees(figures.discountPaise),
      tcs: rupees(figures.tcsPaise),
      roundoff: rupees(figures.roundOffPaise),
      anyIgst,
      anySplit,
    },
    hsn: {
      rows: hsnRows,
      totals: { taxable: total('taxable'), cgst: total('cgst'), sgst: total('sgst'), igst: total('igst'), total: total('total') },
      anyIgst,
      anySplit,
    },
  }
}
