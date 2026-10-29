/**
 * A SALES ORDER'S PURCHASING - from its booked stock to a Request for
 * Quotation, as one state machine with no screen attached
 * (inventory/order_requirement/ and inventory/request_quotation/ -
 * Services/procurementService):
 *
 *   INITIAL                    the order is being made (or edited)
 *     | the order is saved
 *   ORDER_SAVED                its document_id and number are known
 *     | its stock booked (or the booking skipped) - the quantities were
 *     | chosen before the order was saved (the workspace's booking modal)
 *   INVENTORY_DETAILS          its stock, as the PDF save answers it
 *     | Request for Quotation
 *   REQUIREMENTS_LOADING       order_requirement/ (failed - Retry from here)
 *     |                 \----> NO_PURCHASE_REQUIRED   nothing to buy
 *   PURCHASE_METHOD_SELECTION  the requirements: what is bought at which
 *     |                        level - a finished or semi-finished product
 *     |                        ordered from vendors (its vendors ticked
 *     |                        there), or raw materials ticked
 *     | Continue
 *   VENDOR_SELECTION           the raw materials ticked, each with its vendors
 *     | Continue               (skipped when none is ticked)
 *   PURCHASE_REVIEW            each vendor's products, and their quantities
 *     | a vendor's Download
 *   QUOTATION_SUBMITTING  ---> QUOTATION_SUCCESS  \ another vendor's Download
 *                        \--> QUOTATION_ERROR    / sends again from either
 *
 * Quantity allocation is part of the review (each vendor's products, with
 * their quantities), so it is not a state of its own. Back goes one step
 * back - from the review (sent or not) to the vendors, or to the selection
 * when there were no raw materials to choose vendors for.
 *
 * WHAT IS KEPT WHERE. The machine (procurementReducer) holds the state and
 * what the workflow itself knows - the saved order, its stock, the
 * requirements, the request being sent, the server's answers. The user's
 * choices - what is bought, its vendors, their quantities - are apart from
 * it (`choices`), so a Back or a failed request never loses them. Which
 * buttons work is never decided on a screen: it is procurementActions(machine, checks).
 *
 * THE QUANTITIES ARE THE SERVER'S. The stock answered by the PDF save gives
 * each product's shortfall (remain_qty below 0 - the order quantity less the
 * stock other orders have not booked); that is what order_requirement/ is
 * asked for. Its answer's `required_qty` is what each node is bought for -
 * nothing is added to it here.
 *
 * NOTHING BOUGHT TWICE. A finished or semi-finished product ordered from
 * vendors is bought as it is - the products under it cannot be chosen;
 * otherwise its semi-finished products and raw materials can, each on its
 * own - and while any of them is (heldByChildren), it cannot be ordered from
 * vendors. The same product needed in two places of the tree (one
 * product_id, one warehouse) is one purchase, for both quantities together.
 *
 * NO VENDOR IS NO BAR. A product without vendors keeps its quantity and is
 * said to need one (under Inventory > Products): a raw material can still be
 * ticked, a finished or semi-finished product has no Order from Vendors (its
 * products under it can be chosen instead). It is left out of every request -
 * never given a vendor it does not have.
 */

import { getVendorId } from '@/Services/inventoryService'

/* ------------------------------------------------------------------ */
/* The machine                                                        */
/* ------------------------------------------------------------------ */

export const PROCUREMENT_STATE = Object.freeze({
  INITIAL: 'INITIAL',
  ORDER_SAVED: 'ORDER_SAVED',
  INVENTORY_DETAILS: 'INVENTORY_DETAILS',
  REQUIREMENTS_LOADING: 'REQUIREMENTS_LOADING',
  NO_PURCHASE_REQUIRED: 'NO_PURCHASE_REQUIRED',
  PURCHASE_METHOD_SELECTION: 'PURCHASE_METHOD_SELECTION',
  VENDOR_SELECTION: 'VENDOR_SELECTION',
  PURCHASE_REVIEW: 'PURCHASE_REVIEW',
  QUOTATION_SUBMITTING: 'QUOTATION_SUBMITTING',
  QUOTATION_SUCCESS: 'QUOTATION_SUCCESS',
  QUOTATION_ERROR: 'QUOTATION_ERROR',
})
const S = PROCUREMENT_STATE

