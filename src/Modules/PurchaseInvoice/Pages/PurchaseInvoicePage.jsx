import { useEffect, useState } from 'react'
import { AlertCircle, Building2, Lock } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { ROUTES } from '@/Constants/routes'
import { PURCHASE_DOCUMENT_TYPE_INVOICE, PURCHASE_DOCUMENT_TYPE_OUTBOUND_ORDER } from '@/Constants/purchaseInvoice'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { PURCHASE_FLOW } from '@/Modules/PurchaseInvoice/purchaseFlow'
import { purchaseOrderFromQuotation } from '@/Modules/PurchaseInvoice/quotationPurchaseOrder'
import SalesInvoiceScreen from '@/Modules/SalesInvoice/Components/SalesInvoiceScreen'
import { getPurchaseDocumentTypeAccess, hasPurchaseInvoiceModule } from '@/Services/purchaseInvoiceService'
import { fetchCompanies, selectCompanyError, selectCompanyStatus } from '@/Store/Slices/companySlice'

/**
 * /modules/Purchase Invoice - the Purchase Invoice module: Purchase Invoice,
 * Inbound Challan and Outbound Purchase Order, made on the shared document
 * screen with the purchase flow (purchaseFlow).
 *
 * Who gets in is decided as for Sales Invoice, from the active company's
 * record (already in the store):
 *
 *   still loading                    a skeleton - no answer is assumed
 *   no active company                pick one in the header first
 *   "Purchase Invoice" not in its    the module is not part of this
 *   active_modules                   company's plan, with the way to Payment
 *   otherwise                        the screen
 *
 * Which purchase types the company may make (premium_modules) is decided per
 * type - see getPurchaseDocumentTypeAccess.
 *
 * RAISE A PO (Inventory Details > Compare Quotation) arrives here with the
 * router state { raisePurchaseOrder: { companyId, documentNo, quotation } }:
 * Create Document opens on a new Outbound Purchase Order filled from that
 * quotation (purchaseOrderFromQuotation). Taken once, and only for the
 * company it was raised in; the state is then cleared, so a reload or Back
 * does not fill the form again.
 *
 * The screen is Sales Invoice's - Create Document or History - with the
 * purchase flow, and a history of the purchase types: on a purchase the
 * ledger saved as buyer_id is the supplier, so its column is "Seller". Fetch
 * from Tally (sales vouchers) is not offered here. Voucher shows only the
 * Purchase Invoice vouchers.
 */

/** History's options for the purchase documents. */
const PURCHASE_HISTORY = Object.freeze({
  documentTypesOf: getPurchaseDocumentTypeAccess,
  defaultType: PURCHASE_DOCUMENT_TYPE_INVOICE,
  partyLabel: 'Seller',
  tally: false,
})

/**
 * Voucher's options: only the Purchase Invoice vouchers, the supplier as the
 * party - and Add Voucher: invoices other companies shared with this one, or
 * invoice files read by the AI as Purchase Invoices.
 */
const PURCHASE_VOUCHERS = Object.freeze({
  types: [PURCHASE_DOCUMENT_TYPE_INVOICE],
  labels: { account: 'Purchase', party: 'Seller' },
  sharedInvoices: true,
  aiVoucher: PURCHASE_DOCUMENT_TYPE_INVOICE,
})

function Frame({ children }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-brand sm:text-2xl">Purchase Invoice</h1>
      <Card className="border-border/70">
        <CardContent className="px-4">{children}</CardContent>
      </Card>
    </div>
  )
}

/** Raise a PO's quotation as the workspace's prefillRequest - see the note at the top. */
const purchaseOrderRequest = ({ documentNo, quotation }) => ({
  documentType: PURCHASE_DOCUMENT_TYPE_OUTBOUND_ORDER,
  build: (lists) => {
    const { record, vendorName, ledgerFound, unmatched } = purchaseOrderFromQuotation({ documentNo, quotation }, lists)
    const warnings = []
    if (!ledgerFound) warnings.push(vendorName ? `No ledger is named "${vendorName}" - choose the seller.` : 'The quotation names no vendor - choose the seller.')
    if (unmatched.length > 0) warnings.push(`Not in the product list - choose each product again: ${unmatched.join(', ')}.`)
    return { record, warnings }
  },
})

export default function PurchaseInvoicePage() {
  const dispatch = useDispatch()
  const { activeCompany, activeCompanyId } = useActiveCompany()
  const location = useLocation()
  const navigate = useNavigate()

  // Raise a PO's quotation, taken once as the page opens - see the note at the top.
  const [raised] = useState(() => {
    const raise = location.state?.raisePurchaseOrder
    return raise?.quotation ? { companyId: raise.companyId, request: purchaseOrderRequest(raise) } : null
  })
  const hasRouterState = Boolean(location.state?.raisePurchaseOrder)
  useEffect(() => {
    if (hasRouterState) navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [hasRouterState, navigate, location.pathname, location.search])
  const prefillRequest = raised && String(raised.companyId) === String(activeCompanyId) ? raised.request : null
  const status = useSelector(selectCompanyStatus)
  const error = useSelector(selectCompanyError)

  if ((status === 'idle' || status === 'loading') && !activeCompany) {
    return (
      <Frame>
        <ListSkeleton rows={6} />
      </Frame>
    )
  }

  if (status === 'failed' && !activeCompany) {
    return (
      <Frame>
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load your companies"
          action={<RetryButton onClick={() => dispatch(fetchCompanies({ force: true }))} />}
        >
          {error}
        </StateMessage>
      </Frame>
    )
  }

  if (!activeCompany) {
    return (
      <Frame>
        <StateMessage icon={Building2} title="No company selected">
          Choose the company to purchase for in the header, then come back here.
        </StateMessage>
      </Frame>
    )
  }

  if (!hasPurchaseInvoiceModule(activeCompany)) {
    return (
      <Frame>
        <StateMessage
          icon={Lock}
          title="Purchase Invoice is not active for this company"
          action={
            <Button asChild variant="secondary">
              <Link to={ROUTES.PAYMENT}>View plans</Link>
            </Button>
          }
        >
          {activeCompany.comp_name} does not have the Purchase Invoice module. Ask the account owner, or add it to the
          company&apos;s plan.
        </StateMessage>
      </Frame>
    )
  }

  // A company switch starts a fresh document for the new company.
  return (
    <SalesInvoiceScreen
      key={activeCompanyId}
      company={activeCompany}
      title="Purchase Invoice"
      flow={PURCHASE_FLOW}
      history={PURCHASE_HISTORY}
      vouchers={PURCHASE_VOUCHERS}
      prefillRequest={prefillRequest}
    />
  )
}
