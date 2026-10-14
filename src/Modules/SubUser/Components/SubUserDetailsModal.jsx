/**
 * View Details - everything about one sub user, read-only:
 *
 *   Basic Details    name, email, designation, created date
 *   Company Access   one block per company it has, each with that company's
 *                    own role, warehouses, modules and permissions - never
 *                    mixed with another company's
 *
 * The screen that opens it mounts it only while open.
 *
 * Props:
 *   subUser    the row from SubUserList - its `access` is the companies,
 *              already read and named (getSubUserCompanies, resolveSubUserCompany)
 *   onClose()  X / Escape / Close
 */

import { DetailItem, DetailList, YesNo } from '@/Components/Common/DetailList'
import { fieldLabelClass } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import useWarehouseOptions from '@/Hooks/useWarehouseOptions'
import { formatLongDate } from '@/Utils/date'
import { ChipList } from './SubUserChips'

/** A heading over one part of the details, with an optional count after it. */
function SectionTitle({ meta, children }) {
  return (
    <h3 className="mb-2 text-sm font-semibold text-brand">
      {children}
      {meta ? <span className="font-normal text-muted-foreground"> {meta}</span> : null}
    </h3>
  )
}

/**
 * One company's block. The warehouses are named from that company's own list
 * (the same one the form offers); one that is not in it, or a list that could
 * not be read, shows the id it was saved with.
 */
function CompanyAccess({ access }) {
  const canName = access.warehouseIds.length > 0 && access.companyId !== null
  const warehouses = useWarehouseOptions(canName, access.companyId)

  const warehouseNames = access.warehouseIds.map(
    (id) => warehouses.options.find((option) => option.value === id)?.label ?? `ID ${id}`,
  )

  return (
    <section className="rounded-md border border-border">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border bg-muted/40 px-3 py-2">
        <p className="min-w-0 text-sm font-semibold break-words text-foreground">{access.name}</p>
        {access.companyId !== null ? (
          <p className="text-xs text-muted-foreground">Company ID: {access.companyId}</p>
        ) : null}
      </header>

      <DetailList className="grid-cols-1 rounded-none border-0">
        <DetailItem label="Role Name">{access.roleName}</DetailItem>
        <DetailItem label="Role Groups">
          <ChipList items={access.roleGroups} tone="outline" />
        </DetailItem>
        <DetailItem label="Warehouses">
          <ChipList items={warehouseNames} />
        </DetailItem>
        <DetailItem label="Active Modules">
          <ChipList items={access.activeModules} />
        </DetailItem>
        <DetailItem label="Premium Modules">
          <ChipList items={access.premiumModules} />
        </DetailItem>
      </DetailList>

      <div className="border-t border-border px-3 py-2">
        <p className={fieldLabelClass}>Permissions</p>
        {access.permissions.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted-foreground">--</p>
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {access.permissions.map((permission) => (
              <li key={permission.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">{permission.label}</span>
                <YesNo value={permission.enabled} yes="Enabled" no="Disabled" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default function SubUserDetailsModal({ subUser, onClose }) {
  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) onClose?.()
      }}
      title="Sub User Details"
      description={subUser.email || undefined}
      size="lg"
      autoFocus={false}
      footer={
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        <div>
          <SectionTitle>Basic Details</SectionTitle>
          <DetailList className="grid-cols-1">
            <DetailItem label="Name">{subUser.name}</DetailItem>
            <DetailItem label="Email">{subUser.email}</DetailItem>
            <DetailItem label="Designation">{subUser.designation}</DetailItem>
            <DetailItem label="Created Date">{formatLongDate(subUser.created_at)}</DetailItem>
          </DetailList>
        </div>

        <div>
          <SectionTitle meta={`(${subUser.access.length})`}>Company Access</SectionTitle>
          {subUser.access.length === 0 ? (
            <p className="text-sm text-muted-foreground">This sub user has not been given any company.</p>
          ) : (
            <div className="space-y-3">
              {subUser.access.map((access) => (
                <CompanyAccess key={access.key} access={access} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
