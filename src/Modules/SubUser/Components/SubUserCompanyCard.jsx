/**
 * ONE company a sub user is given, inside the Create Sub User modal: which
 * company, and that company's own role, warehouses, modules and permissions.
 *
 * Everything offered here belongs to the chosen company and to no other:
 *
 *   roles            its roles                    useCompanyRoles - only for
 *                    a company with "Multi Department" (canAssignRole); any
 *                    other has no Role Name field and its roles are not read
 *   warehouses       its warehouses               useWarehouseOptions
 *   Active Modules   its `active_modules`         the company record itself
 *   Premium Modules  its `premium_modules`        the company record itself,
 *                    all but Inventory Management
 *   Permissions      the fixed list - the same for every company, except
 *                    Product Details: only for a company with Inventory
 *                    Management, which it sends up when ticked
 *                    (getCompanyPermissions)
 *
 * The card holds no form state: `config` is this company's part of the form
 * (createCompanyConfig), kept by SubUserFormModal under the company's id, so
 * choosing another company here shows that company's own choices.
 *
 * The company's user plan ("Single User" / "Multi User", from its `features`)
 * is shown beside its name. It is not enforced here: how many sub users a
 * plan allows is checked by the backend when the sub user is created.
 *
 * ------------------------------------------------------------------
 * IT OPENS AND CLOSES
 * ------------------------------------------------------------------
 * The header - the company's name, and a chevron at its right - opens and
 * closes the fields beneath it; a click anywhere on it does. Closed, it says
 * in one line what has been chosen (the role, how many modules), and marks a
 * block that still has something to put right.
 *
 * Closing takes the FIELDS off the screen, not the card: the choices are the
 * form's (`config`), and the roles and warehouses stay loaded, so opening it
 * again shows everything as it was and asks the backend nothing.
 *
 * Props:
 *   index            the card's place in the form, from 0 - its heading
 *   idPrefix         unique per card, so two cards never share a field id
 *   company          the chosen company's record, or null
 *   companyOptions   [{ value, label }] - the companies this card may choose
 *   config           the chosen company's choices
 *   errors           { company, roleName }
 *   disabled         the form is being saved
 *   open             whether the fields are showing
 *   onToggle()       the header was clicked
 *   onCompanyChange(companyId)   another company was chosen
 *   onChange(patch)              some of `config` changed
 *   onRemove()                   take this company out; absent on the only card
 */

import { AlertCircle, ChevronDown, Trash2 } from 'lucide-react'
import { Collapsible } from 'radix-ui'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { FieldError, FieldLabel, FormGrid, SelectField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { Label } from '@/Components/ui/label'
import useCompanyRoles from '@/Hooks/useCompanyRoles'
import useWarehouseOptions from '@/Hooks/useWarehouseOptions'
import {
  canAssignRole,
  getCompanyModules,
  getCompanyPermissions,
  getCompanyUserPlan,
  isSingleUserCompany,
} from '@/Services/subUserService'
import { cn } from '@/Library/utils'
import { Chip } from './SubUserChips'

/** A list of names as the choices of a CheckboxGroup. */
const asOptions = (names) => names.map((name) => ({ value: name, label: name }))

/**
 * A labelled grid of checkboxes over a list of `{ value, label }`, with
 * Select all / Clear all once there is more than one. `selected` is the
 * ticked values; `emptyText` is what an empty list says instead.
 */
function CheckboxGroup({ idPrefix, label, required, options, selected, onChange, disabled, error, emptyText }) {
  const values = options.map((option) => option.value)
  const allSelected = values.every((value) => selected.includes(value))

  const toggle = (value, checked) =>
    onChange(checked ? [...selected, value] : selected.filter((entry) => entry !== value))

  const toggleAll = () =>
    onChange(
      allSelected
        ? selected.filter((entry) => !values.includes(entry))
        : [...new Set([...selected, ...values])],
    )

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <FieldLabel required={required}>{label}</FieldLabel>
        {options.length > 1 ? (
          <Button type="button" variant="link" size="xs" disabled={disabled} onClick={toggleAll}>
            {allSelected ? 'Clear all' : 'Select all'}
          </Button>
        ) : null}
      </div>

      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {options.map((option, index) => {
            const inputId = `${idPrefix}-${index}`
            return (
              <div key={option.value} className="flex items-center gap-2">
                <Checkbox
                  id={inputId}
                  checked={selected.includes(option.value)}
                  disabled={disabled}
                  onCheckedChange={(checked) => toggle(option.value, checked === true)}
                />
                <Label htmlFor={inputId} className="font-normal">
                  {option.label}
                </Label>
              </div>
            )
          })}
        </div>
      )}

      <FieldError id={`${idPrefix}-error`}>{error}</FieldError>
    </div>
  )
}

