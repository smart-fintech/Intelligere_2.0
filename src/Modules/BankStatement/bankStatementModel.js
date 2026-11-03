/**
 * THE BANK STATEMENT RULES - plain functions, no React, no requests.
 *
 * An entry is one row of the statement as the backend sends it:
 *
 *   { sr_no, date: "2026-04-02", transaction, ledger, ref_no, credit, debit,
 *     Vouchetype, Orignal_Vouchetype, AccountantNarration, prevoius_created_on,
 *     is_verified }
 *
 * The misspelt keys (ledger, Vouchetype, Orignal_Vouchetype, prevoius_...) are
 * the backend's and the Tally connector's; they are kept as they come.
 *
 * Money the bank paid out is a debit, money it received a credit. So a
 * debit's ledger is debited and the bank credited (Payment), and a credit is
 * the other way round (Receipt). A cash ledger, or another bank's ledger, makes
 * either one a Contra.
 */

export const FILE_TYPE = Object.freeze({ CSV: 'csv', PDF: 'pdf', AI_PDF: 'ai-pdf' })

export const FILE_TYPE_OPTIONS = [
  { value: FILE_TYPE.CSV, label: 'CSV' },
  { value: FILE_TYPE.PDF, label: 'PDF' },
  { value: FILE_TYPE.AI_PDF, label: 'AI PDF (Beta)' },
]

export const VOUCHER = Object.freeze({ PAYMENT: 'Payment', RECEIPT: 'Receipt', CONTRA: 'Contra' })

export const VOUCHER_TYPES = [VOUCHER.PAYMENT, VOUCHER.RECEIPT, VOUCHER.CONTRA]

/** What the part of an Agst Ref payment that no invoice took can be booked as. */
export const REMAINDER_TYPES = [
  { value: 'New Ref', label: 'New Ref' },
  { value: 'On Account', label: 'On Account' },
  { value: 'Advance', label: 'Advance' },
]

/** The marker of that part in a ref - the Tally connector's own name for it. */
const REMAINDER = 'RemainAmount'

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())
const number = (value) => Number.parseFloat(value) || 0
const round2 = (value) => Math.round(value * 100) / 100

/* ------------------------------------------------------------------ */
/* The CSV preview                                                    */
/* ------------------------------------------------------------------ */

/** The columns a statement CSV must have - the backend reads these by name. */
export const CSV_COLUMNS = ['Date', 'Narration', 'Credit', 'Debit']

/** One CSV line into its cells; a quoted cell may hold commas and "" quotes. */
const splitLine = (line) => {
  const cells = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      cells.push(cell)
      cell = ''
    } else cell += char
  }
  cells.push(cell)
  return cells.map((value) => value.trim())
}

/**
 * The file as `{ fields, rows }`, for showing - the backend does the real
 * reading. Blank lines are skipped; a row is an object by header.
 */
export const parseCsv = (source) => {
  const raw = String(source ?? '')
  // A file saved from Excel starts with a byte-order mark.
  const lines = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw)
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== '')
  if (lines.length === 0) return { fields: [], rows: [] }

  const fields = splitLine(lines[0])
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line)
    return Object.fromEntries(fields.map((field, index) => [field, cells[index] ?? '']))
  })
  return { fields, rows }
}

/** The required columns the file does not have, by name (case ignored). */
export const missingCsvColumns = (fields) => {
  const have = new Set(fields.map((field) => field.toLowerCase()))
  return CSV_COLUMNS.filter((column) => !have.has(column.toLowerCase()))
}

/* ------------------------------------------------------------------ */
/* One entry                                                          */
/* ------------------------------------------------------------------ */

export const isDebit = (entry) => number(entry?.debit) > 0

/** The entry's one amount - its debit, else its credit. */
export const amountOf = (entry) => Math.abs(isDebit(entry) ? number(entry.debit) : number(entry.credit))

export const ledgerOf = (entry) => text(entry?.ledger)

