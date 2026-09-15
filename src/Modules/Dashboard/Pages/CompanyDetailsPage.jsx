import { findModule } from '@/Constants/dashboardModules'
import CompanyDetails from '@/Modules/Dashboard/Components/CompanyDetails'
import ModuleLayout from '@/Modules/Dashboard/Components/ModuleLayout'

/**
 * The Company Details page: the navigation and heading from ModuleLayout,
 * with the company form and list underneath. Deliberately thin, like
 * BankDetailsPage - everything about the companies belongs to CompanyDetails.
 */
export default function CompanyDetailsPage() {
  const page = findModule('company')

  return (
    <ModuleLayout title={page.label}>
      <CompanyDetails />
    </ModuleLayout>
  )
}
