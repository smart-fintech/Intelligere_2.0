import ComingSoon from '@/Components/Common/ComingSoon'
import { Card } from '@/Components/ui/card'

/**
 * A whole page for a sidebar link whose feature is not built yet - every
 * product module, Payment and Create Sub User, for now.
 *
 *   <Route path={module.path} element={<ComingSoonPage title={module.name} icon={module.icon} />} />
 *
 * The title and icon are handed in from the same config the sidebar is drawn
 * from, so this page never names a module. When the real page is built, its
 * route stops pointing here - there is nothing in this file to delete.
 *
 * Unlike ModulePlaceholder it has no Details bar on top: these are product
 * pages, not the dashboard's Details pages.
 *
 * Props:
 *   title  the page heading
 *   icon   a lucide icon component
 */
export default function ComingSoonPage({ title, icon }) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-brand sm:text-2xl">{title}</h1>

      <Card className="border-border/70">
        <ComingSoon icon={icon} title={title} />
      </Card>
    </div>
  )
}
