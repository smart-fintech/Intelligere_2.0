import { useState } from 'react'
import { AlertCircle, ArrowLeft, Download } from 'lucide-react'
import { useSelector } from 'react-redux'

import { CheckboxField } from '@/Components/Common/FormFields'
import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Button } from '@/Components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/Components/ui/card'
import { Skeleton } from '@/Components/ui/skeleton'
import { BH_DASHBOARD_PERIOD } from '@/Constants/businessHealth'
import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { invalidateQueries, useQuery } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { buildReportPayload, isWithinRange, readReport } from '@/Modules/BusinessHealth/businessHealth'
import FetchDataModal from '@/Modules/BusinessHealth/Components/FetchDataModal'
import { HealthDot } from '@/Modules/BusinessHealth/Components/ReportCard'
import {
  DASHBOARD_MAX_REPORTS,
  DASHBOARD_SECTIONS,
  findDashboardReport,
  toSavedReport,
} from '@/Modules/BusinessHealth/Reports/dashboard'
import { getDashboardReports, getMisReport, saveDashboardReports } from '@/Services/businessHealthService'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'

/**
 * The Dashboard view (old MISDashboard): the reports this user pinned for the
 * company, one card each - and, before anything is pinned or while editing,
 * the tick boxes to choose them (up to DASHBOARD_MAX_REPORTS).
 *
 *   GET  mis_reports/dashboard/   the pinned reports, read once per company
 *   POST mis_reports/dashboard/   the whole list, in the old object form
 *                                 (toSavedReport), so either app reads it
 *   POST mis_reports/reports/     one per card, for the last month, with no
 *                                 comparative - as in the old Dashboard
 *
 * Each card asks for its own report and shows its own loading and failure:
 * one report that fails no longer blanks the others. Fetch Data (FetchDataModal)
 * brings sales, purchases, bank vouchers or pending bills over from Tally - for
 * Tally users only - and every card asks again once it is done.
 */

const readSavedReports = (response) => (Array.isArray(response?.reports) ? response.reports : [])

/** The pinnable reports a saved list stands for, in the saved order. */
const pinnedReports = (saved) => saved.map(findDashboardReport).filter(Boolean)

/** The old Dashboard's six card colours, in turn. */
const CARD_THEMES = [
  'border-[#2563EB] bg-[#DBEAFE] text-[#2563EB]',
  'border-[#059669] bg-[#D1FAE5] text-[#059669]',
  'border-[#DC2626] bg-[#FEE2E2] text-[#DC2626]',
  'border-[#D97706] bg-[#FEF3C7] text-[#D97706]',
  'border-[#7C3AED] bg-[#EDE9FE] text-[#7C3AED]',
  'border-[#0891B2] bg-[#CFFAFE] text-[#0891B2]',
]

