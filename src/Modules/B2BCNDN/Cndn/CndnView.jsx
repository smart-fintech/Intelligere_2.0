import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Waypoints } from 'lucide-react'

import { InlineAlert } from '@/Components/Common/DataList'
import { TableFilters, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { Input } from '@/Components/ui/input'
import { B2B_CNDN_PAGE_SIZE, B2B_CNDN_SOURCE } from '@/Constants/b2bCndn'
import { useListView } from '@/Hooks/useListView'
import { toast } from '@/Library/toast'
import CndnMappingModal from '@/Modules/B2BCNDN/Cndn/CndnMappingModal'
import {
  checkCndnEntry,
  cndnVoucherLines,
  noteKindText,
  readCndnEntry,
  readCndnUpload,
  toCndnMatchedPayload,
  toCndnSentRow,
  toCndnTallyRow,
} from '@/Modules/B2BCNDN/Cndn/cndnEntry'
import EntriesCard from '@/Modules/B2BCNDN/shared/EntriesCard'
import { failureText } from '@/Modules/B2BCNDN/shared/failureText'
import GetEntriesCard from '@/Modules/B2BCNDN/shared/GetEntriesCard'
import GetEntriesToggle from '@/Modules/B2BCNDN/shared/GetEntriesToggle'
import GstLines from '@/Modules/B2BCNDN/shared/GstLines'
import { describeKey, flattenMapping } from '@/Modules/B2BCNDN/shared/ledgerMapping'
import SimilarLedgersNotice from '@/Modules/B2BCNDN/shared/SimilarLedgersNotice'
import useLedgerDirectory from '@/Modules/B2BCNDN/shared/useLedgerDirectory'
import ResolveNote from '@/Modules/B2BCNDN/shared/ResolveNote'
import useResolveTracking, { RESOLVE_ROW_CLASS, RESOLVE_STATE } from '@/Modules/B2BCNDN/shared/useResolveTracking'
import CreatePartyLedgerModal from '@/Modules/SalesEntries/shared/CreatePartyLedgerModal'
import EntriesTable from '@/Modules/SalesEntries/shared/EntriesTable'
import { Amount, LedgerPickCell, PartyCell, VoucherPreview } from '@/Modules/SalesEntries/shared/EntryCells'
import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'
import SendActions from '@/Modules/SalesEntries/shared/SendActions'
import useEntrySelection from '@/Modules/SalesEntries/shared/useEntrySelection'
import useGuardedSend from '@/Modules/SalesEntries/shared/useGuardedSend'
import useKeywordMapping from '@/Modules/SalesEntries/shared/useKeywordMapping'
import useTallySendAndMark from '@/Modules/SalesEntries/shared/useTallySendAndMark'
import { TALLY_SEND_CNDN_MODULE, buildSendCndnMessage, markB2BCndnSent, saveCndnAsMatched, uploadB2BCndnFile } from '@/Services/Accounting/b2bCndnService'
import { KEYWORD_SOURCE } from '@/Services/Accounting/keywordMappingService'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate } from '@/Utils/date'

/**
 * CREDIT NOTE DEBIT NOTE - the GSTR-2B "B2B-CDNR" sheet as Debit / Credit
 * Note vouchers in Tally.
 *
 *   Upload          the notes come back in the upload's answer, and ONLY there:
 *                   the backend has no batch for CNDN. They stay on this screen
 *                   (kept while another view is open) until the page is left -
 *                   upload the file again to get them back.
 *   matched         saved by the upload, ready to send
 *   unmatched       not saved: their party had no ledger. Create it (or use the
 *                   one the company has for the GSTIN), then Save as matched
 *                   (new_b2b_cdnr_matched/) - only then can the note be sent
 *   Ledger Mapping  the credit note / debit note ledger by slab (CndnMappingModal);
 *                   each note can take its own in the last column
 *   Note no.        can be corrected for Tally; the backend keeps the one uploaded
 *   Send to Tally   cndn_data; ONLY on Tally's "success" the PUT marks the notes
 *                   sent, and they leave the list. Disabled while any note has a
 *                   wrong GST ledger (tomato) or a put-right note is being checked
 *                   (red) - B2BView's rules, useResolveTracking
 *
 *   getEntries     whether Get Entries shows, and the way back to it (B2BCndnScreen)
 *   reportEntries  (source, has) - tells the screen whether valid notes are on screen
 */

