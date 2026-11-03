/**
 * CHEQUE PRINTING - every URL of the module, and its message to Tally.
 *
 *   POST cheque/cheque_print/     multipart, for both kinds:
 *          { company_id, type: 'form', payeeName, bankName, chequeDate: 'DD/MM/YYYY', chequeAmount }
 *          { company_id, type: 'csv', file }
 *          -> { status: 'success', message, image_url: [...] }
 *
 *   POST cheque/cheque_details/   { company_id, type: 'voucher' | 'pastData' }
 *          -> { "<cheque id>": { payee_name, bank_name, cheque_date, cheque_amount,
 *                                narration, created_by, created_on, processed_cheque: [...] } }
 *
 *   PUT  cheque/cheque_details/   the voucher message below - marks the cheque verified
 *   DELETE cheque/cheque_details/ { id }
 *
 * Nothing here shows a message: a failure is an Error carrying the backend's
 * own text (Services/authService), for the screen to show.
 *
 * ------------------------------------------------------------------
 * THE MESSAGE TO TALLY
 * ------------------------------------------------------------------
 * Not the { payload: { module_name } } envelope of the newer Tally messages:
 * the backend relays this one to the Tally agent exactly as it arrives, and the
 * agent's bank statement import reads these flat, oddly spelt keys. There is no
 * reply to wait for - see buildChequeVoucher in Modules/ChequePrinting.
 */

import { ENV } from '@/Config/env'
import { CHEQUE_ENTRY, CHEQUE_PRINTING_MODULE } from '@/Constants/chequePrinting'
import { hasActiveModule } from '@/Services/accessService'
import { api } from '@/Services/authService'
import { fileUrlOf } from '@/Services/salesInvoiceService'

const PRINT_URL = 'cheque/cheque_print/'
const DETAILS_URL = 'cheque/cheque_details/'
const IMAGE_FOLDER = 'media/processed_cheques/'

// Named so axios sends the FormData as it is - see Services/bankService.
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

/** The name the voucher goes by on the socket. */
export const TALLY_CHEQUE_VOUCHER_MODULE = 'bank_statement'

/** The CSV to fill in for many cheques - see LEDGER_CSV_FORMAT_FILE on why it is `?raw`. */
export const CHEQUE_CSV_FORMAT_FILE = 'Cheque_format.csv'
export { default as CHEQUE_CSV_FORMAT_CONTENT } from '@/Assets/format/Cheque_format.csv?raw'

/** Whether the company's `active_modules` lists the module (Services/accessService). */
export const hasChequePrintingModule = (company) => hasActiveModule(company, CHEQUE_PRINTING_MODULE)

/** One cheque from the form. */
export const printCheque = ({ companyId, payeeName, bankName, chequeDate, chequeAmount }) => {
  const body = new FormData()
  body.append('company_id', companyId)
  body.append('payeeName', payeeName)
  body.append('bankName', bankName)
  body.append('chequeDate', chequeDate)
  body.append('chequeAmount', chequeAmount)
  body.append('type', CHEQUE_ENTRY.FORM)
  return api.post(PRINT_URL, body, MULTIPART)
}

/** Every cheque in a CSV. */
export const printChequesFromCsv = ({ companyId, file }) => {
  const body = new FormData()
  body.append('company_id', companyId)
  body.append('file', file)
  body.append('type', CHEQUE_ENTRY.CSV)
  return api.post(PRINT_URL, body, MULTIPART)
}

/** The cheques of one list: `type` is CHEQUE_VIEW.VOUCHER or CHEQUE_VIEW.PAST. */
export const getChequeDetails = (companyId, type) => api.post(DETAILS_URL, { company_id: companyId, type })

/** Records a cheque's voucher: its ledger, bank and narration, and that it is verified. */
export const updateCheque = (voucher) => api.put(DETAILS_URL, voucher)

export const deleteCheque = (id) => api.delete(DETAILS_URL, { data: { id } })

/**
 * Where a cheque's image is, or null when it has none. A full URL or a path is
 * used as it came; a bare file name, as some replies send, is in the images' folder.
 */
export const chequeImageUrl = (value) => {
  const url = fileUrlOf(value)
  if (!url) return null
  const name = String(value).trim()
  return name.includes('/') ? url : `${ENV.API_BASE_URL}${IMAGE_FOLDER}${name}`
}
