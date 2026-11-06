import { useMemo, useState } from 'react'

import { TableFilters, TablePager } from '@/Components/Common/TableTools'
import { SALES_ENTRIES_PAGE_SIZE } from '@/Constants/salesEntries'
import { useListView } from '@/Hooks/useListView'
import { checkSingleEntry, readSingleEntry, singleVoucherLines, toSingleLedgerRow } from '@/Modules/SalesEntries/SingleLedger/singleLedger'
import CreatePartyLedgerModal from '@/Modules/SalesEntries/shared/CreatePartyLedgerModal'
import DefaultLedgerSelect from '@/Modules/SalesEntries/shared/DefaultLedgerSelect'
import EntriesPanel from '@/Modules/SalesEntries/shared/EntriesPanel'
import EntriesTable from '@/Modules/SalesEntries/shared/EntriesTable'
import { Amount, LedgerPickCell, Lines, PartyCell, VoucherPreview } from '@/Modules/SalesEntries/shared/EntryCells'
import GetEntriesPanel from '@/Modules/SalesEntries/shared/GetEntriesPanel'
import KeywordMappingModal from '@/Modules/SalesEntries/shared/KeywordMappingModal'
import SendActions from '@/Modules/SalesEntries/shared/SendActions'
import useEntryBatches from '@/Modules/SalesEntries/shared/useEntryBatches'
import useEntrySelection from '@/Modules/SalesEntries/shared/useEntrySelection'
import useGuardedSend from '@/Modules/SalesEntries/shared/useGuardedSend'
import useKeywordMapping from '@/Modules/SalesEntries/shared/useKeywordMapping'
import { useCompanyLedgers, useSalesLedgerChoice } from '@/Modules/SalesEntries/shared/useLedgerChoices'
import useTallySendAndMark from '@/Modules/SalesEntries/shared/useTallySendAndMark'
import { KEYWORD_SOURCE } from '@/Services/Accounting/keywordMappingService'
import {
  SINGLE_LEDGER_CSV_FORMAT_CONTENT,
  SINGLE_LEDGER_CSV_FORMAT_FILE,
  TALLY_SEND_SINGLE_LEDGER_MODULE,
  buildSendSingleLedgerMessage,
  getSingleLedgerEntries,
  markSingleLedgerEntriesSent,
  uploadSingleLedgerEntries,
} from '@/Services/Accounting/salesEntriesService'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate } from '@/Utils/date'

/**
 * WITHOUT INVENTORY - SINGLE LEDGER. One invoice is posted to ONE sales
 * ledger: party Dr, sales ledger Cr for the taxable amount, plus its GST.
 *
 *   Party Ledger    one for the whole batch (the company's ledgers) - an
 *                   invoice that names its own keeps that one
 *   Sales Ledger    the default, or an invoice's own pick (the last column)
 *   Mapping         source without_inventory: a GST ledger name that IS a
 *                   keyword becomes the mapped ledger
 *   Send to Tally   sales_without_inventory, marked sent only on success
 */

const SEARCH_FIELDS = ['invoiceNo', 'ownParty', 'gstin']
const FILTER_FIELDS = { state: 'State' }
const MAPPING_RULE = 'A GST ledger name that IS the keyword becomes the mapped ledger.'

