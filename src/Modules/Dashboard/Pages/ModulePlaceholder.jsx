import ComingSoon from '@/Components/Common/ComingSoon'
import { Card } from '@/Components/ui/card'
import { findModule } from '@/Constants/dashboardModules'
import ModuleLayout from '@/Modules/Dashboard/Components/ModuleLayout'

/**
 * The page behind every dashboard page that has not been built yet.
 *
 * ONE page serves Company, Ledger and Product details - the route says which:
 *
 *   <Route path={ROUTES.LEDGER_DETAILS} element={<ModulePlaceholder moduleKey="ledger" />} />
 *
 * The title and icon come from Constants/dashboardModules, the same list the
 * navigation bar is drawn from, so a placeholder page never has to be edited -
 * and when the page is built, its route simply stops pointing here.
 *
 * It is wrapped in the same ModuleLayout as Bank Details, so the navigation
 * and the company name stay exactly where the user just saw them.
 */
export default function ModulePlaceholder({ moduleKey }) {
  const page = findModule(moduleKey)

  // `moduleKey` is always a literal written in AppRoutes, so a miss here is a
  // typo rather than a state to design for - but a blank page would hide it.
  if (!page) return null

  return (
    <ModuleLayout title={page.label}>
      <Card className="border-border/70">
        <ComingSoon icon={page.icon} title={page.label} />
      </Card>
    </ModuleLayout>
  )
}
