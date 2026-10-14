/**
 * Create Sub User -> User: the signed-in user's sub users in a table, with
 * Create Sub User (top right) and View Details and Edit on every row. Create
 * and Edit are the same modal (SubUserFormModal), Edit handed the row's
 * record as the API sent it.
 *
 * The same table, filters and pager as the Role, Bank and Ledger lists. The
 * list is read once on arrival and again after a sub user is created or
 * changed (and on Refresh / Retry) - the table is never patched by hand.
 *
 * ------------------------------------------------------------------
 * ONE SUB USER, SEVERAL COMPANIES
 * ------------------------------------------------------------------
 * A sub user's `subuser_details` holds one block per company. Each row is
 * worked out once (the `rows` memo) into what the table shows:
 *
 *   access           the companies, read and named - what View Details shows
 *   companyNames     the Companies column, and the Company filter
 *   roles            the Role column - each role with its groups, once
 *   activeModules    the modules across all its companies, each once
 *   premiumModules     "
 *
 * A cell shows the first few and "+N more"; the whole of it is in View
 * Details, so the table never has to be wide enough for everything.
 *
 * Company and Role can hold several values per row, which the list view's own
 * dropdowns (one value per row) cannot match - so those two narrow the rows
 * BEFORE the view sees them, and are handed to the filter row beside the
 * view's own (`filterView`, as in CustomReport).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Eye, Pencil, Plus, RefreshCw, Users } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
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
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { useListView } from '@/Hooks/useListView'
import { toast } from '@/Library/toast'
import { getSubUserCompanies, getSubUsers, resolveSubUserCompany } from '@/Services/subUserService'
import { formatLongDate } from '@/Utils/date'
import { orDash } from '@/Utils/display'
import { Chip, ChipList } from './SubUserChips'
import SubUserDetailsModal from './SubUserDetailsModal'
import SubUserFormModal from './SubUserFormModal'

const SEARCH_FIELDS = ['name', 'email', 'designation', 'company_text', 'role_text']
const FILTER_FIELDS = { designation: 'Designation' }

/** The two filters a row can hold several values for - see the note at the top. */
const NO_PICK = { company: '', role: '' }

/** How many chips a cell shows before "+N more". */
const CELL_CHIPS = 2

const unique = (values) => [...new Set(values)]
const sortedUnique = (values) => unique(values).sort((a, b) => a.localeCompare(b))

