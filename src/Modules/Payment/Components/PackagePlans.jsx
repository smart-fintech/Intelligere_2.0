import { useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Network,
  Printer,
  Receipt,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Warehouse,
} from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { cn } from '@/Library/utils'

import {
  ADDITIONAL_COMPANY_PRICE_PERCENT,
  MSME_INCLUDED_COMPANIES,
  formatINR,
  isProcurementModule,
  packagePriceFor,
  percentOf,
} from '../pricing'
import { NumberStepper } from './NumberStepper'
import { ProcurementUsage } from './ProcurementUsage'

/** A sanity ceiling for the counter - not a business limit. */
const MAX_COMPANIES = 10000

/**
 * WHICH PLAN CARRIES THE "MOST POPULAR" BADGE
 *
 * The price list says nothing about popularity, so this is a display rule of
 * the frontend's own: Inventory Management recommends Standard, Procurement
 * recommends Growth. Should either be renamed, it falls back to the second
 * cheapest plan of a package that has three or more, which is where both sit
 * today. Accounts Automation has no plans, so it has no badge.
 *
 * It is a recommendation and NOTHING else: it is there from the moment the
 * page opens, never changes with what the user has taken, ticks no box,
 * changes no price and never reaches the payload.
 */
const POPULAR_PLAN_NAMES = ['standard', 'growth']
const POPULAR_PLAN_INDEX = 1

const popularPlanKey = (plans = []) => {
  const named = plans.find((plan) => POPULAR_PLAN_NAMES.includes(String(plan.name ?? '').trim().toLowerCase()))
  if (named) return named.key
  return plans.length >= 3 ? plans[POPULAR_PLAN_INDEX]?.key ?? null : null
}

/** How much of a long list a card shows before "+ n more". */
const SHOWN_AT_FIRST_Biz_Dox = 2
const SHOWN_AT_FIRST_Modules = 2

/* ------------------------------------------------------------------ */
/* The small pieces every card is built from                          */
/* ------------------------------------------------------------------ */

/**
 * ONE LIST, USED FOR EVERY LIST
 *
 * Modules are drawn the same way wherever they appear - in Accounts
 * Automation and inside an Inventory package alike - because both go through
 * this one component: `chips` off gives the ticked two-column list the
 * modules use, `chips` on the wrapped chips the documents use. What a
 * package ENABLES is drawn differently again, by FeatureCards below, so the
 * three kinds of thing are never mistaken for one another.
 *
 * EVERY LIST OPENS AND CLOSES ON ITS OWN. The open/closed state lives here,
 * inside the component, so each list drawn has its own: opening Modules
 * leaves the documents as they were, and the other way round. A list that
 * fits shows no View More at all.
 */
