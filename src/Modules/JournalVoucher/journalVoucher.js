/**
 * Journal Voucher's plain logic - no React, no requests.
 *
 *   readJvLedgers / readTemplates / readVouchers / readBankEntries   the list replies
 *   nameLookup / matchName        a ledger or template name, whatever its case
 *   emptyTemplateForm / templateFormFrom / checkTemplateForm / toTemplatePayload
 *                                 the template designer
 *   voucherFromTemplate / voucherFromUpload / voucherFromBankEntry
 *                                 the one shape every voucher editor works on
 *   voucherTotals / checkVoucher / toVoucherPayload
 *                                 what a voucher adds up to, what is wrong with it, what is sent
 *   historyVoucherPayload / toTallyJournalRow
 *                                 a saved voucher sent again; a voucher as Tally is sent it
 *
 * A voucher being edited is
 *   { key, date: 'YYYY-MM-DD', narration, legs: [{ side: 'Dr' | 'Cr', ledger, amount }] }
 * with `amount` as typed. A leg left blank or at 0 is not sent: a template
 * can carry a ledger that a given month does not use.
 */

import { JV_SIDE } from '@/Constants/journalVoucher'
import { toInputDate } from '@/Utils/date'

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const toList = (value) => (Array.isArray(value) ? value : value ? [value] : [])
const text = (value) => String(value ?? '').trim()
const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })

/** Amounts are compared in paise, so 0.1 + 0.2 balances against 0.3. */
const toPaise = (value) => Math.round(Number(value) * 100)

/* ------------------------------------------------------------------ */
/* Names                                                              */
/* ------------------------------------------------------------------ */

/** A ledger or template name as the backend matches it: no case, single spaces. */
const nameKey = (value) => text(value).toLowerCase().replace(/\s+/g, ' ')

/** names -> a Map from nameKey to the name as the list spells it. */
export const nameLookup = (names) => new Map(names.map((name) => [nameKey(name), name]))

/**
 * The name as `lookup` spells it, or '' when it holds no such name - or when
 * there is no lookup yet: the bank entries can arrive before the ledgers.
 */
export const matchName = (lookup, value) => lookup?.get(nameKey(value)) ?? ''

/**
 * A template name as the Excel upload matches it - "_" is a space there - so
 * two names that differ only so would be the same template to the upload.
 */
const templateKey = (value) => nameKey(String(value ?? '').replaceAll('_', ' '))

/* ------------------------------------------------------------------ */
/* The list replies                                                   */
/* ------------------------------------------------------------------ */

/** [{ id, ledeger_name }] -> [{ id, name }], A to Z. */
export const readJvLedgers = (reply) =>
  toList(reply)
    .filter((row) => isRecord(row) && row.id !== undefined && text(row.ledeger_name))
    .map((row) => ({ id: row.id, name: text(row.ledeger_name) }))
    .sort((a, b) => byName(a.name, b.name))

/** { name: { dr, cr, party_name } } -> [{ name, dr: [names], cr: [names], partyName }], as saved. */
export const readTemplates = (reply) =>
  (isRecord(reply) ? Object.entries(reply) : [])
    .filter(([, template]) => isRecord(template))
    .map(([name, template]) => ({
      name,
      dr: toList(template.dr).map(text).filter(Boolean),
      cr: toList(template.cr).map(text).filter(Boolean),
      partyName: text(template.party_name),
    }))

const readLegs = (legs) =>
  toList(legs)
    .filter(isRecord)
    .map((leg) => ({ ledger: text(leg.ledger_name), amount: Number(leg.amount) || 0 }))

/**
 * { template_name: [voucher] } -> [{ template, vouchers }], each voucher with
 * a `key` unique on the page and what it adds up to.
 */
export const readVouchers = (reply) =>
  (isRecord(reply) ? Object.entries(reply) : [])
    .map(([template, vouchers]) => ({
      template,
      vouchers: toList(vouchers)
        .filter((voucher) => isRecord(voucher) && !voucher.is_delete)
        .map((voucher) => {
          const dr = readLegs(voucher.dr)
          const cr = readLegs(voucher.cr)
          return {
            key: `${template}:${voucher.id}`,
            id: voucher.id,
            template: text(voucher.template_name) || template,
            date: text(voucher.voucher_date),
            narration: text(voucher.narration),
            dr,
            cr,
            total: dr.reduce((sum, leg) => sum + leg.amount, 0),
          }
        }),
    }))
    .filter((group) => group.vouchers.length > 0)

/**
 * A `key` from what a row says rather than its sr_no: a delete or a move
 * numbers the rest again, and an edit or a choice kept by sr_no would land on
 * another row. Two rows saying the same thing are told apart by their order.
 */
const withContentKeys = (rows, contentOf) => {
  const seen = new Map()
  return rows.map((row) => {
    const content = JSON.stringify(contentOf(row))
    const count = seen.get(content) ?? 0
    seen.set(content, count + 1)
    return { ...row, key: `${content}#${count}` }
  })
}

