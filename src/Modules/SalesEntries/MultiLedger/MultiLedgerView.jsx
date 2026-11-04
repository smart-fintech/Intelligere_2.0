import { useMemo, useState } from 'react'
import { CloudDownload, Landmark, MonitorDown } from 'lucide-react'

import { Field } from '@/Components/Common/FormFields'
import { TableFilters, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { SALES_BUYER_KIND, SALES_ENTRIES_PAGE_SIZE } from '@/Constants/salesEntries'
import { useListView } from '@/Hooks/useListView'
import { BuyerBadge, BuyerKindFilter } from '@/Modules/SalesEntries/MultiLedger/BuyerKind'
import Gstr1FetchModal from '@/Modules/SalesEntries/MultiLedger/Gstr1FetchModal'
import { GSTR_1_OUTCOME } from '@/Modules/SalesEntries/MultiLedger/gstr1Reply'
import SalesTallyFetchModal from '@/Modules/SalesEntries/MultiLedger/SalesTallyFetchModal'
import { checkMultiEntry, fillB2cEntry, multiVoucherLines, readMultiEntry, toMultiLedgerRow } from '@/Modules/SalesEntries/MultiLedger/multiLedger'
import useGstr1Fetch from '@/Modules/SalesEntries/MultiLedger/useGstr1Fetch'
import useSalesTallyFetch from '@/Modules/SalesEntries/MultiLedger/useSalesTallyFetch'
import CreatePartyLedgerModal from '@/Modules/SalesEntries/shared/CreatePartyLedgerModal'
import DefaultLedgerSelect from '@/Modules/SalesEntries/shared/DefaultLedgerSelect'
import EntriesPanel from '@/Modules/SalesEntries/shared/EntriesPanel'
import EntriesTable from '@/Modules/SalesEntries/shared/EntriesTable'
import { Amount, LedgerPickCell, Lines, PartyCell, VoucherPreview } from '@/Modules/SalesEntries/shared/EntryCells'
import GetEntriesPanel, { EntrySource } from '@/Modules/SalesEntries/shared/GetEntriesPanel'
import KeywordMappingModal from '@/Modules/SalesEntries/shared/KeywordMappingModal'
import SendActions from '@/Modules/SalesEntries/shared/SendActions'
import useEntryBatches from '@/Modules/SalesEntries/shared/useEntryBatches'
import useEntrySelection from '@/Modules/SalesEntries/shared/useEntrySelection'
import useGuardedSend from '@/Modules/SalesEntries/shared/useGuardedSend'
import useKeywordMapping from '@/Modules/SalesEntries/shared/useKeywordMapping'
import { useCompanyLedgers, useSalesLedgerChoice } from '@/Modules/SalesEntries/shared/useLedgerChoices'
import useTallySendAndMark from '@/Modules/SalesEntries/shared/useTallySendAndMark'
import { KEYWORD_SOURCE } from '@/Services/keywordMappingService'
import {
  MULTI_LEDGER_CSV_FORMAT_CONTENT,
  MULTI_LEDGER_CSV_FORMAT_FILE,
  TALLY_SEND_MULTI_LEDGER_MODULE,
  buildSendMultiLedgerMessage,
  getMultiLedgerEntries,
  markMultiLedgerEntriesSent,
  uploadMultiLedgerEntries,
} from '@/Services/salesEntriesService'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate } from '@/Utils/date'

/**
 * WITHOUT INVENTORY - MULTI LEDGER. One entry is one invoice with its own
 * ledger lines (sales, charges, round off) and GST:
 *
 *   Get entries     Download Format, Upload CSV, Fetch from Tally (a CSV in the
 *                   upload's format, to look over and upload), Fetch from
 *                   GSTR-1 (the month's B2B / B2C invoices straight in as
 *                   entries, useGstr1Fetch)
 *   B2B / B2C       read from the entry (a buyer GSTIN is B2B), shown on each
 *                   row and as the filter over the table. A B2C entry with no
 *                   party posts to the B2C Party Ledger; B2C summaries (no
 *                   invoice number) take the B2C Summary Date and go together
 *   The entries     a batch of 50 invoices (useEntryBatches), paged and
 *                   searched in the browser (useListView), read through the
 *                   multi_party keyword mapping (readMultiEntry)
 *   Sales ledger    only for an entry with no ledger lines: the default, or its own
 *   Send to Tally   the ticked entries (useTallySendAndMark), marked sent only
 *                   when Tally created them all
 */

