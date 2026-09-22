/**
 * THE PAYMENT MODULE'S PRICING - pure functions, no React, no network.
 *
 * GET payment/priceList/ is the source of truth. Nothing below names a
 * package, a module or a price: it reads whatever the backend sends and
 * works out the rest from its SHAPE.
 *
 * ------------------------------------------------------------------
 * 1. HOW THE PRICE LIST IS READ
 * ------------------------------------------------------------------
 * The top-level key is picked from profile_details.user_type
 * ("Accounting Professional" -> accounting_professional, "MSME" -> msme).
 * Under it, each level is read the same way:
 *
 *   an array                     -> the module list itself
 *   an object with the ERP key   -> step into it   (msme.tally, msme.intelligere)
 *   an object of numeric keys    -> company TIERS  (accounting_professional.50 ...)
 *
 * So a new ERP, a new tier or a new user type needs no change here.
 *
 * Each price item is one of two kinds:
 *
 *   { module_name, amount }                     FLAT - one price
 *   { module_name, "100": 1000, "unlimited": }  OPTIONS - the user picks one
 *                                               (Procurement events, warehouses)
 *
 * The item named "All" is the BUNDLE: the Premium Package price.
 *
 * ------------------------------------------------------------------
 * 2. WHAT A PRICE IS MULTIPLIED BY
 * ------------------------------------------------------------------
 * Taken from how the old payment screen charged, unless the item says
 * otherwise with an optional `basis: "per_company" | "flat"`:
 *
 *                     tiers (Accounting Prof.)     quantity (MSME)
 *   bundle ("All")    once - the tier's TOTAL      x companies chosen
 *                     price ("50": 9500 = ₹9,500
 *                     for all 50 companies)
 *   flat module       once per package             x companies chosen
 *   options module    the chosen option, once      the chosen option, once
 *
 * MSME Premium also keeps the old multi-company rule: every company after
 * the first is ADDITIONAL_COMPANY_DISCOUNT_PERCENT cheaper (an item may
 * override it with `additional_company_discount`).
 *
 * ------------------------------------------------------------------
 * 3. THE ORDER OF THE SUM
 * ------------------------------------------------------------------
 *   module / package prices
 *     - multi-company discount (MSME Premium)  = subtotal ("original amount")
 *     - offer discount     (a valid offer)       *     - upgrade discount   (no offer, upgrade)  /  = payable - ONE of the two
 *     + GST on the payable amount              = grand total
 *
 * The two discounts are never combined. A valid offer (payment/checkOffer/,
 * see ./offer) always wins: its discount_percent comes off and the upgrade
 * discount is dropped. Without one, an UPGRADE - a payment for a different
 * company count than the plan held (payment/userPaymentData/
 * company_package), the old screen's own test - gets the upgrade discount
 * (renewalCredit).
 *
 * ------------------------------------------------------------------
 * 4. MONEY
 * ------------------------------------------------------------------
 * Every amount here is an integer number of PAISE. 0.1 + 0.2 never happens:
 * rupees are turned into paise once, on the way in (toPaise), and back into
 * a "8000.00" string once, on the way out (toAmountString).
 *
 * The backend re-prices the order itself and has the final word. These
 * figures are what the user is SHOWN, live, while they choose.
 */

import { formatIndianCurrency } from '@/Utils/currency'

/* ------------------------------------------------------------------ */
/* Defaults - used only when the backend does not say                 */
/* ------------------------------------------------------------------ */

/** GST when the price list carries no `gst_percent` / `gst_rate`. */
export const DEFAULT_GST_PERCENT = 18

/** The old MSME Premium rule: each company after the first costs this much less. */
export const ADDITIONAL_COMPANY_DISCOUNT_PERCENT = 20

/**
 * Display names of the Accounting Professional tiers, from the old screen.
 * A tier the backend adds that is not here is still shown - as "1000 Companies".
 */
const TIER_NAMES = { 50: 'Silver', 100: 'Gold', 250: 'Diamond', 500: 'Platinum' }

/** What the Premium Package of a quantity (MSME) plan is called in the payload. */
const QUANTITY_PREMIUM_PACKAGE_TYPE = 'platinum'