export const PROCUREMENT_EVENT = Object.freeze({
  RESET: 'reset',
  ORDER_SAVED: 'orderSaved',
  BOOKING_CONFIRMED: 'bookingConfirmed',
  BOOKING_SKIPPED: 'bookingSkipped',
  STOCK_READY: 'stockReady',
  LOAD_REQUIREMENTS: 'loadRequirements',
  REQUIREMENTS_LOADED: 'requirementsLoaded',
  REQUIREMENTS_FAILED: 'requirementsFailed',
  CONTINUE: 'continue',
  BACK: 'back',
  SUBMIT: 'submit',
  SUBMIT_SUCCEEDED: 'submitSucceeded',
  SUBMIT_FAILED: 'submitFailed',
})
const E = PROCUREMENT_EVENT

/** The states of a request for quotation being made - the Request for Quotation modal's. */
export const QUOTATION_STATES = Object.freeze([S.PURCHASE_METHOD_SELECTION, S.VENDOR_SELECTION, S.PURCHASE_REVIEW, S.QUOTATION_SUBMITTING, S.QUOTATION_SUCCESS, S.QUOTATION_ERROR])

/** The review, sent or not - where a vendor's request can be sent. */
const REVIEW_STATES = [S.PURCHASE_REVIEW, S.QUOTATION_SUCCESS, S.QUOTATION_ERROR]

export const initialProcurement = Object.freeze({
  state: S.INITIAL,
  // The saved order: { documentId, documentNo, companyName, lines, productsByKey, booked }.
  order: null,
  // The order's stock, as its PDF save answered it.
  stock: null,
  // readRequirement(...) of the last calculation.
  requirement: null,
  // Each calculation asked for - an answer to an older one is dropped.
  attempt: 0,
  // { message } of the last failed request; `ambiguous` when a request for quotation got no answer at all.
  error: null,
  // The vendor's request being (or last) sent - { vendorKey, body }.
  submission: null,
  // The server's answer to it - { vendorKey, message }.
  reply: null,
  // { [vendor key]: the server's message } - each vendor whose request was sent.
  sent: {},
})

/** The booking is done with (or skipped): its stock is shown, and the requirements start afresh. */
const booked = (machine) => ({
  ...machine,
  state: S.INVENTORY_DETAILS,
  requirement: null,
  error: null,
  submission: null,
  reply: null,
  sent: {},
  attempt: machine.attempt + 1,
})

