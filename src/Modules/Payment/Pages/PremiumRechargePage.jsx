import { useState } from 'react'
import { AlertCircle, ArrowLeft, Building2, Check, History, Layers, Sparkles, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'

import { RetryButton, StateMessage } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'
import { Loader } from '@/Components/Common/Loader'
import { Modal } from '@/Components/Common/Modal'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { ROUTES } from '@/Constants/routes'
import { cn } from '@/Library/utils'

import { NumberStepper } from '../Components/NumberStepper'
import { OrderSummary } from '../Components/OrderSummary'
import { MAX_RECHARGE_COUNT, isWholeGroup } from '../premiumFeatures'
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
        {/* The old screen's line: the name, and the price under it -
            "E-Invoice" / "₹1 per unit", "GSTR 1" / "₹5 per filling". */}
        <p className="text-sm font-semibold text-foreground">{entry.label}</p>
        <p className="text-xs text-muted-foreground">
          {formatINR(entry.amount)} per {entry.unit ?? 'unit'}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <NumberStepper
          size="sm"
          value={count}
          onChange={onChange}
          min={0}
          max={MAX_RECHARGE_COUNT}
          label={`${entry.label} quantity`}
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
    <li className={cn('rounded-lg border p-3 transition-colors', checked ? 'border-brand/60 bg-brand-soft/60' : 'border-border/70 hover:border-brand/50')}>
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
 * A named list of documents priced one by one, with the backend's own price
 * for taking the whole list (Biz Doxs: nine documents at 300, or All at
 * 1500). "All <group>" and ticking every document are the same selection -
 * see premiumFeatures.isWholeGroup - so the All price is charged once, never
 * beside the individual ones.
 *
 * `included` are the documents the chosen Inventory Management package
 * already covers: they are shown ticked and marked "Included", cannot be
 * unticked, and are never charged (premiumFeatures.includedGroupKeys).
 */
function GroupPanel({ group, keys, included, onToggleItem, onToggleAll }) {
  const taken = group.items.filter((item) => keys.includes(item.key) || included.includes(item.key))
  const whole = isWholeGroup(group, [...keys, ...included])
  const allIncluded = group.items.every((item) => included.includes(item.key))
  const allId = `group-all-${group.key}`

  return (
    <Panel
      title={group.name}
      meta={`(${taken.length}/${group.items.length} selected)`}
      actions={
        group.bundle ? (
          <label
            htmlFor={allId}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors',
              allIncluded ? 'border-emerald-600/60 bg-emerald-50 dark:bg-emerald-950/30' : 'cursor-pointer',
              !allIncluded && (whole ? 'border-brand bg-brand-soft' : 'border-border/70 hover:border-brand/50'),
            )}
          >
            <Checkbox
              id={allId}
              checked={whole}
              disabled={allIncluded}
              onCheckedChange={allIncluded ? undefined : onToggleAll}
            />
            <span className="font-semibold">All {group.name}</span>
            <span className="font-semibold tabular-nums">
              {allIncluded ? 'Included' : formatINR(group.bundle.amount)}
            </span>
          </label>
        ) : null
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {group.items.map((item) => {
          const covered = included.includes(item.key)
          const checked = covered || keys.includes(item.key)
          const id = `group-${group.key}-${item.key}`

          return (
            <li
              key={item.key}
              className={cn(
                'flex items-center gap-2 rounded-lg border p-2.5 transition-colors',
                covered
                  ? 'border-emerald-600/50 bg-emerald-50 dark:bg-emerald-950/30'
                  : checked
                    ? 'border-brand/60 bg-brand-soft/60'
                    : 'border-border/70 hover:border-brand/50',
              )}
            >
              <Checkbox
                id={id}
                checked={checked}
                disabled={covered}
                onCheckedChange={covered ? undefined : () => onToggleItem(item)}
              />
              <label
                htmlFor={id}
                className={cn('min-w-0 flex-1 truncate text-sm font-medium', !covered && 'cursor-pointer')}
              >
                {item.name}
              </label>
              <span
                className={cn(
                  'shrink-0 text-sm font-semibold tabular-nums',
                  covered && 'text-emerald-700 dark:text-emerald-400',
                )}
              >
                {covered ? 'Included' : formatINR(item.amount)}
              </span>
            </li>
          )
        })}
      </ul>

      {allIncluded ? (
        <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-400">
          All {group.items.length} documents come with the package you chose - no extra charge.
        </p>
      ) : whole && group.bundle ? (
        <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-400">
          All {group.items.length} documents are charged once at {formatINR(group.bundle.amount)}.
        </p>
      ) : included.length ? (
        <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-400">
          {included.length} of them come with the package you chose - only the others are charged.
        </p>
      ) : null}
    </Panel>
  )
}

