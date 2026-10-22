/**
 * WHAT THE PURCHASE INVOICE MODULE BRINGS TO THE SHARED DOCUMENT SCREEN
 * (Modules/SalesInvoice/Components/SalesInvoiceWorkspace - its `flow`): its
 * own form, document types, Seller and Buyer steps and checks. Steps 3 and 4,
 * the preview, the PDF and saving are the shared screen's, run by the purchase
 * types' own profiles (purchaseInvoiceForm).
 *
 *   parties   the company is the BUYER (saved to the company record on Step
 *             2's Next), the supplier ledger the SELLER (saved to that ledger
 *             on Step 1's Next, and saved as buyer_id - the backend keeps the
 *             company as seller_id for every document)
 */

import PurchaseBuyerStep from '@/Modules/PurchaseInvoice/Components/PurchaseBuyerStep'
import PurchaseSellerStep from '@/Modules/PurchaseInvoice/Components/PurchaseSellerStep'
import { createPurchaseForm, validatePurchase } from '@/Modules/PurchaseInvoice/purchaseInvoiceForm'
import { getPurchaseDocumentTypeAccess } from '@/Services/purchaseInvoiceService'

export const PURCHASE_FLOW = Object.freeze({
  createForm: createPurchaseForm,
  documentTypes: getPurchaseDocumentTypeAccess,
  validate: validatePurchase,
  SellerStep: PurchaseSellerStep,
  BuyerStep: PurchaseBuyerStep,
  parties: Object.freeze({ company: 'buyer', ledger: 'seller' }),
})
