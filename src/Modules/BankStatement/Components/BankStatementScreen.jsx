import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useSelector } from 'react-redux'

import { Loader } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import KeywordMapping from '@/Modules/BankStatement/Components/KeywordMapping'
import StatementEntries from '@/Modules/BankStatement/Components/StatementEntries'
import StatementFileBar from '@/Modules/BankStatement/Components/StatementFileBar'
import StatementPreview from '@/Modules/BankStatement/Components/StatementPreview'
import StatementSummary from '@/Modules/BankStatement/Components/StatementSummary'
import StatementUpload from '@/Modules/BankStatement/Components/StatementUpload'
import useBankStatement from '@/Modules/BankStatement/useBankStatement'
import { selectLedgers, selectLedgersCompanyId } from '@/Store/Slices/ledgerSlice'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'

const VIEW = { STATEMENT: 'statement', MAPPING: 'mapping' }

const VIEWS = [
  { value: VIEW.STATEMENT, label: 'View Statement' },
  { value: VIEW.MAPPING, label: 'Mapping Ledger' },
]

/**
 * The Bank Statement screen: the account and the entries on the left, the
 * file (or the keyword mappings) on the right. The page gives it a new `key`
 * for a new company or Start over, so it always begins empty.
 */
export default function BankStatementScreen({ company, companyId, banks, onRestart }) {
  const isTally = useSelector(selectIsTallyErp)
  const allLedgers = useSelector(selectLedgers)
  const ledgersFor = useSelector(selectLedgersCompanyId)

  const statement = useBankStatement({ company, companyId, banks, isTally })
  const [view, setView] = useState(VIEW.STATEMENT)

  const { ledgerOptions, ledgerNames } = useMemo(() => {
    const ledgers = ledgersFor === companyId ? allLedgers : []
    const names = [...new Set(ledgers.map((ledger) => String(ledger.ledeger_name ?? '').trim()).filter(Boolean))]
    return { ledgerOptions: names.map((name) => ({ value: name, label: name })), ledgerNames: new Set(names) }
  }, [allLedgers, ledgersFor, companyId])

  const finished = statement.summary !== null || statement.loadingSummary
  const bankLedger = statement.bank?.bank_ledger_name ?? ''
  const mapping = view === VIEW.MAPPING && statement.started

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-brand sm:text-2xl">Bank Statement</h1>
        <Button
          variant="outline"
          size="sm"
          icon={RefreshCw}
          disabled={statement.sending || statement.uploading}
          onClick={onRestart}
        >
          Start over
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <div className="min-w-0 space-y-4">
          <StatementUpload statement={statement} banks={banks} company={company} companyId={companyId} />

          {statement.started && !finished ? (
            <StatementEntries
              statement={statement}
              ledgerOptions={ledgerOptions}
              ledgerNames={ledgerNames}
              bankLedger={bankLedger}
              isTally={isTally}
            />
          ) : null}

          {finished ? <StatementSummary statement={statement} isTally={isTally} /> : null}
        </div>

        <Panel
          title={mapping ? 'Assign Ledger' : 'Statement'}
          className="min-w-0 xl:sticky xl:top-4"
          actions={<StatementFileBar statement={statement} view={view} views={VIEWS} onViewChange={setView} />}
        >
          {mapping ? <KeywordMapping statement={statement} ledgerOptions={ledgerOptions} /> : <StatementPreview statement={statement} />}
        </Panel>
      </div>

      {statement.uploading ? <Loader variant="fullscreen" label="Reading the statement..." description="A long PDF can take a minute." /> : null}
      {statement.sending ? <Loader variant="fullscreen" label="Sending your data..." /> : null}
    </div>
  )
}
