import { useEffect, useMemo, useRef, useState } from 'react'
import { CloudDownload, RefreshCw, Waypoints } from 'lucide-react'

import { InlineAlert } from '@/Components/Common/DataList'
import { TableFilters, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { B2B_CNDN_PAGE_SIZE, B2B_CNDN_SOURCE } from '@/Constants/b2bCndn'
import { useListView } from '@/Hooks/useListView'
import B2BMappingModal from '@/Modules/B2BCNDN/B2B/B2BMappingModal'
import Gstr2bFetchModal from '@/Modules/B2BCNDN/B2B/Gstr2bFetchModal'
import { b2bVoucherLines, checkB2BEntry, purchaseTypeText, readB2BBatch, toB2BSentRow, toB2BTallyRow } from '@/Modules/B2BCNDN/B2B/b2bEntry'
import useB2BBatch from '@/Modules/B2BCNDN/B2B/useB2BBatch'
import EntriesCard from '@/Modules/B2BCNDN/shared/EntriesCard'
import GetEntriesCard from '@/Modules/B2BCNDN/shared/GetEntriesCard'
import GetEntriesToggle from '@/Modules/B2BCNDN/shared/GetEntriesToggle'
import GstLines from '@/Modules/B2BCNDN/shared/GstLines'
import { describeKey, flattenMapping, isB2BRuleKey } from '@/Modules/B2BCNDN/shared/ledgerMapping'
import SimilarLedgersNotice from '@/Modules/B2BCNDN/shared/SimilarLedgersNotice'
import useLedgerDirectory from '@/Modules/B2BCNDN/shared/useLedgerDirectory'
import ResolveNote from '@/Modules/B2BCNDN/shared/ResolveNote'
import useResolveTracking, { RESOLVE_ROW_CLASS, RESOLVE_STATE } from '@/Modules/B2BCNDN/shared/useResolveTracking'
import CreatePartyLedgerModal from '@/Modules/SalesEntries/shared/CreatePartyLedgerModal'
import EntriesTable from '@/Modules/SalesEntries/shared/EntriesTable'
import { Amount, LedgerPickCell, PartyCell, VoucherPreview } from '@/Modules/SalesEntries/shared/EntryCells'
import { EntrySource } from '@/Modules/SalesEntries/shared/GetEntriesPanel'
import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'
import SendActions from '@/Modules/SalesEntries/shared/SendActions'
import useEntrySelection from '@/Modules/SalesEntries/shared/useEntrySelection'
import useGuardedSend from '@/Modules/SalesEntries/shared/useGuardedSend'
import useKeywordMapping from '@/Modules/SalesEntries/shared/useKeywordMapping'
import useTallySendAndMark from '@/Modules/SalesEntries/shared/useTallySendAndMark'
import { TALLY_SEND_B2B_MODULE, buildSendB2BMessage, markB2BCndnSent, uploadB2BCndnFile } from '@/Services/Accounting/b2bCndnService'
import { KEYWORD_SOURCE } from '@/Services/Accounting/keywordMappingService'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate } from '@/Utils/date'

/**
 * B2B - the GSTR-2B "B2B" sheet as purchase vouchers in Tally.
 *
 *   Get Entries     upload the GSTR-2B workbook, or fetch the months from the
 *                   GST portal - either REPLACES this user's B2B entries
 *   the batch       b2b_cndn_data/ answers the first 100 entries not yet sent.
 *                   Matched (the backend found the party's ledger) and unmatched
 *                   ones are one list; an unmatched one becomes sendable once its
 *                   party has a ledger - created here, or named by a party mapping
 *   Ledger Mapping  purchase ledger by slab and local / interstate, party ledger,
 *                   GST ledger (B2BMappingModal); each entry can also take its own
 *                   purchase ledger in the last column
 *   Send to Tally   b2b_data; ONLY on Tally's "success" is the PUT made that marks
 *                   the entries sent - then the batch is read again, and the next
 *                   entries come in
 *
 * The rows of one invoice are one voucher, so they are ticked and sent together.
 *
 * GST LEDGERS are checked on every entry (shared/gstValidation): a wrong one is
 * shown on a tomato background, and Send to Tally stays disabled while ANY
 * entry of the batch has one - put right in Ledger Mapping > GST Ledger, or by
 * creating the ledger. An entry the user has tried to put right (a party or GST
 * mapping, a ledger created) is red while that is checked, then tomato if it
 * still cannot go, else normal (useResolveTracking). Unmatched alone is normal.
 *
 *   getEntries     whether Get Entries shows, and the way back to it (B2BCndnScreen)
 *   reportEntries  (source, has) - tells the screen whether valid entries are on screen
 */