export function procurementReducer(machine, event) {
  const { state } = machine
  switch (event.type) {
    case E.RESET:
      return initialProcurement
    case E.ORDER_SAVED:
      // A saved order starts its own workflow - nothing of another order's is kept.
      return { ...initialProcurement, state: S.ORDER_SAVED, order: event.order }
    case E.BOOKING_CONFIRMED:
      return state === S.ORDER_SAVED ? booked({ ...machine, order: { ...machine.order, booked: event.booked ?? null } }) : machine
    case E.BOOKING_SKIPPED:
      return state === S.ORDER_SAVED ? booked(machine) : machine
    case E.STOCK_READY:
      // Only this order's stock - from its own PDF save.
      if (!machine.order || String(event.documentId) !== String(machine.order.documentId)) return machine
      return event.stock && typeof event.stock === 'object' ? { ...machine, stock: event.stock } : machine
    case E.LOAD_REQUIREMENTS: {
      const failed = state === S.REQUIREMENTS_LOADING && Boolean(machine.error)
      return (state === S.INVENTORY_DETAILS || failed) && machine.stock
        ? { ...machine, state: S.REQUIREMENTS_LOADING, error: null, attempt: machine.attempt + 1 }
        : machine
    }
    case E.REQUIREMENTS_LOADED:
      if (state !== S.REQUIREMENTS_LOADING || event.attempt !== machine.attempt) return machine
      return {
        ...machine,
        state: needsPurchase(event.requirement) ? S.PURCHASE_METHOD_SELECTION : S.NO_PURCHASE_REQUIRED,
        requirement: event.requirement,
        error: null,
      }
    case E.REQUIREMENTS_FAILED:
      if (state !== S.REQUIREMENTS_LOADING || event.attempt !== machine.attempt) return machine
      return { ...machine, error: { message: event.message || 'The requirements could not be calculated.' } }
    case E.CONTINUE:
      // Only with the step valid (the caller checks it - procurementActions). `vendorStep`: raw materials are ticked.
      if (!event.valid) return machine
      if (state === S.PURCHASE_METHOD_SELECTION) return { ...machine, state: event.vendorStep ? S.VENDOR_SELECTION : S.PURCHASE_REVIEW }
      return state === S.VENDOR_SELECTION ? { ...machine, state: S.PURCHASE_REVIEW } : machine
    case E.BACK:
      if (state === S.VENDOR_SELECTION) return { ...machine, state: S.PURCHASE_METHOD_SELECTION }
      return REVIEW_STATES.includes(state)
        ? { ...machine, state: event.vendorStep ? S.VENDOR_SELECTION : S.PURCHASE_METHOD_SELECTION, error: null, reply: null }
        : machine
    case E.SUBMIT:
      return REVIEW_STATES.includes(state) && event.submission
        ? { ...machine, state: S.QUOTATION_SUBMITTING, submission: event.submission, error: null, reply: null }
        : machine
    case E.SUBMIT_SUCCEEDED: {
      if (state !== S.QUOTATION_SUBMITTING) return machine
      const { vendorKey } = machine.submission
      const message = event.message || 'The request for quotation was sent.'
      return { ...machine, state: S.QUOTATION_SUCCESS, reply: { vendorKey, message }, sent: { ...machine.sent, [vendorKey]: message } }
    }
    case E.SUBMIT_FAILED:
      return state === S.QUOTATION_SUBMITTING
        ? {
            ...machine,
            state: S.QUOTATION_ERROR,
            error: { message: event.message || 'The request for quotation could not be sent.', ambiguous: Boolean(event.ambiguous), vendorKey: machine.submission.vendorKey },
          }
        : machine
    default:
      return machine
  }
}

/**
 * What can be done now - every button's enabled state, from the state and
 * the current step's checks, never from anything else:
 *
 *   requestQuotation    the Request for Quotation button - the stock is known and
 *                       nothing is being calculated, or a request is under way
 *   loading             the requirements are being calculated
 *   continue            the selection: something with a vendor chosen, each
 *                       product ordered from vendors with a vendor ticked; the
 *                       vendors: every raw material with a vendor ticked - a
 *                       product without vendors stays chosen, never in the way
 *   download            on the review, every quantity a number not below 0 (each
 *                       vendor's its own - never added up), nothing being sent
 *   back                a step to go back to
 */
export const procurementActions = (machine, checks = {}) => {
  const { state } = machine
  const loading = state === S.REQUIREMENTS_LOADING && !machine.error
  return {
    requestQuotation: Boolean(machine.stock) && ((state === S.INVENTORY_DETAILS || (state === S.REQUIREMENTS_LOADING && Boolean(machine.error))) || QUOTATION_STATES.includes(state)),
    loading,
    continue: (state === S.PURCHASE_METHOD_SELECTION && Boolean(checks.methodsValid)) || (state === S.VENDOR_SELECTION && Boolean(checks.selectionValid)),
    download: REVIEW_STATES.includes(state) && Boolean(checks.selectionValid) && Boolean(checks.allocationsValid),
    back: state === S.VENDOR_SELECTION || REVIEW_STATES.includes(state),
  }
}

/* ------------------------------------------------------------------ */
/* The requirements                                                   */
/* ------------------------------------------------------------------ */

const STOCK_CATEGORIES = ['finished_product', 'semi_finished_product', 'raw_product']
const EPSILON = 1e-6

const textOf = (value) => (value === null || value === undefined ? '' : String(value).trim())
const numberOf = (value) => {
  const number = Number(value)
  return textOf(value) !== '' && Number.isFinite(number) ? number : null
}
const listOf = (value) => (Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') : [])
const objectOf = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})
const round = (value) => Number(value.toFixed(3))
/** A quantity as words would write it - "12", "2.5". */
export const quantityText = (value) => (numberOf(value) === null ? '--' : String(round(Number(value))))

