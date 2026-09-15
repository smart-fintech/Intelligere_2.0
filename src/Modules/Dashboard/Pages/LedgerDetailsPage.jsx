import { findModule } from '@/Constants/dashboardModules'
import LedgerDetails from '@/Modules/Dashboard/Components/LedgerDetails'
import ModuleLayout from '@/Modules/Dashboard/Components/ModuleLayout'

/**
 * The Ledger Details page: the navigation and heading from ModuleLayout, with
 * the ledger list itself underneath. The same shape as BankDetailsPage.
 *
 * There is no `key` here any more. The data lives in the store, keyed on the
 * company it belongs to, so switching company reloads it without this page
 * having to force a remount - see Store/Slices/ledgerSlice.
 */
export default function LedgerDetailsPage() {
  const page = findModule('ledger')

  return (
    <ModuleLayout title={page.label}>
      <LedgerDetails />
    </ModuleLayout>
  )
}