export default function SubUserCompanyCard({
  index,
  idPrefix,
  company,
  companyOptions,
  config,
  errors = {},
  disabled,
  open,
  onToggle,
  onCompanyChange,
  onChange,
  onRemove,
}) {
  const companyId = company?.company_id ?? null

  // Roles are this company's to give only with Multi Department - without
  // it there is no field, and nothing is asked of the backend.
  const withRole = canAssignRole(company)
  const userPlan = getCompanyUserPlan(company)

  const roles = useCompanyRoles(withRole ? companyId : null)
  const warehouses = useWarehouseOptions(Boolean(companyId), companyId)
  const modules = getCompanyModules(company)

  // Each role name once; the one already chosen is kept even if the company
  // no longer has it, so the select can still show it.
  const roleNames = [...new Set(roles.roles.map((role) => role.role_name).filter(Boolean))]
  if (config.roleName && !roleNames.includes(config.roleName)) roleNames.push(config.roleName)

  const noRoles = roles.status === 'ready' && roleNames.length === 0

  // What the closed header says of the choices: the role where there is one,
  // and how many of the company's own modules are ticked.
  const summary = company
    ? [
        withRole && config.roleName,
        `${modules.active.filter((name) => config.activeModules.includes(name)).length} active`,
        `${modules.premium.filter((name) => config.premiumModules.includes(name)).length} premium`,
      ]
        .filter(Boolean)
        .join(' \u00b7 ')
    : 'Open to choose a company'

  const needsAttention = Object.values(errors).some(Boolean)

  return (
    // A bordered block, not a card: it sits inside the modal, which is one already.
    <Collapsible.Root asChild open={open} onOpenChange={onToggle}>
      <section id={idPrefix} className="overflow-hidden rounded-md border border-border">
        {/* The whole header opens and closes the block. The name is the real
            button (keyboard, screen readers); a click anywhere else on the
            header does the same, except on Remove, which is its own button. */}
        <header
          className="flex min-h-11 cursor-pointer items-center gap-2 bg-muted/40 px-3 py-1.5 transition-colors hover:bg-muted/70"
          onClick={(event) => {
            if (!event.target.closest('button')) onToggle?.()
          }}
        >
          <Collapsible.Trigger className="min-w-0 flex-1 cursor-pointer rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <span className="block truncate text-sm font-semibold text-brand">
              <span className="font-normal text-muted-foreground">Company {index + 1}: </span>
              {company ? company.comp_name : 'No company selected'}
            </span>
            {open ? null : <span className="block truncate text-xs text-muted-foreground">{summary}</span>}
          </Collapsible.Trigger>

          {!open && needsAttention ? (
            <span className="flex shrink-0 items-center gap-1 text-xs text-destructive">
              <AlertCircle className="size-3.5" />
              <span className="hidden sm:inline">Needs attention</span>
            </span>
          ) : null}

          {userPlan ? <Chip tone="outline" className="hidden shrink-0 sm:inline-block">{userPlan}</Chip> : null}

          {onRemove ? (
            <Button
              type="button"
              variant="iconDelete"
              size="icon-sm"
              icon={Trash2}
              tooltip="Remove company"
              aria-label={`Remove ${company?.comp_name || `company ${index + 1}`}`}
              disabled={disabled}
              onClick={onRemove}
            />
          ) : null}

          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 shrink-0 text-brand transition-transform duration-200', open && 'rotate-180')}
          />
        </header>

        <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="space-y-4 border-t border-border p-3">
            {userPlan ? (
              <p className="text-xs text-muted-foreground sm:hidden">Plan: {userPlan}</p>
            ) : null}

            {roles.status === 'failed' ? (
              <InlineAlert action={<RetryButton onClick={roles.retry} />}>
                Could not load this company&apos;s roles: {roles.error}
              </InlineAlert>
            ) : null}

            <FormGrid>
              <SelectField
                id={`${idPrefix}-company`}
                label="Company"
                required
                placeholder="Select Company"
                searchable
                searchPlaceholder="Search company..."
                value={companyId === null ? '' : String(companyId)}
                error={errors.company}
                disabled={disabled}
                onValueChange={onCompanyChange}
                options={companyOptions}
              />

              {withRole ? (
                <SelectField
                  id={`${idPrefix}-role`}
                  label="Role Name"
                  required
                  placeholder={
                    roles.status === 'loading'
                      ? 'Loading roles...'
                      : noRoles
                        ? 'No roles in this company'
                        : 'Select Role'
                  }
                  value={config.roleName}
                  error={
                    errors.roleName ||
                    (noRoles ? 'This company has no roles yet. Create one under Role first.' : undefined)
                  }
                  disabled={disabled || roleNames.length === 0}
                  onValueChange={(roleName) => onChange({ roleName })}
                  options={asOptions(roleNames)}
                />
              ) : null}
            </FormGrid>

            {isSingleUserCompany(company) ? (
              <p className="text-xs text-muted-foreground">
                This company is on the Single User plan. Whether it can take another sub user is checked when you
                save.
              </p>
            ) : null}

            {company ? (
              <>
                {warehouses.status === 'failed' ? (
                  <InlineAlert action={<RetryButton onClick={warehouses.retry} />}>
                    Could not load this company&apos;s warehouses: {warehouses.error}
                  </InlineAlert>
                ) : (
                  <CheckboxGroup
                    idPrefix={`${idPrefix}-warehouse`}
                    label="Warehouse"
                    options={warehouses.options}
                    selected={config.warehouseIds}
                    disabled={disabled}
                    emptyText={
                      warehouses.status === 'loading' ? 'Loading warehouses...' : 'This company has no warehouses.'
                    }
                    onChange={(warehouseIds) => onChange({ warehouseIds })}
                  />
                )}

                <CheckboxGroup
                  idPrefix={`${idPrefix}-active`}
                  label="Active Modules"
                  options={asOptions(modules.active)}
                  selected={config.activeModules}
                  disabled={disabled}
                  emptyText="This company has no active modules."
                  onChange={(activeModules) => onChange({ activeModules })}
                />

                <CheckboxGroup
                  idPrefix={`${idPrefix}-premium`}
                  label="Premium Modules"
                  options={asOptions(modules.premium)}
                  selected={config.premiumModules}
                  disabled={disabled}
                  emptyText="This company has no premium modules."
                  onChange={(premiumModules) => onChange({ premiumModules })}
                />

                <CheckboxGroup
                  idPrefix={`${idPrefix}-permission`}
                  label="Permissions"
                  options={asOptions(getCompanyPermissions(company))}
                  selected={config.permissions}
                  disabled={disabled}
                  onChange={(permissions) => onChange({ permissions })}
                />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select a company to set its warehouses, modules and permissions.
              </p>
            )}
          </div>
        </Collapsible.Content>
      </section>
    </Collapsible.Root>
  )
}