function IncludedList({ title, items, chips = false }) {
  const [open, setOpen] = useState(false)

  if (!items?.length) return null

  const initialCount = chips
    ? SHOWN_AT_FIRST_Biz_Dox
    : SHOWN_AT_FIRST_Modules

  const shown = open ? items : items.slice(0, initialCount)
  const hidden = items.length - shown.length

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </p>

      {chips ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {shown.map((item) => (
            <li
              key={item}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-xs text-brand"
            >
              <Check className="size-3 shrink-0 text-emerald-600" />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 text-brand">
          {shown.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 || open ? (
        <button
          type="button"
          onClick={() => setOpen((shownAll) => !shownAll)}
          aria-expanded={open}
          className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          {open ? 'View Less' : `View More (${hidden})`}
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
      ) : null}
    </div>
  )
}

/**
 * A picture for a capability, chosen by what the backend called it - a
 * warehouse for a warehouse, people for users. It is only decoration: a
 * feature whose wording matches nothing here still gets a card, with the
 * last icon in the list.
 */
const FEATURE_ICONS = [
  [/warehouse|stock|inventor/i, Warehouse],
  [/user|department|team|multi/i, Users],
  [/forecast|intelligen|insight|health|analytic|report/i, TrendingUp],
  [/dox|invoice|voucher|document|order|challan|note/i, FileText],
  [/gst|tax|compare|reconcil/i, Receipt],
  [/print/i, Printer],
  [/distribut|network|integrat/i, Network],
  [/rfq|procure|purchase/i, Boxes],
  [/dashboard|statement|bank/i, BarChart3],
  [/./, Sparkles],
]

const featureIcon = (name) => FEATURE_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? Sparkles

/**
 * WHAT A PACKAGE ENABLES
 *
 * Capabilities - Multi Warehouse, Forecasting - read as small cards with a
 * picture each, so they are plainly a different kind of thing from the
 * modules and documents listed as chips. They stay small on purpose: the
 * prices above them are what the page is for.
 */
function FeatureCards({ title = 'Features', items }) {
  if (!items?.length) return null

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>

      <ul className="mt-2 grid grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = featureIcon(item)

          return (
            <li
              key={item}
              className="flex items-center gap-2 rounded-lg border border-brand/25 bg-brand-soft/40 p-2.5"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-brand">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 text-xs font-semibold text-brand">{item}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * How a plan's price was reached for the companies chosen. The big figure
 * itself now sits in the card's header, on the right; this is the working
 * under it, and only when there is any - up to MSME_INCLUDED_COMPANIES
 * there is nothing to add. Every figure is pricing.packagePriceFor, the
 * same function the quote and the payload use, never a second sum written
 * for the screen.
 */
function PriceNote({ amount, companies }) {
  const extra = Math.max(0, companies - MSME_INCLUDED_COMPANIES)
  const perCompany = percentOf(amount, ADDITIONAL_COMPANY_PRICE_PERCENT)

  if (!extra) {
    return <p className="mt-3 text-xs text-muted-foreground">Up to {MSME_INCLUDED_COMPANIES} companies included</p>
  }

  return (
    <dl className="mt-3 space-y-1 rounded-lg bg-muted/60 p-2.5 text-xs">
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">Base price</dt>
        <dd className="tabular-nums">{formatINR(amount)}</dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">
          {extra} additional × {formatINR(perCompany)}
        </dt>
        <dd className="tabular-nums">{formatINR(extra * perCompany)}</dd>
      </div>
      <div className="flex justify-between gap-2 border-t border-border pt-1 font-semibold">
        <dt>Total for {companies} companies</dt>
        <dd className="tabular-nums">{formatINR(packagePriceFor(amount, companies))}</dd>
      </div>
    </dl>
  )
}

/**
 * One card of the row: what it is on the left, what it costs on the right.
 * On a narrow screen the price wraps under the name instead of pushing it
 * out of the way. For a package sold in several plans the price shown is
 * the plan being read, named under the title.
 *
 * Being taken is said three ways, not by colour alone: the Selected badge in
 * the header, the ring around the card and the button's own words.
 *
 * `action` is how a package with nothing to choose inside it is taken
 * (Accounts Automation). It is drawn under the price and the line that says
 * what the price covers, where the other packages have their plans to tick -
 * so every card is taken at the same height, before its contents are read.
 * A package whose plans do the choosing passes none.
 *
 * The recommendation is not drawn here either: it belongs to a plan inside
 * the card, and is drawn on that plan's tile.
 */
function PackageCard({ step, title, subtitle, amount, companies, selected, action, children, footer, className }) {
  return (
    <div className={cn('relative h-full', className)}>
      <section
        className={cn(
          'flex h-full flex-col rounded-2xl border p-5 shadow-sm transition-all',
          selected
            ? 'border-brand ring-2 ring-brand/40 bg-brand-soft/30 shadow-md'
            : 'border-border/70 bg-card hover:border-brand/50 hover:shadow-md',
        )}
      >
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border pb-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-widest text-brand/70 uppercase">{step}</p>
            <h2 className="text-base font-bold tracking-wide text-brand uppercase">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>

          <div className="ml-auto shrink-0 text-right">
            {selected ? (
              <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-foreground">
                <CheckCircle2 className="size-3.5" /> Selected
              </span>
            ) : null}
            <p className="text-2xl tabular-nums text-brand sm:text-3xl">
              {formatINR(packagePriceFor(amount, companies))}
            </p>
            <p className="text-[11px] text-muted-foreground">/ Year +GST</p>
          {action ? <div>{action}</div> : null}
          </div>
        </header>

        <div className="flex-1">
          <PriceNote amount={amount} companies={companies} />
          {children}
        </div>

        {footer ? <div className="mt-5">{footer}</div> : null}
      </section>
    </div>
  )
}

/** The Select / Selected button every card ends with. */
function SelectButton({ selected, label, onClick }) {
  return (
    <button
      type="button"
      role="radio"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer rounded-xl ',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
      )}
    >

      <span
        className={cn(
          'mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-semibold',
          selected
            ? 'border-brand bg-brand text-brand-foreground'
            : 'border-border text-foreground',
        )}
      >
        {selected ? (
          <>
            <CheckCircle2 className="size-3.5" />
            Selected
          </>
        ) : (
          label
        )}
      </span>
    </button>
  )
}

/**
 * ONE PLAN TO CHOOSE FROM - Basic, or Growth.
 *
 * A plan INSIDE a package, never a package of its own, so it carries no
 * number: just its name, its price for the companies chosen and the Select
 * line at the foot, which lines up across the row because each tile is a
 * column of its own height. What a plan holds is read below the tiles, not
 * inside them. Clicking anywhere on it takes the plan; clicking the one
 * already taken lets it go.
 *
 * The Select line is a span, not a button - the tile itself is the button,
 * and a button inside a button is not allowed.
 */
function PlanTile({ id, name, label, price, caption, selected, popular, onSelect }) {
  // `name` may be drawn as an icon (the Unlimited plan), so the tick box
  // needs words of its own for screen readers.
  const text = label ?? (typeof name === 'string' ? name : 'Plan')

  return (
    <div className="relative h-full">
      {/* On the tile's top-right edge, outside it, so it takes no room from
          the plan and leaves every tile the same size. Drawn from which plan
          this is (popularPlanKey), never from whether it is ticked. */}
      {popular ? (
        <span className="absolute -top-2.5 -right-2 z-10 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold tracking-wide whitespace-nowrap text-brand-foreground uppercase shadow-md">
          <Star className="size-2.5 fill-current" />
          Most Popular
        </span>
      ) : null}

      <label
        htmlFor={id}
        className={cn(
          'flex h-full cursor-pointer flex-col rounded-xl border p-3 text-left transition-colors',
          selected
            ? 'border-brand ring-1 ring-brand/40 bg-brand-soft/60'
            : popular
              ? 'border-brand/50 bg-card hover:border-brand'
              : 'border-border/70 bg-card hover:border-brand/50',
        )}
      >
        <span className="flex items-center gap-2">
          {/* One plan at a time: ticking another lets the first go, which is
              the page's own rule (usePaymentPlan.choosePlan) - the box only
              asks for it. */}
          <Checkbox id={id} checked={selected} onCheckedChange={onSelect} aria-label={text} />

          <span className="truncate text-sm font-bold tracking-wide text-brand uppercase">{name}</span>
        </span>

        <span className="mt-1 block text-lg text-brand">{price}</span>

        {caption ? <span className="block text-xs text-muted-foreground">{caption}</span> : null}
      </label>
    </div>
  )
}

/**
 * WHAT THE PLAN BEING READ HOLDS
 *
 * Below the tiles, never inside them: the tiles stay short enough to
 * compare, and everything about one plan - its features, its modules, its
 * documents - is read in one place that changes with the plan. What the
 * plan carries over from a smaller one is said once, in the Package
 * includes line above. Sections with nothing in them are not drawn.
 */
function SelectedDetails({ features, lists }) {
  return (
    <div className="mt-4 rounded-xl border border-border/70 bg-muted/30 p-4">
      <FeatureCards items={features} />

      {/* Each list says which form it takes - modules the same ticked list
          Accounts Automation uses, documents the chips - and each opens and
          closes on its own. */}
      {lists.map((list) => (
        <IncludedList key={list.title} title={list.title} items={list.items} chips={list.chips} />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The three kinds of card                                            */
/* ------------------------------------------------------------------ */

/**
 * Accounts Automation: one price for everything listed on it. Nothing to
 * choose inside it, so it is the compact card of the row - its modules and
 * documents are the same chips the Inventory packages use, and its capability
 * cards the same as theirs.
 */
function SinglePackage({ section, step, selected, companies, onToggle }) {
  return (
    <PackageCard
      step={step}
      title={section.heading}
      amount={section.amount}
      companies={companies}
      selected={selected}
      // className="md:col-span-2 lg:col-span-1"
      // The button is read under the price now, not at the foot of the card:
      // footer={<SelectButton selected={selected} label="Select Package" onClick={() => onToggle(section)} />}
      //
      // Nothing to choose inside this package, so taking it IS the choice -
      // drawn under the price, where the other packages have their plans.
      action={<SelectButton selected={selected} label="Select Package" onClick={() => onToggle(section)} />}
    >
      <FeatureCards items={section.features} />
      <IncludedList title="Included modules" items={section.modules} chips={false} />
      {section.included.map((list) => (
        <IncludedList key={list.label} title={list.label} items={list.items} chips />
      ))}
    </PackageCard>
  )
}

/**
 * Inventory Management: Basic | Standard | Gold.
 *
 * Three tiles of the same shape to compare and choose from, and under them
 * everything the chosen one holds. Clicking a tile takes that package -
 * clicking it again lets it go - and the panel below follows, so the user
 * reads the detail of what they picked rather than wading through all three
 * before picking anything. `preview` only remembers which panel to show
 * after a package is let go; what is charged is the page's own selection.
 */
function PackagesPackage({ section, step, choice, companies, onChoose }) {
  const [preview, setPreview] = useState(choice ?? section.packages[0]?.key ?? null)
  const shown =
    section.packages.find((pack) => pack.key === (choice ?? preview)) ?? section.packages[0]
  if (!shown) return null

  const take = (pack) => {
    setPreview(pack.key)
    onChoose(section, pack.key)
  }

  return (
    <PackageCard
      step={step}
      title={section.heading}
      subtitle={choice ? `${shown.name} selected` : 'Choose a plan'}
      amount={shown.amount}
      companies={companies}
      selected={Boolean(choice)}
    >
      {/* Three plans to a row inside one column of the row - the packages all
          share the same width, so this stays a small block. */}
      <div aria-label={section.heading} className="mt-5 grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
        {section.packages.map((pack) => (
          <PlanTile
            key={pack.key}
            id={`plan-${section.key}-${pack.key}`}
            name={pack.name}
            price={formatINR(packagePriceFor(pack.amount, companies))}
            selected={choice === pack.key}
            popular={pack.key === popularPlanKey(section.packages)}
            onSelect={() => take(pack)}
          />
        ))}
      </div>

      {/* What the package being read carries over from the one below it -
          Standard includes Basic, Gold includes Standard. It follows the
          selection, is kept out of the tiles so they stay a plain price
          comparison, and is drawn only from the API's `includes`: a package
          that carries none (Basic) shows nothing here. */}
      {shown.includes ? (
        <div className="mt-4 rounded-lg border border-border/70 p-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Package includes</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {/* <span className="font-semibold">{shown.name}</span> */}
            <span className="text-muted-foreground">includes</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 font-medium capitalize">
              <Check className="size-3 text-emerald-600" />
              {shown.includes}
            </span>
          </p>
        </div>
      ) : null}

      {/* What the plan being read holds. The name and the price are on its
          tile already, so they are not repeated here. */}
      <SelectedDetails
        features={shown.features}
        lists={[
          // The modules in the same form Accounts Automation draws them,
          // the documents as their own chips - and each with its own
          // View More.
          { title: 'Modules', items: shown.modules, chips: false },
          ...shown.included.map((list) => ({ title: list.label, items: list.items, chips: true })),
        ]}
      />
    </PackageCard>
  )
}

/** Procurement: Starter | Growth | Business | Unlimited, one of them taken. */
function OptionsPackage({ section, step, choice, companies, onChoose }) {
  const [preview, setPreview] = useState(choice ?? section.plans[0]?.key ?? null)
  const shown = section.plans.find((plan) => plan.key === (choice ?? preview)) ?? section.plans[0]
  if (!shown) return null

  const take = (plan) => {
    setPreview(plan.key)
    onChoose(section, plan.key)
  }

  return (
    <PackageCard
      step={step}
      title={section.heading}
      subtitle={choice ? `${shown.name} selected` : 'Choose a plan'}
      amount={shown.amount}
      companies={companies}
      selected={Boolean(choice)}
    >
      {/* Two plans to a row, so four of them read as a small block inside
          this column rather than a strip across it. */}
      <div aria-label={section.heading} className="mt-5 grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
        {section.plans.map((plan) => (
          <PlanTile
            key={plan.key}
            id={`plan-${section.key}-${plan.key}`}
            name={plan.name}
            price={formatINR(packagePriceFor(plan.amount, companies))}
            caption={plan.limit === null ? 'Unlimited' : `Up to ${plan.limit}`}
            selected={choice === plan.key}
            popular={plan.key === popularPlanKey(section.plans)}
            onSelect={() => take(plan)}
          />
        ))}
      </div>

      {/* What the package holds, once. The plan taken is said by its own
          tick box, so nothing about it is repeated down here. */}
      <IncludedList title="Modules" items={section.modules} chips={false} />
      {section.included.map((list) => (
        <IncludedList key={list.label} title={list.label} items={list.items} chips />
      ))}
    </PackageCard>
  )
}

/**
 * HOW MANY COMPANIES EVERY PLAN IS BOUGHT FOR
 *
 * One count for the whole page, with Payment beside it: the count prices
 * every card, and paying is the next thing to do once the packages are
 * chosen. The first MSME_INCLUDED_COMPANIES come with a plan's price, and
 * each one above them costs ADDITIONAL_COMPANY_PRICE_PERCENT of it.
 *
 * The button only OPENS the payment details - what it costs is read there,
 * and the order is created from that dialog, not here.
 *
 * `issues` are the quote's own words for why this selection cannot be
 * bought yet (pricing.calculatePackageQuote): nothing taken, two packages
 * that cannot go together, and so on. They are said HERE, under the row
 * whose button they hold back, and nowhere else - not on the package cards,
 * which are what the user is still choosing from, and not in the payment
 * dialog, which never opens while there are any.
 */
function CompanyCount({ companies, min, onChange, onPay, paying, payBlocked, payLabel = 'Pay Now', issues = [] }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <div className="text-center sm:text-left">
            <h2 className="flex items-center justify-center gap-2 text-base font-semibold text-foreground sm:justify-start">
              <Building2 className="size-4 text-brand" />
              Company Count
            </h2>
            <p className="text-xs text-muted-foreground">
              First {MSME_INCLUDED_COMPANIES} included · each extra at {ADDITIONAL_COMPANY_PRICE_PERCENT}% of the
              plan price
            </p>
          </div>

          <div className="flex items-center gap-2">
            <NumberStepper
              value={companies}
              onChange={onChange}
              min={min}
              max={MAX_COMPANIES}
              label="Number of companies"
            />
            <span className="text-sm font-medium text-muted-foreground">
              {companies === 1 ? 'Company' : 'Companies'}
            </span>
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          className="w-full sm:w-auto"
          loading={paying}
          disabled={payBlocked}
          onClick={onPay}
        >
          {payLabel}
        </Button>
      </div>

      {issues.length ? (
        <ul className="mt-3 space-y-1 border-t border-border pt-3">
          {issues.map((issue) => (
            <li key={issue} className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0" />
              {issue}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* The page                                                           */
/* ------------------------------------------------------------------ */

/**
 * THE MSME PLANS - one row to compare, one card per package
 *
 * The price list sends whole plans, each named by the backend, in one of
 * three shapes (pricing.parseSection):
 *
 *   single     one price for everything in it   Accounts Automation
 *   packages   named packages, ONE chosen       Inventory Management
 *   options    numbered plans, ONE chosen       Procurement
 *
 * Each becomes ONE card, side by side on a wide screen so the packages can
 * be compared at a glance; a package sold in several plans keeps them
 * INSIDE its card and is given the wider column, since it carries the most.
 * Every card reads the same way: what it is on the left, what it costs on
 * the right.
 *
 * The sections are independent - any, all or none can be taken. Nothing
 * here knows a package name or a price: it draws what buildCatalog parsed,
 * and every figure comes from pricing, never from a sum done here.
 */
export function PackagePlans({
  sections,
  selection,
  companies,
  minCompanies = 1,
  onCompaniesChange,
  onToggleSection,
  onChoosePlan,
  procurementUsage = [],
  onPay,
  paying,
  payBlocked,
  payLabel,
  issues = [],
}) {
  // Shown under the row: it belongs to Procurement, but it is a record of
  // what the user holds, not a plan on sale, and would crowd the card.
  const usage = sections.some(isProcurementModule) ? procurementUsage : []

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-brand sm:text-3xl">
          Choose the Plan
        </h1>
        <p className="mx-auto mt-1 max-w-2xl text-sm text-muted-foreground">
          Start with the tools you need and scale as your business grows.
        </p>
      </header>

      {/*
        THREE COLUMNS OF THE SAME WIDTH
        One card per package, side by side on a wide screen, two up on a
        tablet, stacked on a phone. The count and the payment button sit
        under them, where the choosing ends.
      */}
      <CompanyCount
        companies={companies}
        min={minCompanies}
        onChange={onCompaniesChange}
        onPay={onPay}
        paying={paying}
        payBlocked={payBlocked}
        payLabel={payLabel}
        issues={issues}
      />
      <div className="grid items-stretch gap-5 pt-3 md:grid-cols-2 lg:grid-cols-3">
        {sections.map((section, index) => {
          const step = `Package ${index + 1}`
          const choice = selection[section.key]

          if (section.kind === 'single') {
            return (
              <SinglePackage
                key={section.key}
                section={section}
                step={step}
                selected={Boolean(choice)}
                companies={companies}
                onToggle={onToggleSection}
              />
            )
          }

          if (section.kind === 'packages') {
            return (
              <PackagesPackage
                key={section.key}
                section={section}
                step={step}
                choice={choice}
                companies={companies}
                onChoose={onChoosePlan}
              />
            )
          }

          return (
            <OptionsPackage
              key={section.key}
              section={section}
              step={step}
              choice={choice}
              companies={companies}
              onChoose={onChoosePlan}
            />
          )
        })}
      </div>

      <ProcurementUsage records={usage} />

    </div>
  )
}