export const PACKAGE_MODE = Object.freeze({ PREMIUM: 'premium', CUSTOM: 'custom' })

export const PLAN_STRUCTURE = Object.freeze({ TIERS: 'tiers', QUANTITY: 'quantity' })

const BASIS = Object.freeze({ PER_COMPANY: 'per_company', FLAT: 'flat' })

/** Fields of a price item that are NOT prices of an option. */
const RESERVED_FIELDS = new Set([
  'id',
  'module_name',
  'name',
  'amount',
  'basis',
  'price_basis',
  'description',
  'label',
  'order',
  'additional_company_discount',
  'coming_soon',
  'is_active',
])

/** Thrown when the price list cannot be turned into something to sell. */
export class PricingError extends Error { }

/* ------------------------------------------------------------------ */
/* Money                                                              */
/* ------------------------------------------------------------------ */

/** Rupees (number or "4500.00") -> integer paise, or null if not a number. */
export const toPaise = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number * 100) : null
}

/** Integer paise -> "8000.00", the form the payment API takes. */
export const toAmountString = (paise) => {
  const safe = Math.max(0, Math.round(paise || 0))
  return `${Math.floor(safe / 100)}.${String(safe % 100).padStart(2, '0')}`
}

/** A percentage of an amount, rounded to the nearest paisa. */
export const percentOf = (paise, percent) => Math.round((paise * percent) / 100)

/**
 * Integer paise -> '₹9,500' / '₹1,00,000.50'. Only turns paise into rupees:
 * the formatting itself is Utils/currency's formatIndianCurrency, the one
 * money formatter of the app.
 */
export const formatINR = (paise) => formatIndianCurrency(Math.round(paise || 0) / 100)

/* ------------------------------------------------------------------ */
/* Reading the price list                                             */
/* ------------------------------------------------------------------ */

/** "Accounting Professional" -> "accounting_professional", "Tally" -> "tally". */
export const normalizeKey = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const isNumericKey = (key) => /^\d+$/.test(String(key).trim())

/** "single warehouse" -> "Single Warehouse"; "100" stays "100". */
const optionLabel = (key) =>
  isNumericKey(key)
    ? String(key).trim()
    : String(key)
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())

const readBasis = (raw) => {
  const basis = normalizeKey(raw.basis ?? raw.price_basis)
  return basis === BASIS.PER_COMPANY || basis === BASIS.FLAT ? basis : null
}

/**
 * One price item -> a module, or null when it has no name or no usable price.
 * `id` is filled in later, by position, unless the backend sends one.
 */
const parsePriceItem = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const name = String(raw.module_name ?? raw.name ?? '').trim()
  if (!name) return null

  const base = {
    backendId: raw.id ?? null,
    key: normalizeKey(name),
    name,
    description: typeof raw.description === 'string' ? raw.description : '',
    basis: readBasis(raw),
    discountPercent: toPaise(raw.additional_company_discount) === null
      ? null
      : Number(raw.additional_company_discount),
    // The backend can hold an item back without removing it from the list:
    // `coming_soon: true` or `is_active: false`.
    comingSoon: raw.coming_soon === true || raw.is_active === false,
  }

  const amount = toPaise(raw.amount)
  if (amount !== null && amount >= 0) return { ...base, kind: 'flat', amount, options: [] }

  // Every other numeric field is one option the user can choose.
  const options = Object.entries(raw)
    .filter(([field]) => !RESERVED_FIELDS.has(field))
    .map(([field, value]) => {
      const price = toPaise(value)
      if (price === null || price < 0) return null
      return {
        key: field,
        label: optionLabel(field),
        amount: price,
        quantity: isNumericKey(field) ? Number(field) : null,
      }
    })
    .filter(Boolean)
    // Numbered options in order (100, 250, ...), then named ones ("unlimited").
    .sort((a, b) => {
      if (a.quantity !== null && b.quantity !== null) return a.quantity - b.quantity
      if (a.quantity !== null) return -1
      if (b.quantity !== null) return 1
      return 0
    })

  return options.length ? { ...base, kind: 'options', amount: null, options } : null
}

