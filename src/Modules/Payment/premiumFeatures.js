/**
 * PREMIUM FEATURE RECHARGE - the config and the pure functions behind
 * /payment/premium-feature. No React, no network.
 *
 * ------------------------------------------------------------------
 * TWO NAMES FOR ONE FEATURE
 * ------------------------------------------------------------------
 * The price list (`premium_feature` in payment/priceList/) and the payment
 * payload do not name features the same way:
 *
 *   price list  module_name   "e-invoice", "GSTR2B", "Remort Printing"
 *   payload     feature       "E-Invoice", "GSTR 2B", with a fixed id 1..7
 *
 * RECHARGE_FEATURES below is the one place that joins them. It holds only
 * what the backend does NOT send - the payload's id and feature name. The
 * PRICE, and whether the feature is offered at all, still come from the
 * price list: a feature with no price there is not shown.
 *
 * Names are compared "compactly" - lower case, letters and digits only - so
 * "e-waybill", "E-Way Bill" and "EWAYBILL" are all the same feature. A
 * backend name that differs by more than that goes in `priceNames`.
 *
 * ------------------------------------------------------------------
 * FOUR KINDS OF ITEM ON THE PAGE
 * ------------------------------------------------------------------
 *   RECHARGE   counted units: count x unit price    (E-Invoice, GSTR 1 ...)
 *   GROUP      a named list of items ticked one by one, with an "All"
 *              price for taking the whole list      (Biz Doxs)
 *   PACKAGES   one module sold in named packages, one of which is chosen
 *              in a dialog                          (Inventory Management)
 *   ADD-ON     any other premium_feature item: bought once, at its amount
 *              or the option chosen
 *
 * A new counted feature is one line in RECHARGE_FEATURES; a new group,
 * package or add-on needs no change at all - each appears, named and priced
 * as the backend sends it, as soon as the price list has it.
 */

import { finishQuote, formatINR, toAmountString } from './pricing'

/**
 * The counted features - the ones with a [-] 10 [+] counter - in the order
 * and the wording of the old recharge screen:
 *
 *   E-Invoice             Rs 1    per unit
 *   E-Way Bill            Rs 1    per unit
 *   GSTR 1                Rs 5    per filling
 *   GSTR 1 Download       Rs 2    per fetching
 *   GSTR 2B               Rs 1    per unit
 *   IMS                   Rs 5    per filling
 *   Purchase Invoice(AI)  Rs 0.75 per page
 *
 * `id` and `feature` are exactly what the payment payload has always sent,
 * whatever the order here; `unit` only words the price under the name, and
 * defaults to "unit". The PRICES are the price list's - the figures above
 * are only what it holds today, and are read, never written, here.
 */
export const RECHARGE_FEATURES = [
  { id: 1, feature: 'E-Invoice', priceNames: ['e-invoice'] },
  { id: 2, feature: 'E-Way Bill', priceNames: ['e-waybill'] },
  { id: 4, feature: 'GSTR 1', priceNames: ['GSTR1'], unit: 'filling' },
  { id: 7, feature: 'GSTR 1 Download', priceNames: ['GSTR1Download'], unit: 'fetching' },
  { id: 3, feature: 'GSTR 2B', priceNames: ['GSTR2B'] },
  { id: 5, feature: 'IMS', priceNames: ['IMS'], unit: 'filling' },
  { id: 6, feature: 'Purchase Invoice(AI)', priceNames: ['Purchase Invoice(AI)'], unit: 'page' },
]

/** The old recharge screen's floor: no payment below this many rupees. */
export const MIN_RECHARGE_RUPEES = 25

/** The most units one feature can be recharged with in one payment. */
export const MAX_RECHARGE_COUNT = 100000

/* ------------------------------------------------------------------ */

const compact = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

const namesOf = (entry, displayName) => new Set([displayName, ...(entry.priceNames ?? [])].map(compact))