/** A stock row's (or a requirement's) product name - the backend has sent it under both names. */
const productNameOf = (row) => textOf(row['Product Name']) || textOf(row.product_name)

/** A stock row's Required Qty - its shortfall, remain_qty below 0 (the PDF save's own calculation). */
export const stockRequiredQty = (row) => {
  const remain = numberOf(row?.remain_qty)
  return remain === null ? null : Math.max(-remain, 0)
}

/**
 * The products to ask order_requirement/ about - each one the stock says is
 * short, for its Required Qty, in its warehouse. One the stock gives no
 * warehouse (an order not booked from any) is asked about all the same, with
 * an empty warehouse_id - as the earlier screens asked - never left out, or
 * an order short of stock would be taken for one that needs nothing.
 *
 *   -> { products: [{ "Product Name", sku_code, requirement_qty, warehouse_id }] }
 */
export const requirementProductsOf = (stock) => {
  const products = []
  STOCK_CATEGORIES.forEach((category) =>
    listOf(stock?.[category]).forEach((row) => {
      const required = stockRequiredQty(row)
      if (required === null || required <= EPSILON) return
      // A product without SKU is asked for with an empty sku_code.
      products.push({ 'Product Name': productNameOf(row), sku_code: textOf(row.sku_code), requirement_qty: round(required), warehouse_id: textOf(listOf(row.warehouse)[0]?.warehouse_id) })
    }),
  )
  return { products }
}

/** Whether a Sales Order's stock leaves anything to buy - Request for Quotation is offered only then. */
export const stockIsShort = (stock) => requirementProductsOf(stock).products.length > 0

export const buildRequirementBody = ({ companyName, documentNo, products }) => ({
  company_name: textOf(companyName),
  document_no: textOf(documentNo),
  product: products,
})

/**
 * The order_requirement/ answer as a tree:
 *
 *   { roots: [id], byId: { [id]: node } }
 *   node   { id, level: 'finished' | 'semi' | 'raw', parentId, productId, name, skuCode,
 *            skuDetails, warehouseId, requiredQty, orderQty, availableQty, minQty, vendors,
 *            hsn, per, gstRate, semis: [id], raws: [id] }
 *
 * The parents and children are the answer's, however deep: a node's
 * "Semi-Finished" are semi-finished products, its "Raw Material" raw
 * materials. Each node's id is its place in the tree - the same product can
 * be needed in two places, for two quantities; `productId` is the product.
 */
export const readRequirement = (reply) => {
  const byId = {}
  const roots = []
  const add = (raw, level, id, parentId, key) => {
    const node = {
      id,
      level,
      parentId,
      productId: raw.product_id ?? null,
      name: productNameOf(raw) || key,
      skuCode: textOf(raw.sku_code),
      skuDetails: objectOf(raw.sku_details),
      warehouseId: textOf(listOf(raw.warehouse)[0]?.warehouse_id),
      requiredQty: numberOf(raw.required_qty),
      orderQty: numberOf(raw.order_qty),
      availableQty: numberOf(raw.available_qty),
      minQty: numberOf(raw.min_qty),
      vendors: listOf(raw.vendors),
      hsn: textOf(raw['HSN Code'] ?? raw.Hsn_code),
      per: textOf(raw.Per),
      gstRate: textOf(raw.Gst_rate),
      semis: [],
      raws: [],
    }
    byId[id] = node
    if (level !== 'raw') {
      Object.entries(objectOf(raw['Semi-Finished'])).forEach(([name, child]) => {
        if (child && typeof child === 'object' && !Array.isArray(child)) node.semis.push(add(child, 'semi', `${id}/s:${name}`, id, name))
      })
      Object.entries(objectOf(raw['Raw Material'])).forEach(([name, child]) => {
        if (child && typeof child === 'object' && !Array.isArray(child)) node.raws.push(add(child, 'raw', `${id}/r:${name}`, id, name))
      })
    }
    return id
  }
  Object.entries(objectOf(reply)).forEach(([key, value]) => {
    // A product the answer lists more than once comes as a list.
    if (Array.isArray(value)) listOf(value).forEach((raw, index) => roots.push(add(raw, 'finished', `f:${key}#${index}`, null, key)))
    else if (value && typeof value === 'object') roots.push(add(value, 'finished', `f:${key}`, null, key))
  })
  return { roots, byId }
}

