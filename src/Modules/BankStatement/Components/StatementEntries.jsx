import { useState } from 'react'
import { ChevronRight, ListChecks, Send } from 'lucide-react'

import { ConfirmPopover } from '@/Components/Common/ConfirmPopover'
import { StateMessage } from '@/Components/Common/DataList'
import { CheckboxField, SelectField } from '@/Components/Common/FormFields'
import { Loader } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import EntryCard from '@/Modules/BankStatement/Components/EntryCard'
import { VOUCHER_TYPES } from '@/Modules/BankStatement/bankStatementModel'

/** Cards drawn at a time - a statement of another ERP comes as one page of thousands. */
const CARDS_PAGE = 50

/** Send all, and the next batch - in the panel's header. */
function Actions({ statement, isTally }) {
  const [confirmingNext, setConfirmingNext] = useState(false)
  const { visible } = statement

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        icon={Send}
        disabled={!statement.canSendAll || statement.sending}
        onClick={() => statement.send(visible)}
      >
        {isTally ? `Send ${visible.length} to Tally` : `Verify ${visible.length}`}
      </Button>
      {statement.hasNextBatch ? (
        <ConfirmPopover
          open={confirmingNext}
          onOpenChange={setConfirmingNext}
          title="Go to the next batch?"
          description={`The ${statement.entries.length} entries not sent from this batch will be removed.`}
          confirmLabel="Next"
          variant="default"
          onConfirm={() => {
            setConfirmingNext(false)
            statement.nextBatch()
          }}
        >
          <Button variant="outline" size="icon-sm" icon={ChevronRight} tooltip="Next batch" aria-label="Next batch" disabled={statement.sending} />
        </ConfirmPopover>
      ) : null}
    </div>
  )
}

/** The row above the cards: the ledger for the rest, the filters and the counts. */
function Filters({ statement, ledgerOptions }) {
  return (
    <div className="mb-3 grid gap-3 border-b border-border pb-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_auto_auto]">
      <SelectField
        id="bank-statement-remaining-ledger"
        label="Ledger for Remaining entries"
        size="sm"
        searchable
        searchPlaceholder="Search ledger..."
        placeholder="Select ledger"
        options={ledgerOptions}
        value={statement.remainingLedger}
        onValueChange={statement.setRemainingLedger}
        onClear={() => statement.setRemainingLedger('')}
      />

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        {VOUCHER_TYPES.map((type) => (
          <CheckboxField
            key={type}
            id={`bank-statement-type-${type}`}
            label={type}
            checked={statement.types[type]}
            onCheckedChange={(checked) => statement.setTypes((current) => ({ ...current, [type]: checked === true }))}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <CheckboxField
          id="bank-statement-agst-ref"
          label={statement.agstOn && statement.agstCount ? `Agst Ref: ${statement.agstCount}` : 'Agst Ref'}
          checked={statement.agstOn}
          disabled={statement.loadingOutstanding}
          onCheckedChange={(checked) => statement.setAgstOn(checked === true)}
        />
        <CheckboxField
          id="bank-statement-unmapped"
          label="Unmapped Entries"
          checked={statement.unmappedOnly}
          onCheckedChange={(checked) => statement.setUnmappedOnly(checked === true)}
        />
      </div>
    </div>
  )
}

/** The entries of this batch, each as its voucher, and the way to send them. */
export default function StatementEntries({ statement, ledgerOptions, ledgerNames, bankLedger, isTally }) {
  const [shown, setShown] = useState(CARDS_PAGE)
  const { visible } = statement

  return (
    <Panel
      title="Entries"
      meta={` (Total: ${statement.total} · Remaining: ${statement.remainingCount} · Shown: ${visible.length})`}
      actions={<Actions statement={statement} isTally={isTally} />}
    >
      <Filters statement={statement} ledgerOptions={ledgerOptions} />

      <div className="max-h-[calc(100vh-16rem)] overflow-auto pr-1">
        {statement.loadingPage ? <Loader variant="section" label="Loading entries..." /> : null}

        {!statement.loadingPage && visible.length === 0 ? (
          <StateMessage icon={ListChecks} title="No entries to show">
            {statement.entries.length ? 'No entry matches the filters above.' : 'Every entry of this batch has been handled.'}
          </StateMessage>
        ) : null}

        {!statement.loadingPage
          ? visible.slice(0, shown).map((entry) => (
              <EntryCard
                key={entry.sr_no}
                entry={entry}
                statement={statement}
                ledgerOptions={ledgerOptions}
                ledgerNames={ledgerNames}
                bankLedger={bankLedger}
              />
            ))
          : null}

        {!statement.loadingPage && visible.length > shown ? (
          <div className="mt-3 text-center">
            <Button variant="outline" size="sm" onClick={() => setShown((current) => current + CARDS_PAGE)}>
              Show {Math.min(CARDS_PAGE, visible.length - shown)} more
            </Button>
          </div>
        ) : null}
      </div>
    </Panel>
  )
}
