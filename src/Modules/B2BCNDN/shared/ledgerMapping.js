/**
 * THE LEDGER MAPPINGS of B2B and CNDN - what each saved key means, and the
 * ledger it gives an entry. Plain functions: no React, no requests. Saved
 * through keyword_b2b/ (Services/Accounting/keywordMappingService), one flat
 * { key: ledger } per source.
 *
 * B2B (b2b_mapping_data) holds three kinds of key side by side:
 *
 *   purchase_interstate_<rate>   the purchase ledger of an interstate purchase at that GST slab
 *   purchase_local_<rate>        ... of a local purchase
 *   purchase_interstate,         ... at any slab (the old "All")
 *   purchase_local
 *   purchase_<rate>, purchase    OLDER keys, saved before local / interstate were told
 *                                apart: still read, after the new ones, so nothing saved
 *                                stops working - and never written again
 *   igst_<rate>, cgst_<half>,    the old GST ledger keys (cgst / sgst at half the rate),
 *   sgst_<half>, igst/cgst/sgst  kept as the old screen used them
 *   anything else                a PARTY: "Sharma Traders" -> "abc" - an entry whose
 *                                ledgername IS the key (any case) goes to that ledger
 *
 * CNDN (cndn_mapping_data):
 *
 *   credit_note_<rate>, credit_note   the ledger a credit note posts against
 *   debit_note_<rate>,  debit_note    ... a debit note
 *
 * An entry is INTERSTATE when it carries IGST and LOCAL when it carries CGST /
 * SGST - IGST first, so an entry is never both. One with no GST at all (0%)
 * falls back to its supplier's state against the place of supply; if those
 * are not known either, only the any-type keys apply.
 */

import { renamerOf } from '@/Modules/SalesEntries/shared/keywordMapping'
import { text, toNumber } from '@/Modules/SalesEntries/shared/ledgerLists'

export const PURCHASE_TYPE = Object.freeze({
  INTERSTATE: 'interstate',
  LOCAL: 'local',
  BOTH: 'both',
})

export const PURCHASE_TYPE_OPTIONS = Object.freeze([
  { value: PURCHASE_TYPE.INTERSTATE, label: 'Interstate Purchase (IGST)' },
  { value: PURCHASE_TYPE.LOCAL, label: 'Local Purchase (CGST + SGST)' },
  { value: PURCHASE_TYPE.BOTH, label: 'Both' },
])

export const NOTE_KIND = Object.freeze({
  CREDIT: 'credit',
  DEBIT: 'debit',
  BOTH: 'both',
})

export const NOTE_KIND_OPTIONS = Object.freeze([
  { value: NOTE_KIND.CREDIT, label: 'Credit Note Ledger' },
  { value: NOTE_KIND.DEBIT, label: 'Debit Note Ledger' },
  { value: NOTE_KIND.BOTH, label: 'Both' },
])

export const GST_TAX = Object.freeze({
  IGST: 'igst',
  CGST: 'cgst',
  SGST: 'sgst',
})

export const GST_TAX_OPTIONS = Object.freeze([
  { value: GST_TAX.IGST, label: 'IGST' },
  { value: GST_TAX.CGST, label: 'CGST' },
  { value: GST_TAX.SGST, label: 'SGST' },
])

/** The slab choice that means "every slab". */
export const ALL_SLABS = 'all'

/** 18 -> "18", 2.5 -> "2.5", "18.00" -> "18"; "" when there is no rate. */
export const rateKey = (value) => {
  if (value === null || value === undefined || text(value) === '') return ''
  const number = Number(value)
  return Number.isFinite(number) ? String(number) : text(value)
}

/** The slab list for a select: "All slabs" first, then each rate. */
export const slabOptions = (slabs, { half = false } = {}) => [
  { value: ALL_SLABS, label: 'All slabs' },
  ...slabs.map((rate) => {
    const shown = rateKey(half ? rate / 2 : rate)
    return { value: shown, label: `${shown}%` }
  }),
]

