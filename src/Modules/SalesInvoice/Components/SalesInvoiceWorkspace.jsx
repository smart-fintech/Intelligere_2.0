import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, FilePlus, RefreshCw, Save } from 'lucide-react'

import { InlineAlert } from '@/Components/Common/DataList'
import { Stepper } from '@/Components/Common/Stepper'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { DOCUMENT_TYPE_INVOICE, INVOICE_STEP, INVOICE_STEPS, findDocumentType } from '@/Constants/salesInvoice'
import { toast } from '@/Library/toast'
import BuyerStep from '@/Modules/SalesInvoice/Components/BuyerStep'
import DocumentStep from '@/Modules/SalesInvoice/Components/DocumentStep'
import DocumentTypeCard from '@/Modules/SalesInvoice/Components/DocumentTypeCard'
import GstLedgerCheck from '@/Modules/SalesInvoice/Components/GstLedgerCheck'
import ProductsStep from '@/Modules/SalesInvoice/Components/ProductsStep'
import SellerStep from '@/Modules/SalesInvoice/Components/SellerStep'
import InvoicePreview from '@/Modules/SalesInvoice/Document/InvoicePreview'
import { toInvoiceModel } from '@/Modules/SalesInvoice/Document/invoiceModel'
import useFileDataUrl from '@/Modules/SalesInvoice/Document/useFileDataUrl'
import useBuyerProducts from '@/Modules/SalesInvoice/useBuyerProducts'
import useDocumentMappings from '@/Modules/SalesInvoice/useDocumentMappings'
import useDocumentNumbering from '@/Modules/SalesInvoice/useDocumentNumbering'
import useInvoiceReferenceData from '@/Modules/SalesInvoice/useInvoiceReferenceData'
import useSalesInvoiceForm from '@/Modules/SalesInvoice/useSalesInvoiceForm'
import { SAVE_OUTCOME, runSaveWorkflow } from '@/Modules/SalesInvoice/saveWorkflow'
import {
  buyerFromLedger,
  effectiveDispatch,
  effectiveShipping,
  errorStep,
  gstByRate,
  invoiceFigures,
  invoiceNumberOf,
  lineVariant,
  rateText,
  sellerFromCompany,
  settingsFromCompany,
  stateCodeOf,
  validateInvoice,
} from '@/Modules/SalesInvoice/salesInvoiceForm'
import {
  buildBuyerLedgerPayload,
  buildCompanyUpdatePayload,
  buildInvoiceSaveRequest,
  createBusinessDocument,
  documentPdfFileName,
  getDocumentTypeAccess,
  saveBuyerLedger,
  saveDocumentPdf,
  saveSellerCompany,
} from '@/Services/salesInvoiceService'
import { getLedgerId } from '@/Services/ledgerService'
import { getCountries, getStates } from '@/Services/locationService'
import { gstListText, missingGstLedgers, resolveGstLedgers } from '@/Utils/gstLedgers'

/**
 * Makes sure the preview has drawn the latest state before it is captured:
 * the sheets are re-paginated in a layout effect, so two frames is enough.
 */
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

/**
 * The vector PDF of the invoice on screen (Document/invoicePdf), drawn to the
 * preview's measured layout. Loaded on demand, so the PDF renderer stays out
 * of the page until a PDF is first made.
 */
const makeInvoicePdf = async (model, layoutRef) => {
  const { createInvoicePdf } = await import('@/Modules/SalesInvoice/Document/invoicePdf')
  await nextPaint()
  return createInvoicePdf({ model, layout: layoutRef.current })
}

const saveToDisk = async (bytes, fileName) => {
  const { downloadPdf } = await import('@/Modules/SalesInvoice/Document/invoicePdf')
  downloadPdf(bytes, fileName)
}

/**
 * Compact controls for the whole form: 32px boxes instead of 36-40px, so the
 * fields read as a dense, wide sheet rather than a long column.
 */
const COMPACT_CONTROLS =
  '[&_[data-slot=input]]:h-8 [&_[data-slot=select-trigger]]:h-8! [&_[data-slot=textarea]]:min-h-8 [&_[data-slot=textarea]]:py-1.5'

