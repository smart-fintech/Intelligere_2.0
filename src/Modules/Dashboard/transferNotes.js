/**
 * TRANSFER NOTES - everything read from, and sent to, inventory/transfer_notes/
 * (see inventoryService), with no React in it:
 *
 *   readTransferNotes(reply)             the list, as the page shows it
 *   matchesFilters(note, filters)        the list's own From / To Warehouse and date filters
 *   transferableSkus(products, id)       the SKUs with stock in a warehouse - what a note can move
 *   newTransferForm() / transferFormOf(note)   the form, empty or opened on a saved note
 *   checkTransferForm(form, { editing })      what is wrong with it - {} when nothing
 *   buildTransferNoteBody(form, ...)     the form as POST (and, with `id`, PUT) takes it
 *
 * A NOTE'S LINE IS ONE SKU - its `product_id` (sku_variants[].product_id), so
 * a product with several SKUs gives a line per SKU moved. A new note's lines
 * can only be SKUs the From warehouse holds, at most what it holds. An
 * edited note keeps its lines: only their quantity and remark change (its
 * stock has already moved, so the backend checks the new quantities).
 *
 * Dates: the list sends transfer_date as DD/MM/YYYY, a save sends DD-MM-YYYY.
 * Anything missing is empty, never an error.
 */

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

const listOf = (value) => (Array.isArray(value) ? value : [])

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

/** Only a real web address is offered as the note's PDF. */
const pdfUrlOf = (value) => (/^https?:\/\//i.test(text(value)) ? text(value) : '')

/** "20/10/2026" or "20-10-2026" for a date box (YYYY-MM-DD) - '' when it is neither. */
export const dateInputOf = (value) => {
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text(value))
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : ''
}

/** A date box's value as a save sends it - DD-MM-YYYY. */
const dateTextOf = (input) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(input))
  return match ? `${match[3]}-${match[2]}-${match[1]}` : ''
}

/* ------------------------------------------------------------------ */
/* The list                                                           */
/* ------------------------------------------------------------------ */

const readWarehouse = (warehouse) => {
  const value = isObject(warehouse) ? warehouse : {}
  return {
    id: value.id ?? null,
    name: text(value.name),
    address: text(value.warehouse_address),
    contact: text(value.contact),
    email: text(value.email),
    contactPerson: text(value.contact_person_name),
  }
}

const readLine = (product, index) => ({
  key: `${text(product.product_id) || 'line'}#${index}`,
  productId: product.product_id ?? null,
  name: text(product['Product Name']),
  skuCode: text(product.sku_code),
  skuDetails: isObject(product.sku_details) ? product.sku_details : {},
  hsn: text(product['HSN Code']),
  unit: text(product['Per Unit']),
  quantity: text(product.quantity),
  remark: text(product.remark),
  moved: listOf(product.moved)
    .filter(isObject)
    .map((entry) => ({ srNo: text(entry.sr_no), quantity: text(entry.quantity) })),
})

export const readTransferNotes = (reply) =>
  toList(reply)
    .filter(isObject)
    .map((note, index) => {
      const from = readWarehouse(note.from_warehouse)
      const to = readWarehouse(note.to_warehouse)
      const lines = listOf(note.products).filter(isObject).map(readLine)
      return {
        // Its id - what an edit and a delete name; by place only when it has none.
        key: note.id ?? `note#${index}`,
        id: note.id ?? null,
        transferNo: text(note.transfer_no),
        transferDate: text(note.transfer_date),
        // For sorting and the date filter.
        dateInput: dateInputOf(note.transfer_date),
        vehicleNo: text(note.vehicle_no),
        declaration: text(note.declaration),
        from,
        to,
        fromName: from.name,
        toName: to.name,
        lines,
        productCount: lines.length,
        pdfUrl: pdfUrlOf(note.transfer_note_file),
        createdAt: text(note.created_at),
      }
    })

/** The list's own filters: warehouse ids as text, dates as YYYY-MM-DD - '' for not set. */
export const NO_FILTERS = Object.freeze({ from: '', to: '', fromDate: '', toDate: '' })

/**
 * Whether a note passes every filter set - the listing endpoint filters by
 * nothing but one warehouse_id, so these run on the notes already loaded.
 * Warehouses by id. Dates by `dateInput` (YYYY-MM-DD, read from the list's
 * DD/MM/YYYY), so they compare as dates: From Date alone is "on or after",
 * To Date alone "on or before", both the same day that one day. A note with
 * no readable transfer date passes only while no date is set.
 */
export const matchesFilters = (note, { from, to, fromDate, toDate }) => {
  if (from && String(note.from.id ?? '') !== from) return false
  if (to && String(note.to.id ?? '') !== to) return false
  if ((fromDate || toDate) && !note.dateInput) return false
  if (fromDate && note.dateInput < fromDate) return false
  if (toDate && note.dateInput > toDate) return false
  return true
}

