/**
 * The resources kept in the shared data cache (Library/queryCache) - the
 * first part of every cache key. The rest of a key is whose it is: the
 * company's name or id, exactly as the endpoint is asked with.
 *
 *   PRODUCTS            POST inventory/product/          [PRODUCTS, companyName]
 *   PRODUCT_GROUPS      POST inventory/product_group_list/ [PRODUCT_GROUPS, companyName]
 *   PRODUCT_UNITS       POST inventory/product_units/    [PRODUCT_UNITS, companyName]
 *   DOCUMENT_MAPPINGS   POST invoice/document-mapping/   [DOCUMENT_MAPPINGS, companyId, documentType] -
 *                       'Sales Invoice' or 'Purchase Invoice', each its own mappings
 *   TALLY_VOUCHERS      POST invoice/tally-vouchers/     [TALLY_VOUCHERS, companyId] - one
 *                       answer per company, shared by Sales and Purchase Invoice
 *   TALLY_VOUCHER_TYPES POST tally/voucher-list/        [TALLY_VOUCHER_TYPES, companyName] - the
 *                       company's voucher types, for every voucher of both modules
 *   APP_LEDGER_PRODUCTS POST invoice/app-ledger-product/  [APP_LEDGER_PRODUCTS, companyName, documentType] -
 *                       the ledgers and products the Voucher view's Mapping lists
 *   WAREHOUSES          POST inventory/warehouse_create/  [WAREHOUSES, companyId] - the list, read
 *                       again after a warehouse is created, changed or deleted (useWarehouses)
 *   QUOTATION_REQUESTS  POST inventory/AllRequestSO/      [QUOTATION_REQUESTS, companyName] - read
 *                       once a session, and again after a quotation is uploaded (useQuotationRequests)
 *   TRANSFER_NOTES      POST inventory/transfer_notes/    [TRANSFER_NOTES, companyName, warehouseId] - read
 *                       again after a note is created, changed or deleted (useTransferNotes)
 *   INVENTORY_ADJUSTMENTS POST inventory/update_inventory/ [INVENTORY_ADJUSTMENTS, companyName] - the
 *                       history, read again after an adjustment is saved (useInventoryAdjustments)
 *   FORECAST_RULES      POST inventory/forecastRules/    [FORECAST_RULES, companyName] - read once
 *                       a session per company (useForecastRules)
 *   RECEIVABLE_PAYABLE  POST tally/receivable_payable/   [RECEIVABLE_PAYABLE, companyName, source] - one
 *                       list, read again after a payment, a delete or a Tally sync (OutstandingList)
 *   RECEIVABLE_PAYABLE_SYNC POST tally/receivable_payable/ [RECEIVABLE_PAYABLE_SYNC, companyName] - when it
 *                       last came from Tally (PayableReceivableScreen)
 *   LEDGER_EXPORT_SYNC  POST tally/ledger_export/        [LEDGER_EXPORT_SYNC, companyName] - when the
 *                       ledgers last came from Tally (TallyLedgerExport)
 *   LEDGER_REPORT       POST tally/general_ledger/, tally/party_wise_ledger/  [LEDGER_REPORT, companyId,
 *                       report, what was asked] - one report (LedgerReport)
 *   ERP_LEDGER          POST tally/ERP_ledger_export/    [ERP_LEDGER, companyName, financialYear] - the
 *                       ledgers, read again after any change (ErpLedgerList)
 *   CHEQUE_DETAILS      POST cheque/cheque_details/      [CHEQUE_DETAILS, companyId, type] - the vouchers
 *                       or past cheques, read again after any change (ChequeHistory)
 *   DOCUVAULT_USERS     POST docuvault/users/            [DOCUVAULT_USERS, companyName] - the users and
 *                       the storage, read again after any change to a document (DocuVaultScreen)
 *   DOCUVAULT_DOCUMENTS POST docuvault/documents/        [DOCUVAULT_DOCUMENTS, companyName, email] - one
 *                       user's documents, read again after any change to them (DocuVaultDocuments)
 *   MIS_DASHBOARD       GET mis_reports/dashboard/       [MIS_DASHBOARD, companyId] - the reports the
 *                       user pinned, read again after they are saved (MisDashboard)
 *   MIS_DASHBOARD_REPORT POST mis_reports/reports/       [MIS_DASHBOARD_REPORT, companyId, reportType,
 *                       responseType, period] - one pinned report's card (MisDashboard)
 *   JV_LEDGERS          POST journal_vouchers/jv-ledgers/    [JV_LEDGERS, companyId] - the JV ledgers,
 *                       read again after they are changed (JvLedgers)
 *   JV_TEMPLATES        POST journal_vouchers/jv-templates/  [JV_TEMPLATES, companyId] - read again
 *                       after a template is saved or deleted (TemplateList)
 *   JV_VOUCHERS         POST journal_vouchers/jv-vouchers/   [JV_VOUCHERS, companyId] - the saved
 *                       vouchers, read again after a save or a delete (VoucherHistory)
 *   JV_BANK_ENTRIES     POST journal_vouchers/jv-bank-entries/ [JV_BANK_ENTRIES, companyId] - both
 *                       lists, read again after every change, as a change numbers them again
 *
 * How long an answer is used before it is asked for again, even with no
 * change seen here: what another user, another tab or Tally may have
 * changed meanwhile shows up within this long.
 */
export const QUERY = Object.freeze({
  PRODUCTS: 'products',
  PRODUCT_GROUPS: 'productGroups',
  PRODUCT_UNITS: 'productUnits',
  DOCUMENT_MAPPINGS: 'documentMappings',
  TALLY_VOUCHERS: 'tallyVouchers',
  TALLY_VOUCHER_TYPES: 'tallyVoucherTypes',
  APP_LEDGER_PRODUCTS: 'appLedgerProducts',
  WAREHOUSES: 'warehouses',
  QUOTATION_REQUESTS: 'quotationRequests',
  TRANSFER_NOTES: 'transferNotes',
  INVENTORY_ADJUSTMENTS: 'inventoryAdjustments',
  FORECAST_RULES: 'forecastRules',
  RECEIVABLE_PAYABLE: 'receivablePayable',
  RECEIVABLE_PAYABLE_SYNC: 'receivablePayableSync',
  LEDGER_EXPORT_SYNC: 'ledgerExportSync',
  LEDGER_REPORT: 'ledgerReport',
  ERP_LEDGER: 'erpLedger',
  CHEQUE_DETAILS: 'chequeDetails',
  DOCUVAULT_USERS: 'docuVaultUsers',
  DOCUVAULT_DOCUMENTS: 'docuVaultDocuments',
  MIS_DASHBOARD: 'misDashboard',
  MIS_DASHBOARD_REPORT: 'misDashboardReport',
  JV_LEDGERS: 'jvLedgers',
  JV_TEMPLATES: 'jvTemplates',
  JV_VOUCHERS: 'jvVouchers',
  JV_BANK_ENTRIES: 'jvBankEntries',
})

export const MASTER_DATA_STALE_MS = 5 * 60 * 1000
