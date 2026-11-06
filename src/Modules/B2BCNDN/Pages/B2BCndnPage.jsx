import { AlertCircle, Building2, Lock } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { ROUTES } from '@/Constants/routes'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import B2BCndnScreen from '@/Modules/B2BCNDN/Components/B2BCndnScreen'
import { hasB2BCndnModule } from '@/Services/Accounting/b2bCndnService'
import { fetchCompanies, selectCompanyError, selectCompanyStatus } from '@/Store/Slices/companySlice'

/**
 * /modules/B2B/CNDN - the B2B / CNDN module.
 *
 * Who gets in is decided as for the other product modules, from the active
 * company's record (already in the store):
 *
 *   still loading                      a skeleton - no answer is assumed
 *   no active company                  pick one in the header first
 *   neither "B2B Entries" nor "Credit  the module is not part of this
 *   Note Debit Note" in active_modules company's plan, with the way to Payment
 *   otherwise                          the screen, afresh for each company
 */

function Frame({ children }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-brand sm:text-2xl">B2B / CNDN</h1>
      <Card className="border-border/70">
        <CardContent className="px-4">{children}</CardContent>
      </Card>
    </div>
  )
}

export default function B2BCndnPage() {
  const dispatch = useDispatch()
  const { activeCompany, activeCompanyId, activeCompanyName } = useActiveCompany()
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
          Choose a company in the header, then come back here.
        </StateMessage>
      </Frame>
    )
  }

  if (!hasB2BCndnModule(activeCompany)) {
    return (
      <Frame>
        <StateMessage
          icon={Lock}
          title="B2B / CNDN is not active for this company"
          action={
            <Button asChild variant="secondary">
              <Link to={ROUTES.PAYMENT}>View plans</Link>
            </Button>
          }
        >
          {activeCompany.comp_name} does not have the B2B or Credit Note Debit Note module. Ask the account owner, or add it to the company&apos;s plan.
        </StateMessage>
      </Frame>
    )
  }

  return <B2BCndnScreen key={activeCompanyId} company={activeCompany} companyId={activeCompanyId} companyName={activeCompanyName} />
}