/**
 * THE DOCUMENT CREATION SCREEN - the multi-step form and the live invoice,
 * side by side, each half the width.
 *
 * The page mounts this with a `key` of the company, so a company switch
 * starts a fresh invoice for the new company and nothing of the old one's
 * seller, ledgers or products is carried over.
 *
 * ------------------------------------------------------------------
 * MOVING BETWEEN STEPS
 * ------------------------------------------------------------------
 * Next checks only the step on screen; Previous and the Stepper's ticked
 * steps move back without checking. Every value stays in the one form state
 * whichever step is open, and the preview follows every change.
 *
 * ------------------------------------------------------------------
 * SAVING (Services/salesInvoiceService)
 * ------------------------------------------------------------------
 *   1. the whole form is checked; the first step with a problem opens
 *   2. POST invoice/business-documents/        -> document_id
 *   3. the PDF is made from the preview sheets  (Document/invoicePdf)
 *   4. POST invoice/save-document-pdf/  { id: document_id, file }
 *
 * Success is announced, and the form cleared, only after step 4. If step 2
 * fails nothing else runs. Once step 2 has succeeded the document exists:
 * its id is kept (`saved`), the form is locked so the PDF cannot drift from
 * what was saved, and Save becomes "Retry PDF" - which repeats steps 3-4
 * only, never step 2, so a retry can never create a second document.
 */