/**
 * { single: { template: [entry] }, multi: [row] } -> the same, read safely:
 *   single   [{ template, entries: [{ key, srNo, date, narration, dr, cr }] }]
 *   multi    [{ key, srNo, date, amount, ledger, templates: [names], narration }]
 * `srNo` counts across the whole of its list, not within a template, and is
 * what a delete or a move names - so it is only ever used straight from the
 * latest list.
 */
export const readBankEntries = (reply) => {
  const single = isRecord(reply?.single) ? reply.single : {}
  return {
    single: Object.entries(single)
      .map(([template, entries]) => ({
        template,
        entries: withContentKeys(
          toList(entries)
            .filter(isRecord)
            .map((entry) => ({
              srNo: Number(entry.sr_no),
              date: text(entry.date),
              narration: text(entry.narration),
              dr: readLegs(entry.dr),
              cr: readLegs(entry.cr),
            })),
          ({ date, narration, dr, cr }) => [template, date, narration, dr, cr],
        ),
      }))
      .filter((group) => group.entries.length > 0),
    multi: withContentKeys(
      toList(reply?.multi)
        .filter(isRecord)
        .map((row) => ({
          srNo: Number(row.sr_no),
          date: text(row.date),
          amount: Number(row.amount) || 0,
          ledger: text(row.ledger),
          templates: toList(row.template).map(text).filter(Boolean),
          narration: text(row.narration),
        })),
      ({ date, amount, ledger, narration }) => [date, amount, ledger, narration],
    ),
  }
}

/* ------------------------------------------------------------------ */
/* The template designer                                              */
/* ------------------------------------------------------------------ */

/**
 * { name, dr: [ledger | ''], cr: [ledger | ''], party: { side, index } | null }.
 * The party is one of the template's own ledgers: in the Excel its column
 * takes the party's name, so one template serves every party.
 */
export const emptyTemplateForm = () => ({ name: '', dr: [''], cr: [''], party: null })

export const templateFormFrom = (template) => {
  const dr = template.dr.length ? [...template.dr] : ['']
  const cr = template.cr.length ? [...template.cr] : ['']
  const partyKey = nameKey(template.partyName)
  const drIndex = partyKey ? dr.findIndex((name) => nameKey(name) === partyKey) : -1
  const crIndex = partyKey && drIndex < 0 ? cr.findIndex((name) => nameKey(name) === partyKey) : -1

  return {
    name: template.name,
    dr,
    cr,
    party: drIndex >= 0 ? { side: JV_SIDE.DR, index: drIndex } : crIndex >= 0 ? { side: JV_SIDE.CR, index: crIndex } : null,
  }
}

/** What is wrong with the form - {} when fine. `names` are the templates there are; `editing` the one open. */
export const checkTemplateForm = (form, names, editing) => {
  const errors = {}
  const name = text(form.name)

  if (!name) errors.name = 'Please enter the template title.'
  else if (!editing && names.some((existing) => templateKey(existing) === templateKey(name))) {
    errors.name = 'A template with this title already exists.'
  }

  form.dr.forEach((ledger, index) => {
    if (!ledger) errors[`dr-${index}`] = 'Please select the ledger.'
  })
  form.cr.forEach((ledger, index) => {
    if (!ledger) errors[`cr-${index}`] = 'Please select the ledger.'
  })

  return errors
}

/** The form -> { name: { dr, cr, party_name? } }, what both POST and PUT take. */
export const toTemplatePayload = (form) => {
  const { party } = form
  const partyName = party ? (party.side === JV_SIDE.DR ? form.dr : form.cr)[party.index] : ''
  return {
    [text(form.name)]: {
      dr: [...form.dr],
      cr: [...form.cr],
      ...(partyName ? { party_name: partyName } : {}),
    },
  }
}

/* ------------------------------------------------------------------ */
/* A voucher being edited                                             */
/* ------------------------------------------------------------------ */

const asTyped = (amount) => (Number(amount) ? String(amount) : '')

/** A ledger spelt as the company's list spells it, or as it came when the list has no such ledger. */
const spelt = (lookup, ledger) => matchName(lookup, ledger) || text(ledger)

/** A blank voucher with one leg per ledger of the template, Dr first, dated today. */
export const voucherFromTemplate = (template) => ({
  key: 'form',
  date: toInputDate(new Date()),
  narration: '',
  legs: [
    ...template.dr.map((ledger) => ({ side: JV_SIDE.DR, ledger, amount: '' })),
    ...template.cr.map((ledger) => ({ side: JV_SIDE.CR, ledger, amount: '' })),
  ],
})

