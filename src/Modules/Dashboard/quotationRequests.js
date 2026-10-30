/**
 * COMPARE QUOTATION'S DATA - everything read from, and sent to, the
 * quotation endpoints (see procurementService), with no React in it:
 *
 *   readQuotationRequests(reply)        inventory/AllRequestSO/ -> the History's rows
 *   quoteFormOf(order, vendor)          the Quote Form / Edit Quotation's opening values
 *   changeQuoteRow(row, field, text)    one product cell typed, checked and totalled
 *   buildQuotationBody(...)             the form, as PUT inventory/updated_quotation/ takes it
 *   readQuotationComparison(reply)      inventory/compare_quotation/ -> Compare's vendors
 *   gstPercentOf(row)                   a quoted line's GST %
 *
 * ------------------------------------------------------------------
 * THE HISTORY (inventory/AllRequestSO/)
 * ------------------------------------------------------------------
 * One entry per Sales Order. Its `document_no` is the order; EVERY other
 * property holding an object is one vendor asked - keyed by the vendor's
 * email, and found here by shape, never by a key written down:
 *
 *   { document_no, "<vendor email>": { products: [...the request...], seller,
 *     buyer, requested_at, document_no, document_date,
 *     response?: { master_details, other_details, product: [...the quote...] } } }
 *
 * `products` is what was asked for (Product Name, quantity, HSN Code, Per
 * Unit, GST Rate ...); `response` is the vendor's quotation - there once it
 * has been uploaded (.docx) or filled in with the Quote Form - in the stored
 * shape (Description, Qty, Hsn_code, Per, moq, unit_rate, discount,
 * IGst_rate, total ...). Anything missing is empty, never an error; a reply
 * that is not a list is no requests at all.
 *
 * ------------------------------------------------------------------
 * THE QUOTE FORM (PUT inventory/updated_quotation/)
 * ------------------------------------------------------------------
 *   { document_no, vendor_email, company_name, source: "form",
 *     response: { master_details, other_details: { ...,
 *       additional_charges: { label: amount }, inclusions, exclusions },
 *       product: [...] } }
 *
 * A line's Total is its quantity x unit rate less its discount % - GST is not
 * added (as the earlier screen saved it). The discount is held to 0-99, and
 * no number may be negative. GST % is the IGST rate; CGST and SGST are each
 * half of it. Editing keeps every field the quotation already has - those
 * the form does not show (bank details, note, declaration ...) go back as
 * they came.
 */

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

/** A number the backend may send as text - 0 for none. */
const numberOf = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/** A bare array today; `{ data: [...] }` or `{ results: [...] }` are read too. */
const toList = (reply) => {
  if (Array.isArray(reply)) return reply
  if (Array.isArray(reply?.data)) return reply.data
  if (Array.isArray(reply?.results)) return reply.results
  return []
}

const listOf = (value) => (Array.isArray(value) ? value : [])

/** A SKU's details as one line of text - "Size : 4x9 Color : Red", as a quotation's specification reads. */
export const specificationOf = (skuDetails) =>
  Object.entries(isObject(skuDetails) ? skuDetails : {})
    .filter(([key, value]) => key !== 'Quantity' && text(value) !== '')
    .map(([key, value]) => `${key} : ${text(value)}`)
    .join(' ')

/* ------------------------------------------------------------------ */
/* The History                                                        */
/* ------------------------------------------------------------------ */

/** One product asked for - `key` by its place, as one product can be asked for from two warehouses. */
const readRequestProduct = (product, index) => ({
  key: `${text(product.product_id) || 'product'}#${index}`,
  productId: product.product_id ?? null,
  name: text(product['Product Name']),
  skuCode: text(product.sku_code),
  skuDetails: isObject(product.sku_details) ? product.sku_details : {},
  hsn: text(product['HSN Code']),
  per: text(product['Per Unit']),
  quantity: text(product.quantity),
  gstRate: text(product['GST Rate']),
  warehouseId: text(product.warehouse_id),
})

/** One vendor of an order - `key` is its property name, the vendor's email. */
const readVendor = (key, entry) => {
  const seller = isObject(entry.seller) ? entry.seller : {}
  const response = isObject(entry.response) ? entry.response : {}

  return {
    key,
    requestedAt: text(entry.requested_at),
    documentDate: text(entry.document_date),
    seller: {
      name: text(seller.name),
      // The key itself is the email when the seller does not repeat it.
      email: text(seller.email) || key,
      contact: text(seller.contact),
      gstNo: text(seller.gst_no),
      address: text(seller.address),
      rating: numberOf(seller.rating?.['Overall Rating']),
    },
    products: listOf(entry.products).filter(isObject).map(readRequestProduct),
    // The vendor's quotation, as stored - {} / [] until there is one.
    master: isObject(response.master_details) ? response.master_details : {},
    other: isObject(response.other_details) ? response.other_details : {},
    quoted: listOf(response.product).filter(isObject),
  }
}

