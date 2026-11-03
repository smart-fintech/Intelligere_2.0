import { useState } from 'react'
import { AlertCircle, Building2, Lock } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { ROUTES } from '@/Constants/routes'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import GstCompareScreen from '@/Modules/GstCompare/Components/GstCompareScreen'
import { hasActiveModule } from '@/Services/accessService'
import { fetchCompanies, selectCompanyError, selectCompanyStatus } from '@/Store/Slices/companySlice'

/** The module's name in `active_modules` - its key in PRODUCT_MODULES. */
const GST_COMPARE_MODULE = 'GST Compare'

function Frame({ children }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-brand sm:text-2xl">GST Compare</h1>
      <Card className="border-border/70">
        <CardContent className="px-4">{children}</CardContent>
      </Card>
    </div>
  )
}

/**
 * /modules/GST Compare - compares the purchase ledger with the GST portal.
 *
 * Who gets in is decided as for Purchase Invoice, from the active company's
 * record (already in the store):
 *
 *   still loading                a skeleton - no answer is assumed
 *   no active company            pick one in the header first
 *   "GST Compare" not in its     the module is not part of this company's
 *   active_modules               plan, with the way to Payment
 *   otherwise                    the screen
 */
export default function GstComparePage() {
  const dispatch = useDispatch()
  const { activeCompany, activeCompanyId } = useActiveCompany()
  const status = useSelector(selectCompanyStatus)
  const error = useSelector(selectCompanyError)
  // Start over: a new key is a brand new screen, with nothing carried across.
  const [run, setRun] = useState(0)

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
          Choose the company to compare in the header, then come back here.
        </StateMessage>
      </Frame>
    )
  }

  if (!hasActiveModule(activeCompany, GST_COMPARE_MODULE)) {
    return (
      <Frame>
        <StateMessage
          icon={Lock}
          title="GST Compare is not active for this company"
          action={
            <Button asChild variant="secondary">
              <Link to={ROUTES.PAYMENT}>View plans</Link>
            </Button>
          }
        >
          {activeCompany.comp_name} does not have the GST Compare module. Ask the account owner, or add it to the
          company&apos;s plan.
        </StateMessage>
      </Frame>
    )
  }

  // A company switch starts over for the new company.
  return (
    <GstCompareScreen
      key={`${activeCompanyId}-${run}`}
      company={activeCompany}
      companyId={activeCompanyId}
      onRestart={() => setRun((current) => current + 1)}
    />
  )
}