/** One row of the read Excel. `index` keeps keys apart when the sheet repeats a Sr No. */
export const voucherFromUpload = (row, index, lookup) => ({
  key: `upload-${index}`,
  srNo: row?.sr_no ?? index + 1,
  date: toInputDate(row?.date),
  narration: text(row?.narration),
  legs: toList(row?.entries)
    .filter(isRecord)
    .map((entry) => ({
      side: text(entry.type).toLowerCase() === 'cr' ? JV_SIDE.CR : JV_SIDE.DR,
      ledger: spelt(lookup, entry.ledger),
      amount: asTyped(entry.amount),
    }))
    // Dr first, as the other editors show them; each side keeps its own order.
    .sort((a, b) => (a.side === b.side ? 0 : a.side === JV_SIDE.DR ? -1 : 1)),
})

/** One bank entry, with the bank's amount on its ledger and the others to fill in. */
export const voucherFromBankEntry = (entry, lookup) => ({
  key: entry.key,
  date: toInputDate(entry.date),
  narration: entry.narration,
  legs: [
    ...entry.dr.map((leg) => ({ side: JV_SIDE.DR, ledger: spelt(lookup, leg.ledger), amount: asTyped(leg.amount) })),
    ...entry.cr.map((leg) => ({ side: JV_SIDE.CR, ledger: spelt(lookup, leg.ledger), amount: asTyped(leg.amount) })),
  ],
})

/** { dr, cr, difference } in rupees, from what is typed - anything unreadable counts as 0. */
export const voucherTotals = (voucher) => {
  let dr = 0
  let cr = 0
  voucher.legs.forEach((leg) => {
    const paise = toPaise(leg.amount) || 0
    if (paise <= 0) return
    if (leg.side === JV_SIDE.DR) dr += paise
    else cr += paise
  })
  return { dr: dr / 100, cr: cr / 100, difference: Math.abs(dr - cr) / 100 }
}

/**
 * What is wrong with a voucher - {} when it can be saved:
 *   date       no date
 *   leg-<i>    that leg's amount, or its ledger
 *   balance    no amounts, a side with none, or Dr and Cr apart
 * `lookup` is the company's ledgers (nameLookup); null skips that check, for
 * while they are still on their way.
 */
export const checkVoucher = (voucher, lookup) => {
  const errors = {}
  if (!toInputDate(voucher.date)) errors.date = 'Please choose the date.'

  voucher.legs.forEach((leg, index) => {
    const typed = text(leg.amount)
    if (!typed) return
    const amount = Number(typed)
    if (!Number.isFinite(amount) || amount < 0) errors[`leg-${index}`] = 'Please enter an amount of 0 or more.'
    else if (!/^\d+(\.\d{1,2})?$/.test(typed)) errors[`leg-${index}`] = 'Please use at most 2 decimal places.'
    else if (amount > 0 && !text(leg.ledger)) errors[`leg-${index}`] = 'Please select the ledger.'
    else if (amount > 0 && lookup && !matchName(lookup, leg.ledger)) errors[`leg-${index}`] = 'This ledger is not in the company.'
  })

  const { dr, cr, difference } = voucherTotals(voucher)
  if (dr === 0 && cr === 0) errors.balance = 'Please enter the amounts.'
  else if (dr === 0 || cr === 0) errors.balance = 'A voucher needs at least one Dr and one Cr amount.'
  else if (difference > 0) errors.balance = `Dr and Cr do not match - a difference of ${difference.toFixed(2)}.`

  return errors
}

/** A saved voucher (readVouchers) as jv-vouchers/ takes it again - History's Resend saves a copy. */
export const historyVoucherPayload = (templateName, voucher) => ({
  template_name: templateName,
  voucher_date: toInputDate(voucher.date),
  narration: voucher.narration,
  dr: voucher.dr.map((leg) => ({ ledger_name: leg.ledger, amount: leg.amount })),
  cr: voucher.cr.map((leg) => ({ ledger_name: leg.ledger, amount: leg.amount })),
})

/**
 * A voucher as jv-vouchers/ takes it (toVoucherPayload, historyVoucherPayload)
 * as one row of the message to Tally: with the company's GSTIN and state, and
 * the type, as the old project sent them. `company` is the active company's
 * record.
 */
export const toTallyJournalRow = (company, payload) => ({
  gst_number: company?.comp_gstin || '',
  state: company?.comp_state || '',
  voucher_type: 'Journal',
  ...payload,
})

/** The voucher as jv-vouchers/ saves it: only the legs with an amount, as numbers. */
export const toVoucherPayload = (templateName, voucher) => {
  const legsOf = (side) =>
    voucher.legs
      .filter((leg) => leg.side === side && toPaise(leg.amount) > 0)
      .map((leg) => ({ ledger_name: text(leg.ledger), amount: toPaise(leg.amount) / 100 }))

  return {
    template_name: templateName,
    voucher_date: toInputDate(voucher.date),
    narration: text(voucher.narration),
    dr: legsOf(JV_SIDE.DR),
    cr: legsOf(JV_SIDE.CR),
  }
}