const RATE = String.raw`(?:_\d+(?:\.\d+)?)?`
const B2B_RULE_KEY = new RegExp(String.raw`^(?:purchase(?:_(?:interstate|local))?|igst|cgst|sgst)${RATE}$`)
const CNDN_RULE_KEY = new RegExp(String.raw`^(?:credit|debit)_note${RATE}$`)

/* ------------------------------------------------------------------ */
/* Reading what is saved                                              */
/* ------------------------------------------------------------------ */

/**
 * The saved mapping as one flat { key: ledger }. The old screen's mapping came
 * nested under the company's name ({ "<company>": { purchase_5: ... } }); one
 * still saved that way is read as the company's own, so it keeps working.
 */
export const flattenMapping = (mapping, companyName) => {
  const flat = {}
  Object.entries(mapping ?? {}).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!companyName || text(key).toLowerCase() === text(companyName).toLowerCase()) {
        Object.entries(value).forEach(([inner, ledger]) => {
          if (text(inner) && text(ledger)) flat[text(inner)] = text(ledger)
        })
      }
      return
    }
    if (text(key) && text(value)) flat[text(key)] = text(value)
  })
  return flat
}

/** Only the party keys of a B2B mapping - everything that is not a ledger rule. */
export const partyMappingOf = (flat) => Object.fromEntries(Object.entries(flat).filter(([key]) => !B2B_RULE_KEY.test(key)))

export const isB2BRuleKey = (key) => B2B_RULE_KEY.test(key)
export const isCndnRuleKey = (key) => CNDN_RULE_KEY.test(key)

/** The first of `keys` that holds a ledger -> { ledger, key }, else no ledger. */
const firstOf = (flat, keys) => {
  const key = keys.find((candidate) => text(flat[candidate]))
  return key ? { ledger: text(flat[key]), key } : { ledger: '', key: null }
}

/* ------------------------------------------------------------------ */
/* B2B                                                                 */
/* ------------------------------------------------------------------ */

const sameState = (a, b) =>
  text(a)
    .toLowerCase()
    .replace(/[^a-z]/g, '') ===
  text(b)
    .toLowerCase()
    .replace(/[^a-z]/g, '')

/** INTERSTATE | LOCAL by the entry's GST amounts, else by its states, else null. */
export const purchaseTypeOf = ({ igst, cgst, sgst, state, placeOfSupply }) => {
  if (toNumber(igst) > 0) return PURCHASE_TYPE.INTERSTATE
  if (toNumber(cgst) > 0 || toNumber(sgst) > 0) return PURCHASE_TYPE.LOCAL
  if (text(state) && text(placeOfSupply)) return sameState(state, placeOfSupply) ? PURCHASE_TYPE.LOCAL : PURCHASE_TYPE.INTERSTATE
  return null
}

/** The purchase ledger the mapping gives -> { ledger, key } (key null when none does). */
export const mappedPurchaseLedger = (flat, type, rate) => {
  const slab = rateKey(rate)
  const keys = []
  if (type) {
    if (slab) keys.push(`purchase_${type}_${slab}`)
    keys.push(`purchase_${type}`)
  }
  if (slab) keys.push(`purchase_${slab}`)
  keys.push('purchase')
  return firstOf(flat, keys)
}

/**
 * One GST ledger's name as the old screen chose it: none when the amount is 0;
 * else igst_<rate> / cgst_<rate / 2> / sgst_<rate / 2>, then igst / cgst / sgst,
 * then the name the backend found.
 */
export const mappedTaxLedger = (flat, tax, { amount, rate, own }) => {
  if (!toNumber(amount)) return ''
  const number = Number(rate)
  const slab = Number.isFinite(number) ? rateKey(tax === GST_TAX.IGST ? number : number / 2) : ''
  const found = firstOf(flat, [slab ? `${tax}_${slab}` : null, tax].filter(Boolean))
  return found.ledger || text(own)
}

