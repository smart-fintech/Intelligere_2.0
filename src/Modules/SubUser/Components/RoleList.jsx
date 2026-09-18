/**
 * Create Sub User -> Role: the active company's roles in a table, with
 * Create Role (top right), and Edit / Delete on every row.
 *
 * The same table, filters, pager, row actions and delete confirmation as the
 * Bank and Ledger lists. The roles belong to the active company, so they are
 * read with it and read again after every create / update / delete - the
 * table is never patched by hand.
 */

import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { AlertCircle, Plus, ShieldCheck } from 'lucide-react'

import { ConfirmDialog } from '@/Components/Common/ConfirmDialog'
import { ListSkeleton, RetryButton, RowActions, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import {
  DataTable,
  PlainHead,
  SortableHead,
  TableFilters,
  TablePager,
} from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { useListView } from '@/Hooks/useListView'
import { toast } from '@/Library/toast'
import { deleteCompanyRole, getCompanyRoles } from '@/Services/roleService'
import { selectActiveCompanyId, selectCompanyStatus } from '@/Store/Slices/companySlice'
import { orDash } from '@/Utils/display'
import RoleFormModal from './RoleFormModal'

const SEARCH_FIELDS = ['role_name', 'under_role']

export default function RoleList() {
  const companyStatus = useSelector(selectCompanyStatus)
  const companyId = useSelector(selectActiveCompanyId)

  const [roles, setRoles] = useState([])
  // 'idle' | 'loading' | 'succeeded' | 'failed'
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  // The modal: undefined = closed, null = Create Role, a row = Edit Role.
  const [modalRole, setModalRole] = useState(undefined)
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // The newest request - a late answer from an older one (another company)
  // is dropped. And the company already loaded, so a re-render or React's
  // development double-mount does not ask twice.
  const requestRef = useRef(0)
  const loadedForRef = useRef(null)

  /** POST tally/company_roles/ { company } -> the table. */
  const loadRoles = async (id = companyId) => {
    if (!id) return
    const request = ++requestRef.current
    setStatus('loading')
    setError(null)

    try {
      const list = await getCompanyRoles(id)
      if (request !== requestRef.current) return
      setRoles(list)
      setStatus('succeeded')
    } catch (failure) {
      if (request !== requestRef.current) return
      setError(failure.message)
      setStatus('failed')
      toast.error(failure.message)
    }
  }

  useEffect(() => {
    if (companyStatus !== 'succeeded' || !companyId || loadedForRef.current === companyId) return
    loadedForRef.current = companyId
    setRoles([])
    loadRoles(companyId)
    // loadRoles is a plain function; only a new company should reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyStatus, companyId])

  const view = useListView(roles, { searchFields: SEARCH_FIELDS })

  /** Create / Edit saved: close the modal and read the roles again. */
  const handleSaved = () => {
    setModalRole(undefined)
    loadRoles()
  }

  /** DELETE tally/company_roles/ { company_id, role_id }, then read them again. */
  const handleDelete = async () => {
    if (!confirming || deleting) return

    setDeleting(true)
    try {
      const response = await deleteCompanyRole(companyId, confirming.role_id)
      toast.success(response?.msg || 'Role deleted successfully.')
      setConfirming(null)
      loadRoles()
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setDeleting(false)
    }
  }

  const loading = status === 'loading' || status === 'idle'

  const renderList = () => {
    if (companyStatus !== 'succeeded') return <ListSkeleton />

    if (!companyId) {
      return (
        <StateMessage icon={ShieldCheck} title="No company selected">
          Choose a company in the header to see its roles.
        </StateMessage>
      )
    }

    if (loading && roles.length === 0) return <ListSkeleton />

    if (status === 'failed' && roles.length === 0) {
      return (
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load roles"
          action={<RetryButton onClick={() => loadRoles()} />}
        >
          {error}
        </StateMessage>
      )
    }

    if (roles.length === 0) {
      return (
        <StateMessage icon={ShieldCheck} title="No roles found">
          Use Create Role to add this company's first role.
        </StateMessage>
      )
    }

    return (
      <>
        <TableFilters view={view} searchPlaceholder="Search role name or user role" />

        {view.total === 0 ? (
          <StateMessage icon={ShieldCheck} title="No matching roles">
            Nothing matches the current filters.
          </StateMessage>
        ) : (
          <DataTable
            head={
              <>
                <SortableHead view={view} field="role_name" width={150}>
                  Role name
                </SortableHead>
                <SortableHead view={view} field="under_role" width={180}>
                  Under Role
                </SortableHead>
                <SortableHead view={view} field="payment_permission" width={170}>
                  Payment Permission
                </SortableHead>
                <PlainHead width={200}>Role Group</PlainHead>
                <PlainHead width={130}>Created At</PlainHead>
                <PlainHead width={130}>Updated At</PlainHead>
                <PlainHead width={110} className="text-right">Actions</PlainHead>
              </>
            }
          >
            {view.rows.map((role) => (
              <TableRow className="text-brand" key={role.role_id}>
                <TableCell className="font-medium capitalize">{orDash(role.role_name)}</TableCell>
                <TableCell className="capitalize">{orDash(role.under_role)}</TableCell>
                <TableCell>{orDash(role.payment_permission)}</TableCell>
                <TableCell>
                  {orDash(Array.isArray(role.role_group) ? role.role_group.join(', ') : role.role_group)}
                </TableCell>
                <TableCell>{orDash(role.role_created_at)}</TableCell>
                <TableCell>{orDash(role.updated_at)}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    label={role.under_role}
                    onEdit={() => setModalRole(role)}
                    onDelete={() => setConfirming(role)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        )}

        <TablePager view={view} />
      </>
    )
  }

  return (
    <>
      <Panel
        title="Role List"
        meta={`(Total Count: ${roles.length})`}
        actions={
          <Button
            type="button"
            variant="default"
            size="sm"
            icon={Plus}
            onClick={() => setModalRole(null)}
            disabled={!companyId}
          >
            Create Role
          </Button>
        }
      >
        {renderList()}
      </Panel>

      {/* Mounted only while open; the key starts each opening from its own row. */}
      {modalRole !== undefined && (
        <RoleFormModal
          key={modalRole?.role_id ?? 'new'}
          role={modalRole}
          roles={roles}
          companyId={companyId}
          onSaved={handleSaved}
          onClose={() => setModalRole(undefined)}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirming)}
        onOpenChange={(next) => {
          if (!next) setConfirming(null)
        }}
        title="Delete role"
        description={confirming ? `Remove the role "${confirming.under_role}"? This cannot be undone.` : undefined}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        busy={deleting}
        onConfirm={handleDelete}
      />
    </>
  )
}
