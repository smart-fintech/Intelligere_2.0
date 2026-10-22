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

import {
  CHALLAN_COPIES,
  DOCUMENT_TYPE_INVOICE,
  TRANSPORT_REASONS,
  DELIVERY_MODES,
  documentTitle,
  findDocumentType,
} from '@/Constants/salesInvoice'
import {
  documentProfile,
  effectiveDispatch,
  effectiveShipping,
  invoiceNumberOf,
  isServiceLine,
  lineVariant,
  rateText,
  showsDocumentField,
  stateCodeOf,
  supplyTypesOf,
} from '@/Modules/SalesInvoice/salesInvoiceForm'
import { gstChargesBySlab } from '@/Utils/gstLedgers'

const rupees = (paise) => Math.round(paise || 0) / 100
const labelOf = (options, value) => options.find((option) => option.value === value)?.label ?? value ?? ''

/**
 * @param form           the form as its type has it (applicableForm) - a field
 *                       the type does not show is empty, so it is not printed
 * @param figures        invoiceFigures(form)
 * @param gst            gstByRate(figures) with each entry's `ledger`
 *                       (resolveGstLedgers, Utils/gstLedgers) - printed as the
 *                       saved gst_charges are (gstChargesBySlab)
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
  const profile = documentProfile(form)
  // What the sheet calls the document in its own words - "Invoice" for a Sales
  // Invoice, else the type's name ("Sales Order", "Credit Note", "Purchase
  // Invoice" - a type of another module names itself in its profile).
  const word =
    form.documentType === DOCUMENT_TYPE_INVOICE ? 'Invoice' : (profile.label ?? findDocumentType(form.documentType)?.label ?? 'Document')

  /* ---- the lines - products with a product chosen, services with a ledger ----
     A service is named by its ledger, with its SAC as the code and no unit. */
  const lines = form.lines
    .filter((line) => (isServiceLine(line) ? line.ledgerId : line.productKey))
    .map((line, index) => {
      const service = isServiceLine(line)
      const product = service ? null : productsByKey.get(line.productKey)
      const variant = lineVariant(product, line)
      const row = figures.lines[line.id]
      return {
        kind: 'product',
        sr: index + 1,
        id: line.id,
        name: service ? (ledgerOf(line.ledgerId)?.ledeger_name ?? '') : [product?.name, variant?.skuCode].filter(Boolean).join(' - '),
        // A challan prints the product and its SKU code in columns of their own.
        service,
        productName: service ? '' : (product?.name ?? ''),
        skuCode: service ? '' : (variant?.skuCode ?? ''),
        description: line.description,
        hsn: line.hsn,
        quantity: Number(line.quantity) || 0,
        rate: Number(line.rate) || 0,
        per: service ? '' : line.per,
        gst: interState ? row.igst : row.cgst + row.sgst,
        taxable: rupees(row.taxablePaise),
        // Less its share of the overall discount - what its GST is charged on.
        netTaxable: rupees(row.netTaxablePaise ?? row.taxablePaise),
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
  // The GST rows ARE the saved gst_charges (gstChargesBySlab - the one
  // grouping the payload uses): one row per slab and real ledger, named
  // exactly as the ledger is, with the amount saved under it. A tax with no ledger (none
  // mapped, none for the rate, no basic one) is never given a made-up ledger
  // name: its row is the tax and rate ("IGST 12%") with `missingLedger` set,
  // which the sheet and the PDF mark "No Ledger" in red - and such a
  // document cannot be saved.
  gstChargesBySlab(gst).forEach((charge) => {
    const taxes = charge.entries.map((entry) => `${entry.tax} ${rateText(entry.rate)}%`).join(', ')
    rows.push({
      type: 'meta',
      key: charge.ledger ? `gst-ledger-${charge.slab}-${charge.ledger}` : `gst-missing-${taxes}`,
      label: charge.ledger ?? taxes,
      slab: charge.slab,
      missingLedger: !charge.ledger,
      amount: rupees(charge.paise),
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
    entry.taxable += line.netTaxable ?? line.taxable
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

  const model = {
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
      // Printed only when the buyer has one (a purchase document's buyer - the company).
      pan: buyer.pan,
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
      type: profile.title ?? documentTitle(form.documentType),
      word,
      // The type's own labels for document_no / document_date ("Sales Order No").
      numberLabel: profile.number.replace(/\.$/, ''),
      dateLabel: profile.date,
      invoiceNo: invoiceNumberOf(document),
      invoiceDate: document.invoiceDate,
      // The invoice a Credit / Debit Note adjusts (empty for a type without it).
      linkedInvoiceNo: document.challanInvoiceNo,
      linkedInvoiceDate: document.challanInvoiceDate,
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
      // Only where the type has a Supply Type to choose - never the default it was left on.
      supply: showsDocumentField(form, 'supplyType') ? labelOf(supplyTypesOf(document.supply), document.supplyType) || document.supply : '',
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

  /* ---- a CHALLAN (or Inbound Challan): goods only - its own header, no money ----
     Its lines are the product lines (a service never goes on a challan) and
     its rows those lines alone - no charges, discount, GST, TCS or round off,
     no bank. `copy` is the heading of the copy on screen; the PDF prints each
     copy chosen at saving under its own (CHALLAN_COPIES). */
  if (profile.challan) {
    const goods = lines.filter((line) => !line.service).map((line, index) => ({ ...line, sr: index + 1 }))
    return {
      ...model,
      bank: null,
      lines: goods,
      rows: goods.map((line) => ({ type: 'product', key: `prod-${line.id}`, sr: line.sr, data: line, amount: 0 })),
      challan: {
        title: profile.challanTitle,
        numberLabel: profile.challanLabels?.[0],
        dateLabel: profile.challanLabels?.[1],
        copy: CHALLAN_COPIES[0].label,
        type: document.challanType,
        invoiceNo: document.challanInvoiceNo,
        invoiceDate: document.challanInvoiceDate,
        anySku: goods.some((line) => line.skuCode),
      },
    }
  }
  return model
}