/** What a node is bought for - the server's required_qty, never below 0. */
export const purchaseQty = (node) => Math.max(node?.requiredQty ?? 0, 0)

export const needsPurchase = (tree) => Boolean(tree) && Object.values(tree.byId).some((node) => purchaseQty(node) > EPSILON)

/** A node's children - its semi-finished products, then its raw materials. */
export const childrenOf = (tree, node) => [...node.semis, ...node.raws].map((id) => tree.byId[id])

/* ------------------------------------------------------------------ */
/* Vendors                                                            */
/* ------------------------------------------------------------------ */

/**
 * A node's vendors, each once, as the answer gives them:
 *
 *   [{ key, id, name, email, contact, address, gstin, usable }]
 *
 * `usable` - it has an id, which is what the request names it by.
 */
export const resolveVendors = (node) => {
  const seen = new Set()
  return node.vendors
    .map((vendor) => {
      const id = getVendorId(vendor)
      const email = textOf(vendor.email)
      return {
        key: textOf(id) || email,
        id,
        name: textOf(vendor.name) || email || `Vendor ${id}`,
        email,
        contact: textOf(vendor.contact),
        address: textOf(vendor.address),
        gstin: textOf(vendor.gstin),
        usable: textOf(id) !== '',
      }
    })
    .filter((vendor) => {
      if (!vendor.key || seen.has(vendor.key)) return false
      seen.add(vendor.key)
      return true
    })
}

export const NO_VENDOR_MESSAGE = 'No vendor is linked to this product. Add one under Inventory > Products to request a quotation.'

/**
 * Why a node cannot be chosen to buy - '' when it can. Nothing to buy is not
 * a problem (it is covered by stock); the rest are said on the screen. A
 * vendor is not needed to choose it - see vendorNote.
 */
export const unbuyableReason = (node) => {
  if (purchaseQty(node) <= EPSILON) return ''
  if (node.productId === null || node.productId === undefined || textOf(node.productId) === '') return 'The requirements did not return its product id.'
  if (!node.warehouseId) return 'The requirements did not return its warehouse.'
  return ''
}

export const isBuyable = (node) => purchaseQty(node) > EPSILON && unbuyableReason(node) === ''

/**
 * Why none of a product's vendors can be asked - '' when one can. It can
 * still be chosen (and stays chosen, with its quantity); it is just in no
 * vendor's request until one is linked to it.
 */
export const vendorNote = (vendors) => {
  if (vendors.length === 0) return NO_VENDOR_MESSAGE
  if (!vendors.some((vendor) => vendor.usable)) return 'None of its vendors has an id on record, so none can be asked.'
  return ''
}

/* ------------------------------------------------------------------ */
/* What is bought                                                     */
/* ------------------------------------------------------------------ */

export const EMPTY_CHOICES = Object.freeze({
  // { [finished or semi-finished id]: true } - ordered from vendors as it is
  direct: {},
  // { [raw material id]: true } - ticked to be bought
  picked: {},
  // { [requirement key]: [vendor key] } - see requirementKey
  vendors: {},
  // { [requirement key]: { [vendor key]: "12" } }
  allocations: {},
})

/**
 * What a node is bought as: its product in its warehouse - so the same
 * product needed in two places is bought, and asked of vendors, once. A node
 * without either (never buyable) stands alone.
 */
export const requirementKey = (node) => (textOf(node.productId) && node.warehouseId ? `p:${textOf(node.productId)}|w:${node.warehouseId}` : node.id)

/** Every node under one, itself excluded. */
const descendantsOf = (tree, node) => childrenOf(tree, node).flatMap((child) => [child, ...descendantsOf(tree, child)])

/** Whether a node sits under one ordered from vendors - it then cannot be chosen. */
export const coveredByParent = (tree, choices, node) => {
  let parent = node.parentId ? tree.byId[node.parentId] : null
  while (parent) {
    if (choices.direct[parent.id]) return true
    parent = parent.parentId ? tree.byId[parent.parentId] : null
  }
  return false
}

