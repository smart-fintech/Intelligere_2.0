/**
 * SALES ENTRIES WITHOUT INVENTORY - the URLs of its two views (Multi Ledger,
 * Single Ledger), the sales ledgers every view offers, and their messages to
 * Tally. With Inventory has its own: Services/Accounting/salesInventoryService. Each
 * body takes `company_id`.
 *
 *   accounting_entries/sales_ledger_list/
 *     POST   { company_id }                     -> [{ id, ledeger_name }] - the
 *                                                  company's "Sales Accounts" ledgers
 *
 * MULTI LEDGER
 *   accounting_entries/multi_party_sales_upload/   (old: credit_debit/B2CWithoutInventoryMP/)
 *     POST   multipart { company_id, file }      -> 201, EMPTY body. Replaces every
 *                                                  entry this user uploaded before, sent or not
 *     PUT    { company_id, Invoice_no: [no] }    marks them sent (is_verified), so
 *                                                  later loads leave them out
 *   accounting_entries/get_multi_party_data/       (old: credit_debit/getB2CWithoutInventoryMP/)
 *     POST   { company_id, start_index }         -> { data: [entry], total_len,
 *                                                     Remaining, not_in_tally_count }
 *
 * SINGLE LEDGER
 *   accounting_entries/sales_without_inventory_upload/   (old: credit_debit/UploadB2CWithoutStockAPI/)
 *     POST   multipart { company_id, file }      -> 201, EMPTY body. Replaces EVERY
 *                                                  single-ledger invoice of the company
 *     PUT    { company_id, Invoice_no: [no] }    marks them sent
 *   accounting_entries/get_without_inventory_data/       (old: credit_debit/getB2CWithoutStockAPI/)
 *     POST   { company_id, start_index }         -> { data: [invoice], total_len, Remaining }
 *            The invoice list is the backend's cache of the last upload, kept for an
 *            hour: after that the batches come back empty until the file is uploaded again.
 *
 * Both lists come in batches of 50 invoice numbers - see shared/entryBatch.
 * Nothing here shows a message: a failure is an Error carrying the backend's
 * own text (Services/Global/apiService), for the screen to show.
 *
 * ------------------------------------------------------------------
 * THE MESSAGES TO TALLY - on the app's shared socket
 * ------------------------------------------------------------------
 *   Fetch from Tally, Multi Ledger (old module: getsalesentries)
 *     { payload: { module_name: "fetch_sales_entries_MP", company_name,
 *                  data: { year, start_month, end_month, type: [voucher type] } } }
 *     -> { res: { return_module_name, action_status: "stop_loader", status, msg,
 *                 file_path: "<URL of the CSV>" } }
 *     An end_month before start_month runs into the next year (the agent's rule).
 *
 *   Send to Tally, Multi Ledger (old module: sales_inventory_without_stock, rows in { message })
 *     { payload: { module_name: "sales_inventory_multi_ledger", company_name, message: [row] } }
 *   Send to Tally, Single Ledger (the same old module)
 *     { payload: { module_name: "sales_without_inventory", company_name, data: [row] } }
 *   Both answered { res: { return_module_name, action_status: "stop_loader", status, msg } },
 *   `status` "success" only when Tally created every voucher. The rows: toMultiLedgerRow /
 *   toSingleLedgerRow (Modules/SalesEntries).
 */

import { SALES_ENTRIES_MODULE } from '@/Constants/salesEntries'
import { hasActiveModule } from '@/Services/Auth/accessService'
import { api } from '@/Services/Global/apiService'
import { MULTIPART } from '@/Services/Global/apiHelpers'

const SALES_LEDGERS_URL = 'accounting_entries/sales_ledger_list/'
const MULTI_UPLOAD_URL = 'accounting_entries/multi_party_sales_upload/'
const MULTI_ENTRIES_URL = 'accounting_entries/get_multi_party_data/'
const SINGLE_UPLOAD_URL = 'accounting_entries/sales_without_inventory_upload/'
const SINGLE_ENTRIES_URL = 'accounting_entries/get_without_inventory_data/'