const SEARCH_FIELDS = ['invoiceNo', 'partyLedger', 'gstin']
const FILTER_FIELDS = { state: 'State' }
const MAPPING_RULE = 'A party ledger CONTAINING the keyword, or a ledger line or GST ledger that IS the keyword, becomes the mapped ledger.'
const SUMMARY_GROUP = 'b2c-summary'

/** The last day of a GSTR-1 month, as the entries' dates are written: "2026-05-31". */
const lastDayOf = ({ month, year }) => {
  const day = new Date(Number(year), Number(month), 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function MultiLedgerView({ companyId, companyName, isTally, canCreateLedger }) {
  const batch = useEntryBatches(companyId, getMultiLedgerEntries)
  const sales = useSalesLedgerChoice(companyId)
  const ledgers = useCompanyLedgers(companyId)
  const mapping = useKeywordMapping(companyId, KEYWORD_SOURCE.MULTI_PARTY)
  const [mappingOpen, setMappingOpen] = useState(false)
  const [creatingFor, setCreatingFor] = useState(null)
  const [buyerKind, setBuyerKind] = useState(SALES_BUYER_KIND.ALL)
  const [b2cParty, setB2cParty] = useState('')
  const [summaryDate, setSummaryDate] = useState('')

  const read = useMemo(
    () => batch.rows.map((raw) => readMultiEntry(raw, { mapping: mapping.mapping, ledgerNames: ledgers.names })),
    [batch.rows, mapping.mapping, ledgers.names],
  )
  const entries = useMemo(() => read.map((entry) => fillB2cEntry(entry, { party: b2cParty, summaryDate })), [read, b2cParty, summaryDate])
  const needsB2cParty = read.some((entry) => entry.buyer === SALES_BUYER_KIND.B2C && !entry.partyLedger)
  const needsSummaryDate = read.some((entry) => entry.isSummary && !entry.invoiceDate)
  const counts = {
    [SALES_BUYER_KIND.ALL]: entries.length,
    [SALES_BUYER_KIND.B2B]: entries.filter((entry) => entry.buyer === SALES_BUYER_KIND.B2B).length,
    [SALES_BUYER_KIND.B2C]: entries.filter((entry) => entry.buyer === SALES_BUYER_KIND.B2C).length,
  }
  const shown = useMemo(
    () => (buyerKind === SALES_BUYER_KIND.ALL ? entries : entries.filter((entry) => entry.buyer === buyerKind)),
    [entries, buyerKind],
  )

  const [fetchOpen, setFetchOpen] = useState(false)
  const tallyFetch = useSalesTallyFetch({ companyName, onFetched: () => setFetchOpen(false) })
  const [gstr1Open, setGstr1Open] = useState(false)
  const gstr1 = useGstr1Fetch({
    companyId,
    // The fetched invoices have replaced the entries: start on batch 1 again.
    onSaved: (request) => {
      pick.clear()
      sales.clearOverrides()
      setSummaryDate(lastDayOf(request))
      batch.restart()
    },
    onSettled: (result) => {
      if (result.outcome === GSTR_1_OUTCOME.SAVED || result.outcome === GSTR_1_OUTCOME.SECTIONS_SAVED) setGstr1Open(false)
    },
  })
  const tally = useTallySendAndMark({
    moduleName: TALLY_SEND_MULTI_LEDGER_MODULE,
    companyName,
    buildMessage: buildSendMultiLedgerMessage,
    // B2C summaries share one empty invoice number: it is sent once.
    markSent: (numbers) => markMultiLedgerEntriesSent(companyId, [...new Set(numbers)]),
    onSettled: batch.reload,
  })
  const busy = tally.busy || tallyFetch.busy || gstr1.fetching

  const salesLedgerOf = (entry) => sales.ledgerOf(entry.key)
  const problemOf = (entry) => checkMultiEntry(entry, salesLedgerOf(entry))
  const locked = useMemo(() => {
    const numbers = new Set([...tally.inFlight, ...tally.unmarked])
    return new Set(entries.filter((entry) => numbers.has(entry.invoiceNo)).map((entry) => entry.key))
  }, [entries, tally.inFlight, tally.unmarked])
  // Only what the B2B / B2C filter shows can be ticked and sent.
  const pick = useEntrySelection(shown, {
    locked,
    isReady: (entry) => !problemOf(entry) && !entry.notInTally,
    groupOf: (entry) => (entry.isSummary ? SUMMARY_GROUP : null),
  })
  const guard = useGuardedSend({
    chosen: pick.chosen,
    problemOf,
    toItem: (entry) => ({ invoiceNo: entry.invoiceNo, row: toMultiLedgerRow(entry, salesLedgerOf(entry)) }),
    tally,
  })

  const view = useListView(shown, { searchFields: SEARCH_FIELDS, filterFields: FILTER_FIELDS, initialPageSize: SALES_ENTRIES_PAGE_SIZE })
  const offset = typeof view.pageSize === 'number' ? (view.page - 1) * view.pageSize : 0
  // A B2C entry with no party yet is waiting for the B2C Party Ledger, not missing from Tally.
  const notInTallyHere = entries.filter((entry) => entry.notInTally && entry.partyLedger).length

  const columns = [
    {
      key: 'invoice',
      head: 'Invoice',
      width: 140,
      cell: (entry) => (
        <>
          <BuyerBadge entry={entry} />
          <div className="mt-1 font-medium">{entry.invoiceNo || (entry.isSummary ? 'No invoice no.' : '--')}</div>
          <div className="text-xs text-muted-foreground">
            {entry.invoiceDate ? formatDate(entry.invoiceDate) : '--'}
            {entry.dateFromSummary ? ' (summary date)' : ''}
          </div>
        </>
      ),
    },
    {
      key: 'party',
      head: 'Party Ledger',
      width: 230,
      cell: (entry) => (
        <PartyCell
          name={entry.partyLedger}
          mappedFrom={entry.mappedFrom}
          sub={[entry.partyFromB2c ? 'B2C party ledger' : '', entry.gstin, entry.state].filter(Boolean).join(' · ')}
          notInTally={entry.notInTally && Boolean(entry.partyLedger)}
          onCreate={canCreateLedger && entry.partyLedger ? () => setCreatingFor(entry) : undefined}
          locked={locked.has(entry.key)}
          problem={problemOf(entry)}
          disabled={busy}
        />
      ),
    },
    { key: 'lines', head: 'Ledger Lines', width: 210, cell: (entry) => <Lines lines={entry.lines} empty="No ledger lines" /> },
    { key: 'gst', head: 'GST', width: 160, cell: (entry) => <Lines lines={entry.taxes} empty="No GST" /> },
    { key: 'taxable', head: 'Taxable', width: 110, align: 'right', cell: (entry) => <Amount value={entry.taxable} /> },
    { key: 'total', head: 'Total', width: 110, align: 'right', cell: (entry) => <Amount value={entry.total} className="font-medium" /> },
    {
      key: 'sales',
      head: 'Sales Ledger',
      width: 210,
      cell: (entry) =>
        entry.needsSalesLedger ? (
          <LedgerPickCell
            id={`multi-sales-ledger-${entry.key}`}
            label={`Sales ledger of invoice ${entry.invoiceNo}`}
            value={sales.overrideOf(entry.key)}
            defaultValue={sales.defaultLedger}
            options={sales.options}
            disabled={busy || locked.has(entry.key) || !isTally}
            onChange={(name) => sales.setOverride(entry.key, name)}
          />
        ) : (
          <span className="text-xs text-muted-foreground">From ledger lines</span>
        ),
    },
  ]

  const details = (entry) => (
    <VoucherPreview
      lines={multiVoucherLines(entry, salesLedgerOf(entry))}
      details={[
        { label: 'Address', value: entry.address },
        {
          label: 'Taxable / GST / Total',
          value: [entry.taxable, entry.gstTotal, entry.total].map(formatIndianCurrency).join(' / '),
        },
      ]}
      note="Tally builds the final voucher: sales, discount and round-off lines are posted as the ledger lines name them."
    />
  )

  return (
    <div className="space-y-4">
      <GetEntriesPanel
        format={{ file: MULTI_LEDGER_CSV_FORMAT_FILE, content: MULTI_LEDGER_CSV_FORMAT_CONTENT }}
        upload={(file) => uploadMultiLedgerEntries(companyId, file)}
        onUploaded={() => {
          pick.clear()
          sales.clearOverrides()
          batch.restart()
        }}
        total={batch.total}
        disabled={busy}
        replaces="the multi ledger entries you uploaded or fetched from GSTR-1 before"
        hint="One row per ledger line: the invoice on its first row, then its sales, charges and GST ledgers. Dates as DD/MM/YYYY."
      >
        <EntrySource
          icon={Landmark}
          title="From the GST portal (GSTR-1)"
          description="A month's B2B and B2C invoices straight in as entries. Other GSTR-1 sections can be saved alongside."
        >
          <Button type="button" size="sm" icon={CloudDownload} disabled={busy} onClick={() => setGstr1Open(true)}>
            Fetch from GSTR-1
          </Button>
        </EntrySource>
        {isTally ? (
          <EntrySource icon={MonitorDown} title="From Tally" description="Tally's sales vouchers of a period, as a CSV in the upload format - check it, then upload it.">
            <Button type="button" variant="outline" size="sm" icon={CloudDownload} disabled={busy} onClick={() => setFetchOpen(true)}>
              Fetch from Tally
            </Button>
          </EntrySource>
        ) : null}
      </GetEntriesPanel>

      <EntriesPanel
        batch={batch}
        tally={tally}
        isTally={isTally}
        busy={busy}
        entryCount={entries.length}
        meta={batch.total > 0 ? ` (Total: ${batch.total}${notInTallyHere ? ` · ${notInTallyHere} not in Tally on this batch` : ''})` : undefined}
        emptyHint={`Fetch a month from GSTR-1 or upload a CSV in the format above${isTally ? ' - or fetch the entries from Tally first' : ''}. They show here before anything goes to Tally.`}
      >
        <section className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <h3 className="text-sm font-medium text-foreground">Posting ledgers</h3>
          <div className="flex flex-wrap items-start gap-3">
            <DefaultLedgerSelect
              id="multi-default-sales-ledger"
              label="Default Sales Ledger"
              choices={sales}
              value={sales.defaultLedger}
              onChange={sales.setDefaultLedger}
              disabled={busy || !isTally}
              className="w-full sm:w-64"
            />
            {needsB2cParty ? (
              <DefaultLedgerSelect
                id="multi-b2c-party-ledger"
                label="B2C Party Ledger"
                choices={ledgers}
                value={b2cParty}
                onChange={setB2cParty}
                disabled={busy || !isTally}
                className="w-full sm:w-64"
              />
            ) : null}
            {needsSummaryDate ? (
              <Field
                id="multi-b2c-summary-date"
                label="B2C Summary Date"
                type="date"
                className="w-full sm:w-48"
                value={summaryDate}
                disabled={busy || !isTally}
                onChange={(event) => setSummaryDate(event.target.value)}
              />
            ) : null}
          </div>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            <li>Default Sales Ledger: for entries with no ledger lines - each can take its own. Entries with ledger lines post to the ledgers they name.</li>
            {needsB2cParty ? <li>B2C Party Ledger: the party of every B2C entry that names none, such as a cash or retail customers ledger.</li> : null}
            {needsSummaryDate ? (
              <li>B2C Summary Date: the voucher date of the B2C small-sales summaries, which carry none - set to the month&apos;s last day after a GSTR-1 fetch.</li>
            ) : null}
          </ul>
        </section>

        <BuyerKindFilter value={buyerKind} counts={counts} onChange={setBuyerKind} />

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
          describe={(entry) => (entry.isSummary ? `B2C summary ${entry.state || entry.key}` : `invoice ${entry.invoiceNo}`)}
        />
        <TablePager view={view} />
      </EntriesPanel>

      <SalesTallyFetchModal open={fetchOpen} onOpenChange={setFetchOpen} companyName={companyName} tallyFetch={tallyFetch} />
      <Gstr1FetchModal open={gstr1Open} onOpenChange={setGstr1Open} gstr1={gstr1} total={batch.total} companyName={companyName} />
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
