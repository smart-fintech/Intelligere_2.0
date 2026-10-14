/**
 * Create Sub User - the modal behind the button above the sub user list:
 * ONE account, given to one or more of the parent user's companies.
 *
 *   User Details   email, password, name, designation - entered once; they
 *                  belong to the account, not to a company
 *   Add Company    above the company blocks; adds another block under the
 *                  last, for a company not yet on the form
 *   Company 1..n   one block per company (SubUserCompanyCard), each with its
 *                  own role, warehouses, modules and permissions. A role is
 *                  asked for only where the company can give one - see
 *                  canAssignRole
 *
 * The screen that opens it mounts it only while open, so every opening
 * starts from an empty form. A save that fails leaves the modal open with
 * everything still in it.
 *
 * ------------------------------------------------------------------
 * HOW THE COMPANIES ARE KEPT
 * ------------------------------------------------------------------
 *   rows      the blocks, in order: [{ key, companyId, open }] - `open` is
 *             whether the block's fields are showing. The first starts open
 *             and an added one closed; a block that fails validation is
 *             opened, so what has to be put right is never out of sight
 *   configs   what was chosen for each company, by its company_id
 *
 * The choices are filed under the COMPANY, not under the block. So changing a
 * block from company A to company B shows B's own (empty) choices - nothing
 * of A's carries over - and A's are still there if the block goes back to it.
 * A company can be on one block only: the others do not offer it.
 *
 * The companies are the store's list (useActiveCompany), the same one the
 * rest of the app reads; nothing is fetched here but a Retry after a failure.
 * The first block starts on the active company.
 *
 * Saving is POST useraccount/register/ - see subUserService for the body.
 *
 * ------------------------------------------------------------------
 * EDIT
 * ------------------------------------------------------------------
 * The same form, started from a sub user of the list (getSubUserEditValues):
 * one block per company it has, the first open. Email, name and designation
 * are shown but cannot be changed, and there is no password. Companies can
 * still be added, changed and removed. A company of the sub user's that is
 * not in the user's own list cannot be shown; it is said so above the blocks,
 * and sent back as it was.
 *
 * The blocks are built once the companies are in, as they are what a block
 * is matched to. Saving is PUT useraccount/subuser_list/
 * (buildSubUserUpdatePayload).
 *
 * Props:
 *   mode        'create' (the default) or 'edit'
 *   subUser     edit: the record from the list, as the API sent it
 *   onSaved()   after a successful save: the list reloads, the modal closes
 *   onClose()   X / Escape / Cancel
 */

import { useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { AlertCircle, Briefcase, Building2, Mail, Plus, User } from 'lucide-react'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Field, FormGrid, PasswordField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { toast } from '@/Library/toast'
import { findCompanyById } from '@/Services/companyService'
import {
  buildSubUserPayload,
  buildSubUserUpdatePayload,
  canAssignRole,
  createCompanyConfig,
  getSubUserEditValues,
  registerSubUser,
  updateSubUser,
} from '@/Services/subUserService'
import { fetchCompanies, selectCompanyError, selectCompanyStatus } from '@/Store/Slices/companySlice'
import { selectProfile } from '@/Store/Slices/profileSlice'
import SubUserCompanyCard from './SubUserCompanyCard'

const FORM_ID = 'sub-user-form'

const EMPTY_ACCOUNT = { email: '', password: '', name: '', designation: '' }

/** The id of one block, and the prefix of its fields' ids. */
const blockId = (rowKey) => `sub-user-company-${rowKey}`

/** What a company with nothing chosen yet shows - one object, never written to. */
const EMPTY_CONFIG = Object.freeze(createCompanyConfig())

export default function SubUserFormModal({ mode = 'create', subUser, onSaved, onClose }) {
  const dispatch = useDispatch()
  const { allCompanies: companies, activeCompanyId } = useActiveCompany()
  const companyStatus = useSelector(selectCompanyStatus)
  const companyError = useSelector(selectCompanyError)
  const profile = useSelector(selectProfile)

  const editing = mode === 'edit'

  const [account, setAccount] = useState(EMPTY_ACCOUNT)
  const nextKey = useRef(1)
  const [rows, setRows] = useState(() =>
    editing ? [] : [{ key: 0, companyId: activeCompanyId === null ? '' : String(activeCompanyId), open: true }],
  )
  const [configs, setConfigs] = useState({})
  // Edit: each company's block as it was read ({ key, block }, by company_id),
  // and the blocks the form cannot show - see getSubUserEditValues.
  const [originals, setOriginals] = useState({})
  const [kept, setKept] = useState([])
  // { email, password, name, rows: { [row.key]: { company, roleName } } }
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Edit: the form is filled in from the sub user once the companies are in -
  // straight away, or after they finish loading.
  const [filled, setFilled] = useState(!editing)
  if (!filled && companyStatus === 'succeeded') {
    setFilled(true)
    const values = getSubUserEditValues(subUser, companies)
    setAccount(values.account)
    setRows(
      values.assignments.length > 0
        ? values.assignments.map((assignment, index) => ({
            key: index,
            companyId: assignment.companyId,
            open: index === 0,
          }))
        : [{ key: 0, companyId: '', open: true }],
    )
    setConfigs(Object.fromEntries(values.assignments.map((assignment) => [assignment.companyId, assignment.config])))
    setOriginals(Object.fromEntries(values.assignments.map((assignment) => [assignment.companyId, assignment.original])))
    setKept(values.kept)
  }

  const setAccountField = (field, value) => {
    setAccount((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  /** Clears the given errors of one block, as its fields are edited. */
  const clearRowErrors = (rowKey, fields) =>
    setErrors((previous) => {
      const rowErrors = previous.rows?.[rowKey]
      if (!rowErrors) return previous

      const cleared = Object.fromEntries(fields.map((field) => [field, undefined]))
      return { ...previous, rows: { ...previous.rows, [rowKey]: { ...rowErrors, ...cleared } } }
    })

  /** Adds a closed block under the last, and brings it into view - the button is above them all. */
  const addRow = () => {
    // Past every key in use - an edit form starts with blocks of its own.
    const key = Math.max(nextKey.current, ...rows.map((row) => row.key + 1))
    nextKey.current = key + 1
    setRows((previous) => [...previous, { key, companyId: '', open: false }])
    requestAnimationFrame(() =>
      document.getElementById(blockId(key))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    )
  }

  /** Opens or closes one block - only what is on screen changes, never what was chosen. */
  const toggleRow = (row) =>
    setRows((previous) => previous.map((entry) => (entry.key === row.key ? { ...entry, open: !entry.open } : entry)))

  /** Takes a block out, and with it what was chosen for its company. */
  const removeRow = (row) => {
    setRows((previous) => previous.filter((entry) => entry.key !== row.key))
    setConfigs((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([companyId]) => companyId !== row.companyId)),
    )
  }

  const changeRowCompany = (row, companyId) => {
    setRows((previous) => previous.map((entry) => (entry.key === row.key ? { ...entry, companyId } : entry)))
    // The errors were about the company the block has just left.
    setErrors((previous) => ({ ...previous, rows: { ...previous.rows, [row.key]: undefined } }))
  }

  const changeConfig = (row, patch) => {
    setConfigs((previous) => ({
      ...previous,
      [row.companyId]: { ...(previous[row.companyId] ?? createCompanyConfig()), ...patch },
    }))
    clearRowErrors(row.key, Object.keys(patch))
  }

  const validate = () => {
    const found = {}

    // The account's own fields cannot be changed in an edit, so are not checked.
    if (!editing) {
      if (!account.email.trim()) found.email = 'Email is required'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email.trim())) found.email = 'Enter a valid email address'

      if (!account.password) found.password = 'Password is required'
      else if (account.password.length < 6) found.password = 'Use at least 6 characters'

      if (!account.name.trim()) found.name = 'Name is required'
    }

    const rowErrors = {}
    rows.forEach((row) => {
      const company = findCompanyById(companies, row.companyId)
      if (!company) {
        rowErrors[row.key] = { company: 'Please select a company' }
        return
      }

      // A role is asked for only where the company has roles to give.
      const config = configs[row.companyId] ?? EMPTY_CONFIG
      if (canAssignRole(company) && !config.roleName) rowErrors[row.key] = { roleName: 'Please select a role' }
    })
    if (Object.keys(rowErrors).length > 0) found.rows = rowErrors

    return found
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    // Enter in a field submits too - never twice at once.
    if (submitting) return

    const found = validate()
    setErrors(found)
    // A closed block with something to put right is opened to show it.
    if (found.rows) {
      setRows((previous) => previous.map((entry) => (found.rows[entry.key] ? { ...entry, open: true } : entry)))
    }
    if (Object.keys(found).length > 0) {
      toast.error('Please complete the highlighted fields.')
      return
    }

    // parent_user_id - without it the sub user would belong to nobody.
    if (!editing && (profile?.id === null || profile?.id === undefined)) {
      toast.error('Your profile has not loaded yet. Please try again in a moment.')
      return
    }

    const assignments = rows.map((row) => ({
      company: findCompanyById(companies, row.companyId),
      config: configs[row.companyId] ?? EMPTY_CONFIG,
      original: originals[row.companyId],
    }))

    setSubmitting(true)
    try {
      const response = editing
        ? await updateSubUser(buildSubUserUpdatePayload({ subUser, assignments, kept }))
        : await registerSubUser(buildSubUserPayload({ account, parentUserId: profile.id, assignments }))
      toast.success(response?.msg || (editing ? 'Sub user updated successfully.' : 'Sub user created successfully.'))
      onSaved?.()
    } catch (failure) {
      // The modal stays open with everything still in it.
      toast.error(failure.message)
    } finally {
      setSubmitting(false)
    }
  }

  const companiesLoading = companyStatus === 'idle' || companyStatus === 'loading'
  const ready = companyStatus === 'succeeded' && companies.length > 0

  const chosenIds = rows.map((row) => row.companyId).filter(Boolean)
  const allCompaniesUsed = rows.length >= companies.length

  /* ---------------- The companies: loading, failed, none ---------------- */
  const renderBody = () => {
    if (companiesLoading) return <ListSkeleton />

    if (companyStatus === 'failed') {
      return (
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load your companies"
          action={<RetryButton onClick={() => dispatch(fetchCompanies({ force: true }))} />}
        >
          {companyError}
        </StateMessage>
      )
    }

    if (companies.length === 0) {
      return (
        <StateMessage icon={Building2} title="No companies found">
          A sub user is given access to a company. Add a company first, then come back here.
        </StateMessage>
      )
    }

    return (
      // p-1: room for a field's focus ring inside the modal's scroll box.
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4 p-1">
        {/* Edit: shown so it is clear whose access this is, but read-only. */}
        <FormGrid>
          <Field
            id="sub-user-email"
            label="Email"
            required={!editing}
            readOnly={editing}
            icon={Mail}
            type="email"
            placeholder="Email"
            autoComplete="off"
            value={account.email}
            error={errors.email}
            disabled={submitting}
            onChange={(e) => setAccountField('email', e.target.value)}
          />

          {editing ? null : (
            <PasswordField
              id="sub-user-password"
              label="Password"
              required
              placeholder="Password"
              autoComplete="new-password"
              value={account.password}
              error={errors.password}
              disabled={submitting}
              onChange={(e) => setAccountField('password', e.target.value)}
            />
          )}

          <Field
            id="sub-user-name"
            label="Name"
            required={!editing}
            readOnly={editing}
            icon={User}
            placeholder={editing ? '--' : 'Name'}
            autoComplete="off"
            value={account.name}
            error={errors.name}
            disabled={submitting}
            onChange={(e) => setAccountField('name', e.target.value)}
          />

          <Field
            id="sub-user-designation"
            label="Designation"
            readOnly={editing}
            icon={Briefcase}
            placeholder={editing ? '--' : 'Designation'}
            autoComplete="off"
            value={account.designation}
            disabled={submitting}
            onChange={(e) => setAccountField('designation', e.target.value)}
          />
        </FormGrid>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <h3 className="text-sm font-semibold text-brand">
            Company Access
            <span className="font-normal text-muted-foreground"> ({rows.length})</span>
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            {allCompaniesUsed ? (
              <span className="text-xs text-muted-foreground">Every company is already on the form.</span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Plus}
              disabled={submitting || allCompaniesUsed}
              onClick={addRow}
            >
              Add Company
            </Button>
          </div>
        </div>

        {kept.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            This sub user also has access to {kept.length === 1 ? '1 company' : `${kept.length} companies`} that{' '}
            {kept.length === 1 ? 'is' : 'are'} not in your company list. That access is kept as it is.
          </p>
        ) : null}

        {rows.map((row, index) => (
          <SubUserCompanyCard
            key={row.key}
            index={index}
            idPrefix={blockId(row.key)}
            company={findCompanyById(companies, row.companyId)}
            // Every company no other block has taken - this block's own included.
            companyOptions={companies
              .filter(
                (company) =>
                  String(company.company_id) === row.companyId || !chosenIds.includes(String(company.company_id)),
              )
              .map((company) => ({
                value: String(company.company_id),
                label: company.comp_name || `Company ${company.company_id}`,
              }))}
            config={configs[row.companyId] ?? EMPTY_CONFIG}
            errors={errors.rows?.[row.key]}
            disabled={submitting}
            open={row.open}
            onToggle={() => toggleRow(row)}
            onCompanyChange={(companyId) => changeRowCompany(row, companyId)}
            onChange={(patch) => changeConfig(row, patch)}
            onRemove={rows.length > 1 ? () => removeRow(row) : undefined}
          />
        ))}
      </form>
    )
  }

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next && !submitting) onClose?.()
      }}
      title={editing ? 'Edit Sub User' : 'Create Sub User'}
      description={
        editing
          ? "Change this sub user's role, modules and permissions in each company."
          : 'One account, with its own role, modules and permissions in each company.'
      }
      size="xl"
      autoFocus={!editing}
      // A click outside must not throw away a form this long; Cancel, X and
      // Escape still close it.
      closeOnBackdropClick={false}
      closeOnEsc={!submitting}
      showCloseButton={!submitting}
      footer={
        <>
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={submitting} disabled={!ready || !filled}>
            {editing ? (submitting ? 'Saving...' : 'Save Changes') : submitting ? 'Creating...' : 'Create Sub User'}
          </Button>
        </>
      }
    >
      {renderBody()}
    </Modal>
  )
}