// Named so axios sends the FormData as it is - see Services/Company/bankService.

/** The names these Tally operations go by, in both directions. */
export const TALLY_FETCH_SALES_MODULE = 'fetch_sales_entries_MP'
export const TALLY_SEND_MULTI_LEDGER_MODULE = 'sales_inventory_multi_ledger'
export const TALLY_SEND_SINGLE_LEDGER_MODULE = 'sales_without_inventory'

/** The CSVs to fill in - see LEDGER_CSV_FORMAT_FILE on why they are `?raw`. */
export const MULTI_LEDGER_CSV_FORMAT_FILE = 'SalesEntriesMultiLedgerFormat.csv'
export { default as MULTI_LEDGER_CSV_FORMAT_CONTENT } from '@/Assets/format/SalesEntriesMultiLedgerFormat.csv?raw'
export const SINGLE_LEDGER_CSV_FORMAT_FILE = 'SalesEntriesSingleLedgerFormat.csv'
export { default as SINGLE_LEDGER_CSV_FORMAT_CONTENT } from '@/Assets/format/SalesEntriesSingleLedgerFormat.csv?raw'

/** Whether the company's `active_modules` lists the module (Services/Auth/accessService). */
export const hasSalesEntriesModule = (company) => hasActiveModule(company, SALES_ENTRIES_MODULE)

/** -> [{ id, name }], named ledgers only. */
export const getSalesLedgers = async (companyId) => {
  const reply = await api.post(SALES_LEDGERS_URL, { company_id: companyId })
  return (Array.isArray(reply) ? reply : [])
    .map((ledger) => ({ id: ledger?.id ?? null, name: String(ledger?.ledeger_name ?? '').trim() }))
    .filter((ledger) => ledger.name)
}

/** The 201 has no body, so nothing is read from the reply. */
const upload = async (url, companyId, file) => {
  const body = new FormData()
  body.append('company_id', companyId)
  body.append('file', file)
  await api.post(url, body, MULTIPART)
}

/* ---- Multi Ledger ---- */

export const uploadMultiLedgerEntries = (companyId, file) => upload(MULTI_UPLOAD_URL, companyId, file)

export const markMultiLedgerEntriesSent = (companyId, invoiceNumbers) =>
  api.put(MULTI_UPLOAD_URL, { company_id: companyId, Invoice_no: invoiceNumbers })

export const getMultiLedgerEntries = (companyId, startIndex) =>
  api.post(MULTI_ENTRIES_URL, { company_id: companyId, start_index: startIndex })

export const buildFetchSalesMessage = (companyName, { year, startMonth, endMonth, voucherTypes }) => ({
  payload: {
    module_name: TALLY_FETCH_SALES_MODULE,
    company_name: companyName,
    data: {
      year: String(year),
      start_month: String(startMonth),
      end_month: String(endMonth),
      type: voucherTypes,
    },
  },
})

export const buildSendMultiLedgerMessage = (companyName, rows) => ({
  payload: {
    module_name: TALLY_SEND_MULTI_LEDGER_MODULE,
    company_name: companyName,
    message: rows,
  },
})

/* ---- Single Ledger ---- */

export const uploadSingleLedgerEntries = (companyId, file) => upload(SINGLE_UPLOAD_URL, companyId, file)

export const markSingleLedgerEntriesSent = (companyId, invoiceNumbers) =>
  api.put(SINGLE_UPLOAD_URL, { company_id: companyId, Invoice_no: invoiceNumbers })

export const getSingleLedgerEntries = (companyId, startIndex) =>
  api.post(SINGLE_ENTRIES_URL, { company_id: companyId, start_index: startIndex })

export const buildSendSingleLedgerMessage = (companyName, rows) => ({
  payload: {
    module_name: TALLY_SEND_SINGLE_LEDGER_MODULE,
    company_name: companyName,
    data: rows,
  },
})
