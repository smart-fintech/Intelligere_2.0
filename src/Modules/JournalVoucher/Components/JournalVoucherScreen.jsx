import { useRef, useState } from 'react'
import { SearchX } from 'lucide-react'

import { ListSkeleton, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { JV_VIEW, JV_VIEW_OPTIONS, JV_WORKSPACE } from '@/Constants/journalVoucher'
import BankEntries from '@/Modules/JournalVoucher/Components/BankEntries'
import DetectEntries from '@/Modules/JournalVoucher/Components/DetectEntries'
import JvLedgers from '@/Modules/JournalVoucher/Components/JvLedgers'
import TemplateForm from '@/Modules/JournalVoucher/Components/TemplateForm'
import TemplateList from '@/Modules/JournalVoucher/Components/TemplateList'
import VoucherEntry from '@/Modules/JournalVoucher/Components/VoucherEntry'
import VoucherHistory from '@/Modules/JournalVoucher/Components/VoucherHistory'
import { useCompanyLedgers, useJvBankEntries, useJvLedgers, useJvTemplates, useJvVouchers } from '@/Modules/JournalVoucher/useJournalData'
import useJvTallySend from '@/Modules/JournalVoucher/useJvTallySend'

/**
 * The module's screen: the three radio buttons, and what they show.
 *
 *   Journal Entries       the templates on the left; on the right the bank
 *                         entries, the JV ledgers, a template's form or its
 *                         vouchers (`workspace`). Kept mounted, so a voucher
 *                         half typed survives a look at History.
 *   Detect Bank Entries   bank entries that need a template chosen - the
 *                         count is on its button
 *   History               the saved vouchers
 *
 * The four lists come from the shared cache (useJournalData), so the views
 * share one copy of each and a change made in one shows in the others. A
 * Tally user's sends go through one useJvTallySend, shared the same way.
 */

const BANK_ENTRIES = Object.freeze({ kind: JV_WORKSPACE.BANK_ENTRIES })

export default function JournalVoucherScreen({ companyId }) {
  const [view, setView] = useState(JV_VIEW.ENTRIES)
  const [workspace, setWorkspace] = useState(BANK_ENTRIES)

  const templates = useJvTemplates(companyId)
  const jvLedgers = useJvLedgers(companyId)
  const bankEntries = useJvBankEntries(companyId)
  const vouchers = useJvVouchers(companyId)
  const ledgers = useCompanyLedgers(companyId)
  const tally = useJvTallySend()

  const templateRows = templates.data ?? []
  const singleCount = bankEntries.data?.single.reduce((sum, group) => sum + group.entries.length, 0)
  const multiCount = bankEntries.data?.multi.length

  const viewOptions = JV_VIEW_OPTIONS.map((option) =>
    option.value === JV_VIEW.DETECT && multiCount ? { ...option, label: `${option.label} (${multiCount})` } : option,
  )

  const backToBankEntries = () => setWorkspace(BANK_ENTRIES)

  // Below lg the workspace is under the template list: what a tap opened is brought into view.
  const workspaceRef = useRef(null)
  const openWorkspace = (next) => {
    setWorkspace(next)
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  /** The workspace's template, or why there is none to show yet. */
  const renderNamedTemplate = (render) => {
    const template = templateRows.find((row) => row.name === workspace.name)
    if (template) return render(template)
    if (!templates.data || templates.status === 'loading') {
      return (
        <Panel title={workspace.name}>
          <ListSkeleton rows={4} />
        </Panel>
      )
    }
    return (
      <Panel title={workspace.name}>
        <StateMessage
          icon={SearchX}
          title="This template is no longer there"
          action={
            <Button type="button" variant="outline" size="sm" onClick={backToBankEntries}>
              Back to Bank Entries
            </Button>
          }
        >
          It may have been deleted by another user of this company.
        </StateMessage>
      </Panel>
    )
  }

  const renderWorkspace = () => {
    switch (workspace.kind) {
      case JV_WORKSPACE.LEDGERS:
        return <JvLedgers companyId={companyId} jvLedgers={jvLedgers} ledgers={ledgers} onClose={backToBankEntries} />

      case JV_WORKSPACE.TEMPLATE: {
        const form = (template) => (
          <TemplateForm
            key={template?.name ?? 'new'}
            companyId={companyId}
            template={template}
            templateNames={templateRows.map((row) => row.name)}
            jvLedgers={jvLedgers}
            ledgers={ledgers}
            onSaved={(name) => setWorkspace({ kind: JV_WORKSPACE.VOUCHER, name })}
            onCancel={backToBankEntries}
            onOpenLedgers={() => setWorkspace({ kind: JV_WORKSPACE.LEDGERS })}
          />
        )
        return workspace.name ? renderNamedTemplate(form) : form(null)
      }

      case JV_WORKSPACE.VOUCHER:
        return renderNamedTemplate((template) => (
          <VoucherEntry key={template.name} companyId={companyId} template={template} ledgers={ledgers} tally={tally} onClose={backToBankEntries} />
        ))

      default:
        return <BankEntries companyId={companyId} bankEntries={bankEntries} ledgers={ledgers} onOpenDetect={() => setView(JV_VIEW.DETECT)} />
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <h1 className="text-xl font-semibold text-brand sm:text-2xl">Journal Voucher</h1>

        <ViewSwitch
          options={viewOptions}
          value={view}
          onValueChange={setView}
          label="Journal Voucher view"
          idPrefix="jv-view"
          className="mx-auto w-fit max-w-full"
        />
      </div>

      <div hidden={view !== JV_VIEW.ENTRIES}>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <TemplateList
            companyId={companyId}
            templates={templates}
            workspace={workspace}
            bankCount={singleCount}
            onOpen={openWorkspace}
            onDeleted={(name) => {
              if (workspace.name === name) backToBankEntries()
            }}
          />
          <div ref={workspaceRef} className="min-w-0 scroll-mt-4">
            {renderWorkspace()}
          </div>
        </div>
      </div>

      {view === JV_VIEW.DETECT ? <DetectEntries companyId={companyId} bankEntries={bankEntries} /> : null}
      {view === JV_VIEW.HISTORY ? <VoucherHistory companyId={companyId} vouchers={vouchers} tally={tally} /> : null}
    </div>
  )
}
