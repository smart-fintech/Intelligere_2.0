/**
 * BANK STATEMENT - every request and Tally message of the module, against the
 * backend's bank_statement/ app:
 *
 *   POST   bank_statement/bankstmnt-file/       the statement file (CSV, or a Tabula PDF)
 *   POST   bank_statement/bankstmnt-ai/         a PDF read server-side by the AI reader
 *   POST   bank_statement/bankstmnt-entry/      turns the uploaded file into its entries
 *   PUT    bank_statement/bankstmnt-entry/      marks rows verified (sent)
 *   POST   bank_statement/interval-voucher/     one page of the entries
 *   POST   bank_statement/bank-ledger-mapping/  keyword -> ledger mappings: list / add
 *   DELETE bank_statement/bank-ledger-mapping/  removes one keyword
 *   POST   bank_statement/vouchers-to-excel/    the verified rows and their per-ledger summary
 *   POST   tally/receivable_payable/            outstanding invoices, for Agst Ref
 *
 * The upload is three steps, in this order: the file (either upload) leaves a
 * cleaned CSV on the server, createStatementEntry turns it into the entry, and
 * getStatementPage then reads that entry a page at a time.
 *
 * Failures reach the caller as an Error carrying the backend's message
 * (authService).
 */

import { getEmail } from '@/Library/secureStorage'
import { api } from '@/Services/authService'

const FILE_URL = 'bank_statement/bankstmnt-file/'
const AI_FILE_URL = 'bank_statement/bankstmnt-ai/'
const ENTRY_URL = 'bank_statement/bankstmnt-entry/'
const PAGE_URL = 'bank_statement/interval-voucher/'
const MAPPING_URL = 'bank_statement/bank-ledger-mapping/'
const SUMMARY_URL = 'bank_statement/vouchers-to-excel/'
const OUTSTANDING_URL = 'tally/receivable_payable/'

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

const toList = (response) => {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(response?.results)) return response.results
  return []
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/* ------------------------------------------------------------------ */
/* Uploading                                                          */
/* ------------------------------------------------------------------ */

const statementForm = ({ companyId, bankDetailId, file, password }) => {
  const body = new FormData()
  body.append('company_id', String(companyId))
  body.append('bank_detail_id', String(bankDetailId))
  body.append('upload_file', file, file.name)
  if (password !== undefined) body.append('pdf_password', password)
  return body
}

/** A CSV (Date, Narration, Credit, Debit) or a PDF already read by Tabula. 201, no body. */
export const uploadStatementFile = ({ companyId, bankDetailId, file }) =>
  api.post(FILE_URL, statementForm({ companyId, bankDetailId, file }), MULTIPART)

/** A PDF the server reads itself; `password` only for a locked PDF. 201, no body. */
export const uploadStatementAI = ({ companyId, bankDetailId, file, password = '' }) =>
  api.post(AI_FILE_URL, statementForm({ companyId, bankDetailId, file, password }), MULTIPART)

/** Turns the file just uploaded into the statement's entries -> { data: [...] }. */
export const createStatementEntry = (companyId) => api.post(ENTRY_URL, { company_id: companyId })

/* ------------------------------------------------------------------ */
/* Reading the entries                                                */
/* ------------------------------------------------------------------ */

/**
 * One page of the latest statement, from `lastIndex`:
 *
 *   { data: [...rows], count, bankstmnt_entry_id, msg? }   `msg` only on the last page
 *
 * 100 rows a page for a Tally user, the whole statement for any other ERP.
 */
export const getStatementPage = async ({ companyId, lastIndex = 0 }) => {
  const reply = await api.post(PAGE_URL, { company_id: companyId, last_index: lastIndex })
  return {
    rows: toList(reply),
    count: Number(reply?.count) || 0,
    entryId: reply?.bankstmnt_entry_id ?? null,
    finished: Boolean(reply?.msg),
  }
}

/**
 * Marks rows verified - the record that they were sent:
 *
 *   { company_id, bankstmnt_entry_id, data: [{ id: <sr_no>, Date, ledger, ... }] }
 */
