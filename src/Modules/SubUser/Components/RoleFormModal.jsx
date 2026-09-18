/**
 * Create Role / Edit Role - one modal, two modes:
 *
 *   role = null    CREATE   empty fields    POST { company, ...fields }
 *   role = {...}   EDIT     filled from it  PUT  { role_obj_id, role_id, ...fields }
 *
 * The form's fields are role_name, under_role, payment_permission and
 * role_group. The list API still names the first two role_name and
 * under_role, so an edited row is mapped in explicitly (the form's initialiser).
 *
 * The screen that opens it mounts it only while open (and with a `key` per
 * role), so each opening starts from the right values with no effect.
 *
 * Props:
 *   role        the row being edited, or null to create one
 *   roles       the roles already loaded for the table - the Under Role
 *               options come from their under_role, so nothing is fetched here
 *   companyId   the active company - what a new role is filed under
 *   onSaved()   after a successful save: the list reloads, the modal closes
 *   onClose()   X / Escape / Cancel
 */

import { useState } from 'react'

import { Modal } from '@/Components/Common/Modal'
import { Field, FieldError, FieldLabel, FormGrid, SelectField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { Label } from '@/Components/ui/label'
import { toast } from '@/Library/toast'
import { ROLE_GROUPS, createCompanyRole, updateCompanyRole } from '@/Services/roleService'

const FORM_ID = 'role-form'

/** The top of every hierarchy: always the first Under Role, and a new role's default. */
const OWNER_ROLE = 'Owner'

const isOwner = (name) => name.trim().toLowerCase() === OWNER_ROLE.toLowerCase()

/**
 * The Under Role options: Owner first, then every roles[].role_name, each
 * name once (Owner is never repeated).
 */
const buildUnderRoleOptions = (roles = []) => {
  const names = roles
    .map((entry) => (typeof entry?.role_name === 'string' ? entry.role_name.trim() : ''))
    .filter((name) => name && !isOwner(name))
  return [OWNER_ROLE, ...new Set(names)]
}

export default function RoleFormModal({ role, roles = [], companyId, onSaved, onClose }) {
  const editing = Boolean(role)

  // API row -> form: role_name is the Role Name, under_role the Under Role.
  const [form, setForm] = useState(() => ({
    role_name: role?.role_name ?? '',
    under_role: role?.under_role?.trim() || OWNER_ROLE,
    payment_permission:
      role?.payment_permission === null || role?.payment_permission === undefined
        ? ''
        : String(role.payment_permission),
    role_group: Array.isArray(role?.role_group) ? role.role_group : [],
  }))
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // The fixed options, plus any group an existing role already has that is
  // not among them - so it is shown ticked and can be unticked.
  const groupOptions = [...ROLE_GROUPS, ...form.role_group.filter((group) => !ROLE_GROUPS.includes(group))]

  // From the table's roles; the value being edited is kept even if it is no
  // longer among them, so the select can still show it.
  const underRoleOptions = buildUnderRoleOptions(roles)
  if (!underRoleOptions.includes(form.under_role)) underRoleOptions.push(form.under_role)

  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  const toggleGroup = (group, checked) =>
    setField(
      'role_group',
      checked ? [...form.role_group, group] : form.role_group.filter((entry) => entry !== group),
    )

  const validate = () => {
    const found = {}
    if (!form.role_name.trim()) found.role_name = 'Role name is required'
    if (!form.under_role) found.under_role = 'Please select an under role'
    // if (form.payment_permission === '' || Number(form.payment_permission) < 0) {
    //   found.payment_permission = 'Enter a payment permission of 0 or more'
    // }
    if (form.role_group.length === 0) found.role_group = 'Select at least one role group'
    return found
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    if (!editing && !companyId) {
      toast.error('Select a company before creating a role.')
      return
    }

    const fields = {
      role_name: form.role_name.trim(),
      under_role: form.under_role,
      payment_permission: Number(form.payment_permission),
      role_group: form.role_group,
    }

    setSubmitting(true)
    try {
      const response = editing
        ? await updateCompanyRole({ role_obj_id: role.role_obj_id, role_id: role.role_id, ...fields })
        : await createCompanyRole({ company: companyId, ...fields })

      toast.success(response?.msg || (editing ? 'Role updated successfully.' : 'Role created successfully.'))
      onSaved?.()
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next && !submitting) onClose?.()
      }}
      title={editing ? 'Edit Role' : 'Create Role'}
      size="md"
      closeOnBackdropClick={!submitting}
      closeOnEsc={!submitting}
      showCloseButton={!submitting}
      footer={
        <>
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={submitting}>
            {submitting ? 'Saving...' : editing ? 'Update' : 'Create Role'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-3">
        <FormGrid>
          <Field
            id="role_name"
            label="Role Name"
            required
            type="text"
            value={form.role_name}
            error={errors.role_name}
            disabled={submitting}
            onChange={(e) => setField('role_name', e.target.value)}
          />

          <SelectField
            id="under_role"
            label="Under Role"
            required
            placeholder="Select Under Role"
            value={form.under_role}
            error={errors.under_role}
            disabled={submitting}
            onValueChange={(value) => setField('under_role', value)}
            options={underRoleOptions.map((name) => ({ value: name, label: name }))}
          />

          <Field
            id="payment_permission"
            label="Payment Permission"
            required
            inputMode="numeric"
            min={0}
            value={form.payment_permission}
            // error={errors.payment_permission}
            // disabled={submitting}
            onChange={(e) => setField('payment_permission', e.target.value.replace(/\D/g, ''))}
          />
        </FormGrid>

        {/* Several groups can be picked - the API takes an array. */}
        <div className="space-y-1.5">
          <FieldLabel required>Role Group</FieldLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {groupOptions.map((group) => {
              const inputId = `role-group-${group}`
              return (
                <div key={group} className="flex items-center gap-2">
                  <Checkbox
                    id={inputId}
                    checked={form.role_group.includes(group)}
                    disabled={submitting}
                    onCheckedChange={(checked) => toggleGroup(group, checked === true)}
                  />
                  <Label htmlFor={inputId} className="font-normal">
                    {group}
                  </Label>
                </div>
              )
            })}
          </div>
          <FieldError id="role_group-error">{errors.role_group}</FieldError>
        </div>
      </form>
    </Modal>
  )
}