export default function SingleLedgerView({ companyId, companyName, isTally, canCreateLedger }) {
  const batch = useEntryBatches(companyId, getSingleLedgerEntries)
  const sales = useSalesLedgerChoice(companyId)
  const ledgers = useCompanyLedgers(companyId)
  const mapping = useKeywordMapping(companyId, KEYWORD_SOURCE.WITHOUT_INVENTORY)
  const [party, setParty] = useState('')
  const [mappingOpen, setMappingOpen] = useState(false)
  const [creatingFor, setCreatingFor] = useState(null)

  const entries = useMemo(
    () => batch.rows.map((raw) => readSingleEntry(raw, { mapping: mapping.mapping, ledgerNames: ledgers.names })),
    [batch.rows, mapping.mapping, ledgers.names],
  )

  const tally = useTallySendAndMark({
    moduleName: TALLY_SEND_SINGLE_LEDGER_MODULE,
    companyName,
    buildMessage: buildSendSingleLedgerMessage,
    markSent: (numbers) => markSingleLedgerEntriesSent(companyId, numbers),
    onSettled: batch.reload,
  })
  const busy = tally.busy

  const partyOf = (entry) => entry.ownParty || party
  const salesLedgerOf = (entry) => sales.ledgerOf(entry.key, entry.ownSalesLedger)
  const problemOf = (entry) => checkSingleEntry(entry, partyOf(entry), salesLedgerOf(entry))
  const locked = useMemo(() => {
    const numbers = new Set([...tally.inFlight, ...tally.unmarked])
    return new Set(entries.filter((entry) => numbers.has(entry.invoiceNo)).map((entry) => entry.key))
  }, [entries, tally.inFlight, tally.unmarked])
  const pick = useEntrySelection(entries, { locked, isReady: (entry) => !problemOf(entry) && !entry.notInTally })
  const guard = useGuardedSend({
    chosen: pick.chosen,
    problemOf,
    toItem: (entry) => ({ invoiceNo: entry.invoiceNo, row: toSingleLedgerRow(entry, partyOf(entry), salesLedgerOf(entry)) }),
    tally,
  })

  const view = useListView(entries, { searchFields: SEARCH_FIELDS, filterFields: FILTER_FIELDS, initialPageSize: SALES_ENTRIES_PAGE_SIZE })
  const offset = typeof view.pageSize === 'number' ? (view.page - 1) * view.pageSize : 0

  const columns = [
    {
      key: 'invoice',
      head: 'Invoice',
      width: 140,
      cell: (entry) => (
        <>
          <div className="font-medium">{entry.invoiceNo || '--'}</div>
          <div className="text-xs text-muted-foreground">{formatDate(entry.invoiceDate)}</div>
        </>
      ),
    },
    {
      key: 'party',
      head: 'Party Ledger',
      width: 230,
      cell: (entry) => (
        <PartyCell
          name={partyOf(entry)}
          sub={[entry.ownParty ? '' : party ? 'Batch party ledger' : '', entry.gstin, entry.state].filter(Boolean).join(' · ')}
          notInTally={entry.notInTally}
          onCreate={canCreateLedger && entry.ownParty ? () => setCreatingFor({ ...entry, partyLedger: entry.ownParty }) : undefined}
          locked={locked.has(entry.key)}
          problem={problemOf(entry)}
          disabled={busy}
        />
      ),
    },
    { key: 'gst', head: 'GST', width: 200, cell: (entry) => <Lines lines={entry.taxes} empty="No GST" /> },
    { key: 'taxable', head: 'Taxable', width: 120, align: 'right', cell: (entry) => <Amount value={entry.taxable} /> },
    { key: 'total', head: 'Total', width: 120, align: 'right', cell: (entry) => <Amount value={entry.total} className="font-medium" /> },
    {
      key: 'sales',
      head: 'Sales Ledger',
      width: 220,
      cell: (entry) =>
        entry.ownSalesLedger ? (
          <span className="text-xs">{entry.ownSalesLedger}</span>
        ) : (
          <LedgerPickCell
            id={`single-sales-ledger-${entry.key}`}
            label={`Sales ledger of invoice ${entry.invoiceNo}`}
            value={sales.overrideOf(entry.key)}
            defaultValue={sales.defaultLedger}
            options={sales.options}
            disabled={busy || locked.has(entry.key) || !isTally}
            onChange={(name) => sales.setOverride(entry.key, name)}
          />
        ),
    },
  ]

  const details = (entry) => (
    <VoucherPreview
      lines={singleVoucherLines(entry, partyOf(entry), salesLedgerOf(entry))}
      details={[
        { label: 'Address', value: entry.address },
        { label: 'Taxable / GST / Total', value: [entry.taxable, entry.gstTotal, entry.total].map(formatIndianCurrency).join(' / ') },
      ]}
    />
  )

  return (
    <div className="space-y-4">
      <GetEntriesPanel
        format={{ file: SINGLE_LEDGER_CSV_FORMAT_FILE, content: SINGLE_LEDGER_CSV_FORMAT_CONTENT }}
        upload={(file) => uploadSingleLedgerEntries(companyId, file)}
        onUploaded={() => {
          pick.clear()
          sales.clearOverrides()
          batch.restart()
        }}
        total={batch.total}
        disabled={busy}
        replaces="every single ledger invoice of the company"
        hint="One row per invoice and GST rate - rows of one invoice are put together. Entries show for an hour after the upload."
      />

      <EntriesPanel
        batch={batch}
        tally={tally}
        isTally={isTally}
        busy={busy}
        entryCount={entries.length}
        meta={batch.total > 0 ? ` (Total: ${batch.total})` : undefined}
        emptyHint="Upload a CSV in the format above. The entries show here before anything goes to Tally. An upload is kept for an hour - upload it again after that."
      >
        <div className="flex flex-wrap items-end gap-3">
          <DefaultLedgerSelect
            id="single-party-ledger"
            label="Party Ledger"
            choices={ledgers}
            value={party}
            onChange={setParty}
            disabled={busy || !isTally}
          />
          <DefaultLedgerSelect
            id="single-default-sales-ledger"
            label="Default Sales Ledger"
            choices={sales}
            value={sales.defaultLedger}
            onChange={sales.setDefaultLedger}
            disabled={busy || !isTally}
          />
          <p className="max-w-sm pb-2 text-xs text-muted-foreground">
            The party ledger is used for every invoice that does not name its own. Each invoice can take its own sales ledger.
          </p>
        </div>

        <TableFilters
          view={view}
          searchPlaceholder="Search invoice, party or GSTIN"
          actions={<SendActions isTally={isTally} count={pick.chosen.length} tally={tally} guard={guard} busy={busy} onMapping={() => setMappingOpen(true)} />}
        />
        <EntriesTable
          rows={view.rows}
          offset={offset}
          pick={pick}
          locked={locked}
          disabled={busy || !isTally}
          columns={columns}
          details={details}
          describe={(entry) => `invoice ${entry.invoiceNo}`}
        />
        <TablePager view={view} />
      </EntriesPanel>

      <KeywordMappingModal open={mappingOpen} onOpenChange={setMappingOpen} mapping={mapping} ledgers={ledgers} rule={MAPPING_RULE} />
      <CreatePartyLedgerModal
        entry={creatingFor}
        companyId={companyId}
        companyName={companyName}
        onClose={() => setCreatingFor(null)}
        onCreated={() => {
          setCreatingFor(null)
          batch.reload()
        }}
      />
    </div>
  )
}
