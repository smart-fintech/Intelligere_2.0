/**
 * THE BANK STATEMENT SCREEN'S STATE AND ITS STEPS, for one company:
 *
 *   1. choose     the bank account, the file type and the file
 *   2. submit     the file goes up, becomes the statement's entries, and the
 *                 first page of them is read (Services/Accounting/bankStatementService)
 *   3. map        each entry gets its ledger - by hand, from a keyword mapping,
 *                 or the "remaining entries" ledger - and optionally an Agst Ref
 *   4. send       Tally: the WebSocket message, then the rows are marked
 *                 verified once Tally confirms. Any other ERP: verified alone.
 *                 A sent (or deleted) entry leaves the page; an empty page reads
 *                 the next one, and the last one ends on the summary.
 *
 * Every rule about an entry is in bankStatementModel; this file holds state
 * and makes the calls.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { ENV } from '@/Config/env'
import { getEmail } from '@/Library/secureStorage'
import { toast } from '@/Library/toast'
import {
  FILE_TYPE,
  VOUCHER,
  allocateRef,
  applyMappings,
  availableInvoices,
  effectiveLedger,
  invoicesOf,
  missingCsvColumns,
  needsRemainderType,
  parseCsv,
  toTallyRow,
  toVerifyRow,
  visibleEntries,
  withAmount,
  withLedger,
  withRemainderType,
} from '@/Modules/BankStatement/bankStatementModel'
import useTallyExchange from '@/Modules/GstCompare/useTallyExchange'
import {
  BANK_STATEMENT_SOCKET_MODULE,
  OUTSTANDING_SOURCE,
  buildBankStatementSocketMessage,
  createStatementEntry,
  deleteLedgerMapping,
  getLedgerMappings,
  getOutstandingInvoices,
  getStatementPage,
  getVoucherSummary,
  saveLedgerMapping,
  uploadStatementAI,
  uploadStatementFile,
  verifyStatementRows,
} from '@/Services/Accounting/bankStatementService'

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

/** A copy of `map` without `key`. */
const without = (map, key) => Object.fromEntries(Object.entries(map).filter(([entry]) => entry !== String(key)))

/** The origin of the Tabula reader - only its messages are listened to. */
const tabulaOrigin = (() => {
  try {
    return ENV.TABULA_URL ? new URL(ENV.TABULA_URL).origin : ''
  } catch {
    return ''
  }
})()

