/**
 * THE GST COMPARE SCREEN'S STATE.
 *
 * A comparison has two sides, and it runs by itself as soon as both are ready -
 * whichever was finished last:
 *
 *   purchase ledger   uploaded file(s), vouchers fetched from Tally, or - on
 *                     Submit - Intelligere's own purchase documents, which the
 *                     backend reads itself when the comparison runs
 *   GST portal        uploaded file(s), or GSTR-2B read from the portal
 *
 * View Past Data skips all of that and opens a year's saved comparison, read only.
 *
 * While a comparison runs, `progress` says where it is: { stage: 'uploading',
 * percent } as the files go up (percent null until the browser knows it), then
 * { stage: 'processing' } while the backend matches - most of the wait, and
 * one it cannot measure.
 *
 * Every action on the result answers with the whole comparison again, which
 * replaces the one on screen. `version` counts those, and the tables are keyed
 * on it, so ticks and typing are cleared with the rows they belonged to.
 *
 * UPDATE ENTRIES saves the corrections to the backend first; then, for a
 * comparison made from Tally vouchers, writes them back to Tally (see
 * buildVoucherUpdates). An uploaded register has no vouchers to write to.
 */

import { useRef, useState } from 'react'

import { uploadPercent } from '@/Components/Common/Loader'
import { toast } from '@/Library/toast'
import { downloadComparison } from '@/Modules/GstCompare/gstCompareExport'
import {
  applyVoucherResults,
  buildVoucherIndex,
  buildVoucherUpdates,
  compareIdOf,
  fetchYearOptions,
  financialYearOptions,
  isComparison,
  matchedNarration,
  uploadYearOptions,
} from '@/Modules/GstCompare/gstCompareModel'
import useTallyExchange from '@/Modules/GstCompare/useTallyExchange'
import {
  ENTRY_OPERATION,
  GST_COMPARE_FETCH_MODULE,
  GST_COMPARE_VOUCHER_UPDATE_MODULE,
  applyRcm,
  buildVoucherFetchMessage,
  buildVoucherUpdateMessage,
  compareIntelligereData,
  compareTallyVouchers,
  compareUploadedFiles,
  generateGstr3b,
  getPastData,
  getPastMonths,
  gstr3bFileUrl,
  moveToMatch,
  saveEditedEntries,
  setEntryStatus,
} from '@/Services/gstCompareService'
import { downloadFileFromUrl } from '@/Utils/fileDownload'

export const LEDGER_SOURCE = Object.freeze({ UPLOAD: 'upload', TALLY: 'tally', INTELLIGERE: 'intelligere', PAST: 'past' })
export const PORTAL_SOURCE = Object.freeze({ UPLOAD: 'upload', API: 'api' })

