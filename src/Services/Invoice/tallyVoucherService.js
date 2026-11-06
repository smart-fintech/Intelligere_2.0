/**
 * VOUCHERS - a company's Tally vouchers, and Tally's side of its documents:
 *
 *   POST   invoice/tally-vouchers/   the vouchers, grouped by document type
 *   PUT    invoice/tally-vouchers/   a voucher done (sent to Tally, or verified)
 *   DELETE invoice/tally-vouchers/   remove one
 *   POST   invoice/edit-document/    a voucher's own changes
 *   POST   tally/voucher-list/       the Tally voucher types a fetch can ask for
 *   WS     invoice_voucher_create    a voucher, sent to Tally (the app's WebSocket)
 *   WS     tally_invoice_fetch       fetch documents from Tally (the app's WebSocket)
 */

import { text } from '@/Services/Global/apiHelpers'
import { api } from '@/Services/Global/apiService'

const TALLY_VOUCHERS_URL = 'invoice/tally-vouchers/'

/**
 * POST invoice/tally-vouchers/  { company_id }  -> the company's vouchers,
 * grouped by document type:
 *   { "Sales Invoice": [...], "Purchase Invoice": [...], "Credit Note": [...], "Debit Note": [...] }
 * The answer is handed back exactly as it came; voucherGroupsOf reads the
 * groups out of it. Called through the shared cache (useTallyVouchers), never
 * straight from a screen.
 */
export const getTallyVouchers = (companyId) => api.post(TALLY_VOUCHERS_URL, { company_id: companyId })

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/**
 * The vouchers of an answer, by document type: { "<type>": [voucher, ...] }.
 * The grouped object is read as it came (or under `data`); a group that is
 * not a list is left out, and so is anything in a list that is not a
 * voucher. A bare list is grouped by each voucher's own document_type. {}
 * for anything else.
 */
export const voucherGroupsOf = (reply) => {
  const body = isRecord(reply?.data) ? reply.data : reply
  if (Array.isArray(body)) {
    return body.filter(isRecord).reduce((groups, row) => {
      const type = text(row.document_type)
      if (type) groups[type] = [...(groups[type] ?? []), row]
      return groups
    }, {})
  }
  if (!isRecord(body)) return {}
  return Object.fromEntries(
    Object.entries(body)
      .filter(([, list]) => Array.isArray(list))
      .map(([type, list]) => [text(type), list.filter(isRecord)]),
  )
}

/** One document type's vouchers out of the groups - its name matched case and outer spaces aside; [] when there are none. */
export const vouchersOfType = (groups, documentType) => {
  const wanted = text(documentType).toLowerCase()
  const found = Object.entries(groups ?? {}).find(([type]) => type.toLowerCase() === wanted)
  return found ? found[1] : []
}

/**
 * VOUCHER DELETE - the same URL as the list, POST with the voucher named:
 *   POST invoice/tally-vouchers/  { company_id, document_no, document_type }
 * (the list is POST { company_id } alone). document_type is the voucher's
 * own: Sales Invoice, Purchase Invoice, Credit Note or Debit Note.
 */
export const buildVoucherDeleteBody = ({ companyId, documentNo, documentType }) => ({
  company_id: companyId,
  document_no: text(documentNo),
  document_type: text(documentType),
})

export const deleteTallyVoucher = (voucher) => api.delete(TALLY_VOUCHERS_URL, { data: buildVoucherDeleteBody(voucher) })

/**
 * THE VOUCHER UPDATE - the same URL as the list, but PUT (the list is read
 * with POST { company_id }):
 *   PUT invoice/tally-vouchers/  { company_id, document_no, document_type, voucher_type,
 *                                  narration, account_ledger, is_deleted }
 * Sent once a voucher is done - after Tally confirms it (Send to Tally), or
 * straight away for a company not on Tally (Verified) - with is_deleted
 * true: a done voucher leaves the list, as the earlier voucher screens
 * removed one once it was sent.
 */
export const buildVoucherUpdateBody = ({ companyId, documentNo, documentType, voucherType, narration, accountLedger }) => ({
  company_id: companyId,
  document_no: text(documentNo),
  document_type: text(documentType),
  voucher_type: text(voucherType),
  narration: text(narration),
  account_ledger: text(accountLedger),
  is_deleted: true,
})

export const updateTallyVoucher = (body) => api.put(TALLY_VOUCHERS_URL, body)

const EDIT_INVOICE_URL = 'invoice/edit-document/'

/**
 * POST invoice/edit-document/ - a voucher's own changes, saved:
 *
 *   { document_id, ...only the fields that changed, product_details: [{ product_id, ...changed fields }] }
 *
 * every field under the name the voucher API sends it (buildVoucherEditPayload,
 * Voucher/voucherModel). Only a PDF-uploaded voucher (upload_type "pdf") is edited.
 */
export const editVoucherDocument = (payload) => api.post(EDIT_INVOICE_URL, payload)

