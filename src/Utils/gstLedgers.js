/**
 * GST LEDGERS - which of the company's ledgers a GST tax at a rate is posted
 * to. The one set of rules for every document that needs a CGST, SGST or
 * IGST ledger, so no two screens can pick differently:
 *
 *   resolveGstLedgers(entries, { ledgerMapping, ledgers })
 *     entries        [{ tax: 'CGST', rate: 2.5, ... }] - the GST the document
 *                    charges (gstByRate in the Sales Invoice module)
 *     ledgerMapping  invoice/document-mapping/'s `ledger_mapping`
 *                    ({ cgst: "...", cgst_2.5: "...", igst_18: "..." }), or null
 *     ledgers        the company's ledgers as [{ id, name }]
 *   -> each entry with { ledger, ledgerId, source, basic } added
 *
 * ------------------------------------------------------------------
 * THE ORDER, for each tax and rate on its own
 * ------------------------------------------------------------------
 * The GST MAPPING first (invoice/document-mapping/) - what the user set up:
 *   1. 'mapping'  the mapping for that tax and rate ("cgst_2.5"), when its
 *                 ledger is one of the company's ledgers
 *   2. 'mapping'  else the tax's mapping with no rate ("cgst" - "Any rate"),
 *                 when its ledger is one of the company's ledgers
 * Else the company's ledgers, by name:
 *   3. 'matched'  the ledger whose name says that tax and that rate -
 *                 "CGST @ 2.5%", "CGST 2.5", "C GST 2.5", "C_GST_2.5%"
 *                 (readGstLedgerName)
 *   4. 'matched'  else the tax's BASIC ledger - a name that says the tax and
 *                 no rate: "CGST", "Output CGST", "C_GST"
 * Else:
 *   5. null       none - nothing is assigned, ever: a document that charges
 *                 this tax cannot be saved until the company has a ledger
 *                 for it (missingGstLedgers).
 *
 * `basic` is true for 2 and 4. Where several ledgers fit one step, the first
 * by name (then by id) is taken, so the same ledgers always give the same
 * choice. A ledger is never taken for another tax (a CGST ledger is never an
 * SGST or IGST one), nor a rate-specific one for another rate (CGST 2.5% is
 * never CGST 6%). Nothing here names a ledger, an id or a rate of its own -
 * all of it comes from the company's data.
 */

const TAX_WORDS = ['cgst', 'sgst', 'igst']

/** Two rates are the same rate - 2.5 and "2.50". */
const sameRate = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9

