import { AlertCircle, Building2, Lock } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { ROUTES } from '@/Constants/routes'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { useAccessScope } from '@/Hooks/useSectionAccess'
import DocuVaultScreen from '@/Modules/DocuVault/Components/DocuVaultScreen'
import { hasDocuVaultModule } from '@/Services/DocuVault/docuVaultService'
import { fetchCompanies, selectCompanyError, selectCompanyStatus } from '@/Store/Slices/companySlice'

/**
 * /modules/DocuVault - the DocuVault module.
 *
 * Who gets in is decided as for the other product modules, from the active
 * company's record (already in the store):
 *
 *   still loading                     a skeleton - no answer is assumed
 *   no active company                 pick one in the header first
 *   "Repository" not in its           the module is not part of this
 *   active_modules                    company's plan, with the way to Payment
 *   otherwise                         the screen, afresh for each company
 */

function Frame({ children }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-brand sm:text-2xl">DocuVault</h1>
      <Card className="border-border/70">
        <CardContent className="px-4">{children}</CardContent>
      </Card>
    </div>
  )
}

export default function DocuVaultPage() {
  const dispatch = useDispatch()
  const { activeCompany, activeCompanyName } = useActiveCompany()
  const { subUser } = useAccessScope()
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

  if (!hasDocuVaultModule(activeCompany)) {
    return (
      <Frame>
        <StateMessage
          icon={Lock}
          title="DocuVault is not active for this company"
          action={
            <Button asChild variant="secondary">
              <Link to={ROUTES.PAYMENT}>View plans</Link>
            </Button>
          }
        >
          {activeCompany.comp_name} does not have the DocuVault module. Ask the account owner, or add it to the
          company&apos;s plan.
        </StateMessage>
      </Frame>
    )
  }

  return <DocuVaultScreen key={activeCompanyName} companyName={activeCompanyName} subUser={subUser} />
}
