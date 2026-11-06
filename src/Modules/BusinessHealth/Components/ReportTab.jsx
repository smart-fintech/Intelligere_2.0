import { useRef, useState } from 'react'
import { AlertCircle, FileSearch } from 'lucide-react'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Card, CardContent } from '@/Components/ui/card'
import { BH_EMPTY_FILTERS } from '@/Constants/businessHealth'
import useMasterDetails from '@/Hooks/useMasterDetails'
import { toast } from '@/Library/toast'
import { benchmarkFor, buildReportPayload, readReport, requestOf, validateReport } from '@/Modules/BusinessHealth/businessHealth'
import ReportFilters from '@/Modules/BusinessHealth/Components/ReportFilters'
import { ReportCard } from '@/Modules/BusinessHealth/Components/ReportCard'
import { getMisReport } from '@/Services/Reporting/businessHealthService'

/**
 * One report category: the filters, then the generated report.
 *
 *   reports   the category's reports (BusinessHealth/Reports/*)
 *
 * What stops a Generate is a toast, worded as in the old tabs; a request that
 * fails shows the backend's message in place of the card, with Retry. Only
 * the newest request may answer: Clear, or another Generate, makes the
 * earlier one's reply be ignored. The benchmark is the company's industry
 * from Master Details (useMasterDetails - the record the Inventory tab
 * already reads), or "Other" without one.
 */

const IDLE = { status: 'idle' }

export default function ReportTab({ reports, company, companyId }) {
  const masterDetails = useMasterDetails()
  const [filters, setFilters] = useState(BH_EMPTY_FILTERS)
  const [result, setResult] = useState(IDLE)
  const latest = useRef(0)

  const report = reports.find((entry) => entry.label === filters.report) ?? null
  const benchmark = report ? benchmarkFor(masterDetails.record?.industry_type, report.benchmark) : undefined

  const changeFilters = (next) => {
    // A different report starts with no result, as in the old tabs.
    if (next.report !== filters.report) {
      latest.current += 1
      setResult(IDLE)
    }
    setFilters(next)
  }

  const generate = () => {
    const problem = validateReport(report, filters)
    if (problem) {
      toast.error(problem)
      return
    }

    const request = (latest.current += 1)
    setResult({ status: 'loading' })

    getMisReport(buildReportPayload(companyId, report, filters))
      .then((response) => {
        if (request === latest.current) setResult({ status: 'ready', ...readReport(response, requestOf(report).reportType) })
      })
      .catch((failure) => {
        if (request === latest.current) setResult({ status: 'failed', error: failure.message })
      })
  }

  const clear = () => {
    latest.current += 1
    setFilters(BH_EMPTY_FILTERS)
    setResult(IDLE)
  }

  const renderResult = () => {
    if (result.status === 'idle') return null

    if (result.status === 'loading') {
      return (
        <Card className="border-border/70">
          <CardContent className="px-4">
            <ListSkeleton rows={3} />
          </CardContent>
        </Card>
      )
    }

    if (result.status === 'failed') {
      return (
        <Card className="border-border/70">
          <CardContent className="px-4">
            <StateMessage
              icon={AlertCircle}
              tone="error"
              title="Could not generate the report"
              action={<RetryButton onClick={generate} />}
            >
              {result.error}
            </StateMessage>
          </CardContent>
        </Card>
      )
    }

    if (!result.data) {
      return (
        <Card className="border-border/70">
          <CardContent className="px-4">
            <StateMessage icon={FileSearch} title="Nothing to show">
              The report came back empty for this period.
            </StateMessage>
          </CardContent>
        </Card>
      )
    }

    return (
      <ReportCard
        report={report}
        data={result.data}
        period={result.period}
        comparativePeriod={result.comparativePeriod}
        benchmark={benchmark}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/70">
        <CardContent className="px-4">
          <ReportFilters
            reports={reports}
            report={report}
            company={company}
            companyId={companyId}
            filters={filters}
            onChange={changeFilters}
            onGenerate={generate}
            onClear={clear}
            loading={result.status === 'loading'}
          />
        </CardContent>
      </Card>

      {renderResult()}
    </div>
  )
}
