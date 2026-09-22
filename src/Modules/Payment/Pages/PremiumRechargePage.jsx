import { AlertCircle, ArrowLeft, Building2, Clock, History, Sparkles, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'

import { RetryButton, StateMessage } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'
import { Loader } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { ROUTES } from '@/Constants/routes'
import { cn } from '@/Library/utils'

import { NumberStepper } from '../Components/NumberStepper'
import { OrderSummary } from '../Components/OrderSummary'
import { MAX_RECHARGE_COUNT } from '../premiumFeatures'
import { formatINR } from '../pricing'
import { usePremiumRecharge } from '../usePremiumRecharge'

/** One counted feature: its unit price, how many, and what that costs. */
function RechargeRow({ entry, count, onChange }) {
  return (
    <li
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors',
        count > 0 && 'bg-brand-soft/50',
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{entry.feature}</p>
        <p className="text-xs text-muted-foreground">
          {formatINR(entry.amount)} / {entry.unit ?? 'unit'}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <NumberStepper
          size="sm"
          value={count}
          onChange={onChange}
          min={0}
          max={MAX_RECHARGE_COUNT}
          label={`${entry.feature} quantity`}
        />
        <span className="w-24 text-right text-sm font-semibold tabular-nums">
          {count > 0 ? formatINR(entry.amount * count) : '—'}
        </span>
      </div>
    </li>
  )
}

/** One add-on bought once: a tick, and a choice when it has options. */
function AddOnRow({ item, checked, choice, onToggle, onChoose }) {
  const id = `addon-${item.key}`
  return (
    <li className={cn('rounded-lg border p-3 transition-colors', checked ? 'border-brand/60 bg-brand-soft/60' : 'border-border/70')}>
      <div className="flex items-start gap-3">
        <Checkbox id={id} className="mt-0.5" checked={checked} onCheckedChange={onToggle} />
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm font-semibold capitalize">
          {item.name}
        </label>
        {item.kind === 'flat' ? (
          <span className="shrink-0 text-sm font-semibold">
            {formatINR(item.amount)}
            <span className="text-xs font-normal text-muted-foreground"> / year</span>
          </span>
        ) : null}
      </div>

      {item.kind === 'options' ? (
        <div role="radiogroup" aria-label={`${item.name} option`} className="mt-2 flex flex-wrap gap-2 pl-7">
          {item.options.map((option) => {
            const selected = choice === option.key
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChoose(option.key)}
                className={cn(
                  'cursor-pointer rounded-lg border px-3 py-1.5 text-left text-xs transition-colors outline-none',
                  'focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  selected ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:border-brand/50',
                )}
              >
                <span className="block font-semibold">{option.label}</span>
                <span className="block text-muted-foreground">{formatINR(option.amount)} / year</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </li>
  )
}

/**
 * /payment/premium-feature - recharge premium features (E-Invoice, E-Way
 * Bill, GST filings ...) for one company. Reached from the Premium Features
 * card on the Dashboard; separate from the package payment at /payment.
 *
 * What is on sale and at what price comes from payment/priceList/; the
 * company defaults to the one the user is working in.
 */
export default function PremiumRechargePage() {
  const recharge = usePremiumRecharge()
  const { catalog, quote, company } = recharge

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-brand sm:text-2xl">
          <Zap className="size-5" /> Premium Feature Recharge
        </h1>
        <p className="text-sm text-muted-foreground">Top up usage-based features for a company.</p>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={`${ROUTES.PAYMENT}?tab=history&history=premium`}>
            <History /> Premium history
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to={ROUTES.DASHBOARD}>
            <ArrowLeft /> Dashboard
          </Link>
        </Button>
      </div>
    </div>
  )

  let body
  if (recharge.status === 'loading') {
    body = <Loader variant="page" label="Loading premium features..." />
  } else if (recharge.status === 'failed') {
    body = (
      <StateMessage
        icon={AlertCircle}
        tone="error"
        title="Premium features could not be loaded"
        action={<RetryButton onClick={recharge.retry} />}
      >
        {recharge.error}
      </StateMessage>
    )
  } else if (!catalog.recharge.length && !catalog.addOns.length) {
    body = (
      <StateMessage icon={Sparkles} title="No premium features are currently available.">
        {catalog.comingSoon.length
          ? `${catalog.comingSoon.map((item) => item.name).join(', ')} coming soon.`
          : 'Check back later.'}
      </StateMessage>
    )
  } else {
    body = (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
            {recharge.companies.length ? (
              <SelectField
                id="recharge-company"
                label="Company"
                icon={Building2}
                placeholder="Select a company"
                value={company ? String(company.company_id) : undefined}
                onValueChange={(value) => {
                  const picked = recharge.companies.find((entry) => String(entry.company_id) === value)
                  if (picked) recharge.setCompanyId(picked.company_id)
                }}
                options={recharge.companies.map((entry) => ({
                  value: String(entry.company_id),
                  label: entry.comp_name || `Company ${entry.company_id}`,
                }))}
                searchable={recharge.companies.length > 8}
                className="max-w-md"
              />
            ) : (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="size-4" />
                Add a company first - premium features are bought for a company.
              </p>
            )}
          </div>

          {catalog.recharge.length ? (
            <Panel title="Usage features" meta="pay per use">
              <ul className="-mx-4 divide-y divide-border">
                {catalog.recharge.map((entry) => (
                  <RechargeRow
                    key={entry.key}
                    entry={entry}
                    count={recharge.counts[entry.id] ?? 0}
                    onChange={(value) => recharge.setCount(entry.id, value)}
                  />
                ))}
              </ul>
            </Panel>
          ) : null}

          {catalog.addOns.length ? (
            <Panel title="Add-ons" meta="priced per year">
              <ul className="grid gap-3 sm:grid-cols-2">
                {catalog.addOns.map((item) => (
                  <AddOnRow
                    key={item.key}
                    item={item}
                    checked={recharge.addOnKeys.includes(item.key)}
                    choice={recharge.optionChoices[item.key]}
                    onToggle={() => recharge.toggleAddOn(item)}
                    onChoose={(optionKey) => recharge.chooseOption(item, optionKey)}
                  />
                ))}
              </ul>
            </Panel>
          ) : null}

          {catalog.comingSoon.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" />
              {catalog.comingSoon.map((item) => (
                <span key={item.key} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                  {item.name} · Coming Soon
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <OrderSummary
          title="Recharge Summary"
          facts={[['Company', company?.comp_name || '--']]}
          quote={quote}
          paying={recharge.paying}
          onPay={recharge.checkout}
          payLabel="Pay Now"
          note="GST included"
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      {header}
      {body}
    </div>
  )
}