export default function useGstCompare({ companyName, companyId }) {
  const [ledgerSource, setLedgerSource] = useState(LEDGER_SOURCE.UPLOAD)
  const [portalSource, setPortalSource] = useState(PORTAL_SOURCE.UPLOAD)

  const [year, setYear] = useState(() => uploadYearOptions()[0].value)
  const [startMonth, setStartMonth] = useState('')
  const [endMonth, setEndMonth] = useState('')
  const [compareDate, setCompareDate] = useState(true)
  const [compareInvoice, setCompareInvoice] = useState(true)
  const [voucherTypes, setVoucherTypes] = useState([])
  const [pastYear, setPastYear] = useState(() => financialYearOptions()[0].value)

  const [ledgerFiles, setLedgerFiles] = useState([])
  const [portalFiles, setPortalFiles] = useState([])
  const [tallyData, setTallyData] = useState(null)
  const [intelligereChosen, setIntelligereChosen] = useState(false)
  const [portalFetched, setPortalFetched] = useState(false)
  const [noTallyData, setNoTallyData] = useState(false)

  const [comparison, setComparison] = useState(null)
  const [version, setVersion] = useState(0)
  const [pastMonths, setPastMonths] = useState(null)
  const [comparing, setComparing] = useState(false)
  const [progress, setProgress] = useState(null)
  const [loadingPast, setLoadingPast] = useState(false)
  const [acting, setActing] = useState(null)

  // What Tally holds for each fetched voucher - never drawn, updated as vouchers are written.
  const voucherIndex = useRef(new Map())
  const sentRows = useRef([])
  // One comparison at a time, whatever state a render saw.
  const comparingRef = useRef(false)
  const stageRef = useRef(null)

  const period = { year, startMonth, endMonth, compareDate, compareInvoice }
  const periodChosen = Boolean(startMonth && endMonth)
  const ledgerReady = ledgerFiles.length > 0 || Boolean(tallyData) || intelligereChosen
  const portalReady = portalFiles.length > 0 || portalFetched
  const compareId = compareIdOf(comparison)
  const isPast = ledgerSource === LEDGER_SOURCE.PAST

  const show = (next) => {
    setComparison(next)
    setVersion((current) => current + 1)
  }

  /** Progress events come many to a percent: only a change is stored. */
  const report = (next) => {
    stageRef.current = next?.stage ?? null
    setProgress((current) => (current?.stage === next?.stage && current?.percent === next?.percent ? current : next))
  }

  /** Runs the comparison when both sides are ready, `changes` being what has only just been set. */
  const compareWhenReady = async (changes = {}) => {
    const input = { ledgerFiles, portalFiles, tallyData, intelligereChosen, portalFetched, ...changes }
    const hasLedger = input.ledgerFiles.length > 0 || Boolean(input.tallyData) || input.intelligereChosen
    const hasPortal = input.portalFiles.length > 0 || input.portalFetched
    if (!hasLedger || !hasPortal || comparison || comparing || comparingRef.current) return

    comparingRef.current = true
    setComparing(true)
    report({ stage: 'uploading', percent: null })
    // Once the last byte is out, the wait is the backend's.
    const tracking = {
      onUploadProgress: (event) => {
        const percent = uploadPercent(event)
        report(percent !== null && percent >= 100 ? { stage: 'processing', percent: null } : { stage: 'uploading', percent })
      },
    }
    try {
      const reply = input.intelligereChosen
        ? await compareIntelligereData(period, input.portalFiles, tracking, companyId)
        : input.tallyData
          ? await compareTallyVouchers(period, input.tallyData, input.portalFiles, tracking, companyId)
          : await compareUploadedFiles(period, input.ledgerFiles, input.portalFiles, tracking, companyId)
      if (!isComparison(reply)) throw new Error(reply?.msg || 'The comparison could not be read.')
      show(reply)
      toast.success('Data matched successfully.')
    } catch (error) {
      // The files are chosen again after a failure; vouchers already fetched from Tally are kept.
      setLedgerFiles([])
      setIntelligereChosen(false)
      setPortalFiles([])
      setPortalFetched(false)
      // No reply after the upload finished is the time limit running out, not a lost connection.
      const timedOut = error.status === null && stageRef.current === 'processing'
      toast.error(timedOut ? 'The server took too long to match the data. Please try again, or compare fewer months at a time.' : error.message)
    } finally {
      comparingRef.current = false
      report(null)
      setComparing(false)
    }
  }

  const chooseLedgerSource = (next) => {
    setLedgerSource(next)
    setNoTallyData(false)
    // Each source offers its own years; one it does not offer falls back to the current year.
    const years = next === LEDGER_SOURCE.TALLY ? fetchYearOptions() : uploadYearOptions()
    if (!years.some((option) => option.value === year)) setYear(String(new Date().getFullYear()))
  }

  const pickLedgerFiles = (files) => {
    setLedgerFiles(files)
    compareWhenReady({ ledgerFiles: files })
  }

  const pickPortalFiles = (files) => {
    setPortalFiles(files)
    compareWhenReady({ portalFiles: files })
  }

  /** The portal's GSTR-2B is stored on the backend: an empty gstfile0 tells it to use that. */
  const markPortalFetched = () => {
    setPortalFetched(true)
    compareWhenReady({ portalFetched: true })
  }

  /* ---- Purchase ledger from Tally ---- */

  const voucherFetch = useTallyExchange({
    module: GST_COMPARE_FETCH_MODULE,
    onReply: (reply) => {
      if (reply.status === 'error') {
        toast.error(reply.msg || 'Tally could not fetch the vouchers.')
        return
      }
      const data = Array.isArray(reply.data) ? reply.data : []
      if (!data.some((group) => Object.keys(group ?? {}).length > 0)) {
        setNoTallyData(true)
        return
      }
      voucherIndex.current = buildVoucherIndex(data)
      setTallyData(data)
      toast.success(reply.msg || 'Purchase data fetched from Tally.')
      compareWhenReady({ tallyData: data })
    },
  })

  const fetchFromTally = () => {
    if (!companyName) {
      toast.error('Please select an active company before fetching from Tally.')
      return
    }
    setNoTallyData(false)
    voucherFetch.start(buildVoucherFetchMessage(companyName, { year, startMonth, endMonth, voucherTypes }))
  }

  const voucherUpdate = useTallyExchange({
    module: GST_COMPARE_VOUCHER_UPDATE_MODULE,
    onReply: (reply) => {
      applyVoucherResults(voucherIndex.current, sentRows.current, reply.data)
      if (reply.status === 'error') toast.error(reply.msg || 'Tally could not update the vouchers.')
      else toast.success(reply.msg || 'Vouchers updated in Tally.')
    },
  })

  /* ---- Purchase ledger from Intelligere ---- */

  /** Nothing to fetch: the backend reads the documents when the comparison runs. */
  const fetchFromIntelligere = () => {
    setIntelligereChosen(true)
    compareWhenReady({ intelligereChosen: true })
  }

  /* ---- Past data ---- */

  const viewPastData = async () => {
    const option = financialYearOptions().find((one) => one.value === pastYear)
    if (!option) return
    setLoadingPast(true)
    try {
      const reply = await getPastData(option.startYear, option.endYear, companyId)
      if (!isComparison(reply)) {
        toast.warning(reply?.msg || 'No past data found.')
        return
      }
      show(reply)
      const months = await getPastMonths(option.startYear, option.endYear, companyId).catch(() => null)
      setPastMonths(Array.isArray(months) ? months : [])
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoadingPast(false)
    }
  }

  /* ---- Actions on the result ---- */

  /** One action at a time; its reply, when it is a comparison, replaces the one on screen. */
  const act = async (name, run, successMessage) => {
    if (acting) return false
    setActing(name)
    try {
      const reply = await run()
      if (isComparison(reply)) show(reply)
      if (successMessage) toast.success(successMessage)
      return true
    } catch (error) {
      toast.error(error.message)
      return false
    } finally {
      setActing(null)
    }
  }

  const updateEntries = async (edits) => {
    if (acting) return
    const hasEdits = Object.keys(edits).length > 0
    let latest = comparison

    setActing('update')
    try {
      if (hasEdits) {
        latest = await saveEditedEntries(compareId, edits, companyId)
        if (isComparison(latest)) show(latest)
        else latest = comparison
      }
    } catch (error) {
      toast.error(error.message)
      return
    } finally {
      setActing(null)
    }

    const rows = buildVoucherUpdates(latest, voucherIndex.current, matchedNarration(startMonth))
    if (rows.length === 0) {
      if (hasEdits) toast.success('Data updated successfully.')
      else toast.info('There are no changes to update.')
      return
    }
    sentRows.current = rows
    if (hasEdits) toast.success('Data updated successfully. Writing the vouchers to Tally...')
    voucherUpdate.start(buildVoucherUpdateMessage(companyName, rows))
  }

  const rcm = (keys, picks) => act('rcm', () => applyRcm(compareId, keys, picks), 'Purchase register tax calculated successfully.')

  const moveEntriesToMatch = (keys) =>
    act('match', async () => {
      const { data, msg, ok } = await moveToMatch(compareId, keys)
      if (msg) (ok ? toast.success : toast.error)(msg)
      return data
    })

  const blockEntries = (keys) =>
    act('block', () => setEntryStatus(compareId, keys, ENTRY_OPERATION.BLOCK), 'Blocked successfully.')

  const notToBeConsidered = (keys) =>
    act('not-considered', () => setEntryStatus(compareId, keys, ENTRY_OPERATION.NOT_CONSIDERED), 'Marked as not to be considered.')

  const downloadGstr3b = (keys) =>
    act('gstr3b', async () => {
      const { path } = await generateGstr3b(compareId, keys, companyId)
      if (path) await downloadFileFromUrl(gstr3bFileUrl(path), path)
      toast.success('Tax calculated successfully.')
    })

  const downloadExcel = () => act('excel', () => downloadComparison(comparison))

  return {
    ledgerSource,
    chooseLedgerSource,
    portalSource,
    setPortalSource,
    year,
    setYear,
    startMonth,
    setStartMonth,
    endMonth,
    setEndMonth,
    compareDate,
    setCompareDate,
    compareInvoice,
    setCompareInvoice,
    voucherTypes,
    setVoucherTypes,
    pastYear,
    setPastYear,

    periodChosen,
    ledgerReady,
    portalReady,
    isPast,
    noTallyData,
    fetchingTally: voucherFetch.busy,
    writingTally: voucherUpdate.busy,
    comparing,
    progress,
    loadingPast,
    acting,

    comparison,
    version,
    pastMonths,

    pickLedgerFiles,
    pickPortalFiles,
    markPortalFetched,
    fetchFromTally,
    fetchFromIntelligere,
    viewPastData,

    updateEntries,
    rcm,
    moveEntriesToMatch,
    blockEntries,
    notToBeConsidered,
    downloadGstr3b,
    downloadExcel,
  }
}
