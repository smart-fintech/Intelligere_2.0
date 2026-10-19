import { AlertCircle, Building2, Lock } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { ROUTES } from '@/Constants/routes'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import SalesInvoiceScreen from '@/Modules/SalesInvoice/Components/SalesInvoiceScreen'
import { hasSalesInvoiceModule } from '@/Services/salesInvoiceService'
import { fetchCompanies, selectCompanyError, selectCompanyStatus } from '@/Store/Slices/companySlice'

/**
 * /modules/Sales Invoice - the Sales Invoice module.
 *
 * Who gets in is the active company's record from tally/user-companies-list/
 * (already in the store - nothing is fetched for it here):
 *
 *   still loading                    a skeleton - no answer is assumed
 *   no active company                pick one in the header first
 *   "Sales Invoice" not in its       the module is not part of this
 *   active_modules                   company's plan, with the way to Payment
 *   otherwise                        the screen - Create Document or History
 *
 * Which document types the company may make (premium_modules) is decided
 * inside the screen, per type - see getDocumentTypeAccess.
 */

function Frame({ children }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-brand sm:text-2xl">Sales Invoice</h1>
      <Card className="border-border/70">
        <CardContent className="px-4">{children}</CardContent>
      </Card>
    </div>
  )
}

export default function SalesInvoicePage() {
  const dispatch = useDispatch()
  const { activeCompany, activeCompanyId } = useActiveCompany()
  const status = useSelector(selectCompanyStatus)
  const error = useSelector(selectCompanyError)

  // A reload of the company list (the header's Refresh) keeps the screen - and
  // the invoice being typed - as long as the company is still there.
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
          Choose the company to invoice from in the header, then come back here.
        </StateMessage>
      </Frame>
    )
  }

  if (!hasSalesInvoiceModule(activeCompany)) {
    return (
      <Frame>
        <StateMessage
          icon={Lock}
          title="Sales Invoice is not active for this company"
          action={
            <Button asChild variant="secondary">
              <Link to={ROUTES.PAYMENT}>View plans</Link>
            </Button>
          }
        >
          {activeCompany.comp_name} does not have the Sales Invoice module. Ask the account owner, or add it to the
          company&apos;s plan.
        </StateMessage>
      </Frame>
    )
  }

  return <SalesInvoiceScreen key={activeCompanyId} company={activeCompany} />
}