export const isUnmapped = (entry) => ledgerOf(entry) === ''

/** "cash" as a word - "Cash", "Petty Cash" - and not "Cashew Traders". */
export const isCashLedger = (name) => /\bcash\b/i.test(text(name))

/**
 * The voucher type an entry gets with `ledgerName`: Contra against cash or
 * another bank, else Payment for a debit and Receipt for a credit.
 * `bankLedgers` is a Set of the company's bank ledger names, lower-cased.
 */
export const voucherTypeFor = (entry, ledgerName, bankLedgers) => {
  const name = text(ledgerName).toLowerCase()
  if (name && (isCashLedger(name) || bankLedgers?.has(name))) return VOUCHER.CONTRA
  if (isDebit(entry)) return VOUCHER.PAYMENT
  if (number(entry?.credit) > 0) return VOUCHER.RECEIPT
  return entry?.Vouchetype || VOUCHER.RECEIPT
}

/** The entry with a ledger, and the voucher type that ledger gives it. */
export const withLedger = (entry, ledgerName, bankLedgers) => ({
  ...entry,
  ledger: text(ledgerName),
  Vouchetype: voucherTypeFor(entry, ledgerName, bankLedgers),
})

/** The entry with a new amount on its own side; an empty or bad value changes nothing. */
export const withAmount = (entry, value) => {
  const amount = Math.abs(number(value))
  if (!amount) return entry
  return isDebit(entry) ? { ...entry, debit: amount } : { ...entry, credit: amount }
}

/** The ledger an entry goes with: its own, else the one chosen for the rest. */
export const effectiveLedger = (entry, remainingLedger) => ledgerOf(entry) || text(remainingLedger)

/* ------------------------------------------------------------------ */
/* Keyword mappings                                                   */
/* ------------------------------------------------------------------ */

/**
 * The longest keyword found in a narration, case ignored - so "LIC OF INDIA"
 * wins over "LIC OF IND" when both are in it.
 */
export const bestKeyword = (narration, keywords) => {
  const haystack = text(narration).toLowerCase()
  if (!haystack) return null
  return keywords.reduce((best, keyword) => {
    const needle = String(keyword).toLowerCase()
    if (!needle || !haystack.includes(needle)) return best
    return !best || needle.length > best.length ? keyword : best
  }, null)
}

/**
 * Every entry whose narration holds a keyword gets that keyword's ledger. A
 * ledger the user picked by hand (`manual`) is left alone.
 */
export const applyMappings = (entries, mappings, bankLedgers) => {
  const keywords = Object.keys(mappings ?? {})
  if (keywords.length === 0) return entries
  return entries.map((entry) => {
    if (entry.manual) return entry
    const keyword = bestKeyword(entry.transaction, keywords)
    if (!keyword) return entry
    return { ...withLedger(entry, mappings[keyword], bankLedgers), matchedKeyword: keyword }
  })
}

/* ------------------------------------------------------------------ */
/* Filters                                                            */
/* ------------------------------------------------------------------ */

/**
 * The entries on screen: the voucher types ticked (none ticked shows all),
 * only the unmapped ones when asked, and - with Agst Ref on - the ones that
 * have open invoices first.
 */
export const visibleEntries = (entries, { types, unmappedOnly, agstFirst, hasInvoices }) => {
  const anyType = VOUCHER_TYPES.some((type) => types[type])
  const shown = entries.filter(
    (entry) => (!anyType || types[entry.Vouchetype]) && (!unmappedOnly || isUnmapped(entry)),
  )
  if (!agstFirst) return shown
  return [...shown.filter(hasInvoices), ...shown.filter((entry) => !hasInvoices(entry))]
}

/* ------------------------------------------------------------------ */
/* Agst Ref                                                           */
/* ------------------------------------------------------------------ */

