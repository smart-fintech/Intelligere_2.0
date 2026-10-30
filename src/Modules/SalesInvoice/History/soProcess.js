/**
 * A BOOKED SALES ORDER'S PROCESSES (inventory/progress_report/) - what the
 * process editor (SalesOrderProcessModal) reads, checks, works out and sends,
 * with no screen attached:
 *
 *   hasProcess(value)              the order's `process` holds anything - Show Process, else Book Process
 *   readProcessItems(reply)        the POST's processes, each as it came
 *   prepareProcesses(items)        each with a key, a weightage (an equal share when it has none) and a
 *                                  colour (a random one when it has none); `custom` - the weightages
 *                                  loaded are their own (not all the equal share), so they are kept
 *   equalShare(count)              the equal weightage - "33.33", "50"
 *   editProcess(item, field, value)   one field typed - the item changed, or `warning` and no change
 *   checkProcesses(items, custom)  what keeps them from being sent - { message, rows } or null
 *   processChart(rows, title)      the chart's figures (see below)
 *   buildProgressBody(...)         the PUT's body
 *   inventoryAddItems(entries, products)   the PUT's inventory_add, as StockBookingModal's lines
 *
 * THE FIGURES (as the earlier screen worked them out):
 *   a process's share done   totalDone / total, kept to 0-100% (0 when there is no total)
 *   its contribution         weightage x share done / 100
 *   total complete           the contributions added up, kept to 0-100%, to 2 places - what
 *                            total_process_done is sent as
 * `total` and `totalDone` are the process's own quantities, the only ones
 * edited here; `processingDone`, `total_process_done`, `product_details`,
 * `warehouse` and the rest of each process go back exactly as they came.
 */

const textOf = (value) => (value === null || value === undefined ? '' : String(value).trim())
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const blank = (value) => textOf(value) === ''
/** A number from a value ("33.33", "40%", 20) - null when it is none. */
const numberOf = (value) => {
  const raw = textOf(value).replace(/%$/, '').trim()
  if (raw === '') return null
  const number = Number(raw)
  return Number.isFinite(number) ? number : null
}
const clamp = (value, low, high) => Math.min(Math.max(value, low), high)
const round2 = (value) => Math.round(value * 100) / 100

export const COLOUR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
/** A colour the chart can draw - the process's own when it is one, else a neutral one. */
export const drawableColour = (value) => (COLOUR_PATTERN.test(textOf(value)) ? textOf(value) : '#8884d8')

export const hasProcess = (value) =>
  Array.isArray(value) ? value.length > 0 : isObject(value) ? Object.keys(value).length > 0 : textOf(value) !== ''

/** The POST's processes - a list of them; a reply that is only a message is that message, thrown. */
export const readProcessItems = (reply) => {
  if (Array.isArray(reply)) return reply.filter(isObject)
  if (isObject(reply) && textOf(reply.msg)) throw new Error(textOf(reply.msg))
  return []
}

export const equalShare = (count) => {
  if (!count) return '0'
  const share = 100 / count
  return Number.isInteger(share) ? String(share) : share.toFixed(2)
}

const randomColour = () => `#${Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0')}`

/** [{ key, item }] - keyed by pid (each once), else its place - and whether the weightages are custom. */
export const prepareProcesses = (items) => {
  const share = equalShare(items.length)
  const taken = new Set()
  const rows = items.map((item, index) => {
    const pid = textOf(item.pid)
    const key = pid && !taken.has(pid) ? pid : `#${index}`
    taken.add(key)
    return {
      key,
      item: {
        ...item,
        percentage: blank(item.percentage) ? share : item.percentage,
        colour_code: blank(item.colour_code) ? randomColour() : textOf(item.colour_code),
      },
    }
  })
  const custom = items.length > 0 && items.every((item) => !blank(item.percentage)) && items.some((item) => numberOf(item.percentage) !== Number(share))
  return { rows, custom }
}