/* ------------------------------------------------------------------ */
/* What can be moved                                                  */
/* ------------------------------------------------------------------ */

/** How much of a SKU (readProducts' variant) is in one warehouse - over all its entries. */
export const stockIn = (variant, warehouseId) =>
  variant.details.reduce(
    (total, detail) =>
      total + detail.warehouses.filter((warehouse) => String(warehouse.id) === String(warehouseId)).reduce((sum, warehouse) => sum + numberOf(warehouse.quantity), 0),
    0,
  )

/**
 * The products (readProducts) with stock in the warehouse, each with only
 * its SKUs that have some there: [{ key, name, hsn, unit, skus: [{ productId,
 * skuCode, skuDetails, available, source }] }]. A SKU with no `product_id`
 * cannot be named in a note, so it is left out.
 */
export const transferableSkus = (products, warehouseId) => {
  if (!warehouseId) return []
  return products
    .map((product) => ({
      key: product.key,
      name: product.name,
      hsn: product.hsn,
      unit: product.unit,
      skus: product.variants
        .filter((variant) => variant.productId !== null)
        .map((variant) => ({
          productId: variant.productId,
          skuCode: variant.skuCode,
          skuDetails: Object.fromEntries(variant.skuDetails),
          available: stockIn(variant, warehouseId),
          // The SKU as the API sent it - what SkuSelector lists.
          source: variant.source,
        }))
        .filter((sku) => sku.available > 0),
    }))
    .filter((product) => product.skus.length > 0)
}

/* ------------------------------------------------------------------ */
/* The form                                                           */
/* ------------------------------------------------------------------ */

export const newTransferForm = () => ({
  transferNo: '',
  transferDate: '',
  vehicleNo: '',
  declaration: '',
  fromId: '',
  toId: '',
  lines: [],
})

/** A saved note, back in the form - its lines with their SKU, quantity and remark. */
export const transferFormOf = (note) => ({
  transferNo: note.transferNo,
  transferDate: note.dateInput,
  vehicleNo: note.vehicleNo,
  declaration: note.declaration,
  fromId: note.from.id === null ? '' : String(note.from.id),
  toId: note.to.id === null ? '' : String(note.to.id),
  lines: note.lines.map((line) => ({
    key: line.key,
    productId: line.productId,
    name: line.name,
    skuCode: line.skuCode,
    skuDetails: line.skuDetails,
    hsn: line.hsn,
    unit: line.unit,
    // Not known for a saved line - its stock has already moved.
    available: null,
    quantity: line.quantity,
    remark: line.remark,
  })),
})

/**
 * Everything wrong with the form, by field ('lines.<key>.quantity' for a
 * line's) - {} when it can be saved. A quantity must be above 0 and, on a
 * new note, no more than the From warehouse holds.
 */
export const checkTransferForm = (form) => {
  const found = {}
  if (!text(form.transferNo)) found.transferNo = 'Enter the Transfer Note No.'
  if (!text(form.transferDate)) found.transferDate = 'Choose the transfer date'
  if (!form.fromId) found.fromId = 'Select the From Warehouse'
  if (!form.toId) found.toId = 'Select the To Warehouse'
  if (form.fromId && form.toId && form.fromId === form.toId) found.toId = 'The To Warehouse must differ from the From Warehouse'
  if (form.lines.length === 0) found.lines = 'Add at least one product'
  form.lines.forEach((line) => {
    const quantity = Number(line.quantity)
    if (!text(line.quantity) || !Number.isFinite(quantity) || quantity <= 0) found[`lines.${line.key}.quantity`] = 'Enter a quantity above 0'
    else if (line.available !== null && quantity > line.available) found[`lines.${line.key}.quantity`] = `Only ${line.available} in the From Warehouse`
  })
  return found
}

/** A warehouse id as the backend filed it - a number where it is one. */
const warehouseIdOf = (id) => (Number.isNaN(Number(id)) ? id : Number(id))

/** The form as POST takes it - and PUT, with the note's `id`. */
export const buildTransferNoteBody = (form, { companyName, id = null }) => ({
  ...(id !== null ? { id } : null),
  company_name: companyName,
  transfer_no: text(form.transferNo),
  transfer_date: dateTextOf(form.transferDate),
  vehicle_no: text(form.vehicleNo),
  declaration: text(form.declaration),
  from_warehouse_id: warehouseIdOf(form.fromId),
  to_warehouse_id: warehouseIdOf(form.toId),
  products: form.lines.map((line) => ({ product_id: line.productId, quantity: Number(line.quantity), remark: text(line.remark) })),
})
