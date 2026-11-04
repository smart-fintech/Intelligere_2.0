/**
 * SALES ENTRIES - WITH INVENTORY: its URLs and its message to Tally. Each body
 * takes `company_id`.
 *
 *   accounting_entries/sales_with_inventory_upload/     (old: credit_debit/UploadB2BInvoiceAPI/)
 *     POST   multipart { company_id, file }     -> 201, EMPTY body. Replaces EVERY
 *                                                 inventory invoice of the company
 *     PUT    { company_id, Invoice_no: [no] }   marks them sent (is_verified)
 *                                                 -> { msg: "Invoices Send to Tally successfully" }
 *
 *   accounting_entries/get_inventory_data/              (old: credit_debit/getB2BInvoiceAPI/)
 *     POST   { company_id, start_index }        -> { data: [invoice], total_len, Remaining,
 *                                                     not_in_tally_count }
 *            invoice: ledgername, gstno, state, total, *_amount / *_ledger (packaging,
 *            freight, insurance, others, discount), cgst/sgst/igst/ugst_ledger (as TEXT),
 *            purchaseLedger, tallyledger, products: [{ id, Products, HSN_SAC, GST_rate,
 *            CGST/SGST/IGST/UGST ('{"IGST 18%": 6849.8}' or null), quantity, Rate,
 *            Discount, Amount, Invoice_data }]
 *            Batches of 50 as Multi Ledger (shared/entryBatch). The invoice list is
 *            the backend's cache of the last upload, kept for an hour: after that the
 *            batches come back empty until the file is uploaded again.
 *
 * Nothing here shows a message: a failure is an Error carrying the backend's
 * own text (Services/authService), for the screen to show.
 *
 * ------------------------------------------------------------------
 * THE MESSAGE TO TALLY (old module: sales_inventory, rows wrapped in { message })
 * ------------------------------------------------------------------
 *   { payload: { module_name: "sales_with_inventory", company_name, data: [row] } }
 *   row: toInventoryTallyRow (Modules/SalesEntries/Inventory)
 *   -> { res: { return_module_name, action_status: "stop_loader", status, msg } }
 */

import { api } from '@/Services/authService'

const UPLOAD_URL = 'accounting_entries/sales_with_inventory_upload/'
const ENTRIES_URL = 'accounting_entries/get_inventory_data/'

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

export const TALLY_SEND_INVENTORY_MODULE = 'sales_with_inventory'

export const INVENTORY_CSV_FORMAT_FILE = 'SalesEntriesInventoryFormat.csv'
export { default as INVENTORY_CSV_FORMAT_CONTENT } from '@/Assets/format/SalesEntriesInventoryFormat.csv?raw'

export const uploadInventoryEntries = async (companyId, file) => {
  const body = new FormData()
  body.append('company_id', companyId)
  body.append('file', file)
  await api.post(UPLOAD_URL, body, MULTIPART)
}

export const markInventoryEntriesSent = (companyId, invoiceNumbers) =>
  api.put(UPLOAD_URL, { company_id: companyId, Invoice_no: invoiceNumbers })

export const getInventoryEntries = (companyId, startIndex) =>
  api.post(ENTRIES_URL, { company_id: companyId, start_index: startIndex })

export const buildSendInventoryMessage = (companyName, rows) => ({
  payload: {
    module_name: TALLY_SEND_INVENTORY_MODULE,
    company_name: companyName,
    data: rows,
  },
})