/** Every process at the equal weightage. */
export const withEqualShare = (rows) => {
  const share = equalShare(rows.length)
  return rows.map((row) => ({ ...row, item: { ...row.item, percentage: share } }))
}

const DECIMAL = /^\d*\.?\d*$/

/**
 * One field typed (percentage, total, totalDone, colour_code) - as the earlier
 * screen took it: a colour as typed; a number only when it is one and not
 * negative (an empty box is allowed while typing); Done never above Total;
 * a smaller Total brings Done down to it. Numbers are kept as typed ("12.")
 * and sent as numbers. -> { item } or { warning } (nothing changed).
 */
export const editProcess = (item, field, value) => {
  if (field === 'colour_code') return { item: { ...item, colour_code: value } }
  const typed = String(value ?? '').trim()
  if (!DECIMAL.test(typed)) return { item }
  if (typed === '' || typed === '.') return { item: { ...item, [field]: typed } }
  const number = Number(typed)
  if (field === 'totalDone') {
    const total = numberOf(item.total)
    if (total !== null && number > total) return { item, warning: 'Done quantity cannot exceed Total.' }
    return { item: { ...item, totalDone: typed } }
  }
  if (field === 'total') {
    const done = numberOf(item.totalDone)
    return { item: { ...item, total: typed, totalDone: done !== null && done > number ? typed : item.totalDone } }
  }
  return { item: { ...item, [field]: typed } }
}

/** What keeps the processes from being sent: { message, rows: { [index]: { field: message } } } - null when nothing. */
export const checkProcesses = (items, custom) => {
  if (items.length === 0) return { message: 'There are no processes to submit.', rows: {} }
  const rows = {}
  const mark = (index, field, message) => {
    rows[index] = { ...rows[index], [field]: message }
  }
  items.forEach((item, index) => {
    const total = numberOf(item.total)
    const done = numberOf(item.totalDone)
    if (total === null || total < 0) mark(index, 'total', 'Enter the total')
    if (done === null || done < 0) mark(index, 'totalDone', 'Enter the done quantity')
    else if (total !== null && done > total) mark(index, 'totalDone', 'More than the total')
    if (!COLOUR_PATTERN.test(textOf(item.colour_code))) mark(index, 'colour_code', 'A colour such as #1f5f99')
    if (custom) {
      const weight = numberOf(item.percentage)
      if (weight === null || weight < 0 || weight > 100) mark(index, 'percentage', 'Between 0 and 100')
    }
  })
  if (Object.keys(rows).length > 0) return { message: 'Please correct the highlighted processes.', rows }
  if (custom) {
    const sum = round2(items.reduce((total, item) => total + (numberOf(item.percentage) ?? 0), 0))
    if (sum !== 100) return { message: `Total Weightage must be 100% - it is ${sum}% now.`, rows: {} }
  }
  return null
}

/** A process's figures - its weightage, quantities, share done and contribution. */
const figuresOf = (item) => {
  const weight = Math.max(numberOf(item.percentage) ?? 0, 0)
  const total = numberOf(item.total)
  const done = numberOf(item.totalDone)
  const donePct = total !== null && total > 0 && done !== null ? clamp((done / total) * 100, 0, 100) : 0
  return { weight, total, done, donePct, contribution: (weight * donePct) / 100 }
}

export const totalProcessDone = (items) => round2(clamp(items.reduce((sum, item) => sum + figuresOf(item).contribution, 0), 0, 100))

/**
 * The chart, from the processes in their order - each keeps its own key, so a
 * name, colour and figure always stay together:
 *   { title, overall, remainder, processes: [{ key, name, colour, weight, total, done, donePct, contribution }] }
 * The contributions and the remainder add up to 100.
 */
