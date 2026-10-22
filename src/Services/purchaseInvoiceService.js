/**
 * PURCHASE INVOICE - who may use it, and which purchase documents.
 *
 * Saving, numbering, the earlier products and the PDF upload are the same
 * calls the Sales Invoice module makes (Services/salesInvoiceService) - the
 * backend tells the documents apart by `document_type`. A purchase document
 * is saved with the company as seller_id and the supplier's ledger as
 * buyer_id, as the backend has always stored purchase documents.
 */

import { PURCHASE_DOCUMENT_TYPES, PURCHASE_INVOICE_MODULE } from '@/Constants/purchaseInvoice'
import { hasActiveModule, listsModule } from '@/Services/accessService'

/** Whether the company's `active_modules` lists the Purchase Invoice module (Services/accessService). */
export const hasPurchaseInvoiceModule = (company) => hasActiveModule(company, PURCHASE_INVOICE_MODULE)

/**
 * Every purchase document type, with whether this company may make it:
 *
 *   [{ ...the PURCHASE_DOCUMENT_TYPES entry, enabled }]
 *
 * Purchase Invoice is the module itself and is enabled with it; the other two
 * only when `premium_modules` lists them.
 */
export const getPurchaseDocumentTypeAccess = (company) =>
  PURCHASE_DOCUMENT_TYPES.map((type) => ({
    ...type,
    enabled: hasPurchaseInvoiceModule(company) && (!type.premium || listsModule(company?.premium_modules, type.premiumNames)),
  }))
