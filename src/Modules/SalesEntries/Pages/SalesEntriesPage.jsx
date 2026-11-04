import { AlertCircle, Building2, Lock } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { ROUTES } from '@/Constants/routes'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import SalesEntriesScreen from '@/Modules/SalesEntries/Components/SalesEntriesScreen'
import { hasSalesEntriesModule } from '@/Services/salesEntriesService'
import { fetchCompanies, selectCompanyError, selectCompanyStatus } from '@/Store/Slices/companySlice'

/**
 * /modules/Sales Entries - the Sales Entries module.
 *
 * Who gets in is decided as for the other product modules, from the active
 * company's record (already in the store):
 *
 *   still loading                     a skeleton - no answer is assumed
 *   no active company                 pick one in the header first
 *   "Sales Entries" (the plans' "Sales  the module is not part of this
 *   Inventory") not in active_modules company's plan, with the way to Payment
 *   otherwise                         the screen, afresh for each company
 */

function Frame({ children }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-brand sm:text-2xl">Sales Entries</h1>
      <Card className="border-border/70">
        <CardContent className="px-4">{children}</CardContent>
      </Card>
    </div>
  )
}

export default function SalesEntriesPage() {
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

  if (!hasSalesEntriesModule(activeCompany)) {
    return (
      <Frame>
        <StateMessage
          icon={Lock}
          title="Sales Entries is not active for this company"
          action={
            <Button asChild variant="secondary">
              <Link to={ROUTES.PAYMENT}>View plans</Link>
            </Button>
          }
        >
          {activeCompany.comp_name} does not have the Sales Entries module. Ask the account owner, or add it to the
          company&apos;s plan.
        </StateMessage>
      </Frame>
    )
  }

  return <SalesEntriesScreen key={activeCompanyId} companyId={activeCompanyId} companyName={activeCompanyName} />
}