export default function SubUserList() {
  const { allCompanies: companies } = useActiveCompany()

  /* ---------------- The list ----------------
     A reload keeps the rows on screen until the new ones arrive. */
  const [state, setState] = useState({ status: 'loading', rows: [], error: null })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  useEffect(() => {
    // The attempt already asked for - React's development double-mount does
    // not ask twice.
    if (request.current === attempt) return
    request.current = attempt

    getSubUsers()
      .then((rows) => {
        if (request.current === attempt) setState({ status: 'ready', rows, error: null })
      })
      .catch((failure) => {
        if (request.current !== attempt) return
        toast.error(failure.message)
        setState((previous) => ({ status: 'failed', rows: previous.rows, error: failure.message }))
      })
  }, [attempt])

  /** One controlled reload - Refresh, Retry, and after a sub user is created. */
  const reload = () => {
    setState((previous) => ({ ...previous, status: 'loading' }))
    setAttempt((count) => count + 1)
  }

  // The form that is open: { mode: 'create' } or { mode: 'edit', subUser }, or null.
  const [form, setForm] = useState(null)
  // The row whose details are open, or null.
  const [viewing, setViewing] = useState(null)

  /* Each record as the table shows it - see the note at the top. */
  const rows = useMemo(
    () =>
      state.rows.map((record, index) => {
        const access = getSubUserCompanies(record).map((entry) => ({
          ...entry,
          ...resolveSubUserCompany(entry, companies),
        }))
        const companyNames = unique(access.map((entry) => entry.name))

        // A role held in two companies with the same groups is one line.
        const roles = []
        access.forEach((entry) => {
          if (!entry.roleName && entry.roleGroups.length === 0) return
          const groups = entry.roleGroups.join(', ')
          if (!roles.some((role) => role.name === entry.roleName && role.groups === groups)) {
            roles.push({ name: entry.roleName, groups })
          }
        })
        const roleNames = unique(roles.map((role) => role.name).filter(Boolean))

        return {
          key: `${record.id ?? record.email ?? ''}#${index}`,
          // As the API sent it - what Edit starts from.
          record,
          name: record.name,
          email: record.email,
          designation: record.designation,
          created_at: record.created_at,
          access,
          companyNames,
          roles,
          roleNames,
          activeModules: unique(access.flatMap((entry) => entry.activeModules)),
          premiumModules: unique(access.flatMap((entry) => entry.premiumModules)),
          // What the search box reads for the two columns that are lists.
          company_text: companyNames.join(' '),
          role_text: roleNames.join(' '),
        }
      }),
    [state.rows, companies],
  )

  const [picked, setPicked] = useState(NO_PICK)

  const narrowed = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!picked.company || row.companyNames.includes(picked.company)) &&
          (!picked.role || row.roleNames.includes(picked.role)),
      ),
    [rows, picked],
  )

  const view = useListView(narrowed, { searchFields: SEARCH_FIELDS, filterFields: FILTER_FIELDS })

  /* The view the filter row is handed: its own filters, with Company and Role
     beside them. */
  const filterView = {
    ...view,
    filterFields: { company: 'Company', ...view.filterFields, role: 'Role' },
    filterOptions: {
      ...view.filterOptions,
      company: sortedUnique(rows.flatMap((row) => row.companyNames)),
      role: sortedUnique(rows.flatMap((row) => row.roleNames)),
    },
    filters: { ...view.filters, ...picked },
    setFilter: (field, value) => {
      if (!(field in NO_PICK)) return view.setFilter(field, value)
      setPicked((previous) => ({ ...previous, [field]: value }))
      view.setPage(1)
    },
    isFiltered: view.isFiltered || Boolean(picked.company || picked.role),
    clear: () => {
      setPicked(NO_PICK)
      view.clear()
    },
  }

  const loading = state.status === 'loading'

  const renderList = () => {
    if (loading && rows.length === 0) return <ListSkeleton />

    if (state.status === 'failed' && rows.length === 0) {
      return (
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load sub users"
          action={<RetryButton onClick={reload} />}
        >
          {state.error}
        </StateMessage>
      )
    }

    if (rows.length === 0) {
      return (
        <StateMessage icon={Users} title="No sub users yet">
          Use Create Sub User to add the first one and give it access to your companies.
        </StateMessage>
      )
    }

    return (
      <>
        {/* A reload that failed, with the earlier rows still on screen. */}
        {state.status === 'failed' ? (
          <InlineAlert action={<RetryButton onClick={reload} />}>{state.error}</InlineAlert>
        ) : null}

        <TableFilters view={filterView} searchPlaceholder="Search name, email, company or role" />

        {view.total === 0 ? (
          <StateMessage icon={Users} title="No matching sub users">
            Nothing matches the current filters.
          </StateMessage>
        ) : (
          <DataTable
            head={
              <>
                <SortableHead view={view} field="name" width={140}>
                  Name
                </SortableHead>
                <SortableHead view={view} field="email" width={200}>
                  Email
                </SortableHead>
                <SortableHead view={view} field="designation" width={130}>
                  Designation
                </SortableHead>
                <PlainHead width={180}>Companies</PlainHead>
                <PlainHead width={200}>Role</PlainHead>
                <PlainHead width={190}>Active Modules</PlainHead>
                <PlainHead width={190}>Premium Modules</PlainHead>
                <SortableHead view={view} field="created_at" width={130}>
                  Created Date
                </SortableHead>
                <PlainHead width={100} className="text-right">Actions</PlainHead>
              </>
            }
          >
            {view.rows.map((row) => (
              <TableRow className="text-brand" key={row.key}>
                <TableCell className="font-medium">{orDash(row.name)}</TableCell>
                <TableCell>{orDash(row.email)}</TableCell>
                <TableCell>{orDash(row.designation)}</TableCell>
                <TableCell wrap>
                  <ChipList items={row.companyNames} max={CELL_CHIPS} tone="brand" />
                </TableCell>
                <TableCell wrap>
                  {row.roles.length === 0 ? (
                    <span className="text-sm text-muted-foreground">--</span>
                  ) : (
                    <div className="space-y-1">
                      {row.roles.slice(0, CELL_CHIPS).map((role) => (
                        <div key={`${role.name}|${role.groups}`} className="min-w-0">
                          <Chip tone="outline">{role.name || '--'}</Chip>
                          {role.groups ? (
                            <p className="truncate text-xs text-muted-foreground" title={role.groups}>
                              {role.groups}
                            </p>
                          ) : null}
                        </div>
                      ))}
                      {row.roles.length > CELL_CHIPS ? (
                        <p className="text-xs text-muted-foreground">+{row.roles.length - CELL_CHIPS} more</p>
                      ) : null}
                    </div>
                  )}
                </TableCell>
                <TableCell wrap>
                  <ChipList items={row.activeModules} max={CELL_CHIPS} />
                </TableCell>
                <TableCell wrap>
                  <ChipList items={row.premiumModules} max={CELL_CHIPS} />
                </TableCell>
                <TableCell>{formatLongDate(row.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="iconEdit"
                      size="icon-sm"
                      icon={Eye}
                      tooltip="View Details"
                      aria-label={`View details of ${row.name || row.email || 'sub user'}`}
                      onClick={() => setViewing(row)}
                    />
                    <Button
                      type="button"
                      variant="iconEdit"
                      size="icon-sm"
                      icon={Pencil}
                      tooltip="Edit"
                      aria-label={`Edit ${row.name || row.email || 'sub user'}`}
                      onClick={() => setForm({ mode: 'edit', subUser: row.record })}
                    />
                  </div>
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
        title="Sub User List"
        meta={`(Total Count: ${rows.length})`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" icon={RefreshCw} loading={loading} onClick={reload}>
              Refresh
            </Button>
            <Button type="button" variant="default" size="sm" icon={Plus} onClick={() => setForm({ mode: 'create' })}>
              Create Sub User
            </Button>
          </div>
        }
      >
        {renderList()}
      </Panel>

      {/* Both mounted only while open, so each opening starts fresh. */}
      {form && (
        <SubUserFormModal
          mode={form.mode}
          subUser={form.subUser}
          onSaved={() => {
            setForm(null)
            reload()
          }}
          onClose={() => setForm(null)}
        />
      )}

      {viewing && <SubUserDetailsModal subUser={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}