/**
 * A price-item array -> { bundle, modules, skipped }.
 *
 * `bundle` is the "All" item (null when there is none - then only a Custom
 * Package can be bought). Module ids are 1, 2, 3 ... in the backend's order
 * unless it sends its own, which is what the payment payload's `id` holds.
 */
const parseModuleList = (rawList) => {
  const list = Array.isArray(rawList) ? rawList : []
  const seen = new Set()
  let bundle = null
  let skipped = 0
  const modules = []

  list.forEach((raw) => {
    const item = parsePriceItem(raw)
    if (!item || seen.has(item.key)) {
      skipped += 1
      return
    }
    seen.add(item.key)

    if (item.key === 'all' && item.kind === 'flat') bundle = item
    else modules.push({ ...item, id: item.backendId ?? modules.length + 1 })
  })

  return { bundle, modules, skipped }
}

const tierName = (count) => TIER_NAMES[count] ?? `${count} Companies`

/**
 * Walks one level of the price list - see "HOW THE PRICE LIST IS READ".
 * Returns null when the ERP asked for is not there.
 */
const resolvePricingNode = (node, erpKey) => {
  if (Array.isArray(node)) {
    return { structure: PLAN_STRUCTURE.QUANTITY, plan: parseModuleList(node), tiers: [] }
  }
  if (!node || typeof node !== 'object') return null

  const keys = Object.keys(node)
  const erpMatch = erpKey ? keys.find((key) => normalizeKey(key) === erpKey) : null
  if (erpMatch) return resolvePricingNode(node[erpMatch], null)

  if (keys.length && keys.every(isNumericKey)) {
    const tiers = keys
      .map(Number)
      .sort((a, b) => a - b)
      .map((count) => ({
        key: String(count),
        count,
        name: tierName(count),
        ...parseModuleList(node[String(count)]),
      }))
      .filter((tier) => tier.bundle || tier.modules.length)
    return { structure: PLAN_STRUCTURE.TIERS, plan: null, tiers }
  }

  return null
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/**
 * The object that holds the user-type keys, wherever the reply put it.
 *
 * The documented reply has them at the top ({ accounting_professional, msme,
 * premium_feature }), but a reply wrapped in an envelope - { data: {...} },
 * { status, msg, data: {...} } - hides them one level down, and reading the
 * top level would then find no pricing at all. So the reply is searched,
 * level by level (a few deep), for the first object with the user's key;
 * the wrapper's field names never matter. A reply sent as a JSON string is
 * parsed first.
 *
 * Falls back to the top-level object, so a reply that really has no pricing
 * for this user still reports that, by name.
 */
export const locatePriceList = (response, segmentKey, maxDepth = 3) => {
  let root = response
  if (typeof root === 'string') {
    try {
      root = JSON.parse(root)
    } catch {
      return null
    }
  }
  if (!isPlainObject(root)) return null

  let level = [root]
  for (let depth = 0; depth <= maxDepth && level.length; depth += 1) {
    const found = level.find((node) => Object.keys(node).some((key) => normalizeKey(key) === segmentKey))
    if (found) return found
    level = level.flatMap((node) => Object.values(node).filter(isPlainObject))
  }
  return root
}

/** GST from the price list if it carries one (18 or 0.18), else the default. */
export const readGstPercent = (priceList) => {
  const raw = priceList?.gst_percent ?? priceList?.gst_rate ?? priceList?.gst
  const number = Number(raw)
  if (raw === undefined || raw === null || !Number.isFinite(number) || number < 0) {
    return DEFAULT_GST_PERCENT
  }
  return number > 0 && number < 1 ? number * 100 : number
}

/**
 * The price list + who the user is -> everything the payment page draws.
 *
 *   {
 *     structure        'tiers' (package cards) | 'quantity' (company counter)
 *     tiers            [{ key, count, name, bundle, modules }]   for 'tiers'
 *     plan             { bundle, modules }                       for 'quantity'
 *     gstPercent
 *     premiumFeatures  [module]  - the add-on catalog
 *   }
 *
 * Throws PricingError with a message fit to show when nothing can be sold.
 */
export const buildCatalog = (response, { userType, erp } = {}) => {
  const segmentKey = normalizeKey(userType)
  const priceList = locatePriceList(response, segmentKey)

  if (!priceList) {
    throw new PricingError('The price list is empty. Please try again later.')
  }

  const segment = Object.keys(priceList).find((key) => normalizeKey(key) === segmentKey)
  if (!segmentKey || !segment) {
    throw new PricingError(
      userType
        ? `No pricing is set up for ${userType} accounts yet.`
        : 'Your account type is not set, so no pricing can be shown.',
    )
  }

  const resolved = resolvePricingNode(priceList[segment], normalizeKey(erp))
  if (!resolved) {
    throw new PricingError(
      erp ? `No pricing is set up for the ${erp} ERP yet.` : 'Your ERP is not set, so no pricing can be shown.',
    )
  }

  const empty =
    resolved.structure === PLAN_STRUCTURE.TIERS
      ? resolved.tiers.length === 0
      : !resolved.plan.bundle && resolved.plan.modules.length === 0
  if (empty) throw new PricingError('The price list has no packages to offer yet.')

  const features = parseModuleList(priceList.premium_feature ?? priceList.premium_features)

  return {
    userType,
    erp,
    structure: resolved.structure,
    tiers: resolved.tiers,
    plan: resolved.plan,
    gstPercent: readGstPercent(priceList),
    premiumFeatures: [...(features.bundle ? [features.bundle] : []), ...features.modules],
  }
}

/**
 * The premium features in the price list (`premium_feature`), parsed like
 * any other price items - whatever the reply is wrapped in. Needs no user
 * type: the premium recharge page does not depend on the package pricing.
 */
export const parsePremiumFeatures = (response) => {
  const priceList = locatePriceList(response, 'premium_feature')
  const raw = priceList?.premium_feature ?? priceList?.premium_features
  const features = parseModuleList(raw)
  return {
    items: [...(features.bundle ? [features.bundle] : []), ...features.modules],
    gstPercent: readGstPercent(priceList),
  }
}

/** The { bundle, modules } in play: the chosen tier, or the one quantity plan. */
export const getPlan = (catalog, tierKey) =>
  catalog?.structure === PLAN_STRUCTURE.TIERS
    ? catalog.tiers.find((tier) => tier.key === tierKey) ?? null
    : catalog?.plan ?? null

/* ------------------------------------------------------------------ */
/* The user's current subscription                                    */
/* ------------------------------------------------------------------ */

/** The old screen treated a payment this many months old as a fresh start. */
const RENEWAL_WINDOW_MONTHS = 10

const monthsSince = (dateText) => {
  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  return now.getMonth() - date.getMonth() + 12 * (now.getFullYear() - date.getFullYear())
}

/**
 * payment/userPaymentData/ -> { pastModules, pastQuantity, packageType } or
 * null for a new payment. Same rules as the old screen: "new payment", or a
 * payment RENEWAL_WINDOW_MONTHS or more ago, is a new payment.
 */
export const parseSubscription = (raw) => {
  if (!raw || typeof raw !== 'object' || raw.payment === 'new payment') return null

  const months = monthsSince(raw.payment_date)
  if (months === null || months >= RENEWAL_WINDOW_MONTHS) return null

  const pastModules = Array.isArray(raw.module) ? raw.module.map(String) : []
  return {
    pastModules,
    pastModuleKeys: new Set(pastModules.map(normalizeKey)),
    pastQuantity: Number(raw.company_package) || 0,
    packageType: normalizeKey(raw.package_type),
    // For the upgrade discount (renewalCredit): what was paid, and how long ago.
    pastAmount: toPaise(raw.amount) ?? 0,
    monthsSincePayment: months,
  }
}

/**
 * The old screen's upgrade discount (`renewDisc` in checkPaymentDate): the
 * share of the PREVIOUS payment credited against an upgrade, by how many
 * months ago it was made. An amount, in paise - not a percentage.
 *
 *   0-1 months    100% of the previous amount
 *   2-3 months     70%
 *   4-6 months     50%
 *   7-9 months     25%
 *   10+ months    none - parseSubscription already treats it as a new payment
 *
 * MSME users get none, as before.
 */
const RENEWAL_CREDIT_PERCENT = [
  { upToMonths: 1, percent: 100 },
  { upToMonths: 3, percent: 70 },
  { upToMonths: 6, percent: 50 },
  { upToMonths: 9, percent: 25 },
]

export const renewalCredit = (subscription, userType) => {
  if (!subscription || normalizeKey(userType) === 'msme') return 0
  const step = RENEWAL_CREDIT_PERCENT.find((entry) => subscription.monthsSincePayment <= entry.upToMonths)
  return step ? percentOf(subscription.pastAmount, step.percent) : 0
}

/** True when this payment is an upgrade: a plan is held and the company count changes. */
export const isUpgradePayment = (subscription, companies) =>
  Boolean(subscription) && companies !== subscription.pastQuantity

/**
 * Whether a company tier can be bought, given the plan already held
 * (payment/userPaymentData/ -> parseSubscription). Upgrades only:
 *
 *   no plan yet                every tier
 *   a package (silver, gold)   only tiers LARGER than the one held - the
 *                              package already bought cannot be bought again
 *   a custom package           the same tier or larger - on the same tier the
 *                              user can still add modules (owned ones cost 0)
 *
 * The same rule the old payment screen used. The backend checks again.
 */
export const isTierPurchasable = (tier, subscription) => {
  const held = subscription?.pastQuantity ?? 0
  if (!held) return true
  return subscription.packageType === PACKAGE_MODE.CUSTOM ? tier.count >= held : tier.count > held
}

/**
 * On a renewal the old screen only offered the package type already held.
 * Returns the mode to lock to, or null when both are open.
 */
export const lockedModeFor = (subscription) => {
  if (!subscription?.packageType) return null
  return subscription.packageType === PACKAGE_MODE.CUSTOM ? PACKAGE_MODE.CUSTOM : PACKAGE_MODE.PREMIUM
}

/* ------------------------------------------------------------------ */
/* The quote - what the summary shows                                 */
/* ------------------------------------------------------------------ */

/**
 * Whether a price is charged once or once per company - see "WHAT A PRICE IS
 * MULTIPLIED BY" at the top. An item's own `basis` always wins. Otherwise a
 * TIER's prices (its "All" total and its modules) are charged once: the tier
 * already names the company count. Only the MSME quantity plan charges per
 * company.
 */
const effectiveBasis = (item, structure) => {
  if (item.basis) return item.basis
  return structure === PLAN_STRUCTURE.TIERS ? BASIS.FLAT : BASIS.PER_COMPANY
}

/** True when this item's price is charged once per company - for the price labels. */
export const isPricedPerCompany = (item, structure) =>
  item.kind === 'flat' && effectiveBasis(item, structure) === BASIS.PER_COMPANY

const companiesText = (count) => `${count} ${count === 1 ? 'company' : 'companies'}`

/**
 * The live price of one selection.
 *
 *   input   { catalog, mode, tierKey, quantity, selectedKeys, optionChoices,
 *             subscription, offer }
 *   output  {
 *     companies,         the company count being bought
 *     lines,             [{ key, label, detail, amount, owned }]
 *     discount,          paise off (MSME multi-company), 0 if none
 *     subtotal,          after that discount - the "original amount"
 *     upgrade,           true when this is an upgrade (isUpgradePayment)
 *     upgradeDiscount,   paise off for an upgrade (renewalCredit), 0 if none
 *     offer,             the offer applied (see ./offer), or null. When there is
 *                        one, upgradeDiscount is 0 - the offer takes priority
 *     offerDiscount,     paise off for the offer
 *     payable,           subtotal - offerDiscount: what GST is charged on
 *     gst, total, gstPercent
 *     issues,            reasons the order cannot be placed yet
 *   }
 */
export const calculateQuote = ({
  catalog,
  mode,
  tierKey,
  quantity,
  selectedKeys = [],
  optionChoices = {},
  subscription = null,
  offer = null,
}) => {
  const plan = getPlan(catalog, tierKey)
  const structure = catalog?.structure
  const companies = structure === PLAN_STRUCTURE.TIERS ? plan?.count ?? 0 : Math.max(0, quantity || 0)
  const gstPercent = catalog?.gstPercent ?? DEFAULT_GST_PERCENT
  const lines = []
  const issues = []
  let discount = 0

  if (!plan) issues.push('Choose a package.')
  if (!companies) issues.push('Choose how many companies.')

  if (plan && companies && mode === PACKAGE_MODE.PREMIUM) {
    const bundle = plan.bundle
    if (!bundle) {
      issues.push('A Premium Package is not offered for this plan.')
    } else {
      const perCompany = effectiveBasis(bundle, structure) === BASIS.PER_COMPANY
      const units = perCompany ? companies : 1
      lines.push({
        key: bundle.key,
        label: 'All modules',
        detail: perCompany
          ? `${formatINR(bundle.amount)} × ${companiesText(companies)}`
          : `${companiesText(companies)} package`,
        amount: bundle.amount * units,
        owned: false,
      })

      if (structure === PLAN_STRUCTURE.QUANTITY && units > 1) {
        const percent = bundle.discountPercent ?? ADDITIONAL_COMPANY_DISCOUNT_PERCENT
        discount = percentOf(bundle.amount * (units - 1), percent)
      }

      // Add-ons priced by option (Procurement) can be taken with the Premium
      // Package too, charged on top of it at the option chosen.
      plan.modules
        .filter((module) => module.kind === 'options' && selectedKeys.includes(module.key))
        .forEach((module) => {
          const option = module.options.find((entry) => entry.key === optionChoices[module.key])
          if (!option) issues.push(`Choose a plan for ${module.name}.`)
          else lines.push({ key: module.key, label: module.name, detail: option.label, amount: option.amount, owned: false })
        })
    }
  }

  if (plan && companies && mode === PACKAGE_MODE.CUSTOM) {
    const chosen = plan.modules.filter((module) => selectedKeys.includes(module.key))
    if (!chosen.length) issues.push('Select at least one module.')

    chosen.forEach((module) => {
      const owned = subscription?.pastModuleKeys?.has(module.key) ?? false
      const pastQuantity = subscription?.pastQuantity ?? 0

      if (module.kind === 'options') {
        const option = module.options.find((entry) => entry.key === optionChoices[module.key])
        if (!option) {
          issues.push(`Choose a plan for ${module.name}.`)
          return
        }
        lines.push({ key: module.key, label: module.name, detail: option.label, amount: option.amount, owned: false })
        return
      }

      const perCompany = effectiveBasis(module, structure) === BASIS.PER_COMPANY
      // Already paid for: only the companies added on top are charged (per
      // company), or nothing at all on the same package (per package).
      const units = perCompany
        ? owned ? Math.max(0, companies - pastQuantity) : companies
        : owned && pastQuantity === companies ? 0 : 1

      lines.push({
        key: module.key,
        label: module.name,
        detail: perCompany ? `${formatINR(module.amount)} × ${companiesText(units)}` : 'per package',
        amount: module.amount * units,
        owned: owned && units < (perCompany ? companies : 1),
      })
    })
  }

  // One discount, never both: a valid offer takes priority; only without one
  // does an upgrade get the upgrade discount.
  const upgrade = isUpgradePayment(subscription, companies)
  return {
    companies,
    upgrade,
    ...finishQuote({
      lines,
      discount,
      upgradeDiscount: !offer && upgrade ? renewalCredit(subscription, catalog?.userType) : 0,
      offer,
      gstPercent,
      issues,
    }),
  }
}

/**
 * The part of every quote after the lines: discounts, GST and the total -
 * shared by the package quote above and the premium recharge quote
 * (./premiumFeatures), so both add up the same way.
 */
export const finishQuote = ({ lines, discount = 0, upgradeDiscount = 0, offer, gstPercent, issues }) => {
  const gross = lines.reduce((sum, line) => sum + line.amount, 0)
  const subtotal = Math.max(0, gross - discount)
  // Never more than the subtotal: an upgrade credit cannot make it negative.
  const upgradeOff = Math.min(subtotal, Math.max(0, upgradeDiscount))
  const afterUpgrade = subtotal - upgradeOff
  const offerDiscount = offer ? Math.min(afterUpgrade, percentOf(afterUpgrade, offer.percent)) : 0
  const payable = afterUpgrade - offerDiscount
  const gst = percentOf(payable, gstPercent)

  if (!issues.length && payable <= 0) issues.push('There is nothing to pay for in this selection.')

  return {
    lines,
    discount,
    subtotal,
    upgradeDiscount: upgradeOff,
    offer: offerDiscount > 0 ? offer : null,
    offerDiscount,
    payable,
    gst,
    total: payable + gst,
    gstPercent,
    issues,
  }
}

/* ------------------------------------------------------------------ */
/* The payment payload                                                */
/* ------------------------------------------------------------------ */

/** Procurement keeps the field name the backend has always read. */
const isProcurement = (module) => module.key.includes('procurement')

/** "100" -> 100; "unlimited" stays as the backend spelled it. */
const optionValue = (optionKey) => (isNumericKey(optionKey) ? Number(optionKey) : optionKey)

/** silver / gold / ... for a tier, 'platinum' for MSME premium, 'custom'. */
export const packageTypeFor = (catalog, mode, tierKey) => {
  if (mode === PACKAGE_MODE.CUSTOM) return PACKAGE_MODE.CUSTOM
  if (catalog.structure === PLAN_STRUCTURE.TIERS) return normalizeKey(getPlan(catalog, tierKey)?.name)
  return QUANTITY_PREMIUM_PACKAGE_TYPE
}

/**
 * The POST payment/paymentDetail/ body, built only from what is on screen:
 *
 *   {
 *     currency, amount, gstamount, user_type, product_type,
 *     remove_company,                  [2, 5, 8] - integer ids of the companies
 *                                      the user ticked for removal; [] when none
 *     data: {
 *       "<companies>": [{ id, module_name, checked, ReverseAuctionNumber? }],
 *       package_type, amount, gstamount, is_upgraded, user_type
 *     },
 *     pastmodule
 *   }
 *
 * Premium sends every module of the plan; Custom only the ticked ones.
 * A module priced by option carries the option chosen, in either.
 * `productType` is the caller's (PRODUCT_TYPE.MAIN in Services/paymentService).
 */
export const buildPaymentPayload = ({
  catalog,
  quote,
  mode,
  tierKey,
  selectedKeys = [],
  optionChoices = {},
  subscription = null,
  removeCompanies = [],
  productType,
}) => {
  const plan = getPlan(catalog, tierKey)
  // What is charged is the amount AFTER the offer; GST is already on that.
  const amount = toAmountString(quote.payable)
  const gstamount = toAmountString(quote.gst)
  const userType = catalog.userType

  const modules =
    mode === PACKAGE_MODE.PREMIUM
      ? plan.modules
      : plan.modules.filter((module) => selectedKeys.includes(module.key))

  const moduleRows = modules.map((module) => {
    const row = { id: module.id, module_name: module.name, checked: true }
    if (module.kind !== 'options') return row

    const choice = selectedKeys.includes(module.key) ? optionChoices[module.key] ?? null : null
    if (isProcurement(module)) row.ReverseAuctionNumber = choice ? optionValue(choice) : 0
    else row.selected_option = choice
    return row
  })

  return {
    currency: 'INR',
    amount,
    gstamount,
    user_type: userType,
    product_type: productType,
    // Whole numbers only - never "12" or "12,25".
    remove_company: removeCompanies.map(Number).filter(Number.isInteger),
    data: {
      [quote.companies]: moduleRows,
      package_type: packageTypeFor(catalog, mode, tierKey),
      amount,
      gstamount,
      is_upgraded: Boolean(subscription),
      user_type: userType,
    },
    pastmodule: subscription?.pastModules ?? [],
  }
}