export const verifyStatementRows = ({ companyId, entryId, rows }) =>
  api.put(ENTRY_URL, { company_id: companyId, bankstmnt_entry_id: entryId, data: rows })

/**
 * The verified rows of the statement and a summary per ledger:
 *
 *   { VoucherToExcel: [...rows], bank_Summary: { <ledger>: { total_debit, total_credit,
 *     difference, jv_voucher, entries } } }
 *
 * An unknown id is a 204 with no body - an empty summary.
 */
export const getVoucherSummary = async (entryId) => {
  const reply = await api.post(SUMMARY_URL, { bankstmnt_entry_id: entryId })
  return {
    rows: Array.isArray(reply?.VoucherToExcel) ? reply.VoucherToExcel : [],
    byLedger: isPlainObject(reply?.bank_Summary) ? reply.bank_Summary : {},
  }
}

/* ------------------------------------------------------------------ */
/* Keyword -> ledger mappings                                         */
/* ------------------------------------------------------------------ */

/**
 * The keywords of one bank account - `{ keyword: ledger }`.
 *
 * The backend answers every mapping of the user for the company; the one for
 * this account is picked by its account number, as before.
 */
export const getLedgerMappings = async ({ companyId, accountNo }) => {
  const mappings = toList(await api.post(MAPPING_URL, { company_id: companyId }))
  const mine = mappings.find((mapping) => String(mapping?.account_number ?? '') === String(accountNo ?? ''))
  return isPlainObject(mine?.combination) ? mine.combination : {}
}

/** Adds (or re-points) one keyword -> the account's keywords after it. */
export const saveLedgerMapping = async ({ companyId, bankName, accountNo, keyword, ledger }) => {
  const reply = await api.post(MAPPING_URL, {
    company_id: companyId,
    email: getEmail() || '',
    bankname: bankName,
    accountno: accountNo,
    keyword,
    ledger,
  })
  return isPlainObject(reply?.combination) ? reply.combination : {}
}

/** Removes one keyword -> the account's keywords after it. */
export const deleteLedgerMapping = async ({ companyId, bankName, accountNo, keyword }) => {
  const reply = await api.delete(MAPPING_URL, {
    data: { company_id: companyId, bankname: bankName, accountno: accountNo, keyword },
  })
  return isPlainObject(reply?.combination) ? reply.combination : {}
}

/* ------------------------------------------------------------------ */
/* Agst Ref - the invoices still open                                 */
/* ------------------------------------------------------------------ */

export const OUTSTANDING_SOURCE = Object.freeze({ PAYABLE: 'payable', RECEIVABLE: 'receivable' })

/**
 * The open invoices of every ledger, for one side:
 *
 *   { <ledger>: [{ invoice_no, amount, billdate, duedate, credit_days, partial }] }
 */
export const getOutstandingInvoices = async ({ companyName, source }) => {
  const reply = await api.post(OUTSTANDING_URL, { source, company_name: companyName })
  return isPlainObject(reply) ? reply : {}
}

/* ------------------------------------------------------------------ */
/* Sending to Tally over the WebSocket                                */
/* ------------------------------------------------------------------ */

/** Sent as `module`, answered as `return_module_name`. */
export const BANK_STATEMENT_SOCKET_MODULE = 'bank_statement'

/**
 * The Send to Tally message. It is flat - NOT the { payload: { module_name, ... } }
 * envelope of the other modules - as the bank statement has always been sent:
 *
 *   { company, bank, module: "bank_statement", bank_statement_data: [...] }
 *
 * `bank` is the bank's ledger; the rows are built by toTallyRow
 * (Modules/BankStatement/bankStatementModel).
 */
export const buildBankStatementSocketMessage = ({ companyName, bank, rows }) => (
  {
    payload: {
      company_name: companyName,
      bank_name: bank,
      module_name: BANK_STATEMENT_SOCKET_MODULE,
      data: rows,
    }
  })
