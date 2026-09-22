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
 * TWO KINDS OF ITEM ON THE PAGE
 * ------------------------------------------------------------------
 *   RECHARGE   counted units: count x unit price    (E-Invoice, GSTR 1 ...)
 *   ADD-ON     any other premium_feature item: bought once, at its amount
 *              or the option chosen                (Quotation, Inventory
 *                                                    Management ...)
 *
 * A new counted feature is one line in RECHARGE_FEATURES; a new add-on
 * needs no change at all - it appears as soon as the price list has it.
 */

import { finishQuote, formatINR, toAmountString } from './pricing'

/**
 * The counted features, in payload order. `id` and `feature` are exactly what
 * the payment payload has always sent; `unit` only words the price label.
 */
export const RECHARGE_FEATURES = [
  { id: 1, feature: 'E-Invoice', priceNames: ['e-invoice'] },
  { id: 2, feature: 'E-Way Bill', priceNames: ['e-waybill'] },
  { id: 3, feature: 'GSTR 2B', priceNames: ['GSTR2B'], unit: 'fetch' },
  { id: 4, feature: 'GSTR 1', priceNames: ['GSTR1'], unit: 'filing' },
  { id: 5, feature: 'IMS', priceNames: ['IMS'], unit: 'filing' },
  { id: 6, feature: 'Purchase Invoice(AI)', priceNames: ['Purchase Invoice(AI)'], unit: 'page' },
  { id: 7, feature: 'GSTR 1 Download', priceNames: ['GSTR1Download'], unit: 'download' },
]

/**
 * Shown as "Coming Soon" and never sold, even when priced - until the
 * backend marks the item itself (`coming_soon` / `is_active`), at which
 * point this list can be emptied. "Remort" is how the price list spells it.
 */
export const COMING_SOON_FEATURES = [{ name: 'Remote Printing', priceNames: ['Remort Printing'] }]

/** The old recharge screen's floor: no payment below this many rupees. */
export const MIN_RECHARGE_RUPEES = 25

/** The most units one feature can be recharged with in one payment. */
export const MAX_RECHARGE_COUNT = 100000

/* ------------------------------------------------------------------ */

const compact = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

const namesOf = (entry, displayName) => new Set([displayName, ...(entry.priceNames ?? [])].map(compact))

/** The COMING_SOON_FEATURES entry for a price-list name, if any. */
const comingSoonEntry = (name) =>
  COMING_SOON_FEATURES.find((entry) => namesOf(entry, entry.name).has(compact(name))) ?? null

const isComingSoon = (item) => item.comingSoon || Boolean(comingSoonEntry(item.name))

/** Shown by the config's spelling ("Remote Printing"), not the price list's. */
const displayName = (name) => comingSoonEntry(name)?.name ?? name

/**
 * Price-list items (pricing.parsePremiumFeatures().items) -> what the page
 * draws:
 *
 *   recharge    [{ id, feature, unit, amount, key }]   priced counted features
 *   addOns      [item]                                 everything else on sale
 *   comingSoon  [{ key, name }]                        shown, not sold
 */
export const buildRechargeCatalog = (items = []) => {
  const used = new Set()

  const recharge = RECHARGE_FEATURES.map((entry) => {
    const names = namesOf(entry, entry.feature)
    const item = items.find((candidate) => candidate.kind === 'flat' && names.has(compact(candidate.name)))
    if (!item) return null
    used.add(item.key)
    return { ...entry, key: `recharge-${entry.id}`, amount: item.amount, comingSoon: isComingSoon(item) }
  }).filter(Boolean)

  const rest = items.filter((item) => !used.has(item.key))

  return {
    recharge: recharge.filter((entry) => !entry.comingSoon),
    addOns: rest.filter((item) => !isComingSoon(item)),
    comingSoon: [
      ...recharge.filter((entry) => entry.comingSoon).map((entry) => ({ key: entry.key, name: entry.feature })),
      ...rest.filter(isComingSoon).map((item) => ({ key: item.key, name: displayName(item.name) })),
    ],
  }
}

/**
 * The live price:
 *   counts         { [feature id]: units }
 *   addOnKeys      the add-ons ticked
 *   optionChoices  { [add-on key]: option key }
 * Same shape as every other quote (pricing.finishQuote). No offer: the
 * recharge flow does not take one.
 */
export const calculateRechargeQuote = ({ catalog, counts = {}, addOnKeys = [], optionChoices = {}, gstPercent }) => {
  const issues = []
  const lines = []

  catalog.recharge.forEach((entry) => {
    const count = counts[entry.id] ?? 0
    if (count > 0) {
      lines.push({
        key: entry.key,
        label: entry.feature,
        detail: `${count} × ${formatINR(entry.amount)}${entry.unit ? ` / ${entry.unit}` : ''}`,
        amount: entry.amount * count,
        owned: false,
      })
    }
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

  if (!lines.length && !issues.length) issues.push('Add a quantity to at least one feature.')

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
 * Every counted feature of RECHARGE_FEATURES is listed, 0 where none was
 * bought, as the old screen sent it. Ticked add-ons follow, with the old
 * screen's empty count and - for an option-priced one - the option chosen.
 */
export const buildRechargePayload = ({ quote, companyName, counts = {}, catalog, addOnKeys = [], optionChoices = {}, productType }) => {
  const rows = RECHARGE_FEATURES.map(({ id, feature }) => ({ id, count: counts[id] ?? 0, feature }))

  catalog.addOns
    .filter((item) => addOnKeys.includes(item.key))
    .forEach((item, index) => {
      rows.push({
        id: RECHARGE_FEATURES.length + index + 1,
        count: '',
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