/**
 * SECTIONS vs GROUPS
 *
 * premium_feature arrives as named lists:
 *
 *   "Biz Doxs":       [ Challan ... , All ]   an OFFER - its "All" price is
 *                                             the price of the whole list
 *   "Other Features": [ GSTR1, IMS, Inventory Management ... ]
 *                                             only a SECTION heading - the
 *                                             items in it are sold one by one
 *
 * The difference is the "All" item. A list that has one is kept together, as
 * a group the page draws with its "All Biz Doxs" tick; a list without one is
 * only a wrapper, so its items are lifted out and sold as if they had been
 * listed at the top - counters get their counters, packages their dialog.
 * Nothing here names either list: a section the backend adds tomorrow is
 * lifted the same way.
 */
const liftSections = (items) =>
  items.flatMap((item) => (item.kind === 'group' && !item.bundle ? item.items : [item]))

/**
 * Price-list items (pricing.parsePremiumFeatures().items) -> what the page
 * draws:
 *
 *   recharge    [{ id, feature, unit, amount, key }]   priced counted features
 *   groups      [{ key, name, items, bundle }]         Biz Doxs and the like
 *   packages    [{ key, name, packages: [...] }]       Inventory Management
 *   addOns      [item]                                 everything else on sale
 *
 * Everything the price list carries is on sale: an item is shown, and can be
 * bought, as soon as it has a price there.
 */
export const buildRechargeCatalog = (rawItems = []) => {
  const items = liftSections(rawItems)
  const used = new Set()

  const recharge = RECHARGE_FEATURES.map((entry) => {
    const names = namesOf(entry, entry.feature)
    const item = items.find((candidate) => candidate.kind === 'flat' && names.has(compact(candidate.name)))
    if (!item) return null
    used.add(item.key)
    return {
      ...entry,
      key: `recharge-${entry.id}`,
      label: entry.label ?? entry.feature,
      amount: item.amount,
    }
  }).filter(Boolean)

  const rest = items.filter((item) => !used.has(item.key))

  return {
    recharge,
    groups: rest.filter((item) => item.kind === 'group'),
    packages: rest.filter((item) => item.kind === 'packages'),
    addOns: rest.filter((item) => item.kind === 'flat' || item.kind === 'options'),
  }
}

/* ------------------------------------------------------------------ */
/* Groups (Biz Doxs)                                                  */
/* ------------------------------------------------------------------ */

/** Every member of a group - what ticking "All <group>" selects. */
export const groupItemKeys = (group) => group.items.map((item) => item.key)

/**
 * Whether the whole group is taken. It is the ONE test behind both the "All
 * Biz Doxs" tick and the "All" price: ticking All selects every member, and
 * ticking every member one by one is the same thing. So the group is never
 * charged twice, and never at 300 x 9 when the backend offers it at 1500.
 */
export const isWholeGroup = (group, keys = []) =>
  group.items.length > 0 && group.items.every((item) => keys.includes(item.key))

/** The package chosen for a packaged module (Inventory Management), or null. */
const chosenPackage = (item, packageChoices = {}) =>
  item.packages.find((entry) => entry.key === packageChoices[item.key]) ?? null

/**
 * A package's own named lists, plus those of the package it `includes`, and
 * that one's in turn: Gold includes Standard, so Gold covers Standard's nine
 * documents although its own card lists none. The chain is the API's
 * `includes` field, followed by name; a package that names itself, or a loop
 * between two, stops at the one already seen.
 */
const coveredLists = (item, pack, seen = new Set()) => {
  if (!pack || seen.has(pack.key)) return []
  seen.add(pack.key)

  const parent = pack.includes
    ? item.packages.find((entry) => compact(entry.name) === compact(pack.includes))
    : null

  return [...pack.included, ...coveredLists(item, parent, seen)]
}

/**
 * WHAT A PACKAGE ALREADY COVERS
 *
 * A package card carries lists of its own, named after the group they come
 * from: Basic's `"Biz Doxs": ["Challan"]`, Standard's nine. Those documents
 * come WITH the package, so they must never be charged again beside it.
 *
 * -> { [group key]: [member keys the chosen packages cover] }
 *
 * Nothing is named here: a package list is matched to a group by name, so a
 * package that starts covering another group needs no change. Names are
 * compared compactly, as everywhere else on this page.
 */