/** A name compared without case or extra spaces - how a mapping names a ledger. */
const nameKey = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * A GST mapping key, read: "cgst", "sgst_6", "igst_18" - a tax, and the rate
 * it is for ('' when it names none - the tax's basic ledger); anything else
 * comes back as it came.
 */
export const readMappingKey = (key) => {
  const match = /^(cgst|sgst|igst)(?:_(.+))?$/i.exec(String(key).trim())
  return match ? { tax: match[1].toUpperCase(), rate: match[2] ?? '' } : { tax: String(key), rate: '' }
}

/**
 * The tax and rate a ledger's NAME says, or null when it is not a GST
 * ledger of one tax:
 *
 *   "CGST @ 2.5%"  "C GST 2.5"  "C_GST_2.5%"  "cgst-2.50"  -> { tax: 'CGST', rate: 2.5 }
 *   "Output IGST 18%"                                      -> { tax: 'IGST', rate: 18 }
 *   "CGST"  "Output CGST"  "C_GST"                         -> { tax: 'CGST', rate: null }   (basic)
 *   "GST"  "CGST SGST 5%"  "CGST 2.5% 2024"                -> null (no tax / two taxes / two numbers)
 *   "Input CGST 2.5%"                                      -> null (the purchase side's ledger)
 *
 * Case, spaces, underscores, hyphens, "@" and "%" do not matter.
 */
export const readGstLedgerName = (name) => {
  const text = String(name ?? '')
    .toLowerCase()
    // A dot is part of a number only between two digits ("2.5"), else a separator ("C.GST").
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    // Numbers stand on their own: "cgst2.5" is "cgst" and "2.5".
    .replace(/(\d+(?:\.\d+)?)/g, ' $1 ')
  const parts = text.split(/[^a-z0-9.]+/).filter(Boolean)

  // "c gst", "c_gst", "c-gst" are "cgst".
  const words = []
  for (let index = 0; index < parts.length; index += 1) {
    if (['c', 's', 'i'].includes(parts[index]) && parts[index + 1] === 'gst') {
      words.push(`${parts[index]}gst`)
      index += 1
    } else words.push(parts[index])
  }

  if (words.includes('input')) return null
  const taxes = [...new Set(words.filter((word) => TAX_WORDS.includes(word)))]
  const rates = [...new Set(words.filter((word) => /^\d+(\.\d+)?$/.test(word)).map(Number))]
  if (taxes.length !== 1 || rates.length > 1) return null
  return { tax: taxes[0].toUpperCase(), rate: rates.length === 1 ? rates[0] : null }
}

/** True when a ledger's name says this tax AND this rate - so the rate need not be repeated beside it. */
export const nameSaysGst = (name, tax, rate) => {
  const read = readGstLedgerName(name)
  return Boolean(read && read.tax === tax && read.rate !== null && sameRate(read.rate, rate))
}

/** True when a ledger's name says this tax and no rate - the tax's basic ledger. */
const nameIsBasicGst = (name, tax) => {
  const read = readGstLedgerName(name)
  return Boolean(read && read.tax === tax && read.rate === null)
}

const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || String(a.id).localeCompare(String(b.id))

/** The company's ledgers whose names say this tax and rate, first one first (by name, then id). */
export const matchGstLedgers = (ledgers, tax, rate) =>
  (ledgers ?? []).filter((ledger) => ledger?.name && nameSaysGst(ledger.name, tax, rate)).sort(byName)

/** The company's basic ledgers for this tax (the tax, no rate), first one first. */
export const matchBasicGstLedgers = (ledgers, tax) =>
  (ledgers ?? []).filter((ledger) => ledger?.name && nameIsBasicGst(ledger.name, tax)).sort(byName)

/**
 * Whether a ledger NAME allows it to carry this tax at this rate: a name that
 * says no tax ("Output Central Tax") is the user's to choose; a name that
 * says another tax ("CGST" for IGST), or another rate ("IGST 18%" for IGST
 * 12%, or for every rate), does not. What a mapping is checked against.
 */
export const ledgerFitsGst = (name, tax, rate) => {
  const read = readGstLedgerName(name)
  // Not a GST ledger of one tax: fine unless it still names one ("Input CGST", "CGST SGST").
  if (!read) return !/\b[csi]\s*[_.-]?\s*gst\b/i.test(String(name ?? ''))
  if (read.tax !== tax) return false
  if (read.rate === null) return true
  return rate !== null && sameRate(read.rate, rate)
}

/**
 * The mapping for this tax - for this rate, or (`anyRate`) its "Any rate" one -
 * as one of the company's ledgers; null when there is none, its ledger is
 * not one the company has (a deleted or renamed ledger is not posted to), or
 * its ledger's name says another tax or rate (ledgerFitsGst) - a mapping is
 * never allowed to post IGST to a CGST ledger.
 */
const mappedLedger = (ledgerMapping, ledgers, tax, rate, anyRate) => {
  const keys = Object.keys(ledgerMapping ?? {}).sort()
  for (const key of keys) {
    const mapped = readMappingKey(key)
    if (mapped.tax !== tax) continue
    if (anyRate ? mapped.rate : !mapped.rate || !sameRate(mapped.rate, rate)) continue
    const wanted = nameKey(ledgerMapping[key])
    const ledger = wanted ? (ledgers ?? []).find((candidate) => nameKey(candidate?.name) === wanted) : null
    if (ledger && ledgerFitsGst(ledger.name, tax, rate)) return ledger
  }
  return null
}

/** One tax and rate's ledger - see the order at the top. */
export const resolveGstLedger = ({ tax, rate, ledgerMapping, ledgers }) => {
  const found = (ledger, source, basic) => ({ ledger: ledger.name, ledgerId: ledger.id, source, basic })

  const mapped = mappedLedger(ledgerMapping, ledgers, tax, rate, false)
  if (mapped) return found(mapped, 'mapping', false)
  const mappedBasic = mappedLedger(ledgerMapping, ledgers, tax, rate, true)
  if (mappedBasic) return found(mappedBasic, 'mapping', true)

  const [matched] = matchGstLedgers(ledgers, tax, rate)
  if (matched) return found(matched, 'matched', false)
  const [basic] = matchBasicGstLedgers(ledgers, tax)
  if (basic) return found(basic, 'matched', true)

  return { ledger: null, ledgerId: null, source: null, basic: false }
}

/** Every entry with its ledger - `ledger` null when the company has none for that tax. */
export const resolveGstLedgers = (entries, { ledgerMapping, ledgers }) =>
  entries.map((entry) => ({ ...entry, ...resolveGstLedger({ tax: entry.tax, rate: entry.rate, ledgerMapping, ledgers }) }))

/**
 * THE GST CHARGES - what the saved `gst_charges` holds and what the invoice
 * prints, worked out here once so the two can never differ: one charge per
 * real ledger, its amount the sum of every tax and rate posted to it (CGST
 * 2.5% and CGST 9% both on the basic "CGST" -> one "CGST" charge), in the
 * order the taxes first appear. An entry with no ledger stays a charge of
 * its own with `ledger` null - shown as missing, and never saved.
 *
 *   gstChargesByLedger(resolveGstLedgers(...))
 *   -> [{ ledger: 'CGST', paise: 2509, entries: [...] }, { ledger: null, paise: 7200, entries: [IGST 12%] }]
 */
export const gstChargesByLedger = (resolved) => {
  const charges = []
  const byLedger = new Map()
  resolved.forEach((entry) => {
    const name = String(entry.ledger ?? '').trim()
    if (!name) {
      charges.push({ ledger: null, paise: entry.paise, entries: [entry] })
      return
    }
    let charge = byLedger.get(name)
    if (!charge) {
      charge = { ledger: name, paise: 0, entries: [] }
      byLedger.set(name, charge)
      charges.push(charge)
    }
    charge.paise += entry.paise
    charge.entries.push(entry)
  })
  return charges
}

/** The entries still without a ledger - only the taxes and rates the document actually charges. */
export const missingGstLedgers = (resolved) => resolved.filter((entry) => !entry.ledger)

/** A rate as text without float noise - 2.5, 9. */
const rateLabel = (rate) => String(Number(Number(rate).toFixed(4)))

/** "CGST 2.5%, SGST 2.5%" */
export const gstListText = (entries) => entries.map((entry) => `${entry.tax} ${rateLabel(entry.rate)}%`).join(', ')

/**
 * The missing entries grouped by tax - what has to be created:
 *   [{ tax: 'SGST', rates: [2.5, 9], suggestedName: 'SGST' }]
 * One rate missing -> a ledger for that rate is suggested ("SGST @ 2.5%");
 * several -> the tax's basic ledger ("SGST"), which serves them all.
 */
export const missingGstTypes = (missing) => {
  const byTax = new Map()
  missing.forEach((entry) => byTax.set(entry.tax, [...(byTax.get(entry.tax) ?? []), entry.rate]))
  return [...byTax.entries()].map(([tax, rates]) => ({
    tax,
    rates,
    suggestedName: rates.length === 1 ? `${tax} @ ${rateLabel(rates[0])}%` : tax,
  }))
}
