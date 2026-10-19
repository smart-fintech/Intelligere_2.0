/**
 * GST LEDGERS - which of the company's ledgers a GST tax at a rate is posted
 * to. The one set of rules for every document that needs a CGST, SGST or
 * IGST ledger, so no two screens can pick differently:
 *
 *   resolveGstLedgers(entries, { ledgerMapping, ledgers })
 *     entries        [{ tax: 'CGST', rate: 2.5, ... }] - the GST the document
 *                    charges (gstByRate in the Sales Invoice module)
 *     ledgerMapping  invoice/document-mapping/'s `ledger_mapping`
 *                    ({ cgst_2.5: "...", igst_18: "..." }), or null
 *     ledgers        the company's ledgers as [{ id, name }]
 *   -> each entry with { ledger, ledgerId, source } added
 *
 * ------------------------------------------------------------------
 * THE ORDER, for each tax and rate on its own
 * ------------------------------------------------------------------
 *   1. 'mapping'  the configured mapping for THAT tax and rate ("cgst_2.5"),
 *                 when its ledger is one of the company's ledgers
 *   2. 'matched'  else the company's own ledger whose name says that tax and
 *                 that rate - "CGST @ 2.5%", "C GST 2.5", "C_GST_2.5%",
 *                 "Output CGST 2.50" (readGstLedgerName); several such
 *                 ledgers -> the first by name, then by id, so the same
 *                 ledgers always give the same choice
 *   3. null       none - nothing is assigned. There is no default ledger:
 *                 a document that needs this tax cannot be saved until a
 *                 ledger exists or is mapped (missingGstLedgers).
 *
 * A ledger is never taken for another tax (a CGST ledger is not an SGST or
 * IGST one) or another rate (CGST 2.5% is not CGST 6%). A mapping without a
 * rate ("cgst" - "Any rate") names no rate, so it is not used: that was the
 * one ledger every rate fell back to. Nothing here names a ledger, an id or
 * a rate of its own - all of it comes from the company's data.
 */

const TAX_WORDS = ['cgst', 'sgst', 'igst']

/** Two rates are the same rate - 2.5 and "2.50". */
const sameRate = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9

/** A name compared without case or extra spaces - how a mapping names a ledger. */
const nameKey = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * A GST mapping key, read: "cgst", "sgst_6", "igst_18" - a tax, and the rate
 * it is for ('' when it names none); anything else comes back as it came.
 */
export const readMappingKey = (key) => {
  const match = /^(cgst|sgst|igst)(?:_(.+))?$/i.exec(String(key).trim())
  return match ? { tax: match[1].toUpperCase(), rate: match[2] ?? '' } : { tax: String(key), rate: '' }
}

/**
 * The tax and rate a ledger's NAME says, or null when it does not say
 * exactly one of each:
 *
 *   "CGST @ 2.5%"  "C GST 2.5"  "C_GST_2.5%"  "cgst-2.50"  -> { tax: 'CGST', rate: 2.5 }
 *   "Output IGST 18%"                                      -> { tax: 'IGST', rate: 18 }
 *   "CGST"  "CGST SGST 5%"  "CGST 2.5% 2024"               -> null (no rate / two taxes / two numbers)
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
  if (taxes.length !== 1 || rates.length !== 1) return null
  return { tax: taxes[0].toUpperCase(), rate: rates[0] }
}

/** True when a ledger's name already says this tax and rate - so it need not be repeated beside it. */
export const nameSaysGst = (name, tax, rate) => {
  const read = readGstLedgerName(name)
  return Boolean(read && read.tax === tax && sameRate(read.rate, rate))
}

/** The company's ledgers whose names say this tax and rate, first one first (by name, then id). */
export const matchGstLedgers = (ledgers, tax, rate) =>
  (ledgers ?? [])
    .filter((ledger) => ledger?.name && nameSaysGst(ledger.name, tax, rate))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || String(a.id).localeCompare(String(b.id)))

/**
 * The configured mapping for this tax and rate, as one of the company's
 * ledgers - null when there is none, it names no rate, or its ledger is not
 * one the company has (a deleted or renamed ledger is not posted to).
 */
const mappedLedger = (ledgerMapping, ledgers, tax, rate) => {
  const keys = Object.keys(ledgerMapping ?? {}).sort()
  for (const key of keys) {
    const mapped = readMappingKey(key)
    if (mapped.tax !== tax || !mapped.rate || !sameRate(mapped.rate, rate)) continue
    const wanted = nameKey(ledgerMapping[key])
    const ledger = wanted ? (ledgers ?? []).find((candidate) => nameKey(candidate?.name) === wanted) : null
    if (ledger) return ledger
  }
  return null
}

/** One tax and rate's ledger - see the order at the top. */
export const resolveGstLedger = ({ tax, rate, ledgerMapping, ledgers }) => {
  const mapped = mappedLedger(ledgerMapping, ledgers, tax, rate)
  if (mapped) return { ledger: mapped.name, ledgerId: mapped.id, source: 'mapping' }
  const [matched] = matchGstLedgers(ledgers, tax, rate)
  if (matched) return { ledger: matched.name, ledgerId: matched.id, source: 'matched' }
  return { ledger: null, ledgerId: null, source: null }
}

/** Every entry with its ledger - `ledger` null when none is mapped or found. */
export const resolveGstLedgers = (entries, { ledgerMapping, ledgers }) =>
  entries.map((entry) => ({ ...entry, ...resolveGstLedger({ tax: entry.tax, rate: entry.rate, ledgerMapping, ledgers }) }))

/** The entries still without a ledger - only the taxes and rates the document actually charges. */
export const missingGstLedgers = (resolved) => resolved.filter((entry) => !entry.ledger)

/** "CGST 2.5%, SGST 2.5%" */
export const gstListText = (entries) =>
  entries.map((entry) => `${entry.tax} ${String(Number(Number(entry.rate).toFixed(4)))}%`).join(', ')
