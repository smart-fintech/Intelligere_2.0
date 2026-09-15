import { findModule } from '@/Constants/dashboardModules'
import BankDetails from '@/Modules/Dashboard/Components/BankDetails'
import ModuleLayout from '@/Modules/Dashboard/Components/ModuleLayout'

/**
 * The Bank Details page: the navigation and heading from ModuleLayout, with
 * the bank list itself underneath.
 *
 * This page is deliberately thin. Everything about the accounts - loading
 * them, searching, adding, editing, deleting - belongs to BankDetails, so
 * that component can be dropped anywhere and this file has nothing to break.
 *
 * There is no `key` here any more. The data lives in the store, keyed on the
 * company it belongs to, so switching company reloads it without this page
 * having to force a remount - see Store/Slices/bankSlice.
 */
export default function BankDetailsPage() {
  const page = findModule('bank')

  return (
    <ModuleLayout title={page.label}>
      <BankDetails />
    </ModuleLayout>
  )
}