export const readQuotationRequests = (reply) =>
  toList(reply)
    .filter(isObject)
    .map((order, index) => {
      const documentNo = text(order.document_no)
      const vendors = Object.entries(order)
        .filter(([key, value]) => key !== 'document_no' && isObject(value))
        .map(([key, value]) => readVendor(key, value))

      return {
        // By its place too: the same order number twice must still be two rows.
        key: `${documentNo || 'order'}#${index}`,
        documentNo,
        vendors,
        vendorNames: vendors.map((vendor) => vendor.seller.name || vendor.key).join(', '),
        // Compare Quotations is offered once any vendor has quoted.
        quotedCount: vendors.filter((vendor) => vendor.quoted.length > 0).length,
      }
    })

/* ------------------------------------------------------------------ */
/* The Quote Form                                                     */
/* ------------------------------------------------------------------ */

/** The Master Details the form shows, in its order. */
export const MASTER_FIELDS = [
  { key: 'quotation_no', label: 'Quotation No.' },
  { key: 'quotation_date', label: 'Quotation Date', date: true },
  { key: 'reference_no', label: 'Reference No.', locked: true },
  { key: 'reference_date', label: 'Reference Date', date: true },
  { key: 'validity_period', label: 'Validity Period', placeholder: 'e.g. 4 month' },
  { key: 'delivery_time', label: 'Delivery Time', placeholder: 'e.g. 1 month' },
  { key: 'advanced_percent_required', label: 'Advanced %' },
  { key: 'credit_terms', label: 'Credit Terms' },
]

/** The Other Details the form shows; the rest of other_details is kept as it came. */
export const OTHER_FIELDS = [
  { key: 'warranty_duration', label: 'Warranty Duration' },
  { key: 'coverage_details', label: 'Coverage Details', wide: true },
]

const OTHER_DETAILS = ['warranty_duration', 'coverage_details', 'bank_name', 'bank_ac_no', 'bank_ifsc', 'bank_branch', 'note', 'declaration', 'authorised_signature_date']

/** The fields a stored quote line carries besides the ones the form fills - sent as they are. */
const EMPTY_ROW = {
  id: '',
  Per: '',
  Qty: '',
  dims: '',
  Description: '',
  specification: '',
  Hsn_code: '',
  moq: '',
  Rate: '',
  unit_rate: '',
  discount: '',
  CGst_rate: '',
  SGst_rate: '',
  IGst_rate: '',
  total: '',
  slug: '',
  user: '',
  group: '',
  company: '',
  platform: '',
  multi_gst: {},
  group_name: '',
  stockitem_guid: '',
  product_description: '',
}

/** quantity x rate less the discount % - no GST - as text with two decimals. */
const totalOf = (row) => {
  const base = numberOf(row.Qty) * numberOf(row.unit_rate)
  return (base - base * (numberOf(row.discount) / 100)).toFixed(2)
}

/** A requested product as a new quote line - the vendor fills in the rate, MOQ and discount. */
const rowFromRequest = (product, index) => {
  const gst = numberOf(product.gstRate)
  return {
    ...EMPTY_ROW,
    key: `request#${index}`,
    id: product.productId ?? '',
    Description: product.name,
    specification: specificationOf(product.skuDetails),
    sku_code: product.skuCode,
    sku_details: product.skuDetails,
    Hsn_code: product.hsn,
    Per: product.per,
    Qty: product.quantity,
    discount: '0',
    IGst_rate: product.gstRate ? String(gst) : '',
    CGst_rate: gst / 2,
    SGst_rate: gst / 2,
    total: '0.00',
    warehouse: product.warehouseId ? [{ warehouse_id: product.warehouseId }] : [],
  }
}

/** A stored quote line, back in the form - as text, for its boxes. */
const rowFromQuoted = (item, index) => ({
  ...EMPTY_ROW,
  ...item,
  key: `quoted#${index}`,
  Qty: text(item.Qty),
  moq: text(item.moq),
  unit_rate: text(item.unit_rate),
  discount: text(item.discount) || '0',
  IGst_rate: text(item.IGst_rate),
  total: numberOf(item.total).toFixed(2),
})

/** A DD/MM/YYYY or DD-MM-YYYY date (as quotations carry them) for a date box - '' when it is neither. */
export const dateInputOf = (value) => {
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text(value))
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : ''
}

/** A date box's value as the quotation saves it - DD/MM/YYYY. */
export const dateTextOf = (input) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(input))
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ''
}

/**
 * What the form opens with. A vendor that has quoted: its quotation (Edit
 * Quotation). One that has not: the request's products, Reference No. the
 * order and Reference Date the order's date (Quote Form).
 */