export default function SalesInvoiceWorkspace({ company }) {
  const invoice = useSalesInvoiceForm(company)
  const { form, setErrors, reset } = invoice
  const { ledgers, banks, countries, products } = useInvoiceReferenceData(company.company_id)

  const documentTypes = useMemo(() => getDocumentTypeAccess(company), [company])
  const allowedTypes = useMemo(
    () => documentTypes.filter((type) => type.enabled).map((type) => type.value),
    [documentTypes],
  )

  const figures = useMemo(() => invoiceFigures(form), [form])
  const companyId = company.company_id
  const documentTypeValue = form.documentType
  const isInvoice = documentTypeValue === DOCUMENT_TYPE_INVOICE

  /* ---- the document number: a new round each time a document is saved ----
     (useDocumentNumbering, under the steps below, says when it is asked -
     a save itself asks nothing; the next document asks at Step 2) */
  const [numberingRound, setNumberingRound] = useState(0)
  const { applyDocumentDefaults } = invoice

  /* ---- Sales Invoice only: the GST ledger mappings ----
     Read once per company (shared cache). With the company's ledgers they
     settle every GST ledger the invoice needs, by the one rule in
     Utils/gstLedgers - the preview and the check before saving read the
     same answer. */
  const mappings = useDocumentMappings(companyId, isInvoice)
  const ledgerMapping = isInvoice ? mappings.ledgerMapping : null
  // The documents that post GST to ledgers - the ones the mapping is for.
  const needsGstLedgers = isInvoice

  /* ---- the buyer's earlier products - once the Buyer step is completed ---- */
  const [confirmedBuyerId, setConfirmedBuyerId] = useState(null)
  const buyerProducts = useBuyerProducts({ companyId, ledgerId: confirmedBuyerId, documentType: documentTypeValue })

  /* ---- what the company record held when last read or saved ---- */
  const [sellerBaseline, setSellerBaseline] = useState(() => ({
    seller: sellerFromCompany(company),
    settings: settingsFromCompany(company),
  }))
  const gst = useMemo(() => gstByRate(figures), [figures])
  // The same entries, each with its ledger: the mapped one, else the company's
  // matching one, else none (`ledger` null) - never a default.
  const gstLedgers = useMemo(
    () => (needsGstLedgers ? resolveGstLedgers(gst, { ledgerMapping, ledgers: ledgers.named }) : gst),
    [needsGstLedgers, gst, ledgerMapping, ledgers.named],
  )

  /* ---- can it be saved, as far as GST ledgers go? ----
     Only the taxes and rates this document charges are checked, and only
     once both lists are in - a list still loading, or one that failed, is
     not "no ledger". */
  const { retry: retryLedgers } = ledgers
  const { reload: reloadMappings } = mappings
  const gstCheck = useMemo(() => {
    const retry = () => {
      retryLedgers()
      reloadMappings()
    }
    if (!needsGstLedgers || gstLedgers.length === 0) return { status: 'ok', missing: [], retry }
    if (ledgers.status === 'failed' || mappings.status === 'failed') return { status: 'failed', missing: [], retry }
    if (ledgers.status !== 'succeeded' || mappings.status !== 'ready') return { status: 'loading', missing: [], retry }
    const missing = missingGstLedgers(gstLedgers)
    return { status: missing.length > 0 ? 'missing' : 'ok', missing, retry }
  }, [needsGstLedgers, gstLedgers, ledgers.status, mappings.status, retryLedgers, reloadMappings])
  const context = useMemo(() => ({ allowedTypes, productsByKey: products.byKey }), [allowedTypes, products.byKey])

  /* ---- the live preview ---- */
  const logo = useFileDataUrl(form.seller.logo)
  const signature = useFileDataUrl(form.seller.signature)
  const paymentQr = useFileDataUrl(form.document.paymentQr)
  const bank = banks.list.find((entry) => String(entry.id) === String(form.document.bankId)) ?? null

  const model = useMemo(
    () =>
      toInvoiceModel({
        form,
        figures,
        gst: gstLedgers,
        productsByKey: products.byKey,
        ledgersById: ledgers.byId,
        bank,
        images: { logo, signature, paymentQr },
      }),
    [form, figures, gstLedgers, products.byKey, ledgers.byId, bank, logo, signature, paymentQr],
  )
  // The preview's measured layout for the current model - what the PDF is drawn to.
  const layoutRef = useRef(null)
  const keepLayout = useCallback((layout) => {
    layoutRef.current = layout
  }, [])

  /* ---- steps ---- */
  const [stepIndex, setStepIndex] = useState(0)
  const step = INVOICE_STEPS[stepIndex]
  const lastStep = stepIndex === INVOICE_STEPS.length - 1
  const topRef = useRef(null)

  // Asked when the screen opens, then again on reaching
  // Step 2 or later only if the company, the Step 1 document type or the round (a save) changed.
  const numbering = useDocumentNumbering({
    companyId,
    documentType: documentTypeValue,
    stepIndex,
    round: numberingRound,
    apply: applyDocumentDefaults,
  })

  const goTo = (index) => {
    setStepIndex(index)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** After the errors are drawn, the first field with one gets the focus. */
  const focusFirstError = () => {
    requestAnimationFrame(() => window.document.querySelector('[aria-invalid="true"]')?.focus())
  }

  /* ---- saving ---- */
  // 'idle' | 'step' | 'creating' | 'pdf' | 'uploading' | 'download'
  const [phase, setPhase] = useState('idle')
  const busyRef = useRef(false)
  // { documentId, invoiceNo } once the document exists and only its PDF is still to go.
  const [saved, setSaved] = useState(null)

  /**
   * The Seller and Buyer steps write back to where their details live, on
   * Next, and only when something changed:
   *
   *   Seller   PUT  tally/user-companies-list/   the company
   *   Buyer    PUT  tally/create-ledger/         the buyer's ledger
   *
   * A failed save keeps the user on the step (the message is the backend's
   * own); nothing is sent while typing. Completing the Buyer step is also
   * what lets the buyer's earlier products be loaded.
   */
  const saveStep = async () => {
    if (step.key === INVOICE_STEP.SELLER) {
      const payload = buildCompanyUpdatePayload(companyId, form, sellerBaseline)
      if (!payload) return true
      await saveSellerCompany(payload)
      setSellerBaseline({ seller: { ...form.seller }, settings: { ...form.settings } })
      return true
    }

    if (step.key === INVOICE_STEP.BUYER) {
      const ledger = ledgers.byId.get(form.buyer.ledgerId)
      if (!ledger) return false
      const lists = {
        countryNames: getCountries(countries.data),
        stateNamesOf: (country) => getStates(countries.data, country),
      }
      const payload = buildBuyerLedgerPayload(companyId, ledger, form.buyer, buyerFromLedger(ledger, form.buyer.ledgerId, lists))
      if (payload) {
        await saveBuyerLedger(payload)
        // The list is read again, so the next comparison is against what was saved.
        ledgers.retry()
      }
      setConfirmedBuyerId(getLedgerId(ledger))
      return true
    }

    return true
  }

  const next = async () => {
    if (busyRef.current) return
    const found = validateInvoice(form, context, step.key)
    if (Object.keys(found).length > 0) {
      setErrors((previous) => ({ ...previous, ...found }))
      toast.error('Please correct the highlighted fields.')
      focusFirstError()
      return
    }

    busyRef.current = true
    setPhase('step')
    try {
      if (await saveStep()) goTo(stepIndex + 1)
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      busyRef.current = false
      setPhase('idle')
    }
  }

  const documentType = findDocumentType(form.documentType)
  const busy = phase !== 'idle'
  const locked = (busy && phase !== 'download') || Boolean(saved)
  const fileNameFor = (invoiceNo) => documentPdfFileName(documentType?.label, invoiceNo)

  /**
   * Download PDF (the preview's button): the same PDF the save uploads, from
   * the same sheets, to the user's disk. Shares the save's guard, so a
   * download and a save can never run at once, nor either twice.
   */
  const download = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setPhase('download')
    try {
      const bytes = await makeInvoicePdf(model, layoutRef)
      await saveToDisk(bytes, fileNameFor(invoiceNumberOf(form.document)))
    } catch (failure) {
      console.error('[Sales Invoice] PDF download failed:', failure)
      toast.error(`The PDF could not be made: ${failure.message}`)
    } finally {
      busyRef.current = false
      setPhase('idle')
    }
  }

  /** The outcome of a save attempt, in words - and what is kept for a retry. */
  const report = ({ outcome, saved: keep, error }, invoiceNo) => {
    const what = `${documentType?.label ?? 'Document'} ${invoiceNo}`
    switch (outcome) {
      case SAVE_OUTCOME.DONE:
        toast.success(`${what} saved, with its PDF.`)
        setSaved(null)
        reset()
        setNumberingRound((round) => round + 1)
        goTo(0)
        return
      case SAVE_OUTCOME.CREATE_FAILED:
        // Nothing was saved - every value is still in the form.
        toast.error(error.message)
        return
      case SAVE_OUTCOME.NO_DOCUMENT_ID:
        toast.error('The server did not return the saved document. Please check before saving again.')
        return
      case SAVE_OUTCOME.PDF_FAILED:
        console.error('[Sales Invoice] PDF generation failed:', error)
        setSaved(keep)
        toast.error(`${what} was saved, but its PDF could not be generated: ${error.message} Press Retry PDF.`)
        return
      case SAVE_OUTCOME.UPLOAD_FAILED:
        console.error('[Sales Invoice] PDF upload failed:', error)
        setSaved(keep)
        toast.error(`${what} was saved, but its PDF could not be uploaded: ${error.message} Press Retry PDF.`)
        return
      default:
    }
  }

  const save = async () => {
    if (busyRef.current) return
    busyRef.current = true

    try {
      let request = null
      // A document that already exists needs only its PDF - nothing is checked or created again.
      if (!saved) {
        const found = validateInvoice(form, context)
        if (Object.keys(found).length > 0) {
          setErrors(found)
          const at = errorStep(found)
          if (at >= 0 && at !== stepIndex) goTo(at)
          toast.error('Some details need attention before the document can be saved.')
          focusFirstError()
          return
        }

        // Every GST tax and rate it charges must have a ledger - none is ever assumed.
        if (gstCheck.status !== 'ok') {
          const productsStep = INVOICE_STEPS.findIndex((entry) => entry.key === INVOICE_STEP.PRODUCTS)
          if (stepIndex !== productsStep) goTo(productsStep)
          toast.error(
            gstCheck.status === 'missing'
              ? `No GST ledger found for ${gstListText(gstCheck.missing)}. Map or create one before saving.`
              : gstCheck.status === 'loading'
                ? 'The GST ledgers are still being checked. Please save again in a moment.'
                : 'The GST ledgers could not be checked. Press Retry, then save.',
          )
          return
        }

        const dispatch = effectiveDispatch(form)
        const shipping = effectiveShipping(form)
        request = buildInvoiceSaveRequest({
          form,
          figures,
          gstCharges: gst.map((entry) => ({ ...entry, rateText: rateText(entry.rate) })),
          company,
          dispatch: { ...dispatch, stateCode: stateCodeOf(dispatch.state) },
          shipping: { ...shipping, stateCode: stateCodeOf(shipping.state) },
          invoiceNo: invoiceNumberOf(form.document),
          ledgersById: ledgers.byId,
          banks: banks.list,
          productsByKey: products.byKey,
          lineVariantOf: lineVariant,
        })
      }

      const invoiceNo = saved?.invoiceNo ?? request.invoiceNo
      const result = await runSaveWorkflow({
        saved,
        invoiceNo,
        createDocument: () => createBusinessDocument(request),
        makePdf: () => makeInvoicePdf(model, layoutRef),
        uploadPdf: (documentId, bytes) => saveDocumentPdf(documentId, bytes, fileNameFor(invoiceNo)),
        onStage: setPhase,
      })
      report(result, invoiceNo)
    } finally {
      busyRef.current = false
      setPhase('idle')
    }
  }

  /** Leaves a saved document whose PDF did not go up, and starts a fresh one. */
  const startNew = () => {
    setSaved(null)
    reset()
    // That document used its number: the next one is asked for at Step 2.
    setNumberingRound((round) => round + 1)
    goTo(0)
  }

  const saveLabel = {
    download: saved ? 'Retry PDF' : 'Save Invoice',
    creating: 'Saving...',
    pdf: 'Generating PDF...',
    uploading: 'Uploading PDF...',
  }[phase] ?? (saved ? 'Retry PDF' : 'Save Invoice')

  const stepProps = { invoice, disabled: locked }

  return (
    <div ref={topRef} className="scroll-mt-4 space-y-3">
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        {/* ---------------- The form - half the width ---------------- */}
        <section aria-label="Document form" className={`@container min-w-0 space-y-3 ${COMPACT_CONTROLS}`}>
          <Card className="border-border/70 py-2.5 shadow-sm">
            <CardContent className="px-3">
              <Stepper steps={INVOICE_STEPS} current={stepIndex} onStepClick={goTo} disabled={busy} />
            </CardContent>
          </Card>

          {saved ? (
            <InlineAlert
              action={
                <Button type="button" variant="outline" size="sm" icon={FilePlus} disabled={busy} onClick={startNew}>
                  Start new
                </Button>
              }
            >
              {saved.invoiceNo} is saved (document {saved.documentId}), but its PDF is not uploaded yet. Press Retry PDF -
              the document will not be saved a second time.
            </InlineAlert>
          ) : null}

          {step.key === INVOICE_STEP.SELLER ? (
            <>
              <DocumentTypeCard {...stepProps} documentTypes={documentTypes} locked={Boolean(saved)} />
              <SellerStep {...stepProps} />
            </>
          ) : null}
          {step.key === INVOICE_STEP.BUYER ? <BuyerStep {...stepProps} ledgers={ledgers} countries={countries} /> : null}
          {step.key === INVOICE_STEP.DOCUMENT ? (
            <DocumentStep {...stepProps} banks={banks} numbering={numbering} numberLocked={Boolean(saved)} />
          ) : null}
          {step.key === INVOICE_STEP.PRODUCTS ? (
            <ProductsStep
              {...stepProps}
              products={products}
              ledgers={ledgers}
              figures={figures}
              mappings={mappings}
              buyerProducts={buyerProducts}
              showMapping={isInvoice}
            />
          ) : null}
          {step.key === INVOICE_STEP.PRODUCTS && !saved ? (
            <GstLedgerCheck
              check={gstCheck}
              companyId={companyId}
              companyName={company.comp_name}
              disabled={locked}
              onOpenMapping={() => {
                invoice.setField('gstLedgerMapping', true)
                topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            />
          ) : null}

          {/* ---------------- Previous / Next / Save ---------------- */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" icon={ArrowLeft} disabled={stepIndex === 0 || busy} onClick={() => goTo(stepIndex - 1)}>
              Previous
            </Button>

            {lastStep || saved ? (
              <Button type="button" variant="secondary" icon={saved ? RefreshCw : Save} loading={busy} onClick={save}>
                {saveLabel}
              </Button>
            ) : (
              <Button type="button" icon={ArrowRight} loading={phase === 'step'} disabled={busy} onClick={next}>
                Next
              </Button>
            )}
          </div>
        </section>

        {/* ---------------- The live invoice - the other half ---------------- */}
        <aside
          aria-label="Document preview"
          className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm h-[75vh] lg:sticky lg:top-3 lg:h-[calc(100dvh-9rem)]"
        >
          <InvoicePreview
            model={model}
            onLayout={keepLayout}
            onDownload={download}
            downloading={phase === 'download'}
            disabled={busy && phase !== 'download'}
          />
        </aside>
      </div>
    </div>
  )
}
