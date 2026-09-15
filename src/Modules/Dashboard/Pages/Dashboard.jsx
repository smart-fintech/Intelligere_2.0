import { Card } from '@/Components/ui/card'
import { Tooltip } from '@/Components/ui/tooltip'
import {
  MODULE_STATUS,
  PRODUCT_MODULES,
  findModule,
} from '@/Constants/dashboardModules'
import ModuleLayout from '@/Modules/Dashboard/Components/ModuleLayout'
import { cn } from '@/Library/utils'

/**
 * Modules & Features - the landing page after signing in, and the first tab
 * in the dashboard navigation.
 *
 * It lists the twelve product features (Bank Statement, GST Compare, and so
 * on) from Constants/dashboardModules. These are NOT the pages in the
 * navigation bar above them - see the note at the top of that file.
 *
 * Nothing here names a feature or hardcodes a status: a card shows the Coming
 * Soon badge purely because its `status` says so, and its tooltip is its
 * `description`, which is why both are an edit to that list and no change at
 * all in this file.
 */

/** One feature card: icon, name, and its status. */
function FeatureCard({ module }) {
  const Icon = module.icon
  const available = module.status === MODULE_STATUS.AVAILABLE

  return (
    // The app's shared tooltip, the same one the header buttons use.
    <Tooltip text={module.description}>
      <Card
        // Focusable so a keyboard user can reach the tooltip too.
        tabIndex={0}
        className={cn(
          'gap-0 border-border/70 p-4 transition-all duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          // A released feature will be clickable one day, so it gets the lift;
          // one that is still coming stays flat and slightly faded.
          available ? 'hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md' : 'opacity-90',
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-lg',
              available
                ? 'bg-brand-soft text-brand dark:bg-brand/15'
                : 'bg-muted text-muted-foreground',
            )}
          >
            <Icon className="size-5" strokeWidth={1.75} />
          </span>

          <div className="min-w-0">
            <h2 className="text-sm font-medium text-foreground">{module.name}</h2>

            {available ? (
              <span className="mt-1.5 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                Available
              </span>
            ) : (
              <span className="mt-1.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                Coming Soon
              </span>
            )}
          </div>
        </div>
      </Card>
    </Tooltip>
  )
}

export default function Dashboard() {
  const page = findModule('home')

  return (
    <ModuleLayout title={page.label}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {PRODUCT_MODULES.map((module) => (
          <FeatureCard key={module.key} module={module} />
        ))}
      </div>
    </ModuleLayout>
  )
}