/** The module a voucher goes to Tally under - sent as `module_name`, answered as `return_module_name`. */
export const TALLY_VOUCHER_MODULE = 'invoice_voucher_create'

/** The WebSocket message for a voucher, in the envelope every Tally message is sent in. */
export const buildVoucherSocketMessage = (payload) => ({ payload })

const TALLY_VOUCHER_LIST_URL = 'tally/voucher-list/'

/**
 * POST tally/voucher-list/  { company_name } -> ["Sales", "Credit Note", ...]
 * The voucher types the company's Tally has - what the fetch can ask for.
 */
export const getTallyVoucherTypes = async (companyName) => {
  const reply = await api.post(TALLY_VOUCHER_LIST_URL, { company_name: companyName })
  return [...new Set(voucherTypesOf(reply).map((type) => type.name))]
}

/**
 * The voucher types of a tally/voucher-list/ answer, each once:
 *   [{ voucher_type_name: "Credit Note acc", voucher_group: "Credit Note" }, ...]
 *   -> [{ name: "Credit Note acc", group: "Credit Note" }]
 * A plain name in the list (the earlier answer) is a type with no group.
 */
export const voucherTypesOf = (reply) => {
  const list = Array.isArray(reply) ? reply : Array.isArray(reply?.data) ? reply.data : []
  const seen = new Set()
  return list
    .map((row) => (row && typeof row === 'object' ? { name: text(row.voucher_type_name), group: text(row.voucher_group) } : { name: text(row), group: '' }))
    .filter((type) => {
      if (!type.name || seen.has(type.name)) return false
      seen.add(type.name)
      return true
    })
}

/** POST tally/voucher-list/ { company_name } -> voucherTypesOf - read through the shared cache (useVoucherTypes). */
export const getVoucherTypeList = async (companyName) => voucherTypesOf(await api.post(TALLY_VOUCHER_LIST_URL, { company_name: companyName }))

/** The voucher_group a document type's vouchers are made in. */
export const VOUCHER_GROUP_OF = Object.freeze({
  'Sales Invoice': 'Sales',
  'Credit Note': 'Credit Note',
  'Debit Note': 'Debit Note',
  'Purchase Invoice': 'Purchase',
})

/** The voucher_type_name a document type's voucher starts with - when the company's Tally has it. */
export const DEFAULT_VOUCHER_TYPE_OF = Object.freeze({
  'Sales Invoice': 'Sales',
  'Purchase Invoice': 'Purchase',
  'Credit Note': 'Credit Note',
  'Debit Note': 'Debit Note',
})

/**
 * The voucher type a document type's voucher is given until the user picks
 * one: the type of tally/voucher-list/ whose voucher_type_name is
 * DEFAULT_VOUCHER_TYPE_OF's (case and outer spaces aside), as Tally names it.
 * '' when Tally has none of that name - nothing else is picked for the user.
 */
export const defaultVoucherTypeFor = (types, documentType) => {
  const wanted = text(DEFAULT_VOUCHER_TYPE_OF[text(documentType)]).toLowerCase()
  if (!wanted) return ''
  return (types ?? []).find((type) => type.name.toLowerCase() === wanted)?.name ?? ''
}

/**
 * The voucher types a document type's voucher may be made as - those whose
 * voucher_group is the document type's group (VOUCHER_GROUP_OF; case and
 * outer spaces aside), in the order Tally sent them. [] for a document type
 * with no group, or a group Tally has no type in.
 */
export const voucherTypesOfGroup = (types, documentType) => {
  const group = text(VOUCHER_GROUP_OF[text(documentType)]).toLowerCase()
  if (!group) return []
  return (types ?? []).filter((type) => text(type.group).toLowerCase() === group)
}

/**
 * The module the invoice fetch uses in both directions - sent as
 * `module_name`, answered as `return_module_name` - the convention every
 * Tally message in the app follows (ledgerService, productService).
 */
export const TALLY_INVOICE_FETCH_MODULE = 'tally_invoice_fetch'

/**
 * The fetch, in the envelope every Tally message is sent in:
 *
 *   { "payload": { "module_name": "tally_invoice_fetch",
 *                  "company_name": "<active company>",
 *                  "data": { "start_year": "2025", "start_month": "3",
 *                            "end_year": "2026", "end_month": "3",
 *                            "voucher_type": ["Sales", "Credit Note"] } } }
 *
 * Years and months go as text, months without a leading zero.
 */
export const buildTallyInvoiceFetchMessage = (companyName, { startYear, startMonth, endYear, endMonth, voucherTypes }) => ({
  payload: {
    module_name: TALLY_INVOICE_FETCH_MODULE,
    company_name: companyName,
    data: {
      start_year: String(startYear),
      start_month: String(Number(startMonth)),
      end_year: String(endYear),
      end_month: String(Number(endMonth)),
      voucher_type: [...voucherTypes],
    },
  },
})
