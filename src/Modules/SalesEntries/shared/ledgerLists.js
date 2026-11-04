/**
 * READING THE LEDGER VALUES THE SALES ENTRY APIs RETURN - shared by the three
 * views, which differ in which of these they hold:
 *
 *   ledger list   [{ "<ledger>": amount }, { "0": "0.0" }, ...]
 *                 Multi Ledger and Single Ledger: cgst/sgst/igst/ugst_ledger,
 *                 others_Ledger. Usually an array; it can also arrive as the
 *                 text of one - JSON, or Python's repr with single quotes, as
 *                 the inventory invoice's own `"[{'IGST=18': '6849.8'}]"`.
 *   tax JSON      '{"IGST 18%": 6849.8}' - a product's CGST/SGST/IGST/UGST
 *                 (With Inventory): JSON text, or null / "".
 *
 * `{ "0": "0.0" }` (and "0.0", "np.int64(0)") is an empty GST slab: left out of
 * what is SHOWN, but every list goes to Tally as it came - the backend skips
 * them itself. Renaming (keyword mapping) keeps them too.
 */

/** The keys of an empty GST slab - the same set the backend skips. */
const EMPTY_SLAB_KEYS = new Set(['0', '0.0', 'np.int64(0)'])

export const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

export const toNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/** "1 entry", "3 entries". */
export const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

export const isEmptySlab =(name) => !text(name) || EMPTY_SLAB_KEYS.has(text(name))

const parseText = (value) => {
  try {
    return JSON.parse(value)
  } catch {
    // Python's repr: single quotes. Only tried when the text has no double quote of its own.
    if (value.includes('"')) return null
    try {
      return JSON.parse(value.replace(/'/g, '"'))
    } catch {
      return null
    }
  }
}

/** A ledger list as an array of objects - [] for anything that is not one. */
export const readLedgerList = (value) => {
  const list = typeof value === 'string' ? (value.trim() ? parseText(value.trim()) : null) : value
  return Array.isArray(list) ? list.filter((item) => item && typeof item === 'object') : []
}

/** [{ name, amount }] of a ledger list: no empty slabs, no zero amounts. */
export const readLines = (value) =>
  readLedgerList(value).flatMap((item) =>
    Object.entries(item)
      .filter(([name]) => !isEmptySlab(name))
      .map(([name, amount]) => ({ name: text(name), amount: toNumber(amount) }))
      .filter((line) => line.amount !== 0),
  )

/** A product's tax JSON as an object - {} when there is none, or it cannot be read. */
export const readTaxJson = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  const parsed = parseText(value.trim())
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

/** [{ name, amount }] of a product's tax JSON, zero amounts left out. */
export const readTaxLines = (value) =>
  Object.entries(readTaxJson(value))
    .map(([name, amount]) => ({ name: text(name), amount: toNumber(amount) }))
    .filter((line) => line.name && line.amount !== 0)

/**
 * The same ledger list with each ledger renamed by `rename(name)` - an array
 * again, empty slabs and all. A value that is not a list is returned as it came.
 */
export const renameLedgerList = (value, rename) => {
  const list = readLedgerList(value)
  if (list.length === 0) return value
  return list.map((item) =>
    Object.fromEntries(Object.entries(item).map(([name, amount]) => [isEmptySlab(name) ? name : rename(name), amount])),
  )
}

/** A product's tax JSON with each ledger renamed - JSON text again; "" / null stay as they were. */
export const renameTaxJson = (value, rename) => {
  const taxes = readTaxJson(value)
  const names = Object.keys(taxes)
  if (names.length === 0) return value
  return JSON.stringify(Object.fromEntries(names.map((name) => [rename(name), taxes[name]])))
}

/** Lines of the same ledger added together, in the order first seen. */
export const sumByName = (lines) => {
  const totals = new Map()
  lines.forEach((line) => totals.set(line.name, (totals.get(line.name) ?? 0) + line.amount))
  return [...totals].map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }))
}