/** name -> its party ledger when a party key IS the name (trimmed, any case), else the name. */
export const partyRenamerOf = (flat) => renamerOf(partyMappingOf(flat))

/* ------------------------------------------------------------------ */
/* CNDN                                                                */
/* ------------------------------------------------------------------ */

/** As the backend's voucher: "Debit note" (any case) is a debit note, anything else a credit note. */
export const noteKindOf = (noteType) => (text(noteType).toLowerCase() === 'debit note' ? NOTE_KIND.DEBIT : NOTE_KIND.CREDIT)

export const mappedNoteLedger = (flat, kind, rate) => {
  const slab = rateKey(rate)
  return firstOf(flat, [slab ? `${kind}_note_${slab}` : null, `${kind}_note`].filter(Boolean))
}

/* ------------------------------------------------------------------ */
/* Writing - the keys one choice in the mapping dialog saves          */
/* ------------------------------------------------------------------ */

const PURCHASE_TYPES = [PURCHASE_TYPE.INTERSTATE, PURCHASE_TYPE.LOCAL]
const NOTE_KINDS = [NOTE_KIND.CREDIT, NOTE_KIND.DEBIT]

/** Purchase ledger: a type (or both) at a slab (or all) -> { purchase_local_5: ledger, ... }. */
export const purchaseMappingFor = (type, slab, ledger) =>
  Object.fromEntries(
    (type === PURCHASE_TYPE.BOTH ? PURCHASE_TYPES : [type]).map((one) => [slab === ALL_SLABS ? `purchase_${one}` : `purchase_${one}_${slab}`, ledger]),
  )

/** GST ledger: igst / cgst / sgst at a slab (cgst / sgst at the half rate) or all. */
export const taxMappingFor = (tax, slab, ledger) => ({
  [slab === ALL_SLABS ? tax : `${tax}_${slab}`]: ledger,
})

export const noteMappingFor = (kind, slab, ledger) =>
  Object.fromEntries((kind === NOTE_KIND.BOTH ? NOTE_KINDS : [kind]).map((one) => [slab === ALL_SLABS ? `${one}_note` : `${one}_note_${slab}`, ledger]))

/* ------------------------------------------------------------------ */
/* Showing a saved key                                                */
/* ------------------------------------------------------------------ */

const slabText = (slab) => (slab ? `${slab}%` : 'All slabs')

/**
 * A saved key in words -> { kind, label, legacy }:
 *   purchase_local_5   { kind: 'purchase', label: 'Local · 5%' }
 *   purchase_12        { kind: 'purchase', label: 'Any type · 12%', legacy: true }
 *   cgst_9             { kind: 'tax', label: 'CGST · 9%' }
 *   debit_note         { kind: 'note', label: 'Debit Note · All slabs' }
 *   Sharma Traders     { kind: 'party', label: 'Sharma Traders' }
 */
export const describeKey = (key) => {
  let match = /^purchase(?:_(interstate|local))?(?:_(\d+(?:\.\d+)?))?$/.exec(key)
  if (match) {
    const [, type, slab] = match
    const typeText = type === PURCHASE_TYPE.INTERSTATE ? 'Interstate' : type === PURCHASE_TYPE.LOCAL ? 'Local' : 'Any type'
    return {
      kind: 'purchase',
      label: `${typeText} · ${slabText(slab)}`,
      legacy: !type,
    }
  }
  match = /^(igst|cgst|sgst)(?:_(\d+(?:\.\d+)?))?$/.exec(key)
  if (match)
    return {
      kind: 'tax',
      label: `${match[1].toUpperCase()} · ${slabText(match[2])}`,
      legacy: false,
    }
  match = /^(credit|debit)_note(?:_(\d+(?:\.\d+)?))?$/.exec(key)
  if (match)
    return {
      kind: 'note',
      label: `${match[1] === 'credit' ? 'Credit' : 'Debit'} Note · ${slabText(match[2])}`,
      legacy: false,
    }
  return { kind: 'party', label: key, legacy: false }
}