export default function useBankStatement({ company, companyId, banks, isTally }) {
  const companyName = text(company?.comp_name)

  /* ---- 1. choosing ---- */
  const [chosenBankId, setBankId] = useState('')
  // A company with one account has nothing to choose.
  const bankId = chosenBankId || (banks.length === 1 ? String(banks[0].id) : '')
  const bank = banks.find((entry) => String(entry.id) === bankId) ?? null
  const bankLedger = text(bank?.bank_ledger_name)

  const bankLedgers = useMemo(
    () => new Set(banks.map((entry) => text(entry.bank_ledger_name).toLowerCase()).filter(Boolean)),
    [banks],
  )

  const [fileType, setFileTypeState] = useState(FILE_TYPE.CSV)
  const [file, setFileState] = useState(null)
  const [csv, setCsv] = useState(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [password, setPassword] = useState('')
  const [uploading, setUploading] = useState(false)

  // A PDF is previewed from an object URL, which must be let go of.
  const objectUrl = useRef('')
  const showPdf = (url, owned) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = owned ? url : ''
    setPdfUrl(url)
  }
  useEffect(() => () => objectUrl.current && URL.revokeObjectURL(objectUrl.current), [])

  const setFile = (next) => {
    setFileState(next)
    setCsv(null)
    showPdf('', false)
    if (!next) return
    if (fileType === FILE_TYPE.CSV) {
      next
        .text()
        .then((source) => {
          const parsed = parseCsv(source)
          setCsv(parsed)
          const missing = missingCsvColumns(parsed.fields)
          if (missing.length) toast.warning(`The file header is not valid - it needs ${missing.join(', ')}.`)
        })
        .catch(() => toast.error('The file could not be read.'))
    } else showPdf(URL.createObjectURL(next), true)
  }

  const setFileType = (next) => {
    setFileTypeState(next)
    setFileState(null)
    setCsv(null)
    showPdf('', false)
  }

  // The Tabula reader hands back the PDF it read: { message: "getPdfData", PDFbase64, PDFbinary, original_filename }.
  useEffect(() => {
    if (fileType !== FILE_TYPE.PDF) return undefined
    const receive = (event) => {
      if (!tabulaOrigin || event.origin !== tabulaOrigin) return
      const { message, PDFbase64, PDFbinary, original_filename: name } = event.data ?? {}
      if (message !== 'getPdfData' || !PDFbase64) return
      setFileState(new File([PDFbinary], name || 'statement.pdf', { type: 'application/pdf' }))
      showPdf(PDFbase64, false)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [fileType])

  /* ---- 2. the entries ---- */
  const [entryId, setEntryId] = useState(null)
  const [total, setTotal] = useState(0)
  const [nextIndex, setNextIndex] = useState(0)
  const [entries, setEntries] = useState([])
  const [loadingPage, setLoadingPage] = useState(false)
  const [mappings, setMappings] = useState({})
  const started = entryId !== null

  const [summary, setSummary] = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(false)

  const loadSummary = async (id) => {
    setLoadingSummary(true)
    try {
      setSummary(await getVoucherSummary(id))
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoadingSummary(false)
    }
  }

  /** Reads the page from `lastIndex`; `withMappings` the keywords to apply to it. */
  const loadPage = async (lastIndex, withMappings = mappings) => {
    setLoadingPage(true)
    try {
      const page = await getStatementPage({ companyId, lastIndex })
      const fresh = page.rows.filter((row) => row.is_verified !== true && row.is_verified !== 'true')
      setEntryId(page.entryId)
      setTotal(page.count)
      setNextIndex(lastIndex + page.rows.length)
      setEntries(applyMappings(fresh, withMappings, bankLedgers))
      if (page.rows.length === 0) await loadSummary(page.entryId)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoadingPage(false)
    }
  }

  const submit = async () => {
    if (!bank) return toast.error('Please select a bank first.')
    if (!file) return toast.error('Please choose the statement file first.')

    setUploading(true)
    try {
      if (fileType === FILE_TYPE.AI_PDF) {
        await uploadStatementAI({ companyId, bankDetailId: bank.id, file, password })
      } else {
        await uploadStatementFile({ companyId, bankDetailId: bank.id, file })
      }
      await createStatementEntry(companyId)
      // The keywords are a help, not a step: without them the entries still load.
      const keywords = await getLedgerMappings({ companyId, accountNo: bank.account_no }).catch(() => ({}))
      setMappings(keywords)
      await loadPage(0, keywords)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setUploading(false)
    }
  }

  /** After entries leave the page: an empty page moves on - the next one, or the summary. */
  const moveOnIfDone = (remaining) => {
    if (remaining.length > 0) return
    if (nextIndex < total) loadPage(nextIndex)
    else loadSummary(entryId)
  }

  // The newest list, for a removal that comes after an await (a send) - the
  // list it started from may have been edited since.
  const entriesNow = useRef(entries)
  useEffect(() => {
    entriesNow.current = entries
  })

  const removeEntries = (srNos) => {
    const gone = new Set(srNos)
    const keep = (list) => list.filter((entry) => !gone.has(entry.sr_no))
    setEntries(keep)
    moveOnIfDone(keep(entriesNow.current))
  }

  const updateEntry = (srNo, change) => setEntries((current) => current.map((entry) => (entry.sr_no === srNo ? change(entry) : entry)))

  /* ---- 3. mapping ---- */
  const [remainingLedger, setRemainingLedger] = useState('')
  const [types, setTypes] = useState({ [VOUCHER.PAYMENT]: true, [VOUCHER.RECEIPT]: true, [VOUCHER.CONTRA]: true })
  const [unmappedOnly, setUnmappedOnly] = useState(false)

  const setLedger = (srNo, ledgerName) => {
    updateEntry(srNo, (entry) => ({ ...withLedger(entry, ledgerName, bankLedgers), manual: true }))
    // Invoices belong to a ledger - another ledger starts its Agst Ref again.
    clearRef(srNo)
  }
  const setAmount = (srNo, value) => {
    updateEntry(srNo, (entry) => withAmount(entry, value))
    clearRef(srNo)
  }
  const setNarration = (srNo, value) => updateEntry(srNo, (entry) => ({ ...entry, AccountantNarration: value }))

  const [savingKeyword, setSavingKeyword] = useState(false)
  const adoptMappings = (next) => {
    setMappings(next)
    setEntries((current) => applyMappings(current, next, bankLedgers))
  }

  const addKeyword = async (keyword, ledger) => {
    if (!text(keyword) || !text(ledger)) return toast.error('Enter a keyword and choose its ledger.')
    setSavingKeyword(true)
    try {
      adoptMappings(await saveLedgerMapping({ companyId, bankName: bankLedger, accountNo: bank?.account_no, keyword: text(keyword), ledger }))
      return true
    } catch (error) {
      toast.error(error.message)
      return false
    } finally {
      setSavingKeyword(false)
    }
  }

  const removeKeyword = async (keyword) => {
    try {
      adoptMappings(await deleteLedgerMapping({ companyId, bankName: bankLedger, accountNo: bank?.account_no, keyword }))
    } catch (error) {
      toast.error(error.message)
    }
  }

  /* ---- Agst Ref ---- */
  const [agstOn, setAgstOnState] = useState(false)
  const [outstanding, setOutstanding] = useState(null)
  const [loadingOutstanding, setLoadingOutstanding] = useState(false)
  const [chosenInvoices, setChosenInvoices] = useState({})
  const [refs, setRefs] = useState({})

  const setAgstOn = async (on) => {
    setAgstOnState(on)
    if (!on || outstanding || loadingOutstanding) return
    setLoadingOutstanding(true)
    try {
      const [payable, receivable] = await Promise.all([
        getOutstandingInvoices({ companyName, source: OUTSTANDING_SOURCE.PAYABLE }),
        getOutstandingInvoices({ companyName, source: OUTSTANDING_SOURCE.RECEIVABLE }),
      ])
      setOutstanding({ payable, receivable })
    } catch (error) {
      toast.error(error.message)
      setAgstOnState(false)
    } finally {
      setLoadingOutstanding(false)
    }
  }

  function clearRef(srNo) {
    setRefs((current) => without(current, srNo))
    setChosenInvoices((current) => without(current, srNo))
  }

  const hasInvoices = (entry) => Boolean(outstanding) && invoicesOf(entry, outstanding).length > 0
  const invoicesFor = (entry) => (outstanding ? availableInvoices(entry, outstanding, refs, entries) : [])

  const chooseInvoices = (srNo, invoiceNos) => {
    setChosenInvoices((current) => ({ ...current, [srNo]: invoiceNos }))
    setRefs((current) => without(current, srNo))
  }

  const applyRef = (entry) => {
    const ref = allocateRef(entry, invoicesFor(entry), chosenInvoices[entry.sr_no] ?? [])
    if (Object.keys(ref.lines).length === 0) return toast.error('Choose the invoices to set this entry against.')
    setRefs((current) => ({ ...current, [entry.sr_no]: ref }))
  }

  const setRemainderType = (srNo, type) =>
    setRefs((current) => (current[srNo] ? { ...current, [srNo]: withRemainderType(current[srNo], type) } : current))

  /* ---- what is on screen ---- */
  const filtered = visibleEntries(entries, { types, unmappedOnly, agstFirst: false, hasInvoices })
  const visible = agstOn ? visibleEntries(filtered, { types: {}, unmappedOnly: false, agstFirst: true, hasInvoices }) : filtered
  const agstCount = agstOn ? filtered.filter(hasInvoices).length : 0
  const canSendAll = visible.length > 0 && visible.every((entry) => effectiveLedger(entry, remainingLedger))

  /* ---- 4. sending ---- */
  const [sendingIds, setSendingIds] = useState([])
  const pending = useRef(null)

  const verify = async (list) => {
    await verifyStatementRows({ companyId, entryId, rows: list.map((entry) => toVerifyRow(entry, remainingLedger)) })
    removeEntries(list.map((entry) => entry.sr_no))
  }

  const tally = useTallyExchange({
    module: BANK_STATEMENT_SOCKET_MODULE,
    onReply: async (reply) => {
      const list = pending.current ?? []
      pending.current = null
      const ok = String(reply.status ?? '').toLowerCase() === 'success'
      if (!ok) {
        setSendingIds([])
        return toast.error(text(reply.msg) || 'Tally could not create the entries.')
      }
      try {
        await verify(list)
        toast.success(text(reply.msg) || `${list.length} entr${list.length === 1 ? 'y' : 'ies'} sent to Tally.`)
      } catch (error) {
        toast.error(`Tally has the entries, but they could not be marked sent here: ${error.message}`)
      } finally {
        setSendingIds([])
      }
    },
  })

  const send = async (list) => {
    if (list.length === 0) return
    if (list.some((entry) => !effectiveLedger(entry, remainingLedger))) {
      return toast.error('Please select a ledger first.')
    }
    if (list.some((entry) => needsRemainderType(refs[entry.sr_no]))) {
      return toast.error('Choose how the remaining amount of an Agst Ref entry is booked.')
    }

    setSendingIds(list.map((entry) => entry.sr_no))

    if (!isTally) {
      try {
        await verify(list)
        toast.success(`${list.length} entr${list.length === 1 ? 'y' : 'ies'} verified.`)
      } catch (error) {
        toast.error(error.message)
      } finally {
        setSendingIds([])
      }
      return
    }

    const email = getEmail() || ''
    const rows = list.map((entry) =>
      toTallyRow(entry, { companyName, bankLedger, email, remainingLedger, ref: refs[entry.sr_no] }),
    )
    pending.current = list
    const started = await tally.start(buildBankStatementSocketMessage({ companyName, bank: bankLedger, rows }))
    if (!started) {
      pending.current = null
      setSendingIds([])
    }
  }

  // A lost connection or no answer ends the exchange with no reply - and so
  // with the rows still pending (a reply takes them at once).
  useEffect(() => {
    if (tally.busy || pending.current === null) return
    pending.current = null
    setSendingIds([])
  }, [tally.busy])

  const deleteEntry = (srNo) => {
    clearRef(srNo)
    removeEntries([srNo])
  }

  /** The next page now - what is left unsent of this one is dropped. */
  const nextBatch = () => loadPage(nextIndex)

  return {
    // choosing
    bank,
    bankId,
    setBankId,
    fileType,
    setFileType,
    file,
    setFile,
    csv,
    pdfUrl,
    password,
    setPassword,
    uploading,
    submit,
    // the statement
    started,
    entryId,
    total,
    remainingCount: Math.max(total - nextIndex, 0),
    hasNextBatch: nextIndex < total,
    loadingPage,
    nextBatch,
    entries,
    visible,
    // mapping
    mappings,
    addKeyword,
    removeKeyword,
    savingKeyword,
    remainingLedger,
    setRemainingLedger,
    types,
    setTypes,
    unmappedOnly,
    setUnmappedOnly,
    setLedger,
    setAmount,
    setNarration,
    deleteEntry,
    // Agst Ref
    agstOn,
    setAgstOn,
    loadingOutstanding,
    agstCount,
    hasInvoices,
    invoicesFor,
    chosenInvoices,
    chooseInvoices,
    refs,
    applyRef,
    setRemainderType,
    // sending
    send,
    sendingIds,
    sending: sendingIds.length > 0,
    canSendAll,
    // the end
    summary,
    loadingSummary,
  }
}