/** One package card in the dialog - everything on it is the price list's. */
function PackageCard({ pack, selected, onSelect }) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border p-4 shadow-sm transition-colors',
        selected ? 'border-brand bg-brand-soft/60 shadow-md' : 'border-border/70 bg-card hover:border-brand/50',
      )}
    >
      <h3 className="text-sm font-semibold tracking-wide text-brand uppercase">{pack.name}</h3>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {formatINR(pack.amount)}
        <span className="ml-1 text-sm font-normal text-muted-foreground">/ Year</span>
      </p>

      {/* The package this one builds on, named by the API's `includes`. */}
      {pack.includes ? (
        <p className="mt-3 rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium capitalize">
          Includes {pack.includes}
        </p>
      ) : null}

      {pack.features.length ? (
        <>
          <p className="mt-3 text-xs font-semibold text-muted-foreground">Features</p>
          <ul className="mt-1 space-y-1.5">
            {pack.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {pack.modules.length ? (
        <>
          <p className="mt-3 text-xs font-semibold text-muted-foreground">Modules</p>
          <ul className="mt-1 space-y-1">
            {pack.modules.map((module) => (
              <li key={module} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                <span>{module}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {pack.included.map((list) => (
        <div key={list.label} className="mt-3">
          <p className="text-xs font-semibold text-muted-foreground">{list.label}</p>
          <ul className="grid grid-cols-2 mt-1 space-y-1">
            {list.items.map((entry) => (
              <li key={entry} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                <span>{entry}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <Button
        type="button"
        className="mt-4 w-full"
        variant={selected ? 'default' : 'outline'}
        onClick={onSelect}
      >
        {selected ? 'Selected' : 'Select for payment'}
      </Button>
    </div>
  )
}

/**
 * A module sold in named packages (Inventory Management: Basic / Standard /
 * Gold). The packages open in a dialog; the one chosen becomes a line in the
 * summary and is the only package sent with the payment.
 */
function PackagesPanel({ item, choice, onChoose, onClear }) {
  const [open, setOpen] = useState(false)
  const chosen = item.packages.find((pack) => pack.key === choice) ?? null

  return (
    <Panel
      title={item.name}
      meta={`(${item.packages.length} packages)`}
      actions={
        <div className="flex gap-2">
          {chosen ? (
            <Button type="button" size="sm" variant="ghost" onClick={onClear}>
              Remove
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="default" icon={Layers} onClick={() => setOpen(true)}>
            {chosen ? 'Change package' : 'View packages'}
          </Button>
        </div>
      }
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors',
          chosen ? 'border-brand/60 bg-brand-soft/60' : 'border-border/70 hover:border-brand/50',
        )}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{chosen ? chosen.name : 'Choose a package'}</span>
          <span className="block text-xs text-muted-foreground">
            {chosen
              ? chosen.includes
                ? `Everything in ${chosen.includes}`
                : `${chosen.features.length} features`
              : item.packages.map((pack) => pack.name).join(' · ')}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {chosen ? formatINR(chosen.amount) : '—'}
        </span>
      </button>

      {open ? (
        <Modal open onOpenChange={setOpen} size="xxl" title={item.name} description="Choose the package to pay for.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {item.packages.map((pack) => (
              <PackageCard
                key={pack.key}
                pack={pack}
                selected={pack.key === choice}
                onSelect={() => {
                  onChoose(pack.key)
                  setOpen(false)
                }}
              />
            ))}
          </div>
        </Modal>
      ) : null}
    </Panel>
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
        <Button asChild variant="default" size="sm">
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
  } else if (!catalog.recharge.length && !catalog.groups.length && !catalog.packages.length && !catalog.addOns.length) {
    body = (
      <StateMessage icon={Sparkles} title="No premium features are currently available.">
        Check back later.
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

          {catalog.groups.map((group) => (
            <GroupPanel
              key={group.key}
              group={group}
              keys={recharge.groupKeys[group.key] ?? []}
              included={recharge.includedKeys[group.key] ?? []}
              onToggleItem={(item) => recharge.toggleGroupItem(group, item)}
              onToggleAll={() => recharge.toggleWholeGroup(group)}
            />
          ))}

          {catalog.packages.map((item) => (
            <PackagesPanel
              key={item.key}
              item={item}
              choice={recharge.packageChoices[item.key]}
              onChoose={(packageKey) => recharge.choosePackage(item, packageKey)}
              onClear={() => recharge.clearPackage(item)}
            />
          ))}

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