const SEARCH_FIELDS = ['invoiceNo', 'party', 'ownParty', 'gstin']
const FILTER_FIELDS = { ledgerStatus: 'Ledger', gstStatus: 'GST Ledger', typeText: 'Purchase Type' }

const SEND_LABELS = Object.freeze({
  done: 'B2B entries sent to Tally.',
  failed: 'Tally could not take the B2B entries.',
  busy: 'B2B entries are still being sent to Tally. Please wait for it to finish.',
})

const UPLOAD_FAILED = 'The file could not be read. Upload the GSTR-2B Excel file from the GST portal, with its "B2B" sheet.'

export default function B2BView({ companyId, companyName, isTally, canCreateLedger, getEntries, reportEntries }) {
  const batch = useB2BBatch(companyId)
  const ledgers = useLedgerDirectory(companyId)
  const mapping = useKeywordMapping(companyId, KEYWORD_SOURCE.B2B)
  const flat = useMemo(() => flattenMapping(mapping.mapping, companyName), [mapping.mapping, companyName])
  const [overrides, setOverrides] = useState({})
  // null, or where the mapping dialog opens - a new id resets its form
  const [mappingAt, setMappingAt] = useState(null)
  const [portalOpen, setPortalOpen] = useState(false)
  const [creatingFor, setCreatingFor] = useState(null)
  // The PUT row of every entry handed to Tally, by key - read when it is marked sent (or again, on retry).
  const sentRowsRef = useRef(new Map())
  const resolving = useResolveTracking()

  const read = useMemo(() => readB2BBatch(batch.reply, { mapping: flat, ledgerNames: ledgers.names }), [batch.reply, flat, ledgers.names])

  // Valid entries on screen: Get Entries and the B2B / CNDN switch step aside (B2BCndnScreen).
  const hasEntries = read.entries.length > 0
  useEffect(() => reportEntries(B2B_CNDN_SOURCE.B2B, hasEntries), [reportEntries, hasEntries])

  const purchaseOf = (entry) => overrides[entry.key] || entry.mappedPurchase.ledger

  // An invoice goes whole or not at all: a line in its way stops the others too.
  const ownProblems = new Map(read.entries.map((entry) => [entry.key, checkB2BEntry(entry, purchaseOf(entry))]))
  const invoiceProblem = new Map()
  read.entries.forEach((entry) => {
    const problem = ownProblems.get(entry.key)
    if (problem && !invoiceProblem.has(entry.invoiceKey)) invoiceProblem.set(entry.invoiceKey, problem)
  })
  const problemOf = (entry) =>
    ownProblems.get(entry.key) || (invoiceProblem.has(entry.invoiceKey) ? `Another line of this invoice: ${invoiceProblem.get(entry.invoiceKey)}` : null)

  const entries = useMemo(
    () =>
      read.entries.map((entry) => ({
        ...entry,
        ledgerStatus: entry.notInTally ? 'Party ledger missing' : 'Party ledger found',
        gstStatus: entry.gstIssues.length > 0 ? 'GST ledger error' : 'GST ledgers valid',
        typeText: purchaseTypeText(entry.purchaseType),
      })),
    [read.entries],
  )

  const tally = useTallySendAndMark({
    moduleName: TALLY_SEND_B2B_MODULE,
    companyName,
    buildMessage: buildSendB2BMessage,
    markSent: (keys) => markB2BCndnSent(B2B_CNDN_SOURCE.B2B, keys.map((key) => sentRowsRef.current.get(key)).filter(Boolean)),
    onSettled: batch.reload,
    labels: SEND_LABELS,
  })
  const busy = tally.busy

  const locked = useMemo(() => {
    const keys = new Set([...tally.inFlight, ...tally.unmarked])
    return new Set(entries.filter((entry) => keys.has(entry.key)).map((entry) => entry.key))
  }, [entries, tally.inFlight, tally.unmarked])

  const pick = useEntrySelection(entries, {
    locked,
    isReady: (entry) => !problemOf(entry) && !entry.notInTally,
    groupOf: (entry) => entry.invoiceKey,
  })
  const guard = useGuardedSend({
    chosen: pick.chosen,
    problemOf,
    toItem: (entry) => {
      sentRowsRef.current.set(entry.key, toB2BSentRow(entry, purchaseOf(entry), companyId))
      return {
        invoiceNo: entry.key,
        row: toB2BTallyRow(entry, purchaseOf(entry)),
      }
    },
    tally,
  })

  const view = useListView(entries, {
    searchFields: SEARCH_FIELDS,
    filterFields: FILTER_FIELDS,
    initialPageSize: B2B_CNDN_PAGE_SIZE,
  })
  const offset = typeof view.pageSize === 'number' ? (view.page - 1) * view.pageSize : 0
  const parties = [...new Set(entries.map((entry) => entry.ownParty).filter(Boolean))]

  // What a put-right entry waits on before it can be checked again.
  const checking = ledgers.status === 'loading' || batch.status === 'loading' || mapping.saving || mapping.status === 'loading'
  const stateOf = (entry) => resolving.stateOf(entry, { pending: checking, problem: problemOf(entry) || (entry.notInTally ? 'not in Tally' : null) })
  const unlocked = entries.filter((entry) => !locked.has(entry.key))
  const gstErrors = unlocked.filter((entry) => entry.gstIssues.length > 0)
  const pendingCount = unlocked.filter((entry) => stateOf(entry) === RESOLVE_STATE.PENDING).length
  const blocked =
    pendingCount > 0
      ? 'Checking the ledgers...'
      : gstErrors.length > 0
        ? `Fix the GST ledgers of ${plural(gstErrors.length, 'entry', 'entries')} to send`
        : null

  /** After the user's action: the entries it was meant to put right are checked again. */
  const touchAfterMapping = (keys) => {
    const names = new Set(
      Object.keys(keys)
        .filter((key) => !isB2BRuleKey(key))
        .map((key) => key.toLowerCase()),
    )
    const ruled = Object.keys(keys).some(isB2BRuleKey)
    resolving.touch(
      entries
        .filter((entry) => names.has(entry.ownParty.toLowerCase()) || (ruled && (entry.gstIssues.length > 0 || problemOf(entry))))
        .map((entry) => entry.key),
    )
  }
  const touchAfterCreate = (created) =>
    resolving.touch(
      entries.filter((entry) => (created.gstin && entry.gstin === created.gstin) || entry.ownParty === created.ownParty).map((entry) => entry.key),
    )

  const restart = () => {
    pick.clear()
    setOverrides({})
    resolving.clear()
  }

  const setOverride = (key, name) =>
    setOverrides((previous) => {
      const next = { ...previous }
      if (name) next[key] = name
      else delete next[key]
      return next
    })

  const columns = [
    {
      key: 'invoice',
      head: 'Invoice',
      width: 150,
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
      width: 250,
      cell: (entry) => (
        <>
          <PartyCell
            name={entry.party}
            mappedFrom={entry.mappedFrom}
            sub={[entry.gstin, entry.state].filter(Boolean).join(' · ')}
            notInTally={entry.notInTally}
            onCreate={
              canCreateLedger
                ? () =>
                    setCreatingFor({
                      ...entry,
                      partyLedger: entry.ownParty,
                      address: '',
                    })
                : undefined
            }
            locked={locked.has(entry.key)}
            problem={entry.notInTally ? null : problemOf(entry)}
            disabled={busy}
          />
          <ResolveNote state={stateOf(entry)} stillMissing={entry.notInTally ? entry.party : ''} />
          {entry.notInTally && !locked.has(entry.key) ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
              disabled={busy}
              onClick={() =>
                setMappingAt({
                  tab: 'party',
                  party: entry.ownParty,
                  id: Date.now(),
                })
              }
            >
              Map to an existing ledger
            </Button>
          ) : null}
        </>
      ),
    },
    {
      key: 'gst',
      head: 'GST',
      width: 200,
      cell: (entry) => <GstLines lines={entry.taxes} rate={entry.gstRate} extra={entry.typeText} />,
    },
    {
      key: 'taxable',
      head: 'Taxable',
      width: 120,
      align: 'right',
      cell: (entry) => <Amount value={entry.taxable} />,
    },
    {
      key: 'value',
      head: 'Invoice Value',
      width: 130,
      align: 'right',
      cell: (entry) => <Amount value={entry.invoiceValue} className="font-medium" />,
    },
    {
      key: 'purchase',
      head: 'Purchase Ledger',
      width: 230,
      cell: (entry) => (
        <>
          <LedgerPickCell
            id={`b2b-purchase-ledger-${entry.key}`}
            label={`Purchase ledger of invoice ${entry.invoiceNo}`}
            value={overrides[entry.key] ?? ''}
            defaultValue={entry.mappedPurchase.ledger}
            options={ledgers.options}
            disabled={busy || locked.has(entry.key) || !isTally}
            onChange={(name) => setOverride(entry.key, name)}
          />
          {!overrides[entry.key] ? (
            <div className="mt-1 text-[11px] text-muted-foreground">
              {entry.mappedPurchase.key ? `Mapped: ${describeKey(entry.mappedPurchase.key).label}` : 'Not mapped'}
            </div>
          ) : null}
        </>
      ),
    },
  ]

  const details = (entry) => (
    <VoucherPreview
      lines={b2bVoucherLines(entry, purchaseOf(entry))}
      details={[
        { label: 'Party in the GST portal', value: entry.ownParty },
        { label: 'Place of supply', value: entry.placeOfSupply },
        {
          label: 'Invoice value / Taxable',
          value: [entry.invoiceValue, entry.taxable].map(formatIndianCurrency).join(' / '),
        },
      ]}
      note="The lines of one invoice are added up into one purchase voucher."
    />
  )

  const footer =
    read.remaining > 0 ? (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>{plural(read.remaining, 'more entry comes', 'more entries come')} in as the entries of this batch are sent.</span>
        <Button type="button" variant="outline" size="sm" icon={RefreshCw} disabled={busy || batch.status === 'loading'} onClick={batch.reload}>
          Load next batch
        </Button>
      </div>
    ) : null

  return (
    <div className="space-y-4">
      {getEntries.visible ? (
        <GetEntriesCard
          upload={(file) => uploadB2BCndnFile(B2B_CNDN_SOURCE.B2B, companyId, file)}
          onUploaded={(reply) => {
            restart()
            batch.show(reply)
            getEntries.onLoaded()
          }}
          sheet="B2B"
          total={read.total}
          replaces="every B2B entry you uploaded or fetched before"
          disabled={busy}
          failedText={UPLOAD_FAILED}
        >
          <EntrySource icon={CloudDownload} title="GSTR-2B from the GST portal" description="The B2B invoices of the months you choose, read from the portal.">
            <Button type="button" variant="outline" size="sm" icon={CloudDownload} disabled={busy} onClick={() => setPortalOpen(true)}>
              Fetch from GST Portal
            </Button>
          </EntrySource>
        </GetEntriesCard>
      ) : null}

      <EntriesCard
        status={batch.status}
        error={batch.error}
        onRetry={batch.reload}
        tally={tally}
        isTally={isTally}
        hasAny={read.total > 0}
        entryCount={entries.length}
        emptyTitle="No B2B entries yet"
        emptyHint="Upload the GSTR-2B file, or fetch it from the GST portal. The entries show here before anything goes to Tally."
        doneHint={read.remaining > 0 ? 'Load the next batch for the entries after these.' : 'Every B2B entry has been sent to Tally.'}
        meta={read.total > 0 ? ` (Batch: ${entries.length} · Total: ${read.total})` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <GetEntriesToggle toggle={getEntries.toggle} disabled={busy} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Waypoints}
              disabled={busy}
              onClick={() => setMappingAt({ tab: 'purchase', id: Date.now() })}
            >
              Ledger Mapping
            </Button>
            {/* Only once an upload has brought entries - before that nothing asks the API. */}
            {read.total > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={RefreshCw}
                loading={batch.status === 'loading' && read.total > 0}
                disabled={busy}
                onClick={batch.reload}
              >
                Refresh
              </Button>
            ) : null}
          </div>
        }
        footer={footer}
      >
        <SimilarLedgersNotice similar={read.similar} />
        {gstErrors.length > 0 ? (
          <InlineAlert
            action={
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setMappingAt({ tab: 'tax', id: Date.now() })}>
                Map GST Ledgers
              </Button>
            }
          >
            {plural(gstErrors.length, 'entry has', 'entries have')} a GST ledger that cannot be used (shown in tomato). Nothing can be sent to Tally until they
            are put right - map the GST ledger, or create it.
          </InlineAlert>
        ) : null}
        <TableFilters
          view={view}
          searchPlaceholder="Search invoice, party or GSTIN"
          actions={<SendActions isTally={isTally} count={pick.chosen.length} tally={tally} guard={guard} busy={busy} blocked={blocked} />}
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
          rowClassName={(entry) => RESOLVE_ROW_CLASS[stateOf(entry)]}
        />
        <TablePager view={view} />
      </EntriesCard>

      <B2BMappingModal
        key={mappingAt?.id ?? 'closed'}
        open={Boolean(mappingAt)}
        onOpenChange={(next) => !next && setMappingAt(null)}
        mapping={mapping}
        flat={flat}
        ledgers={ledgers}
        parties={parties}
        initial={mappingAt}
        onSaved={touchAfterMapping}
      />
      <Gstr2bFetchModal
        open={portalOpen}
        onOpenChange={setPortalOpen}
        companyId={companyId}
        companyName={companyName}
        total={read.total}
        onFetched={() => {
          restart()
          batch.reload()
          getEntries.onLoaded()
        }}
      />
      <CreatePartyLedgerModal
        entry={creatingFor}
        companyId={companyId}
        companyName={companyName}
        group="Sundry Creditors"
        onClose={() => setCreatingFor(null)}
        onCreated={() => {
          touchAfterCreate(creatingFor)
          setCreatingFor(null)
          batch.reload()
        }}
      />
    </div>
  )
}
