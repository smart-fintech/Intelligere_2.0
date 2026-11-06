import { AlertCircle, Building2 } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Card, CardContent } from '@/Components/ui/card'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import ProcurementScreen from '@/Modules/Procurement/Components/ProcurementScreen'
import { fetchCompanies, selectCompanyError, selectCompanyStatus } from '@/Store/Slices/companySlice'

/**
 * /modules/Procurement Automation - Bids and Pre Bids.
 *
 *   still loading           a skeleton - no answer is assumed
 *   no active company       pick one in the header first
 *   otherwise               the screen, afresh for each company
 *
 * The plan is not checked here: what the company may create is the backend's
 * to say (its quota message is shown as it is sent).
 */

function Frame({ children }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-brand sm:text-2xl">Procurement Automation</h1>
      <Card className="border-border/70">
        <CardContent className="px-4">{children}</CardContent>
      </Card>
    </div>
  )
}

export default function ProcurementPage() {
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

  if (!activeCompany || activeCompanyId === null || activeCompanyId === undefined) {
    return (
      <Frame>
        <StateMessage icon={Building2} title="No company selected">
          Choose a company in the header, then come back here.
        </StateMessage>
      </Frame>
    )
  }

  return (
    <ProcurementScreen
      key={activeCompanyId}
      companyId={activeCompanyId}
      companyName={activeCompanyName}
    />
  )
}
