import { findModule } from '@/Constants/dashboardModules'
import InventoryDetails from '@/Modules/Dashboard/Components/InventoryDetails'
import ModuleLayout from '@/Modules/Dashboard/Components/ModuleLayout'

/**
 * The Inventory Details page: the navigation and heading from ModuleLayout,
 * with the inventory tabs underneath. Deliberately thin, like the Bank and
 * Ledger pages - everything about the tabs belongs to InventoryDetails.
 */
export default function InventoryDetailsPage() {
  const page = findModule('inventory')

  return (
    <ModuleLayout title={page.label}>
      <InventoryDetails />
    </ModuleLayout>
  )
}