/** Which side's invoices an entry is settled against - none for a Contra. */
export const outstandingSideOf = (entry) => {
  if (entry.Vouchetype === VOUCHER.PAYMENT) return 'payable'
  if (entry.Vouchetype === VOUCHER.RECEIPT) return 'receivable'
  return null
}

/** The ledger's open invoices on the entry's side. */
export const invoicesOf = (entry, outstanding) => {
  const side = outstandingSideOf(entry)
  const ledger = ledgerOf(entry)
  if (!side || !ledger) return []
  const list = outstanding?.[side]?.[ledger]
  return Array.isArray(list) ? list : []
}

/**
 * How much of each invoice the OTHER entries' refs already took, by
 * `${ledger}|${invoice_no}` - an invoice settled once is not offered in full
 * again.
 */
export const takenByOthers = (refs, entries, exceptSrNo) => {
  const ledgerOfSr = new Map(entries.map((entry) => [entry.sr_no, ledgerOf(entry)]))
  const taken = new Map()
  Object.entries(refs).forEach(([srNo, ref]) => {
    if (String(srNo) === String(exceptSrNo)) return
    const ledger = ref?.ledger ?? ledgerOfSr.get(Number(srNo))
    Object.values(ref?.lines ?? {}).forEach((line) => {
      if (line.invoice_no === REMAINDER) return
      const key = `${ledger}|${line.invoice_no}`
      taken.set(key, (taken.get(key) ?? 0) + number(line.invoice_amount))
    })
  })
  return taken
}

/** The invoices still open for an entry, each with what is left of it as `amount`. */
export const availableInvoices = (entry, outstanding, refs, entries) => {
  const taken = takenByOthers(refs, entries, entry.sr_no)
  const ledger = ledgerOf(entry)
  return invoicesOf(entry, outstanding)
    .map((invoice) => ({ ...invoice, amount: round2(number(invoice.amount) - (taken.get(`${ledger}|${invoice.invoice_no}`) ?? 0)) }))
    .filter((invoice) => invoice.amount > 0)
}

/**
 * The entry's amount spread over the chosen invoices, in the order they are
 * listed - each takes what is left of it until the amount runs out. What is
 * left over after the last one is the remainder, booked as `remainderType`.
 *
 *   { ledger, lines: { 1: { invoice_no, invoice_amount, Bill_type: "Agst Ref" }, ...,
 *                      n: { invoice_no: "RemainAmount", invoice_amount, Bill_type } } }
 */
export const allocateRef = (entry, invoices, chosen, remainderType = '') => {
  let left = amountOf(entry)
  const lines = {}
  let index = 0
  invoices
    .filter((invoice) => chosen.includes(invoice.invoice_no))
    .forEach((invoice) => {
      if (left <= 0) return
      const take = round2(Math.min(left, number(invoice.amount)))
      left = round2(left - take)
      index += 1
      lines[index] = { invoice_no: invoice.invoice_no, invoice_amount: take, Bill_type: 'Agst Ref' }
    })
  if (index > 0 && left > 0) {
    index += 1
    lines[index] = { invoice_no: REMAINDER, invoice_amount: left, Bill_type: remainderType }
  }
  return { ledger: ledgerOf(entry), lines }
}

/** The ref's remainder line, or null. */
export const remainderOf = (ref) => Object.values(ref?.lines ?? {}).find((line) => line.invoice_no === REMAINDER) ?? null

/** True while a ref has a remainder with no booking type chosen - it cannot be sent so. */
export const needsRemainderType = (ref) => {
  const line = remainderOf(ref)
  return Boolean(line) && !text(line.Bill_type)
}

/** The ref with its remainder booked as `type`. */
export const withRemainderType = (ref, type) => ({
  ...ref,
  lines: Object.fromEntries(
    Object.entries(ref.lines).map(([key, line]) => [key, line.invoice_no === REMAINDER ? { ...line, Bill_type: type } : line]),
  ),
})

/* ------------------------------------------------------------------ */
/* What goes up                                                       */
/* ------------------------------------------------------------------ */