const SEARCH_FIELDS = ['noteNo', 'party', 'gstin']
const FILTER_FIELDS = { statusText: 'Status', gstStatus: 'GST Ledger', kindText: 'Note Type' }

const SEND_LABELS = Object.freeze({
  done: 'Credit / debit notes sent to Tally.',
  failed: 'Tally could not take the credit / debit notes.',
  busy: 'Credit / debit notes are still being sent to Tally. Please wait for it to finish.',
})

const UPLOAD_FAILED = 'The file could not be read. Upload the GSTR-2B Excel file from the GST portal, with its "B2B-CDNR" sheet.'
const SAVE_FAILED = 'The note could not be saved. Check that its ledger has the same GST number, and try again.'

export default function CndnView({ companyId, companyName, isTally, canCreateLedger, getEntries, reportEntries }) {
  const ledgers = useLedgerDirectory(companyId)
  const mapping = useKeywordMapping(companyId, KEYWORD_SOURCE.CNDN)
  const flat = useMemo(() => flattenMapping(mapping.mapping, companyName), [mapping.mapping, companyName])
  // [{ raw, saved, key, promoted }] - the upload's notes, less the ones marked sent
  const [notes, setNotes] = useState([])
  const [similar, setSimilar] = useState([])
  const [uploaded, setUploaded] = useState(false)
  const [overrides, setOverrides] = useState({})
  const [noteNumbers, setNoteNumbers] = useState({})
  const [savingKey, setSavingKey] = useState(null)
  const [mappingOpen, setMappingOpen] = useState(false)
  const [creatingFor, setCreatingFor] = useState(null)
  const sentRowsRef = useRef(new Map())

  const entries = useMemo(
    () =>
      notes.map((note) => {
        const entry = readCndnEntry(note, {
          mapping: flat,
          ledgerNames: ledgers.names,
          ledgerOfGstin: ledgers.ofGstin,
          tallyNoteNo: noteNumbers[note.key],
        })
        // invoiceNo: how the send's checks name an entry (useGuardedSend).
        return {
          ...entry,
          invoiceNo: entry.noteNo,
          statusText: entry.saved ? 'Matched' : 'Unmatched',
          gstStatus: entry.gstIssues.length > 0 ? 'GST ledger error' : 'GST ledgers valid',
          kindText: noteKindText(entry.kind),
        }
      }),
    // ofGstin is rebuilt with the ledger list, which `names` follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, flat, ledgers.names, noteNumbers],
  )

  // Valid notes on screen: Get Entries and the B2B / CNDN switch step aside (B2BCndnScreen).
  const hasEntries = notes.length > 0
  useEffect(() => reportEntries(B2B_CNDN_SOURCE.CNDN, hasEntries), [reportEntries, hasEntries])

  const ledgerOf = (entry) => overrides[entry.key] || entry.mappedLedger.ledger
  const problemOf = (entry) => checkCndnEntry(entry, ledgerOf(entry))

  const tally = useTallySendAndMark({
    moduleName: TALLY_SEND_CNDN_MODULE,
    companyName,
    buildMessage: buildSendCndnMessage,
    markSent: async (keys) => {
      await markB2BCndnSent(B2B_CNDN_SOURCE.CNDN, keys.map((key) => sentRowsRef.current.get(key)).filter(Boolean))
      setNotes((previous) => previous.filter((note) => !keys.includes(note.key)))
    },
    labels: SEND_LABELS,
  })
  const busy = tally.busy || savingKey !== null
  const resolving = useResolveTracking()

  const locked = useMemo(() => new Set([...tally.inFlight, ...tally.unmarked]), [tally.inFlight, tally.unmarked])
  const pick = useEntrySelection(entries, {
    locked,
    isReady: (entry) => !problemOf(entry) && !entry.notInTally,
  })
  const guard = useGuardedSend({
    chosen: pick.chosen,
    problemOf,
    toItem: (entry) => {
      sentRowsRef.current.set(entry.key, toCndnSentRow(entry, ledgerOf(entry), companyId))
      return {
        invoiceNo: entry.key,
        row: toCndnTallyRow(entry, ledgerOf(entry)),
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

  const setIn = (setter) => (key, value) =>
    setter((previous) => {
      const next = { ...previous }
      if (value) next[key] = value
      else delete next[key]
      return next
    })
  const setOverride = setIn(setOverrides)
  const setNoteNumber = setIn(setNoteNumbers)

  // What a put-right note waits on before it can be checked again (B2BView's rule).
  const checking = ledgers.status === 'loading' || mapping.saving || mapping.status === 'loading'
  const stateOf = (entry) =>
    resolving.stateOf(entry, {
      pending: checking || savingKey === entry.key,
      problem: problemOf(entry) || (entry.notInTally ? 'not in Tally' : null),
    })
  const unlocked = entries.filter((entry) => !locked.has(entry.key))
  const gstErrors = unlocked.filter((entry) => entry.gstIssues.length > 0)
  const pendingCount = unlocked.filter((entry) => stateOf(entry) === RESOLVE_STATE.PENDING).length
  const blocked =
    pendingCount > 0 ? 'Checking the ledgers...' : gstErrors.length > 0 ? `Fix the GST ledgers of ${plural(gstErrors.length, 'note', 'notes')} to send` : null
  // A mapping saved: the notes still in the way are checked again.
  const touchAfterMapping = () => resolving.touch(entries.filter((entry) => entry.gstIssues.length > 0 || problemOf(entry)).map((entry) => entry.key))

  const showUpload = (reply) => {
    const read = readCndnUpload(reply)
    pick.clear()
    setOverrides({})
    setNoteNumbers({})
    sentRowsRef.current = new Map()
    resolving.clear()
    setNotes(read.notes)
    setSimilar(read.similar)
    setUploaded(true)
    getEntries.onLoaded()
  }

  /** Saves an unmatched note against its GSTIN's ledger - the backend waits for a ledger still syncing. */
  const saveAsMatched = async (entry) => {
    if (savingKey) return
    resolving.touch([entry.key])
    setSavingKey(entry.key)
    try {
      await saveCndnAsMatched(companyId, toCndnMatchedPayload(entry))
      setNotes((previous) => previous.map((note) => (note.key === entry.key ? { ...note, saved: true, promoted: true } : note)))
      toast.success(`Note ${entry.noteNo} saved as matched.`)
    } catch (failure) {
      toast.error(failureText(failure, SAVE_FAILED))
    } finally {
      setSavingKey(null)
    }
  }

  const columns = [
    {
      key: 'note',
      head: 'Note',
      width: 190,
      cell: (entry) => (
        <>
          <Input
            aria-label={`Note number of ${entry.noteNo} in Tally`}
            className="h-8 text-sm"
            value={noteNumbers[entry.key] ?? entry.noteNo}
            disabled={busy || locked.has(entry.key) || !isTally}
            onChange={(event) => setNoteNumber(entry.key, event.target.value === entry.noteNo ? '' : event.target.value)}
          />
          <div className="mt-1 text-xs text-muted-foreground">
            {noteKindText(entry.kind)} · {formatDate(entry.noteDate)}
          </div>
          {noteNumbers[entry.key] ? <div className="text-[11px] text-muted-foreground">Uploaded as {entry.noteNo}</div> : null}
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
            sub={[entry.gstin, entry.state].filter(Boolean).join(' · ')}
            notInTally={entry.notInTally}
            onCreate={
              canCreateLedger && !entry.gstinLedger
                ? () =>
                    setCreatingFor({
                      ...entry,
                      partyLedger: entry.party,
                      address: '',
                    })
                : undefined
            }
            locked={locked.has(entry.key)}
            problem={entry.saved ? problemOf(entry) : null}
            disabled={busy}
          />
          <ResolveNote state={stateOf(entry)} stillMissing={entry.notInTally ? entry.party : ''} />
          {!entry.saved ? (
            <div className="mt-1 space-y-1">
              <p className="text-[11px] text-destructive">
                {entry.gstinLedger ? `Unmatched - the company's ledger for this GSTIN is ${entry.gstinLedger}.` : 'Unmatched - no ledger has this GSTIN yet.'}
              </p>
              {entry.gstinLedger ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  icon={CheckCircle2}
                  loading={savingKey === entry.key}
                  disabled={busy}
                  onClick={() => saveAsMatched(entry)}
                >
                  {savingKey === entry.key ? 'Saving...' : 'Save as matched'}
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'gst',
      head: 'GST',
      width: 190,
      cell: (entry) => <GstLines lines={entry.taxes} rate={entry.gstRate} />,
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
      head: 'Note Value',
      width: 120,
      align: 'right',
      cell: (entry) => <Amount value={entry.noteValue} className="font-medium" />,
    },
    {
      key: 'ledger',
      head: 'Note Ledger',
      width: 230,
      cell: (entry) => (
        <>
          <LedgerPickCell
            id={`cndn-ledger-${entry.key}`}
            label={`Ledger of note ${entry.noteNo}`}
            value={overrides[entry.key] ?? ''}
            defaultValue={entry.mappedLedger.ledger}
            options={ledgers.options}
            disabled={busy || locked.has(entry.key) || !isTally}
            onChange={(name) => setOverride(entry.key, name)}
          />
          {!overrides[entry.key] ? (
            <div className="mt-1 text-[11px] text-muted-foreground">
              {entry.mappedLedger.key ? `Mapped: ${describeKey(entry.mappedLedger.key).label}` : 'Not mapped'}
            </div>
          ) : null}
        </>
      ),
    },
  ]

  const details = (entry) => (
    <VoucherPreview
      lines={cndnVoucherLines(entry, ledgerOf(entry))}
      details={[
        { label: 'Supply type', value: entry.supplyType },
        { label: 'Voucher', value: noteKindText(entry.kind) },
        {
          label: 'Note value / Taxable',
          value: [entry.noteValue, entry.taxable].map(formatIndianCurrency).join(' / '),
        },
      ]}
    />
  )

  return (
    <div className="space-y-4">
      {getEntries.visible ? (
        <GetEntriesCard
          upload={(file) => uploadB2BCndnFile(B2B_CNDN_SOURCE.CNDN, companyId, file)}
          onUploaded={showUpload}
          sheet="B2B-CDNR"
          total={notes.length}
          replaces="every credit / debit note you uploaded before"
          disabled={busy}
          failedText={UPLOAD_FAILED}
        />
      ) : null}

      <EntriesCard
        status="ready"
        tally={tally}
        isTally={isTally}
        hasAny={uploaded}
        entryCount={entries.length}
        emptyTitle="No credit / debit notes yet"
        emptyHint="Upload the GSTR-2B file. The notes show here before anything goes to Tally, and stay until you leave this page."
        doneHint="Every note of the upload has been sent to Tally."
        meta={
          uploaded ? ` (${entries.filter((entry) => entry.saved).length} matched · ${entries.filter((entry) => !entry.saved).length} unmatched)` : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <GetEntriesToggle toggle={getEntries.toggle} disabled={busy} />
            <Button type="button" variant="outline" size="sm" icon={Waypoints} disabled={busy} onClick={() => setMappingOpen(true)}>
              Ledger Mapping
            </Button>
          </div>
        }
      >
        <SimilarLedgersNotice similar={similar} />
        {gstErrors.length > 0 ? (
          <InlineAlert
            action={
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setMappingOpen(true)}>
                Map GST Ledgers
              </Button>
            }
          >
            {plural(gstErrors.length, 'note has', 'notes have')} a GST ledger that cannot be used (shown in tomato). Nothing can be sent to Tally until they are
            put right - map the GST ledger (Ledger Mapping, GST Ledger), or create it.
          </InlineAlert>
        ) : null}
        <TableFilters
          view={view}
          searchPlaceholder="Search note, party or GSTIN"
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
          describe={(entry) => `note ${entry.noteNo}`}
          rowClassName={(entry) => RESOLVE_ROW_CLASS[stateOf(entry)]}
        />
        <TablePager view={view} />
      </EntriesCard>

      <CndnMappingModal open={mappingOpen} onOpenChange={setMappingOpen} mapping={mapping} flat={flat} ledgers={ledgers} onSaved={touchAfterMapping} />
      <CreatePartyLedgerModal
        entry={creatingFor}
        companyId={companyId}
        companyName={companyName}
        group="Sundry Creditors"
        description={creatingFor ? `For note ${creatingFor.noteNo}` : undefined}
        onClose={() => setCreatingFor(null)}
        onCreated={() => {
          const entry = creatingFor
          setCreatingFor(null)
          if (entry) resolving.touch([entry.key])
          // The backend waits for the new ledger while Tally syncs it.
          if (entry) saveAsMatched(entry)
        }}
      />
    </div>
  )
}