/**
 * Whether a node's way of buying is held by its vendors: it is ordered from
 * vendors (or, a raw material, ticked) and a vendor is ticked for it - its
 * switch (or tick) cannot change until they are all unticked. Its own
 * vendors only; a product above it can still be ordered from vendors.
 */
export const heldByVendors = (choices, node) =>
  Boolean(choices.direct[node.id] || choices.picked[node.id]) && (choices.vendors[requirementKey(node)] ?? []).length > 0

/**
 * Whether something under a node is chosen - a raw material ticked, or a
 * semi-finished product ordered from vendors with a vendor ticked. Its Order
 * from Vendors would then buy the same thing twice, so it cannot be turned on
 * until they are cleared. Only its own branch counts.
 */
export const heldByChildren = (tree, choices, node) => descendantsOf(tree, node).some((child) => choices.picked[child.id] || heldByVendors(choices, child))

/**
 * Drops what was chosen for these nodes, and the vendors and quantities of
 * whatever is no longer bought - kept for a product still bought elsewhere.
 */
const forget = (choices, tree, nodes, add = {}) => {
  const direct = { ...choices.direct }
  const picked = { ...choices.picked }
  nodes.forEach(({ id }) => {
    delete direct[id]
    delete picked[id]
  })
  const next = { ...choices, direct: { ...direct, ...add.direct }, picked: { ...picked, ...add.picked } }
  const bought = new Set(boughtNodes(tree, next).map(requirementKey))
  const keep = (byKey) => Object.fromEntries(Object.entries(byKey).filter(([key]) => bought.has(key)))
  return { ...next, vendors: keep(choices.vendors), allocations: keep(choices.allocations) }
}

/**
 * Turns a finished or semi-finished product's Order from Vendors on or off.
 * Either way what was chosen under it is dropped (on - it is bought as it
 * is; off - its own vendors and quantities go with it). Never on without a
 * vendor to order from, or over something chosen under it (heldByChildren).
 */
export const setDirect = (choices, tree, nodeId, on, vendorsOf) => {
  const node = tree.byId[nodeId]
  if (!node || node.level === 'raw' || coveredByParent(tree, choices, node) || heldByVendors(choices, node)) return choices
  if (on && (!isBuyable(node) || vendorsOf(node).length === 0 || heldByChildren(tree, choices, node))) return choices
  return forget(choices, tree, [node, ...descendantsOf(tree, node)], on ? { direct: { [nodeId]: true } } : {})
}

/** Ticks a raw material to be bought, or unticks it (its vendors and quantities with it). */
export const togglePick = (choices, tree, nodeId) => {
  const node = tree.byId[nodeId]
  if (!node || node.level !== 'raw' || coveredByParent(tree, choices, node) || heldByVendors(choices, node)) return choices
  if (choices.picked[nodeId]) return forget(choices, tree, [node])
  if (!isBuyable(node)) return choices
  return { ...choices, picked: { ...choices.picked, [nodeId]: true } }
}

/** Every node to be bought - a product ordered from vendors, or the raw materials ticked where none above is. */
export const boughtNodes = (tree, choices) => {
  if (!tree) return []
  const visit = (node) => {
    if (node.level === 'raw') return choices.picked[node.id] ? [node] : []
    if (choices.direct[node.id]) return [node]
    return childrenOf(tree, node).flatMap(visit)
  }
  return tree.roots.flatMap((id) => visit(tree.byId[id]))
}

/**
 * Each product to be bought, with what is needed of it - the nodes of one
 * requirement (requirementKey) merged, their quantities added up:
 *
 *   [{ key, node (the first, for its name, SKU and HSN), nodes, qty, raw (a raw
 *      material among them - its vendors come on a step of their own),
 *      vendors (resolveVendors, each once), selected: [the usable ones ticked],
 *      vendorless (no usable vendor - kept, but in no vendor's request) }]
 */