export const processChart = (rows, title) => {
  const processes = rows.map(({ key, item }, index) => ({
    key,
    name: textOf(item.name) || `Process ${index + 1}`,
    colour: drawableColour(item.colour_code),
    ...figuresOf(item),
  }))
  const overall = totalProcessDone(rows.map((row) => row.item))
  const filled = Math.min(processes.reduce((sum, process) => sum + process.contribution, 0), 100)
  return { title: textOf(title), overall, remainder: Math.max(100 - filled, 0), processes }
}

/** Dark text on a light colour, white on a dark one. */
export const textColourOn = (hex) => {
  let code = textOf(hex).replace('#', '')
  if (code.length === 3) code = code.split('').map((digit) => digit + digit).join('')
  if (!/^[0-9a-f]{6}$/i.test(code)) return '#ffffff'
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(code.slice(at, at + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#222222' : '#ffffff'
}

/** A quantity as sent: a number when it is one, else as it was. */
const sentNumber = (value) => (numberOf(value) === null ? value : numberOf(value))

/**
 * PUT inventory/progress_report/'s body - every process, in the order on
 * screen, as it came with only its edited fields changed: percentage as
 * text ("33.33"), total and totalDone as numbers.
 */
export const buildProgressBody = ({ companyName, soNo, items, inventoryAdd }) => ({
  company_name: companyName,
  document_no: soNo,
  total_process_done: totalProcessDone(items),
  process: items.map((item) => ({
    ...item,
    percentage: textOf(item.percentage),
    total: sentNumber(item.total),
    totalDone: sentNumber(item.totalDone),
  })),
  inventory_add: Boolean(inventoryAdd),
})

const sameText = (a, b) => textOf(a).toLowerCase() === textOf(b).toLowerCase()

/**
 * The PUT's inventory_add as StockBookingModal's lines - the reply's
 *   [{ name, sku_code, warehouse_id, add_qty, category }]
 * each matched in the product list by its SKU code, else by its name, with
 *   quantity      add_qty - the stock to add (never a remove_qty / book_qty)
 *   warehouseId   warehouse_id - the warehouse it goes into, chosen at the start
 *   category      category - the product's, where the list has none
 * (the earlier screen's names - Products, quantity / Quantity, Rate - are read
 * too); services are left out:
 *   -> { items: [{ key, productKey, skuIndex, productName, skuCode, quantity, rate, warehouseId, category }],
 *        unmatched: [names] }   one not in the list is never given another product
 */
export const inventoryAddItems = (entries, products) => {
  const items = []
  const unmatched = []
  ;(Array.isArray(entries) ? entries : [])
    .filter(isObject)
    .filter((entry) => !sameText(entry.Invoice_type, 'Service'))
    .forEach((entry, index) => {
      const name = textOf(entry.name) || textOf(entry.Products) || textOf(entry['Product Name']) || textOf(entry.product_name)
      const sku = textOf(entry.sku_code)
      let product = null
      let skuIndex = -1
      if (sku) {
        product = products.find((candidate) => candidate.variants.some((variant) => sameText(variant.skuCode, sku))) ?? null
        skuIndex = product ? product.variants.findIndex((variant) => sameText(variant.skuCode, sku)) : -1
      }
      if (!product && name) {
        product = products.find((candidate) => sameText(candidate.name, name)) ?? null
        skuIndex = product && product.variants.length === 1 ? 0 : -1
      }
      if (!product || skuIndex < 0) {
        unmatched.push(name || sku || 'A product')
        return
      }
      items.push({
        key: `${index}:${product.key}:${skuIndex}`,
        productKey: String(product.key),
        skuIndex,
        productName: textOf(product.name),
        skuCode: textOf(product.variants[skuIndex].skuCode),
        quantity: textOf(entry.add_qty ?? entry.quantity ?? entry.Quantity),
        rate: textOf(entry.Rate ?? entry.rate),
        warehouseId: textOf(entry.warehouse_id),
        category: textOf(entry.category),
      })
    })
  return { items, unmatched }
}
