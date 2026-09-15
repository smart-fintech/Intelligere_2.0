import { Construction } from 'lucide-react'

import { cn } from '@/Library/utils'

/**
 * The placeholder for anything that has not been built yet.
 *
 * ONE component covers all of them - Company, Ledger and Product details all
 * render this, so there is no page to delete when a module is finished: its
 * route stops pointing at the placeholder and starts pointing at the real
 * page.
 *
 *   <ComingSoon icon={Building2} title="Company Details" />
 *
 * Props (both optional):
 *   icon       a lucide icon component. Defaults to the roadworks sign, so a
 *              caller with nothing particular to show still gets one.
 *   title      what is coming, shown above the message
 *   className  extra classes on the wrapper
 *
 * There is deliberately no `description` prop. The message below is the whole
 * point of the page; anything more would only be filler.
 */
export default function ComingSoon({ icon: Icon = Construction, title, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-16 text-center',
        className,
      )}
    >
      {/* The illustration: the module's own icon inside a soft brand disc,
          with a slow pulse behind it so it reads as artwork rather than as
          another button. */}
      <div className="relative mb-6 flex size-24 items-center justify-center rounded-full bg-brand-soft dark:bg-brand/15">
        <span className="absolute inset-0 animate-pulse rounded-full bg-brand/10" />
        <Icon className="relative size-10 text-brand" strokeWidth={1.5} />
      </div>

      {title ? (
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </p>
      ) : null}

      <h2 className="mt-1 text-2xl font-semibold text-brand">Coming Soon</h2>

      <p className="mt-2 text-sm text-muted-foreground">
        This module is currently under development.
      </p>
    </div>
  )
}