export const includedGroupKeys = (catalog, packageChoices = {}) => {
  const included = {}

  catalog.packages.forEach((item) => {
    const chosen = chosenPackage(item, packageChoices)
    if (!chosen) return

    coveredLists(item, chosen).forEach((list) => {
      const group = catalog.groups.find((entry) => compact(entry.name) === compact(list.label))
      if (!group) return

      const covered = group.items
        .filter((member) => list.items.some((name) => compact(name) === compact(member.name)))
        .map((member) => member.key)

      included[group.key] = [...new Set([...(included[group.key] ?? []), ...covered])]
    })
  })

  return included
}

/**
 * What a group is charged as, once what a package already covers is taken
 * out of it:
 *
 *   none       nothing of it is taken
 *   included   everything taken comes with a package - no charge at all
 *   bundle     its own "All" price: either every member is taken, or the
 *              members taken already cost as much as the whole list, and
 *              nobody should pay more than the whole list costs
 *   items      the members taken, each at its own price
 *
 * One function, used by both the price and the payload, so what the summary
 * shows and what is sent can never disagree.
 */
const groupCharge = (group, keys = [], included = []) => {
  const taken = group.items.filter((item) => keys.includes(item.key) || included.includes(item.key))
  if (!taken.length) return { kind: 'none', items: [] }

  const chargeable = taken.filter((item) => !included.includes(item.key))
  if (!chargeable.length) return { kind: 'included', items: [] }

  const sum = chargeable.reduce((total, item) => total + item.amount, 0)
  if (group.bundle && (chargeable.length === group.items.length || sum >= group.bundle.amount)) {
    return { kind: 'bundle', items: chargeable }
  }
  return { kind: 'items', items: chargeable }
}

/** What a group costs - see groupCharge above. */
const groupLines = (group, keys = [], included = []) => {
  const charge = groupCharge(group, keys, included)

  if (charge.kind === 'none') return []

  if (charge.kind === 'included') {
    return [
      {
        key: `${group.key}:included`,
        label: group.name,
        detail: 'included in your package',
        amount: 0,
        owned: false,
      },
    ]
  }

  if (charge.kind === 'bundle') {
    return [
      {
        key: `${group.key}:all`,
        label: `${group.name} - ${group.bundle.name}`,
        detail: `all ${group.items.length} included`,
        amount: group.bundle.amount,
        owned: false,
      },
    ]
  }

  return charge.items.map((item) => ({
    key: `${group.key}:${item.key}`,
    label: item.name,
    detail: group.name,
    amount: item.amount,
    owned: false,
  }))
}

/* ------------------------------------------------------------------ */
/* The price                                                          */
/* ------------------------------------------------------------------ */

/**
 * The live price:
 *   counts          { [feature id]: units }
 *   groupKeys       { [group key]: [member keys ticked] }
 *   packageChoices  { [module key]: package key }
 *   addOnKeys       the add-ons ticked
 *   optionChoices   { [add-on key]: option key }
 * Same shape as every other quote (pricing.finishQuote). No offer: the
 * recharge flow does not take one.
 */
export const calculateRechargeQuote = ({
  catalog,
  counts = {},
  groupKeys = {},
  packageChoices = {},
  addOnKeys = [],
  optionChoices = {},
  gstPercent,
}) => {
  const issues = []
  const lines = []

  catalog.recharge.forEach((entry) => {
    const count = counts[entry.id] ?? 0
    if (count > 0) {
      lines.push({
        key: entry.key,
        label: entry.label ?? entry.feature,
        detail: `${count} × ${formatINR(entry.amount)}${entry.unit ? ` / ${entry.unit}` : ''}`,
        amount: entry.amount * count,
        owned: false,
      })
    }
  })

  // What the chosen package already covers is never charged again.
  const includedKeys = includedGroupKeys(catalog, packageChoices)

  catalog.groups.forEach((group) => {
    lines.push(...groupLines(group, groupKeys[group.key], includedKeys[group.key]))
  })

  catalog.packages.forEach((item) => {
    const chosen = chosenPackage(item, packageChoices)
    if (!chosen) return
    lines.push({
      key: item.key,
      label: `${item.name} - ${chosen.name}`,
      detail: chosen.includes ? `includes ${chosen.includes}` : 'package',
      amount: chosen.amount,
      owned: false,
    })
  })

  catalog.addOns
    .filter((item) => addOnKeys.includes(item.key))
    .forEach((item) => {
      if (item.kind === 'flat') {
        lines.push({ key: item.key, label: item.name, detail: 'per year', amount: item.amount, owned: false })
        return
      }
      const option = item.options.find((entry) => entry.key === optionChoices[item.key])
      if (!option) issues.push(`Choose an option for ${item.name}.`)
      else lines.push({ key: item.key, label: item.name, detail: option.label, amount: option.amount, owned: false })
    })

  if (!lines.length && !issues.length) issues.push('Select at least one feature to pay for.')

  const quote = finishQuote({ lines, offer: null, gstPercent, issues })
  if (quote.lines.length && quote.payable < MIN_RECHARGE_RUPEES * 100) {
    quote.issues.push(`The minimum order is ₹${MIN_RECHARGE_RUPEES} before GST.`)
  }
  return quote
}

