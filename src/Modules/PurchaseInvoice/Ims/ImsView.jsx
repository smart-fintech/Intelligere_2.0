import { useMemo, useState } from 'react'
import { DownloadCloud, FileSearch, Lock, RefreshCcw, Save, Search, Undo2, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'

import { StateMessage } from '@/Components/Common/DataList'
import { Field, SelectField } from '@/Components/Common/FormFields'
import { GstPortalAuthDialogs } from '@/Components/Common/GstPortalAuthDialogs'
import { DataTable, PlainHead, TablePager } from '@/Components/Common/TableTools'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { Checkbox } from '@/Components/ui/checkbox'
import { TableCell, TableRow } from '@/Components/ui/table'
import { ROUTES } from '@/Constants/routes'
import { useListView } from '@/Hooks/useListView'
import { cn } from '@/Library/utils'
import { ACTION_FIELD, actionOf, changeCount, IMS_ACTIONS, IMS_SECTIONS, imsColumns, STATUS_FIELD } from '@/Modules/PurchaseInvoice/Ims/imsModel'
import useIms, { imsRowKey } from '@/Modules/PurchaseInvoice/Ims/useIms'
import { listsModule } from '@/Services/Auth/accessService'
import { IMS_PREMIUM } from '@/Services/Gst/gstReturnService'

/**
 * IMS - Purchase Invoice's view of the GST portal's Invoice Management System
 * (useIms): Fetch IMS reads the company's invoices in the portal's eight
 * sections, each a tab with its count; a section's table has the columns its
 * own rows have. Each row's Action (Accept, Reject, Pending, No Action) can be
 * changed - one by one, or for the rows ticked - in any section; Save Actions
 * sends every change at once. Signing in to the portal, when it asks, is the
 * shared username / OTP dialogs'.
 *
 * Only for a company whose `premium_modules` lists IMS (the active company's
 * record, read on every render - a company switch is checked again). Any
 * other sees that IMS is a premium feature, with the way to buy it: the
 * premium recharge page (ROUTES.PREMIUM_PAYMENT), where IMS is sold - and
 * nothing of IMS is asked for.
 */
export default function ImsView({ company }) {
  if (!listsModule(company?.premium_modules, [IMS_PREMIUM])) return <ImsPremiumLocked />
  return <ImsWorkspace company={company} />
}

function ImsPremiumLocked() {
  return (
    <Card className="border-border/70 py-3 shadow-sm" data-testid="ims-premium-locked">
      <CardContent className="px-3">
        <StateMessage
          icon={Lock}
          title="IMS Premium Feature"
          action={
            <Button asChild>
              <Link to={ROUTES.PREMIUM_PAYMENT}>
                <Zap /> Purchase Premium
              </Link>
            </Button>
          }
        >
          IMS is available as a premium feature. Upgrade your plan to access IMS functionality.
        </StateMessage>
      </CardContent>
    </Card>
  )
}

const SEARCH_FIELDS = ['GSTIN of Supplier', 'Trade/Legal Name', 'Invoice Number']
const ACTION_OPTIONS = IMS_ACTIONS.map((action) => ({ value: action.value, label: action.label }))
const STATUS_TONE = {
  A: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  R: 'bg-red-50 text-destructive border-red-200',
  P: 'bg-amber-50 text-amber-700 border-amber-200',
  N: 'bg-muted text-muted-foreground border-border',
}

const cellText = (value) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return value.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function ImsWorkspace({ company }) {
  const ims = useIms({ companyId: company.company_id })
  const [active, setActive] = useState(IMS_SECTIONS[0].key)
  const [ticked, setTicked] = useState(() => new Set())

  const sections = ims.sections ?? []
  const section = sections.find((entry) => entry.key === active) ?? sections[0] ?? null
  const rows = useMemo(() => section?.rows ?? [], [section])
  const columns = useMemo(() => imsColumns(rows), [rows])
  // A row's key by the row itself - the table's rows are the fetched rows, untouched.
  const keys = useMemo(() => new Map(rows.map((row, index) => [row, imsRowKey(section?.key, index)])), [rows, section])
  const view = useListView(rows, { searchFields: SEARCH_FIELDS })
  const pending = changeCount(ims.changes)

  const chooseSection = (next) => {
    if (!next) return
    setActive(next)
    setTicked(new Set())
    view.setSearch('')
    view.setPage(1)
  }
  const tick = (key, on) =>
    setTicked((current) => {
      const next = new Set(current)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  const pageKeys = view.rows.map((row) => keys.get(row))
  const pageAll = pageKeys.length > 0 && pageKeys.every((key) => ticked.has(key))
  const markTicked = (action) => {
    ims.chooseMany(
      rows.filter((row) => ticked.has(keys.get(row))).map((row) => [keys.get(row), row]),
      action,
    )
    setTicked(new Set())
  }
  const fetchAgain = () => {
    setTicked(new Set())
    ims.fetch()
  }

  return (
    <div className="space-y-3">
      <GstPortalAuthDialogs portal={ims.portal} />

      <Card className="gap-0 border-border/70 py-3 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-2 px-3">
          <div className="min-w-0 mr-auto">
            <p className="text-sm font-semibold text-brand">IMS - Invoice Management System</p>
            <p className="text-xs text-muted-foreground">Supplier invoices on the GST portal for {company.comp_name}. Accept, reject or keep them pending.</p>
          </div>
          {ims.sections ? (
            <>
              {pending > 0 ? (
                <Button type="button" variant="ghost" size="sm" icon={Undo2} disabled={ims.busy} onClick={ims.discard}>
                  Discard Changes
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" icon={RefreshCcw} loading={ims.working === 'fetch'} disabled={ims.busy} onClick={fetchAgain}>
                {ims.working === 'fetch' ? 'Fetching...' : 'Fetch Again'}
              </Button>
              <Button type="button" size="sm" icon={Save} loading={ims.working === 'save'} disabled={ims.busy || pending === 0} onClick={ims.save}>
                {ims.working === 'save' ? 'Saving...' : `Save Actions${pending ? ` (${pending})` : ''}`}
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>

      {!ims.sections ? (
        <Card className="border-border/70 py-3 shadow-sm">
          <CardContent className="px-3">
            <StateMessage
              icon={FileSearch}
              title="Fetch IMS from the GST portal"
              action={
                <Button type="button" icon={DownloadCloud} loading={ims.working === 'fetch'} disabled={ims.busy} onClick={ims.fetch}>
                  {ims.working === 'fetch' ? 'Fetching IMS...' : 'Fetch IMS'}
                </Button>
              }
            >
              The invoices your suppliers filed, in all eight IMS sections. The portal may ask you to sign in first.
            </StateMessage>
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-3 border-border/70 py-3 shadow-sm">
          <CardContent className="space-y-3 px-3">
            <ViewSwitch
              options={sections.map((entry) => ({ value: entry.key, label: `${entry.label} (${entry.rows.length})` }))}
              value={section?.key ?? ''}
              onValueChange={chooseSection}
              label="IMS section"
              idPrefix="ims-section"
              className="justify-start"
            />

            {rows.length === 0 ? (
              <StateMessage icon={FileSearch} title={`No ${section?.label ?? ''} invoices`}>
                The GST portal has nothing in this section.
              </StateMessage>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <Field
                    id="ims-search"
                    label="Search"
                    icon={Search}
                    placeholder="GSTIN, trade name or invoice no."
                    className="w-full sm:w-72"
                    value={view.search}
                    onChange={(event) => view.setSearch(event.target.value)}
                  />
                  {ticked.size > 0 ? (
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Action for the ticked invoices">
                      <span className="text-xs text-muted-foreground">{ticked.size} ticked - mark as</span>
                      {IMS_ACTIONS.map((action) => (
                        <Button key={action.value} type="button" variant="outline" size="sm" disabled={ims.busy} onClick={() => markTicked(action.value)}>
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <DataTable
                  head={
                    <>
                      <PlainHead width={48}>
                        <Checkbox
                          aria-label="Tick every invoice on this page"
                          checked={pageAll}
                          disabled={ims.busy}
                          onCheckedChange={(on) => pageKeys.forEach((key) => tick(key, on === true))}
                        />
                      </PlainHead>
                      {columns.map((column) => (
                        <PlainHead key={column} width={column === 'Sr.' ? 64 : column === 'Trade/Legal Name' ? 220 : undefined}>
                          {column}
                        </PlainHead>
                      ))}
                      <PlainHead width={150}>Action</PlainHead>
                    </>
                  }
                >
                  {view.rows.map((row) => {
                    const key = keys.get(row)
                    const action = actionOf(row, ims.changes, key)
                    const changed = Object.hasOwn(ims.changes, key)
                    return (
                      <TableRow key={key} data-state={changed ? 'selected' : undefined}>
                        <TableCell>
                          <Checkbox aria-label={`Tick ${row['Invoice Number'] ?? key}`} checked={ticked.has(key)} disabled={ims.busy} onCheckedChange={(on) => tick(key, on === true)} />
                        </TableCell>
                        {columns.map((column) => (
                          <TableCell key={column} title={cellText(row[column])}>
                            {column === STATUS_FIELD ? (
                              <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_TONE[row[ACTION_FIELD]] ?? STATUS_TONE.N)}>
                                {cellText(row[column]) || 'No Action'}
                              </span>
                            ) : (
                              cellText(row[column])
                            )}
                          </TableCell>
                        ))}
                        <TableCell>
                          <SelectField
                            id={`ims-action-${key}`}
                            ariaLabel={`Action for ${row['Invoice Number'] ?? key}`}
                            size="sm"
                            options={ACTION_OPTIONS}
                            value={action}
                            disabled={ims.busy}
                            onValueChange={(value) => value && ims.choose(key, row, value)}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </DataTable>
                <TablePager view={view} />
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