export const purchaseLines = (tree, choices, vendorsOf) => {
  const lines = new Map()
  boughtNodes(tree, choices).forEach((node) => {
    const key = requirementKey(node)
    const line = lines.get(key) ?? { key, node, nodes: [], qty: 0, raw: false, vendors: [] }
    line.nodes.push(node)
    line.qty = round(line.qty + purchaseQty(node))
    line.raw = line.raw || node.level === 'raw'
    vendorsOf(node).forEach((vendor) => {
      if (!line.vendors.some((entry) => entry.key === vendor.key)) line.vendors.push(vendor)
    })
    lines.set(key, line)
  })
  return [...lines.values()].map((line) => {
    const ticked = new Set(choices.vendors[line.key] ?? [])
    return { ...line, selected: line.vendors.filter((vendor) => vendor.usable && ticked.has(vendor.key)), vendorless: !line.vendors.some((vendor) => vendor.usable) }
  })
}

/** Ticks or unticks a vendor for a requirement - unticked, its quantity goes with it. */
export const toggleVendor = (choices, requirement, key) => {
  const current = choices.vendors[requirement] ?? []
  if (!current.includes(key)) return { ...choices, vendors: { ...choices.vendors, [requirement]: [...current, key] } }
  const allocations = { ...choices.allocations[requirement] }
  delete allocations[key]
  return { ...choices, vendors: { ...choices.vendors, [requirement]: current.filter((entry) => entry !== key) }, allocations: { ...choices.allocations, [requirement]: allocations } }
}

/**
 * The selection's problems: `nodes` - { [requirement key]: what is wrong }
 * for each one bought with vendors but none ticked; `none` - nothing is
 * chosen to buy; `unaskable` - something is, but none of it has a vendor, so
 * no request can be made. A product without vendors is not a problem of its
 * own - it stays chosen, in no vendor's request.
 */
export const checkSelection = (lines) => {
  const nodes = {}
  lines.forEach(({ key, selected, vendorless }) => {
    if (!vendorless && selected.length === 0) nodes[key] = 'Tick at least one vendor.'
  })
  return { nodes, none: lines.length === 0, unaskable: lines.length > 0 && lines.every(({ vendorless }) => vendorless) }
}

export const selectionIsValid = (problems) => !problems.none && !problems.unaskable && Object.keys(problems.nodes).length === 0

/** The purchase-method step: something to ask a vendor for, and each product ordered from vendors with one ticked - raw materials get theirs on the next step. */
export const methodsAreValid = (problems, lines) => !problems.none && !problems.unaskable && lines.every(({ key, raw }) => raw || !problems.nodes[key])

/** Whether raw materials with vendors are ticked - they then have a vendor step of their own. */
export const hasVendorStep = (lines) => lines.some(({ raw, vendorless }) => raw && !vendorless)

/* ------------------------------------------------------------------ */
/* Quantities                                                         */
/* ------------------------------------------------------------------ */

export const allocate = (choices, requirement, key, text) => ({
  ...choices,
  allocations: { ...choices.allocations, [requirement]: { ...choices.allocations[requirement], [key]: text } },
})

/**
 * Into the review: each vendor ticked for a product, with no quantity of its
 * own yet, is asked for all of the product's required quantity - every
 * vendor its own, never shared out. A quantity already entered is kept.
 */
export const withDefaultAllocations = (choices, lines) =>
  lines.reduce(
    (next, { key, qty, selected }) =>
      selected.reduce((filled, vendor) => (textOf(filled.allocations[key]?.[vendor.key]) !== '' ? filled : allocate(filled, key, vendor.key, String(round(qty)))), next),
    choices,
  )

const allocated = (choices, requirement, key) => numberOf(choices.allocations[requirement]?.[key])

/**
 * The quantities' problems: `cells` - { "key|vendorKey": what is wrong } (a
 * number, not below 0). Each vendor's quantity stands on its own - more than
 * is required may be asked for, and nothing adds them up.
 */
export const checkAllocations = (lines, choices) => {
  const cells = {}
  lines.forEach(({ key, selected }) =>
    selected.forEach((vendor) => {
      const text = textOf(choices.allocations[key]?.[vendor.key])
      const value = allocated(choices, key, vendor.key)
      const cell = `${key}|${vendor.key}`
      if (text === '') cells[cell] = 'Enter a quantity (0 for none)'
      else if (value === null) cells[cell] = 'Numbers only'
      else if (value < 0) cells[cell] = 'Not below 0'
    }),
  )
  return { cells }
}