/**
 * One row of the Tally message (`bank_statement_data`), field for field as the
 * Tally connector reads it - the amount in Credit and its negative in Debit,
 * whichever side it is on:
 *
 *   { id, company, Date, Transaction, ledger, Ref_no, AccountantNarration,
 *     Credit, Debit, Vouchetype, is_verified, prevoius_created_on: "null",
 *     prevoius_zero_cr_dr, created_on, slug, created_by, bank, module }
 *
 * An Agst Ref entry also carries its bill lines as `ref`; any other entry has none.
 */
export const toTallyRow = (entry, { companyName, bankLedger, email, remainingLedger, ref }) => {
  const amount = String(amountOf(entry))
  const lines = ref?.lines ?? entry.ref
  return {
    id: entry.sr_no,
    company: companyName,
    Date: entry.date,
    Transaction: entry.transaction,
    ledger: effectiveLedger(entry, remainingLedger),
    Ref_no: '',
    AccountantNarration: entry.AccountantNarration ?? '',
    Credit: amount,
    Debit: `-${amount}`,
    Vouchetype: entry.Vouchetype,
    ...(lines && Object.keys(lines).length ? { ref: lines } : {}),
    is_verified: true,
    prevoius_created_on: 'null',
    prevoius_zero_cr_dr: number(entry.credit) > 0 ? 'Credit' : 'Debit',
    created_on: new Date().toISOString(),
    slug: '',
    created_by: email,
    bank: bankLedger,
    module: 'bank_statement',
  }
}

/** One row of the verify update (PUT bankstmnt-entry/) - only `id` is required there. */
export const toVerifyRow = (entry, remainingLedger) => ({
  id: entry.sr_no,
  Date: entry.date,
  Transaction: entry.transaction,
  ledger: effectiveLedger(entry, remainingLedger),
  Ref_no: entry.ref_no ?? '',
  Credit: number(entry.credit),
  Debit: number(entry.debit),
  Vouchetype: entry.Vouchetype,
  Orignal_Vouchetype: entry.Orignal_Vouchetype || (isDebit(entry) ? VOUCHER.PAYMENT : VOUCHER.RECEIPT),
  AccountantNarration: entry.AccountantNarration ?? '',
  prevoius_created_on: entry.prevoius_created_on ?? '',
})

/* ------------------------------------------------------------------ */
/* The summary                                                        */
/* ------------------------------------------------------------------ */

/** How many Payment, Receipt and Contra rows a ledger has. */
export const countByType = (entries = []) => {
  const counts = { Payment: 0, Receipt: 0, Contra: 0 }
  entries.forEach((entry) => {
    const type = text(entry.Vouchetype || entry.voucherType).toLowerCase()
    const match = VOUCHER_TYPES.find((voucher) => voucher.toLowerCase() === type)
    if (match) counts[match] += 1
  })
  return counts
}

/** Each ledger of the summary as a row, and the total of them all. */
export const summaryRows = (byLedger) => {
  const rows = Object.entries(byLedger ?? {}).map(([ledger, value]) => {
    const entries = Array.isArray(value?.entries) ? value.entries : []
    return {
      ledger,
      entries,
      counts: countByType(entries),
      jv: value?.jv_voucher === true,
      debit: number(value?.total_debit),
      credit: number(value?.total_credit),
      difference: number(value?.difference),
    }
  })
  const total = rows.reduce(
    (sum, row) => ({
      counts: {
        Payment: sum.counts.Payment + row.counts.Payment,
        Receipt: sum.counts.Receipt + row.counts.Receipt,
        Contra: sum.counts.Contra + row.counts.Contra,
      },
      debit: round2(sum.debit + row.debit),
      credit: round2(sum.credit + row.credit),
      difference: round2(sum.difference + row.difference),
    }),
    { counts: { Payment: 0, Receipt: 0, Contra: 0 }, debit: 0, credit: 0, difference: 0 },
  )
  return { rows, total }
}
