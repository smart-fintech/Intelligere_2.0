import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useDispatch } from 'react-redux'

import { RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Loader } from '@/Components/Common/Loader'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { fetchCompanies } from '@/Store/Slices/companySlice'

import { PACKAGE_MODE, PLAN_STRUCTURE, formatINR } from '../pricing'
import { usePaymentPlan } from '../usePaymentPlan'
import { CompanyCounter } from './CompanyCounter'
import { CompanySelectDialog } from './CompanySelectDialog'
import { ModuleList } from './ModuleList'
import { OfferBanner } from './OfferBanner'
import { PackageModeSwitch } from './PackageModeSwitch'
import { PaymentSummary } from './PaymentSummary'
import { TierCards } from './TierCards'

/**
 * The Payment tab, in the layout of the old payment page: one card with the
 * package type, the package cards (or the MSME company count) and the
 * modules on the left, and the summary on the right. Cashfree at the end.
 *
 * Which of the two layouts is drawn - tier cards (Accounting Professional)
 * or a company counter (MSME) - follows the SHAPE of the price list for this
 * user (catalog.structure), not their user type.
 */
export function PaymentPlanner() {
  const dispatch = useDispatch()
  const plan = usePaymentPlan()
  const { allCompanies } = useActiveCompany()
  const [pickingCompanies, setPickingCompanies] = useState(false)

  // The shell loads the company list; this only makes sure it is there.
  useEffect(() => {
    dispatch(fetchCompanies())
  }, [dispatch])

  if (plan.status === 'loading') {
    return <Loader variant="page" label={plan.loadingLabel} />
  }
  console.info(plan)
  if (plan.status === 'failed') {
    return (
      <StateMessage
        icon={AlertCircle}
        tone="error"
        title="Pricing could not be shown"
        action={<RetryButton onClick={plan.retry} />}
      >
        {plan.error}
      </StateMessage>
    )
  }

  const { catalog, quote, selection, subscription } = plan
  const tiered = catalog.structure === PLAN_STRUCTURE.TIERS
  const premium = selection.mode === PACKAGE_MODE.PREMIUM
  const premiumAvailable = tiered ? catalog.tiers.some((tier) => tier.bundle) : Boolean(catalog.plan.bundle)
  const waitingForOffer = plan.offerStatus === 'loading' ? 'Checking available offers...' : null

  // The price under the MSME company card, as the old page showed it: the
  // Premium package per company (without add-ons such as Procurement, which
  // are charged on top), or the Custom total per year.
  const packageLine = quote.lines.find((line) => line.key === plan.plan?.bundle?.key)
  const counterPrice = premium
    ? formatINR(quote.companies && packageLine ? Math.round((packageLine.amount - quote.discount) / quote.companies) : 0)
    : quote.subtotal > 0
      ? formatINR(quote.subtotal)
      : ''

  // Payment: with companies, ask which to remove first (the dialog's
  // Continue calls checkout with those ids -> remove_company). With none,
  // straight to payment, removing nothing.
  const pay = () => {
    if (!allCompanies.length) plan.checkout([])
    else setPickingCompanies(true)
  }

  return (
    <div>
      <div className="grid gap-6 rounded-md border border-border/70 bg-card p-4 shadow-md sm:p-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] lg:gap-0">
        <div className="space-y-6 lg:pr-6">
          <OfferBanner offer={plan.offer} status={plan.offerStatus} />

          <PackageModeSwitch
            value={selection.mode}
            onChange={plan.setMode}
            lockedMode={plan.lockedMode}
            premiumAvailable={premiumAvailable}
          />

          {tiered && subscription && !selection.tierKey ? (
            <p className="text-center text-sm text-brand">
              You already have the largest package - there is no upgrade to buy.
            </p>
          ) : null}

          {tiered ? (
            <TierCards
              tiers={catalog.tiers}
              value={selection.tierKey}
              onChange={plan.setTierKey}
              mode={selection.mode}
              subscription={subscription}
              subtotal={quote.subtotal}
            />
          ) : (
            <CompanyCounter
              value={selection.quantity}
              onChange={plan.setQuantity}
              min={plan.minQuantity}
              price={counterPrice}
              unit={premium ? '/ Company / Year' : '/ Year'}
            />
          )}

          {plan.plan ? (
            <ModuleList
              modules={plan.plan.modules}
              mode={selection.mode}
              selectedKeys={selection.selectedKeys}
              optionChoices={selection.optionChoices}
              onToggle={plan.toggleModule}
              onChooseOption={plan.chooseOption}
              isLocked={plan.isLockedModule}
            />
          ) : null}
        </div>

        <div className="border-t border-brand/60 pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <PaymentSummary quote={quote} paying={plan.paying} waiting={waitingForOffer} onPay={pay} />
        </div>
      </div>

      {pickingCompanies ? (
        <CompanySelectDialog
          open
          onOpenChange={setPickingCompanies}
          companies={allCompanies}
          paying={plan.paying}
          onConfirm={plan.checkout}
        />
      ) : null}
    </div>
  )
}
