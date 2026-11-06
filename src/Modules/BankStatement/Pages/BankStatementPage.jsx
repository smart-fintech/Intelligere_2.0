import { useEffect, useState } from 'react'
import { AlertCircle, Building2, Landmark, Lock } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { ROUTES } from '@/Constants/routes'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import BankStatementScreen from '@/Modules/BankStatement/Components/BankStatementScreen'
import { hasActiveModule } from '@/Services/Auth/accessService'
import { fetchBankOptions, fetchBanks, selectBankError, selectBankStatus, selectBanks, selectBanksCompanyId } from '@/Store/Slices/bankSlice'
import { fetchCompanies, selectCompanyError, selectCompanyStatus } from '@/Store/Slices/companySlice'
import { fetchLedgers } from '@/Store/Slices/ledgerSlice'

/** The module's name in `active_modules` - its key in PRODUCT_MODULES. */
const BANK_STATEMENT_MODULE = 'Bank Statement'

function Frame({ children }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-brand sm:text-2xl">Bank Statement</h1>
      <Card className="border-border/70">
        <CardContent className="px-4">{children}</CardContent>
      </Card>
    </div>
  )
}

/**
 * /modules/Bank Statement - reads a bank statement into vouchers and sends
 * them to Tally (or verifies them, for any other ERP).
 *
 * Who gets in is decided as for GST Compare, from the active company's
 * record (already in the store):
 *
 *   still loading                a skeleton - no answer is assumed
 *   no active company            pick one in the header first
 *   "Bank Statement" not in its  the module is not part of this company's
 *   active_modules               plan, with the way to Payment
 *   no bank account yet          the way to Bank Details
 *   otherwise                    the screen
 *
 * The company's bank accounts and ledgers come from the same store as Bank
 * Details and Ledger Details - nothing is fetched twice.
 */
export default function BankStatementPage() {
  const dispatch = useDispatch()
  const { activeCompany, activeCompanyId } = useActiveCompany()
  const status = useSelector(selectCompanyStatus)
  const error = useSelector(selectCompanyError)
  const banks = useSelector(selectBanks)
  const bankStatus = useSelector(selectBankStatus)
  const bankError = useSelector(selectBankError)
  const banksFor = useSelector(selectBanksCompanyId)
  // Start over: a new key is a brand new screen, with nothing carried across.
  const [run, setRun] = useState(0)

  const allowed = Boolean(activeCompany) && hasActiveModule(activeCompany, BANK_STATEMENT_MODULE)

  useEffect(() => {
    if (!allowed || !activeCompanyId) return
    dispatch(fetchBanks({ companyId: activeCompanyId }))
    dispatch(fetchLedgers({ companyId: activeCompanyId }))
    dispatch(fetchBankOptions())
  }, [allowed, activeCompanyId, dispatch])

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
          Choose the company whose statement this is in the header, then come back here.
        </StateMessage>
      </Frame>
    )
  }

  if (!allowed) {
    return (
      <Frame>
        <StateMessage
          icon={Lock}
          title="Bank Statement is not active for this company"
          action={
            <Button asChild variant="secondary">
              <Link to={ROUTES.PAYMENT}>View plans</Link>
            </Button>
          }
        >
          {activeCompany.comp_name} does not have the Bank Statement module. Ask the account owner, or add it to the
          company&apos;s plan.
        </StateMessage>
      </Frame>
    )
  }

  const banksReady = bankStatus === 'succeeded' && banksFor === activeCompanyId

  if (bankStatus === 'failed' && banksFor !== activeCompanyId) {
    return (
      <Frame>
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load the bank accounts"
          action={<RetryButton onClick={() => dispatch(fetchBanks({ companyId: activeCompanyId, force: true }))} />}
        >
          {bankError}
        </StateMessage>
      </Frame>
    )
  }

  if (!banksReady) {
    return (
      <Frame>
        <ListSkeleton rows={6} />
      </Frame>
    )
  }

  if (banks.length === 0) {
    return (
      <Frame>
        <StateMessage
          icon={Landmark}
          title="No bank account yet"
          action={
            <Button asChild variant="secondary">
              <Link to={ROUTES.BANK_DETAILS}>Add a bank account</Link>
            </Button>
          }
        >
          A statement is read into one of {activeCompany.comp_name}&apos;s bank accounts. Add the account in Bank
          Details first.
        </StateMessage>
      </Frame>
    )
  }

  // A company switch starts over for the new company.
  return (
    <BankStatementScreen
      key={`${activeCompanyId}-${run}`}
      company={activeCompany}
      companyId={activeCompanyId}
      banks={banks}
      onRestart={() => setRun((current) => current + 1)}
    />
  )
}