export const quoteFormOf = (order, vendor) => {
  const editing = Object.keys(vendor.master).length > 0
  const master = vendor.master
  const other = vendor.other
  const charges = Object.entries(isObject(other.additional_charges) ? other.additional_charges : {})

  return {
    editing,
    master: {
      ...master,
      ...Object.fromEntries(MASTER_FIELDS.map(({ key }) => [key, text(master[key])])),
      reference_no: text(master.reference_no) || order.documentNo,
      reference_date: text(master.reference_date) || (editing ? '' : vendor.documentDate),
    },
    other: { ...other, ...Object.fromEntries(OTHER_DETAILS.map((key) => [key, text(other[key])])) },
    charges: charges.length > 0 ? charges.map(([label, amount]) => ({ label, amount: text(amount) })) : [{ label: '', amount: '' }],
    inclusions: listOf(other.inclusions).map(text).filter(Boolean),
    exclusions: listOf(other.exclusions).map(text).filter(Boolean),
    rows: vendor.quoted.length > 0 ? vendor.quoted.map(rowFromQuoted) : vendor.products.map(rowFromRequest),
  }
}

const NUMBER_FIELDS = ['Qty', 'moq', 'unit_rate', 'discount', 'IGst_rate']

/**
 * One product cell typed. A number box takes '' (cleared) or a number - a
 * negative is 0, a discount over 99 is 99, and anything else is turned away
 * (the row comes back unchanged). GST % sets CGST and SGST to half each. The
 * Total follows.
 */
export const changeQuoteRow = (row, field, value) => {
  let next = value
  if (NUMBER_FIELDS.includes(field) && value !== '') {
    const number = Number(value)
    if (!Number.isFinite(number)) return row
    if (number < 0) next = '0'
    else if (field === 'discount' && number > 99) next = '99'
  }

  const changed = { ...row, [field]: next }
  if (field === 'IGst_rate') {
    const gst = numberOf(next)
    changed.CGst_rate = gst / 2
    changed.SGst_rate = gst / 2
  }
  return { ...changed, total: totalOf(changed) }
}

/** The form as PUT inventory/updated_quotation/ takes it - see the note at the top. */
export const buildQuotationBody = ({ documentNo, vendorEmail, companyName, form }) => {
  const additional = form.charges.reduce((charges, { label, amount }) => {
    const name = text(label)
    if (name) charges[name] = text(amount)
    return charges
  }, {})

  const product = form.rows.map((row) => {
    // `key` is the form's own; the rest is the line as stored.
    const line = { ...row }
    delete line.key
    const gst = numberOf(row.IGst_rate)
    return {
      ...line,
      Qty: numberOf(row.Qty),
      Rate: numberOf(row.Rate),
      unit_rate: numberOf(row.unit_rate),
      discount: numberOf(row.discount),
      IGst_rate: gst,
      CGst_rate: gst / 2,
      SGst_rate: gst / 2,
      total: Number(totalOf(row)),
    }
  })

  return {
    document_no: documentNo,
    vendor_email: vendorEmail,
    company_name: companyName,
    response: {
      master_details: form.master,
      other_details: { ...form.other, additional_charges: additional, inclusions: form.inclusions, exclusions: form.exclusions },
      product,
    },
    source: 'form',
  }
}

/* ------------------------------------------------------------------ */
/* Compare Quotations (inventory/compare_quotation/)                  */
/* ------------------------------------------------------------------ */

/** A quoted line's GST % - its IGST rate, else CGST + SGST. */
export const gstPercentOf = (row) =>
  row?.IGst_rate !== null && row?.IGst_rate !== undefined && text(row.IGst_rate) !== ''
    ? numberOf(row.IGst_rate)
    : numberOf(row?.CGst_rate) + numberOf(row?.SGst_rate)

/**
 * { "<vendor email>": { product: [{ ...the quoted line, past_quotation: [...] }],
 *   master_details: { quotation_no, quotation_date, delivery_time, vendor_name },
 *   vendor_details: { name, rating: { "Overall Rating" } ... } } }
 * -> [{ key, name, rating, master, products, raw }] - `raw` is what Raise a PO takes.
 */
export const readQuotationComparison = (reply) =>
  Object.entries(isObject(reply) ? reply : {})
    .filter(([, entry]) => isObject(entry))
    .map(([key, entry]) => {
      const master = isObject(entry.master_details) ? entry.master_details : {}
      const vendor = isObject(entry.vendor_details) ? entry.vendor_details : {}
      return {
        key,
        name: text(master.vendor_name) || text(vendor.name) || key,
        rating: numberOf(vendor.rating?.['Overall Rating']),
        master,
        products: listOf(entry.product)
          .filter(isObject)
          .map((row, index) => ({ ...row, key: `${key}#${text(row.id) || 'line'}#${index}`, past: listOf(row.past_quotation).filter(isObject) })),
        raw: entry,
      }
    })