/** One pinned report: its own request, and its own loading, failure and answer. */
function DashboardCard({ companyId, saved, theme }) {
  const report = findDashboardReport(saved)
  const period = saved.current_period || BH_DASHBOARD_PERIOD
  // A pinned report this app knows is asked for by its request (BH_REPORT_REQUESTS);
  // one it does not (saved elsewhere) by what was saved, as the old Dashboard did.
  const payload = report
    ? buildReportPayload(companyId, report, { current_period: period })
    : {
        company_id: companyId,
        reportType: [saved.reportType],
        current_period: period,
        ...(saved.responseType && { responseType: saved.responseType }),
      }
  const card = useQuery({
    key: [QUERY.MIS_DASHBOARD_REPORT, companyId, saved.reportType, saved.responseType || '', period],
    fetch: () => getMisReport(payload).then((response) => readReport(response, saved.reportType)),
    staleTime: MASTER_DATA_STALE_MS,
  })

  const data = card.data?.data
  const v1 = data?.[report?.responseKey]
  const v2 = data?.[report?.responseSecondryKey]
  const healthy = card.data ? isWithinRange(v1, report?.range) : null

  return (
    <Card className="h-full gap-0 overflow-hidden border-border/70 py-0">
      <div className={cn('border-l-[5px] px-5 py-4', theme)}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">{report?.title ?? saved.reportType}</h3>
          {healthy === null ? null : <HealthDot healthy={healthy} />}
        </div>
        {report?.range ? <p className="mt-1 text-xs text-muted-foreground">Range: {report.range.display}</p> : null}
      </div>

      <CardContent className="space-y-3 px-5 py-4">
        {card.status === 'failed' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">{card.error}</span>
            <RetryButton onClick={card.reload} />
          </div>
        ) : !card.data ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (
          <>
            <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs">{card.data.period}</span>
            <div className="text-[15px] leading-7 text-foreground">{report ? report.sentence(v1, v2) : null}</div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** The tick boxes, by section. */
function ReportPicker({ chosen, onToggle }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {DASHBOARD_SECTIONS.map((section) => (
        <Card key={section.id} className="gap-3 border-border/70">
          <CardHeader>
            <CardTitle className="text-base text-brand">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {section.reports.map((report) => (
              <CheckboxField
                key={report.request}
                id={`bh-pin-${report.request}`}
                label={report.label}
                checked={chosen.some((entry) => entry === report)}
                onCheckedChange={() => onToggle(report)}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function MisDashboard({ companyId, companyName }) {
  const saved = useQuery({
    key: [QUERY.MIS_DASHBOARD, companyId],
    fetch: () => getDashboardReports(companyId).then(readSavedReports),
    staleTime: MASTER_DATA_STALE_MS,
  })
  const [editing, setEditing] = useState(false)
  const [chosen, setChosen] = useState([])
  const [saving, setSaving] = useState(false)
  const [fetchOpen, setFetchOpen] = useState(false)
  // Fetch Data runs in Tally - offered only to Tally users, as every Tally action in the app.
  const isTally = useSelector(selectIsTallyErp)

  // What came over from Tally changes the figures: every card asks again.
  const fetched = () => invalidateQueries(QUERY.MIS_DASHBOARD_REPORT, { refetchActive: true })

  const fetchData = isTally ? (
    <>
      <Button type="button" variant="outline" icon={Download} onClick={() => setFetchOpen(true)}>
        Fetch Data
      </Button>
      <FetchDataModal open={fetchOpen} onOpenChange={setFetchOpen} companyName={companyName} onFetched={fetched} />
    </>
  ) : null

  if (!saved.data) {
    return (
      <Card className="border-border/70">
        <CardContent className="px-4">
          {saved.status === 'failed' ? (
            <StateMessage
              icon={AlertCircle}
              tone="error"
              title="Could not load your dashboard"
              action={<RetryButton onClick={saved.reload} />}
            >
              {saved.error}
            </StateMessage>
          ) : (
            <ListSkeleton rows={4} />
          )}
        </CardContent>
      </Card>
    )
  }

  const hasPinned = saved.data.length > 0
  const picking = editing || !hasPinned

  const toggle = (report) => {
    if (chosen.includes(report)) {
      setChosen(chosen.filter((entry) => entry !== report))
      return
    }
    if (chosen.length >= DASHBOARD_MAX_REPORTS) {
      toast.error(`You can select a maximum ${DASHBOARD_MAX_REPORTS} reports.`)
      return
    }
    setChosen([...chosen, report])
  }

  const startEditing = () => {
    setChosen(pinnedReports(saved.data))
    setEditing(true)
  }

  const save = () => {
    setSaving(true)
    saveDashboardReports(companyId, chosen.map(toSavedReport))
      .then(() => saved.reload())
      .then(() => {
        toast.success('MIS Configuration Saved')
        setEditing(false)
      })
      .catch((failure) => toast.error(failure.message))
      .finally(() => setSaving(false))
  }

  if (picking) {
    return (
      <div className="space-y-4">
        <ReportPicker chosen={chosen} onToggle={toggle} />
        <div className="flex justify-end gap-2">
          {hasPinned ? (
            <Button type="button" variant="outline" icon={ArrowLeft} onClick={() => setEditing(false)}>
              Back
            </Button>
          ) : null}
          <Button type="button" variant="outline" loading={saving} onClick={save}>
            {hasPinned ? 'Update Reports' : 'Generate Reports'}
          </Button>
          {fetchData}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={startEditing}>
          Edit Report Selection
        </Button>
        {fetchData}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {saved.data.map((entry, index) => (
          <DashboardCard
            key={`${entry.reportType}:${entry.responseType || ''}`}
            companyId={companyId}
            saved={entry}
            theme={CARD_THEMES[index % CARD_THEMES.length]}
          />
        ))}
      </div>
    </div>
  )
}