/**
 * The POST payment/paymentDetail/ body - the shape the backend reads:
 *
 *   {
 *     currency, amount, gstamount, product_type: "premium_feature",
 *     "<company name>": [{ id, count, feature }, ...]
 *   }
 *
 * ONLY what the user chose: a counted feature is in the payload when its
 * quantity is above 0, and everything else when it is ticked. Nothing the
 * user did not pick is sent, so choosing E-Invoice alone sends that one row.
 * Everything bought once carries the old screen's empty count.
 *
 *   group member   { id, count: "", feature: "Challan", group: "Biz Doxs" }
 *   whole group    { id, count: "", feature: "All",     group: "Biz Doxs" }
 *                  ONE row, priced as the group's own "All" - its members
 *                  are not repeated, so nothing is charged twice
 *   covered by a   no row at all - the package row already carries it
 *   package
 *   package        { id, count: "", feature: "Inventory Management",
 *                    selected_package: "Standard",
 *                    package: { "Standard": { ...exactly as the price list
 *                                             sent it... } } }
 *                  only the package chosen: never Basic or Gold beside it
 *   add-on         { id, count: "", feature, selected_option? }
 */
export const buildRechargePayload = ({
  quote,
  companyName,
  counts = {},
  catalog,
  groupKeys = {},
  packageChoices = {},
  addOnKeys = [],
  optionChoices = {},
  productType,
}) => {
  const rows = RECHARGE_FEATURES
    .map(({ id, feature }) => ({ id, count: counts[id] ?? 0, feature }))
    // A quantity of 0 was not bought - it is left out of the payload.
    .filter((row) => row.count > 0)
    // By id, as the payload has always been ordered - the list above is in
    // the order the screen shows them, which is not the same.
    .sort((a, b) => a.id - b.id)

  // Everything bought once carries on the counted features' numbering.
  let nextId = RECHARGE_FEATURES.length
  const addRow = (row) => {
    nextId += 1
    rows.push({ id: nextId, count: '', ...row })
  }

  // A document a package covers is not sent as a row of its own: it is
  // already in the package row below, and would otherwise be charged twice.
  const includedKeys = includedGroupKeys(catalog, packageChoices)

  catalog.groups.forEach((group) => {
    const charge = groupCharge(group, groupKeys[group.key], includedKeys[group.key])

    if (charge.kind === 'bundle') {
      addRow({ feature: group.bundle.name, group: group.name })
      return
    }
    charge.items.forEach((item) => addRow({ feature: item.name, group: group.name }))
  })

  catalog.packages.forEach((item) => {
    const chosen = chosenPackage(item, packageChoices)
    if (!chosen) return
    addRow({ feature: item.name, selected_package: chosen.name, package: chosen.raw })
  })

  catalog.addOns
    .filter((item) => addOnKeys.includes(item.key))
    .forEach((item) => {
      addRow({
        feature: item.name,
        ...(item.kind === 'options' ? { selected_option: optionChoices[item.key] ?? null } : {}),
      })
    })

  return {
    currency: 'INR',
    amount: toAmountString(quote.payable),
    gstamount: toAmountString(quote.gst),
    product_type: productType,
    [companyName]: rows,
  }
}
