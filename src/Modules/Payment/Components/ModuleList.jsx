import { useState } from 'react'
import { CircleCheck, CircleX, Infinity as InfinityIcon } from 'lucide-react'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'

import { PACKAGE_MODE, formatINR } from '../pricing'
import { CountBadge } from './TierCards'

/** The old page's filled icons: a green tick for "in", a red cross for "out". */
const Tick = () => <CircleCheck aria-hidden="true" className="size-4 shrink-0 fill-green-700 text-white" />
const Cross = () => <CircleX aria-hidden="true" className="size-4 shrink-0 fill-red-600 text-white" />

/** One cell of the three-column list, with the old page's blue rule under it. */
function Cell({ className, children }) {
  return <li className={cn('border-b border-brand pt-1 pb-3', className)}>{children}</li>
}

/**
 * A module priced by option (Procurement: 100 / 250 / Unlimited). As on the
 * old page it is a title you click; the options open in a dialog as circle
 * cards, and the one chosen is shown under the title.
 */
function OptionModule({ module, checked, choice, onChoose, onClear }) {
  const [open, setOpen] = useState(false)
  const chosen = module.options.find((option) => option.key === choice)

  return (
    <Cell className="text-center">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer text-sm font-bold text-brand underline-offset-4 hover:underline"
      >
        {module.name}
      </button>
      <span className="block text-xs text-muted-foreground">
        {checked && chosen ? `${chosen.label} · ${formatINR(chosen.amount)}` : 'Click to choose a plan'}
      </span>

      {open ? (
        <Modal
          open
          onOpenChange={setOpen}
          size="xl"
          title={module.name}
          footer={
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onClear()
                  setOpen(false)
                }}
              >
                Clear
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </>
          }
        >
          <div className="w-full">
            <h4 className="mb-2 font-semibold text-gray-800 m-0 p-0">
              Typical Procurement Categories
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-1 ">
              {[
                "Raw materials",
                "Packaging materials",
                "Engineering consumables",
                "Job work and subcontracting",
                "Transportation and logistics",
                "Capital equipment",
                "Maintenance and repair items",
                "Annual rate contracts",
              ].map((category, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 text-sm text-gray-700"
                >
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />
                  <span>{category}</span>
                </div>
              ))}
            </div>
          </div>
          <div role="radiogroup" aria-label={`${module.name} plan`} className="grid grid-cols-2 gap-x-3 gap-y-10 pt-8 md:grid-cols-3 lg:grid-cols-5">
            {module.options.map((option) => {
              const selected = checked && option.key === choice

              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChoose(option.key)}
                  className={cn(
                    'relative cursor-pointer rounded-md border px-3 pt-10 pb-4 text-center shadow-sm transition-colors outline-none',
                    'focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    selected
                      ? 'border-brand bg-brand-soft'
                      : 'border-border/60 bg-card hover:border-brand',
                  )}
                >
                  <CountBadge selected={selected}>
                    {option.quantity !== null ? (
                      option.quantity
                    ) : option.key.toLowerCase() === 'unlimited' ? (
                      <InfinityIcon className="size-6" />
                    ) : (
                      <span className="text-xs">{option.label}</span>
                    )}
                  </CountBadge>

                  <span className="block text-lg text-brand">
                    {option.label}
                  </span>

                  <span className="mt-2 block border-t border-brand pt-2 text-sm font-semibold text-foreground">
                    {formatINR(option.amount)}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {option.quantity !== null ?
                      <>
                        {formatINR(option.amount / option.quantity)}  per procurement event
                      </> :
                      <>
                        Enjoy Unlimited procurement event
                      </>}
                  </span>
                </button>
              )
            })}
          </div>
        </Modal>
      ) : null}
    </Cell>
  )
}

/**
 * The "Modules" box of the old payment page: a grey header strip and the
 * modules of the chosen plan in three columns.
 *
 *   Premium  every module ticked - they all come with the price. Add-ons
 *            priced by option (Procurement) are chosen here too, charged on top
 *   Custom   click a module's icon to take it in or out; its price sits
 *            beside it, green once it is in
 *
 * What is listed and what it costs is the plan's, from the price list.
 */
export function ModuleList({ modules, mode, selectedKeys, optionChoices, onToggle, onChooseOption, isLocked }) {
  const premium = mode === PACKAGE_MODE.PREMIUM
  const shown = modules

  return (
    <section className="rounded-md border border-border/70 bg-card p-2 shadow-xs">
      <h2 className="border-b border-border bg-muted py-1.5 text-center text-lg text-brand">Modules</h2>

      {shown.length ? (
        <ul className="grid grid-cols-1 gap-x-8 gap-y-3 px-2 pt-3 pb-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((module) => {
            const checked = selectedKeys.includes(module.key)

            if (premium && module.kind !== 'options') {
              return (
                <Cell key={module.key}>
                  <span className="flex items-center gap-2 text-sm text-brand">
                    <Tick />
                    {module.name}
                  </span>
                </Cell>
              )
            }

            if (module.kind === 'options') {
              return (
                <OptionModule
                  key={module.key}
                  module={module}
                  checked={checked}
                  choice={optionChoices[module.key]}
                  onChoose={(optionKey) => onChooseOption(module, optionKey)}
                  onClear={() => {
                    if (checked) onToggle(module)
                  }}
                />
              )
            }

            const locked = isLocked(module)
            return (
              <Cell key={module.key}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={locked}
                  title={locked ? 'Already in your plan' : undefined}
                  onClick={() => onToggle(module)}
                  className="flex w-full cursor-pointer items-center gap-2 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default"
                >
                  {checked ? <Tick /> : <Cross />}
                  <span className="text-brand">{module.name}</span>
                  <span className={cn('ml-1 whitespace-nowrap', checked ? 'text-green-700' : 'text-brand')}>
                    {formatINR(module.amount)}
                  </span>
                </button>
              </Cell>
            )
          })}
        </ul>
      ) : (
        <p className="px-2 py-4 text-center text-sm text-muted-foreground">This package has no modules listed.</p>
      )}
    </section>
  )
}