export const allocationsAreValid = (problems) => Object.keys(problems.cells).length === 0

/* ------------------------------------------------------------------ */
/* The request                                                        */
/* ------------------------------------------------------------------ */

/**
 * The vendors asked, in the order first ticked, each with what it is asked for:
 *
 *   [{ vendor, items: [{ key, node, qty (required in all), cell (its "key|vendorKey") }] }]
 */
export const vendorParts = (lines) => {
  const parts = new Map()
  lines.forEach(({ key, node, qty, selected }) =>
    selected.forEach((vendor) => {
      const part = parts.get(vendor.key) ?? { vendor, items: [] }
      part.items.push({ key, node, qty, cell: `${key}|${vendor.key}` })
      parts.set(vendor.key, part)
    }),
  )
  return [...parts.values()]
}

/**
 * The request for quotation (inventory/request_quotation/):
 *
 *   { company_name, document_no, buyer_company_id,
 *     vendors: [{ vendor_id_seller, products: [{ product_id, quantity, warehouse_id }] }] }
 *
 * Each vendor once, with every product allocated to it above 0 - the
 * quantity as entered, even past what is required. Only `vendorKey`'s part
 * when one is named.
 *
 * @param order      the saved order - { documentNo, companyName }
 * @param companyId  the company asking (the buyer)
 * @param lines      purchaseLines(...)
 */
export const buildQuotationBody = ({ order, companyId, lines, choices, vendorKey = null }) => {
  const vendors = new Map()
  lines.forEach(({ key, node, selected }) =>
    selected.forEach((vendor) => {
      if (vendorKey !== null && vendor.key !== vendorKey) return
      const quantity = allocated(choices, key, vendor.key) ?? 0
      if (quantity <= EPSILON) return
      const entry = vendors.get(vendor.key) ?? { vendor_id_seller: vendor.id, products: [] }
      const same = entry.products.find((row) => String(row.product_id) === String(node.productId) && row.warehouse_id === node.warehouseId)
      if (same) same.quantity = round(same.quantity + quantity)
      else entry.products.push({ product_id: node.productId, quantity: round(quantity), warehouse_id: node.warehouseId })
      vendors.set(vendor.key, entry)
    }),
  )
  return {
    company_name: textOf(order.companyName),
    document_no: textOf(order.documentNo),
    buyer_company_id: companyId,
    vendors: [...vendors.values()],
  }
}

/**
 * One vendor's request as its Word file shows it (Document/quotationDocx) -
 * drawn from the same lines and quantities as buildQuotationBody, so the file
 * and the request always agree:
 *
 *   { seller: the vendor, buyer: the company asking, so_no, so_date,
 *     product: [{ Description, Hsn_code, Per, Qty (as entered), Gst_rate, sku_details }] }
 *
 * Only what is asked of this vendor (above 0); nothing is filled in that the
 * requirements or the order did not give.
 *
 * @param order  the saved order - { documentNo, documentDate (DD/MM/YYYY), buyer:
 *               { name, address, gstin, phone, email } }
 */
export const buildQuotationDocument = ({ order, lines, choices, vendorKey }) => {
  const product = []
  let seller = null
  lines.forEach(({ key, node, selected }) =>
    selected.forEach((vendor) => {
      if (vendor.key !== vendorKey) return
      seller = vendor
      const quantity = allocated(choices, key, vendor.key) ?? 0
      if (quantity <= EPSILON) return
      product.push({ Description: node.name, Hsn_code: node.hsn, Per: node.per, Qty: round(quantity), Gst_rate: node.gstRate, sku_details: node.skuDetails })
    }),
  )
  return {
    seller: seller ? { name: seller.name, address: seller.address, gstin: seller.gstin, contact: seller.contact, email: seller.email } : {},
    buyer: { ...order.buyer },
    product,
    so_no: textOf(order.documentNo),
    so_date: textOf(order.documentDate),
  }
}

/** Whether a request has anything to send. */
export const hasQuotation = (body) => Boolean(body) && body.vendors.length > 0
