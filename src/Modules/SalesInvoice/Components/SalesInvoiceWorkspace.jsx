import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { ArrowLeft, ArrowRight, Boxes, FilePlus, RefreshCw, Save, X } from 'lucide-react'

import { InlineAlert } from '@/Components/Common/DataList'
import { CheckboxField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Stepper } from '@/Components/Common/Stepper'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import {
  CHALLAN_COPIES,
  DOCUMENT_TYPE_INVOICE,
  INVOICE_STEP,
  INVOICE_STEPS,
  findDocumentType,
} from '@/Constants/salesInvoice'
import { toast } from '@/Library/toast'
import BuyerStep from '@/Modules/SalesInvoice/Components/BuyerStep'
import DocumentStep from '@/Modules/SalesInvoice/Components/DocumentStep'
import DocumentTypeCard from '@/Modules/SalesInvoice/Components/DocumentTypeCard'
import GstLedgerCheck from '@/Modules/SalesInvoice/Components/GstLedgerCheck'
import PortalAuthModal from '@/Modules/SalesInvoice/Components/PortalAuthModal'
import ShareInvoiceModal from '@/Modules/SalesInvoice/Components/ShareInvoiceModal'
import ProductsStep from '@/Modules/SalesInvoice/Components/ProductsStep'
import SellerStep from '@/Modules/SalesInvoice/Components/SellerStep'
import DocumentFileUpload from '@/Modules/SalesInvoice/Document/DocumentFileUpload'
import InvoicePreview from '@/Modules/SalesInvoice/Document/InvoicePreview'
import { toEwayBillModel } from '@/Modules/SalesInvoice/Document/ewayBillModel'
import { toInvoiceModel } from '@/Modules/SalesInvoice/Document/invoiceModel'
import useFileDataUrl from '@/Modules/SalesInvoice/Document/useFileDataUrl'
import useBuyerProducts from '@/Modules/SalesInvoice/useBuyerProducts'
import useDocumentMappings from '@/Modules/SalesInvoice/useDocumentMappings'
import useDocumentNumbering from '@/Modules/SalesInvoice/useDocumentNumbering'
import useInvoiceReferenceData from '@/Modules/SalesInvoice/useInvoiceReferenceData'
import useSalesInvoiceForm from '@/Modules/SalesInvoice/useSalesInvoiceForm'
import { formFromSavedDocument, formPrefilledFrom } from '@/Modules/SalesInvoice/documentPrefill'
import useDocumentPrefill from '@/Modules/SalesInvoice/useDocumentPrefill'
import useOrderProducts from '@/Modules/SalesInvoice/useOrderProducts'
import { orderReference } from '@/Modules/SalesInvoice/orderProducts'
import OrderProducts from '@/Modules/SalesInvoice/Components/OrderProducts'
import InventoryBookingModal from '@/Modules/SalesInvoice/Components/InventoryBookingModal'
import StockBookingModal from '@/Modules/SalesInvoice/Components/StockBookingModal'
import ChallanStockModal from '@/Modules/SalesInvoice/Components/ChallanStockModal'
import { buildStockSummaryRequest, needsChallanStock, readStockSummary } from '@/Modules/SalesInvoice/challanStock'
import InventoryDetailsModal from '@/Modules/SalesInvoice/Components/InventoryDetailsModal'
import { buildBookingBody } from '@/Modules/SalesInvoice/inventoryBooking'
import { needsStockBooking, stockBookingItems } from '@/Modules/SalesInvoice/stockBooking'
import { PROCUREMENT_STATE, QUOTATION_STATES } from '@/Modules/SalesInvoice/procurement'
import useProcurement from '@/Modules/SalesInvoice/useProcurement'
import useInventoryAccess from '@/Hooks/useInventoryAccess'
import { buildPrefillFrom, readPrefillFrom } from '@/Services/documentPrefillService'
import { bookInventory, getStockSummary } from '@/Services/inventoryBookingService'
import { SAVE_OUTCOME, runSaveWorkflow } from '@/Modules/SalesInvoice/saveWorkflow'
import {
  buyerFromLedger,
  effectiveDispatch,
  effectiveShipping,
  errorStep,
  gstByRate,
  applicableForm,
  createInvoiceForm,
  documentProfile,
  invoiceFigures,
  invoiceNumberOf,
  lineVariant,
  rateText,
  sellerFromCompany,
  settingsFromCompany,
  showsDocumentField,
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
  MAPPING_DOCUMENT_TYPE,
  saveBuyerLedger,
  saveDocumentFile,
  saveDocumentPdf,
  saveSellerCompany,
  updateBusinessDocument,
} from '@/Services/salesInvoiceService'
import { PORTAL_AUTH, hasPortalCredentials, needsPortalAuth } from '@/Services/gstPortalService'
import { findBuyerCompany, getAllCompanies } from '@/Services/invoiceSharingService'
import { getLedgerId } from '@/Services/ledgerService'
import { getCountries, getStates } from '@/Services/locationService'
import { fetchCompanies } from '@/Store/Slices/companySlice'
import { selectIsIntelligereErp, selectIsTallyErp } from '@/Store/Slices/profileSlice'
import { formatDate } from '@/Utils/date'
import { missingGstLedgers, missingGstTypes, resolveGstLedgers } from '@/Utils/gstLedgers'

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
const makeInvoicePdf = async (model, layoutRef, copies) => {
  const { createInvoicePdf } = await import('@/Modules/SalesInvoice/Document/invoicePdf')
  await nextPaint()
  return createInvoicePdf({ model, layout: layoutRef.current, copies })
}

/**
 * The E-Way Bill PDF of the invoice on screen (toEwayBillModel) - before the
 * e-way bill is generated, so its number and date are not on it yet.
 */
const makeEwayBillPdf = async (model, documentType) => {
  const { createEwayBillPdf } = await import('@/Modules/SalesInvoice/Document/invoicePdf')
  return createEwayBillPdf(toEwayBillModel(model, { documentType, enteredDate: new Date() }))
}

/** The types offered for sharing with the buyer's company once saved (invoice/xy-invoice/). */
const SHARED_DOCUMENT_TYPES = Object.freeze(['Sales Invoice', 'Credit Note', 'Debit Note'])

/** Every challan copy, in order - what Download PDF prints, and what Save Challan starts with ticked. */
const ALL_COPIES = CHALLAN_COPIES.map((copy) => copy.value)

/** The Sales Order document type - its stock is booked, and its PDF save answers with it. */
const SALES_ORDER = 'Sales Order'

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
 * WHAT A MODULE BRINGS TO THIS SCREEN - Sales Invoice's own, unless another
 * module (Purchase Invoice) passes its `flow`:
 *
 *   createForm(company)     a new form
 *   documentTypes(company)  the types offered, each with `enabled`
 *   validate                validateFormWith(...) with the module's party checks
 *   SellerStep, BuyerStep   Steps 1 and 2
 *   parties                 which side is the company and which the ledger:
 *                           { company: 'seller', ledger: 'buyer' } on a sale.
 *                           The company's side is saved to the company record,
 *                           the ledger's to that ledger (on that step's Next);
 *                           the ledger is the buyer_id saved, and the one whose
 *                           earlier products are offered.
 *   chargeLedgerSac         each Other Charges ledger needs its SAC number,
 *                           saved with the charge as ledger_sac (Sales only)
 */
const SALES_FLOW = Object.freeze({
  createForm: createInvoiceForm,
  documentTypes: getDocumentTypeAccess,
  validate: validateInvoice,
  SellerStep,
  BuyerStep,
  parties: Object.freeze({ company: 'seller', ledger: 'buyer' }),
  chargeLedgerSac: true,
})

/** A history record's document number when it is only inside invoice_master_details. */
const objectDocumentNo = (record) => {
  const master = record.invoice_master_details
  if (master && typeof master === 'object') return master.document_no
  try {
    return JSON.parse(master || '{}').document_no
  } catch {
    return ''
  }
}

/** The step a side is entered on. */
const STEP_OF_PARTY = { seller: INVOICE_STEP.SELLER, buyer: INVOICE_STEP.BUYER }

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
 *
 * ------------------------------------------------------------------
 * A TYPE THAT UPLOADS ITS OWN FILE (the profile's `uploadsFile` - Purchase
 * Invoice, Inbound Challan) makes no PDF at all: the preview panel is a file
 * picker (DocumentFileUpload), and steps 3-4 are the chosen file uploaded as
 * it is - or nothing, when no file was chosen (save-document-pdf/ is then
 * never called). A failed upload keeps the document (Retry Upload sends the
 * file chosen then - never a second document).
 *
 * PREFILL FROM (useDocumentPrefill, beside the Document Type)
 * ------------------------------------------------------------------
 * A type with sources (PREFILL_SOURCES) offers Prefill From - a source type,
 * then one of the company's documents of it. The chosen document is read
 * (invoice/prefill-document-details/) and, once the ledger, product and bank
 * lists are in, put into the form (formPrefilledFrom): the new document keeps
 * its own type, number, date and company side. It is saved with
 *   prefill_from   { document_from, document_id: [...] }
 * - only while that source is still one its type allows; otherwise {}.
 * Not offered while editing (an update keeps the record's own prefill_from)
 * or once the document is saved.
 *
 * ORDER PRODUCTS (useOrderProducts - Challan, Inbound Challan, Purchase Invoice)
 * ------------------------------------------------------------------
 * Step 2's Next asks for the party's order numbers (invoice/order-document-
 * numbers/ - the ledger chosen, as buyer_id); Products lists the chosen
 * orders' products (OrderProducts - on the Document step too, where the
 * Reference No. it fills is checked), and a product's + fills the entry form.
 * The rows ticked set Reference No. when they all share one. Another party
 * or type shows nothing of the last one's.
 *
 * A SALES ORDER'S STOCK (Inventory Management)
 * ------------------------------------------------------------------
 * A NEW Sales Order, for a company with Inventory Management, has its stock
 * booked FIRST: Save (once the form checks out) opens InventoryBookingModal,
 * and only its OK goes on - the order is created (invoice/business-documents/),
 * then booked with the quantities chosen and the document_id just returned
 * (saveWorkflow's step 2b - inventory/inventory_booking/), then its PDF.
 * Closed, nothing is created. A booking the server refuses leaves the order
 * saved and waiting: Book Inventory opens the modal again (with the quantities
 * chosen) and sends only the booking, Skip booking goes on to the PDF - nothing
 * is ever created twice, and a booking done is never asked for again. Every
 * Sales Order's PDF save answers with its `stock`, kept for Inventory Details
 * (InventoryDetailsModal) - offered once the order is saved.
 *
 * From there the order's purchasing runs as one workflow (useProcurement -
 * procurement.js): saved, booking, then - once Request for Quotation is
 * pressed - its requirements calculated from that stock
 * (inventory/order_requirement/) and, when something must be bought, a
 * Request for Quotation - inside Inventory Details, its only entry point
 * (RequestQuotation: what is bought at which level, the raw materials'
 * vendors, then each seller's quantities and Download -
 * inventory/request_quotation/).
 *
 * A PURCHASE'S STOCK (Purchase Invoice, Inbound Challan - Inventory Management)
 * ------------------------------------------------------------------
 * Once a NEW one is created, and before its file / PDF is saved, its product
 * lines are booked into warehouses (saveWorkflow's step 2b -
 * StockBookingModal: each line in the product form, filled from the product
 * list, the warehouse the user's to choose; one product POST per line, with
 * the document_id). It cannot be closed; a retry of the upload never books
 * again. Not for a Purchase Invoice whose Prefill From is an Inbound Challan
 * (needsStockBooking) - that stock came in with the challan.
 *
 * A CHALLAN'S STOCK (Challan with no Prefill From - Inventory Management)
 * ------------------------------------------------------------------
 * Before a NEW one is created: its products' stock summary (POST
 * inventory/SKUWarehouseSummaryAPI/), ChallanStockModal to take each one's
 * quantity out of a warehouse's free stock or a Sales Order's booking, the
 * PUT - and only once that succeeds, the Challan is created and its PDF made.
 * Closed, or refused, nothing is saved. Done once for the same lines (a create
 * that fails is saved again without taking the stock out twice). Not with a
 * Prefill From - a Sales Order's stock is that order's booking; a Proforma's
 * as it always was (needsChallanStock).
 *
 * EDITING A SAVED DOCUMENT (History's Edit)
 * ------------------------------------------------------------------
 *   editRequest   { record, ... } - a new object each time Edit is pressed;
 *                 `record` is the history row as the server sent it
 *   onDocumentSaved()   after a document is saved or updated, with its PDF
 *
 * The record is put into the form (formFromSavedDocument) once the ledger,
 * product and bank lists are in - until then the form is locked and Save is
 * not offered. Its `document_id` is kept, from the moment it is loaded until
 * the update is done or Cancel Edit is pressed, and is the id the update
 * names - never the number, a party's id or a row's place. While editing, the document number and type cannot change and
 * no new number is asked for; Save is "Update ..." and step 2 is
 *   PUT invoice/business-documents/  { ...the same body, document_id }
 * (updateBusinessDocument) - never a POST, so no second document is made.
 * The PDF is then made and uploaded under the same id, as on a save, with
 * the same Retry PDF if that fails. Cancel edit, or a finished update, goes
 * back to a new, empty document.
 */
export default function SalesInvoiceWorkspace({ company, flow = SALES_FLOW, editRequest = null, onDocumentSaved }) {
  const invoice = useSalesInvoiceForm(company, flow.createForm)
  const { form, setErrors, reset } = invoice
  const { ledgers, banks, countries, products } = useInvoiceReferenceData(company.company_id)
  const { SellerStep: SellerDetails, BuyerStep: BuyerDetails, parties, validate } = flow

  const documentTypes = useMemo(() => flow.documentTypes(company), [flow, company])
  const allowedTypes = useMemo(
    () => documentTypes.filter((type) => type.enabled).map((type) => type.value),
    [documentTypes],
  )

  // The form as this document type has it - what it does not show cleared
  // (applicableForm): the figures, the preview and the saved document read
  // this, so nothing hidden can change a total or be saved.
  const applicable = useMemo(() => applicableForm(form), [form])
  const figures = useMemo(() => invoiceFigures(applicable), [applicable])
  const companyId = company.company_id
  const documentTypeValue = form.documentType
  const isInvoice = documentTypeValue === DOCUMENT_TYPE_INVOICE
  const profile = documentProfile(form)
  // A challan (or Inbound Challan): goods only - no GST, no ledgers to check, its own sheet and copies.
  const isChallanDoc = Boolean(profile.challan)
  // Purchase Invoice / Inbound Challan: no PDF made - the user's own file, uploaded when there is one.
  const uploadsFile = Boolean(profile.uploadsFile)
  // A sale (Sales Invoice, Credit Note, Debit Note) can be shared with its buyer's own company once saved.
  const sharesWithBuyer = parties.company === 'seller' && SHARED_DOCUMENT_TYPES.includes(form.documentType)
  // E-Way Bill ticked, on a type that has the setting - its own PDF goes up with the invoice's (makeDocumentPdfs).
  const makesEwayBill = profile.settings.includes('eWayBill') && Boolean(form.settings.eWayBill)
  const [documentFile, setDocumentFile] = useState(null)
  // Every type but a challan charges GST - listed, mapped and posted to ledgers.
  const chargesGst = profile.gst

  /* ---- the document number: a new round each time a document is saved ----
     (useDocumentNumbering: asked by Step 2's Next only - a save itself asks
     nothing; the next document asks at its own Step 2 Next) */
  const [numberingRound, setNumberingRound] = useState(0)
  const { applyDocumentDefaults } = invoice

  /* ---- the GST ledgers ----
     Every document that charges GST names, in gst_charges, the LEDGER each
     tax is posted to - so every type needs a real ledger for each tax and
     rate it charges. The GST mappings (invoice/document-mapping/) are the
     company's for its side - 'Sales Invoice' on a sale, 'Purchase Invoice'
     on a purchase - read once per company and side (shared cache) for every
     type that charges GST; ledgers are also matched by name. One rule,
     Utils/gstLedgers - the table, the preview, the check before saving and
     the saved gst_charges all read the same answer. */
  const mappingType = parties.company === 'seller' ? MAPPING_DOCUMENT_TYPE.SALES : MAPPING_DOCUMENT_TYPE.PURCHASE
  const mappings = useDocumentMappings(companyId, chargesGst ? mappingType : null)
  const ledgerMapping = chargesGst ? mappings.ledgerMapping : null

  /* ---- the buyer's earlier products - once the Buyer step is completed ---- */
  // The ledger side's (the buyer's on a sale, the supplier's on a purchase), once its step is completed.
  const [confirmedLedgerId, setConfirmedLedgerId] = useState(null)
  const buyerProducts = useBuyerProducts({ companyId, ledgerId: confirmedLedgerId, documentType: documentTypeValue })

  /* ---- what the company record held when last read or saved ---- */
  const [sellerBaseline, setSellerBaseline] = useState(() => ({
    seller: sellerFromCompany(company),
    settings: settingsFromCompany(company),
  }))

  /* ---- E-Invoice / E-Way Bill: authenticated before they tick ----
     Ticking one whose portal credentials the company record does not hold
     (both username and password) opens PortalAuthModal for THAT feature; the
     box ticks only once its own endpoint says so. Then tally/user-companies-list/
     is read again, and the box (and the baseline the Seller step's save
     compares against) follows the feature's flag as the company now has it.
     Each feature on its own - one never stands in for the other. The record
     read is always the latest `company` (the store's); a company switch
     remounts the workspace, so nothing of another company's carries over. */
  const dispatch = useDispatch()
  const { setField } = invoice
  const [portalAuth, setPortalAuth] = useState(null)
  const changeSetting = (key, checked) => {
    if (checked && needsPortalAuth(key) && !hasPortalCredentials(company, key)) {
      setPortalAuth(key)
      return
    }
    setField(`settings.${key}`, checked)
  }
  const portalAuthenticated = async (key, reply) => {
    const { label } = PORTAL_AUTH[key]
    setPortalAuth(null)
    setField(`settings.${key}`, true)
    toast.success(reply?.msg || `${label} authenticated.`)
    let companies
    try {
      companies = await dispatch(fetchCompanies({ force: true })).unwrap()
    } catch {
      // The reload's own failure is shown by AppLayout; the authentication stands, so the box stays ticked.
      return
    }
    const latest = companies.find((entry) => String(entry.company_id) === String(companyId))
    if (!latest) return
    const on = settingsFromCompany(latest)[key]
    setField(`settings.${key}`, on)
    setSellerBaseline((previous) => ({ ...previous, settings: { ...previous.settings, [key]: on } }))
    if (!on) toast.info(`${label} is authenticated, but it is still off for this company. Tick it again to turn it on.`)
  }
  // A challan charges no GST - none is printed, checked or saved.
  const gst = useMemo(() => (chargesGst ? gstByRate(figures) : []), [chargesGst, figures])
  // The same entries, each with its ledger: the one for that rate (mapped,
  // else matched by name), else the tax's basic one, else none (`ledger`
  // null) - never a default.
  const gstLedgers = useMemo(
    () => resolveGstLedgers(gst, { ledgerMapping, ledgers: ledgers.named }),
    [gst, ledgerMapping, ledgers.named],
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
    if (gstLedgers.length === 0) return { status: 'ok', missing: [], retry }
    // The mappings count only where they are read (a type that charges GST).
    const mappingStatus = chargesGst ? mappings.status : 'ready'
    if (ledgers.status === 'failed' || mappingStatus === 'failed') return { status: 'failed', missing: [], retry }
    if (ledgers.status !== 'succeeded' || mappingStatus !== 'ready') return { status: 'loading', missing: [], retry }
    const missing = missingGstLedgers(gstLedgers)
    return { status: missing.length > 0 ? 'missing' : 'ok', missing, retry }
  }, [gstLedgers, chargesGst, ledgers.status, mappings.status, retryLedgers, reloadMappings])
  /* ---- an Other Charges ledger's SAC (Sales Invoice) ----
     Missing, it blocks the save either way; the ERP (the profile in the
     store) says what is offered - Add SAC on Intelligere, what to do in Tally
     on Tally. null until the profile says which. */
  const isTallyErp = useSelector(selectIsTallyErp)
  const isIntelligereErp = useSelector(selectIsIntelligereErp)
  const erp = isTallyErp ? 'tally' : isIntelligereErp ? 'intelligere' : null
  const chargeSacRule = useMemo(() => (flow.chargeLedgerSac ? { erp } : null), [flow.chargeLedgerSac, erp])

  const context = useMemo(
    () => ({ allowedTypes, productsByKey: products.byKey, ledgersById: ledgers.byId, chargeSac: chargeSacRule }),
    [allowedTypes, products.byKey, ledgers.byId, chargeSacRule],
  )

  /* ---- the live preview ---- */
  const logo = useFileDataUrl(form.seller.logo)
  const signature = useFileDataUrl(form.seller.signature)
  // A type with no bank or Payment QR field prints neither (applicable has them empty).
  const paymentQr = useFileDataUrl(applicable.document.paymentQr)
  const bank = banks.list.find((entry) => String(entry.id) === String(applicable.document.bankId)) ?? null

  const model = useMemo(
    () =>
      toInvoiceModel({
        form: applicable,
        figures,
        gst: gstLedgers,
        productsByKey: products.byKey,
        ledgersById: ledgers.byId,
        bank,
        images: { logo, signature, paymentQr },
      }),
    [applicable, figures, gstLedgers, products.byKey, ledgers.byId, bank, logo, signature, paymentQr],
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

  // Asked only by the Buyer step's Next (see next() below) - never on opening,
  // on a render, between other steps, or after a save.
  // Auto Increment's box changes only once the company's setting is saved (numbering.setAutoIncrement).
  const setAutoIncrement = useCallback((on) => setField('document.autoIncrement', on), [setField])
  const numbering = useDocumentNumbering({
    companyId,
    documentType: documentTypeValue,
    round: numberingRound,
    apply: applyDocumentDefaults,
    setAutoIncrement,
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

  /* ---- History's Edit ----
     `editing` is the saved document being edited ({ documentId, documentNo })
     or null for a new one; `pendingEdit` a record waiting for the lists it is
     read against. A new Edit replaces whatever was in the form - nothing of
     the previous document is kept. */
  const [editing, setEditing] = useState(null)
  const [pendingEdit, setPendingEdit] = useState(null)
  const [seenEditRequest, setSeenEditRequest] = useState(null)

  /* ---- Prefill From ----
     `prefilledFrom` - the source the form was last filled from ({ documentFrom,
     documentIds }), what prefill_from records; `pendingPrefill` a record waiting
     for the lists it is read against, as an Edit's does. */
  const [prefilledFrom, setPrefilledFrom] = useState(null)
  const [pendingPrefill, setPendingPrefill] = useState(null)
  const prefill = useDocumentPrefill({
    companyId,
    documentType: documentTypeValue,
    enabled: !saved && !editing && !pendingEdit,
    onDocument: (record, source) => setPendingPrefill({ record, source }),
    onClear: () => {
      setPendingPrefill(null)
      setPrefilledFrom(null)
    },
  })
  const { clear: clearPrefill } = prefill

  /* ---- a Sales Order's stock ----
     `procurement` - the saved order's purchasing. `bookingAsk` - the booking
     modal, open while a save waits for its answer (bookingAnswer: the
     quantities chosen, or null - closed); `bookedRef` the quantities last
     chosen, for a booking that was refused. `inventoryDetails` - { documentId,
     documentNo, stock } from the last Sales Order's PDF save, for Inventory Details. */
  const inventoryAccess = useInventoryAccess()
  // A NEW Sales Order of a company with Inventory Management books its stock - an update never does.
  const booksInventory = documentTypeValue === SALES_ORDER && inventoryAccess.full && !editing
  // { documentId, documentNo, items } while its lines are being booked; stockAnswer settles the save's step 2b.
  const [stockAsk, setStockAsk] = useState(null)
  const stockAnswer = useRef(null)
  const procurement = useProcurement({ companyId })
  const bookingAnswer = useRef(null)
  const bookedRef = useRef(null)
  const [bookingAsk, setBookingAsk] = useState(null)
  const [inventoryDetails, setInventoryDetails] = useState(null)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  /**
   * The saved order as its purchasing needs it - taken as it is saved, since
   * the form is cleared once its PDF is. Its date (DD/MM/YYYY, as the request
   * for quotation's Word file shows it) and the company asking - the active
   * company's own details - are for that file.
   */
  const orderSnapshot = (documentId, documentNo) => {
    const own = sellerFromCompany(company)
    return {
      documentId,
      documentNo,
      documentDate: formatDate(form.document.invoiceDate, '').replace(/-/g, '/'),
      companyName: company.comp_name,
      buyer: { name: own.name, address: own.address, gstin: own.gstin, phone: own.phone, email: own.email },
      lines: applicable.lines,
      productsByKey: products.byKey,
      booked: null,
    }
  }
  /** Opens the booking modal - its answer: { items, booked } on OK, null when closed. */
  const askBooking = (documentNo, initialBooked) =>
    new Promise((resolve) => {
      bookingAnswer.current = resolve
      setBookingAsk({ documentNo, initialBooked })
    })
  const settleBooking = (answer) => {
    const resolve = bookingAnswer.current
    bookingAnswer.current = null
    setBookingAsk(null)
    resolve?.(answer)
  }
  // Nothing of a booking outlives the workspace.
  useEffect(
    () => () => {
      bookingAnswer.current?.(null)
      stockAnswer.current?.('paused')
    },
    [],
  )
  /**
   * The saved purchase's lines booked into warehouses (step 2b) - 'booked'
   * once the last is saved; 'skipped' when it has no product to book. A line
   * whose product is no longer in the product list is left out, and said so.
   */
  const bookStock = (documentId, documentNo) => {
    const { items, unmatched } = stockBookingItems({ lines: applicable.lines, productsByKey: products.byKey })
    if (unmatched.length > 0) toast.warning(`Not in the product list, so not booked into a warehouse: ${unmatched.join(', ')}.`)
    if (items.length === 0) return Promise.resolve('skipped')
    return new Promise((resolve) => {
      stockAnswer.current = resolve
      setStockAsk({ documentId, documentNo, items })
    })
  }
  /**
   * The saved order booked with the quantities chosen (step 2b) - 'booked', or
   * 'paused' when the server refuses it (its message shown; the order stays saved).
   */
  const sendBooking = async (documentId, { items, booked }) => {
    const body = buildBookingBody({ companyName: company.comp_name, documentId, items, booked })
    // Nothing any warehouse holds - nothing to book.
    if (body.products.length > 0) {
      try {
        const reply = await bookInventory(body)
        toast.success(reply?.msg || 'The stock was booked.')
      } catch (failure) {
        toast.error(failure.message || 'The stock could not be booked.')
        return 'paused'
      }
    }
    procurement.bookingConfirmed(booked)
    return 'booked'
  }

  /* ---- order products - the party's orders, after Step 2 ---- */
  const ledgerParty = form[parties.ledger]
  const orders = useOrderProducts({
    companyId,
    documentType: documentTypeValue,
    partyKey: ledgerParty.ledgerId,
    // The ticked rows' one shared Reference No. goes into the document's; rows that differ leave it as it is.
    onCheckedChange: (rows) => {
      const reference = orderReference(rows)
      if (reference) setField('document.referenceNo', reference)
    },
  })
  // A NEW Purchase Invoice / Inbound Challan books its stock after it is created - not one prefilled from an Inbound Challan (needsStockBooking).
  const booksStock = needsStockBooking({ documentType: documentTypeValue, orderSource: orders.source, inventory: inventoryAccess.full, editing: Boolean(editing) })
  // A NEW Challan with nothing in Prefill From takes its stock out before it is created (needsChallanStock).
  const takesChallanStock = needsChallanStock({
    documentType: documentTypeValue,
    inventory: inventoryAccess.full,
    editing: Boolean(editing),
    prefilled: Boolean(orders.source || prefill.sourceType || prefilledFrom),
  })
  // { rows, documentNo } while the modal is open; challanStockAnswer settles the save's wait for it;
  // challanStockFor - the lines whose stock is already out (never taken out twice).
  const [challanStockAsk, setChallanStockAsk] = useState(null)
  const challanStockAnswer = useRef(null)
  const challanStockFor = useRef(null)
  const linesTaken = JSON.stringify(applicable.lines.map((line) => [line.productKey, line.skuValue, line.quantity]))
  /** The Challan's stock taken out (POST, the modal, PUT) - true once it is, or there is nothing to take; false - not saved. */
  const takeChallanStock = async (documentNo) => {
    const { body, items } = buildStockSummaryRequest({ companyName: company.comp_name, lines: applicable.lines, productsByKey: products.byKey })
    if (body.length === 0) return true
    let reply
    try {
      reply = await getStockSummary(body)
    } catch (failure) {
      toast.error(failure.message || 'The stock could not be read.')
      return false
    }
    const rows = readStockSummary(reply, items)
    if (rows.length === 0) return true
    return new Promise((resolve) => {
      challanStockAnswer.current = resolve
      setChallanStockAsk({ rows, documentNo })
    })
  }
  const settleChallanStock = (done) => {
    const resolve = challanStockAnswer.current
    challanStockAnswer.current = null
    setChallanStockAsk(null)
    resolve?.(done)
  }
  // Nor does a Challan's wait for its stock.
  useEffect(
    () => () => {
      challanStockAnswer.current?.(false)
    },
    [],
  )

  if (editRequest && editRequest !== seenEditRequest) {
    setSeenEditRequest(editRequest)
    setPendingEdit(editRequest.record)
    setEditing(null)
    setSaved(null)
    setStepIndex(0)
    setPendingPrefill(null)
    setPrefilledFrom(null)
    clearPrefill()
  }
  const listsSettled = ![ledgers.status, products.status, banks.status].some((status) => status === 'idle' || status === 'loading')
  if (pendingPrefill && listsSettled) {
    const { record, source } = pendingPrefill
    setPendingPrefill(null)
    // Still a source this type allows (the type may have changed while it loaded).
    if (prefill.sources.includes(source.documentType)) {
      invoice.prefill(
        formPrefilledFrom(record, form, {
          createForm: flow.createForm,
          company,
          parties,
          ledgers,
          products: products.list,
          banks: banks.list,
          countries: { countryNames: getCountries(countries.data), stateNamesOf: (country) => getStates(countries.data, country) },
        }),
      )
      setPrefilledFrom({ documentFrom: source.documentType, documentIds: [source.documentId] })
      // Another party may be in the form now: its earlier products wait for its step again.
      setConfirmedLedgerId(null)
    }
  }
  if (pendingEdit && listsSettled) {
    const record = pendingEdit
    invoice.load(
      formFromSavedDocument(record, {
        createForm: flow.createForm,
        company,
        parties,
        ledgers,
        products: products.list,
        banks: banks.list,
        countries: { countryNames: getCountries(countries.data), stateNamesOf: (country) => getStates(countries.data, country) },
      }),
    )
    setEditing({
      // The record's own document_id (business-document-history) - what the PUT names.
      documentId: record.document_id,
      documentNo: String(record.document_no ?? '').trim() || String(objectDocumentNo(record) ?? ''),
      // Where it was prefilled from, as saved - an update keeps it.
      prefillFrom: readPrefillFrom(record.prefill_from),
    })
    setPendingEdit(null)
    setConfirmedLedgerId(null)
    setDocumentFile(null)
  }

  /**
   * The Seller and Buyer steps write back to where their details live, on
   * Next, and only when something changed - on a sale:
   *
   *   Seller   PUT  tally/user-companies-list/   the company
   *   Buyer    PUT  tally/create-ledger/         the buyer's ledger
   *
   * (a purchase the other way round - `flow.parties`). A failed save keeps
   * the user on the step (the message is the backend's own); nothing is sent
   * while typing. Completing the ledger's step is also what lets that
   * ledger's earlier products be loaded.
   */
  const saveStep = async () => {
    if (step.key === STEP_OF_PARTY[parties.company]) {
      const details = form[parties.company]
      const payload = buildCompanyUpdatePayload(companyId, { seller: details, settings: form.settings }, sellerBaseline)
      if (!payload) return true
      await saveSellerCompany(payload)
      setSellerBaseline({ seller: { ...details }, settings: { ...form.settings } })
      return true
    }

    if (step.key === STEP_OF_PARTY[parties.ledger]) {
      const party = form[parties.ledger]
      const ledger = ledgers.byId.get(party.ledgerId)
      if (!ledger) return false
      const lists = {
        countryNames: getCountries(countries.data),
        stateNamesOf: (country) => getStates(countries.data, country),
      }
      const payload = buildBuyerLedgerPayload(companyId, ledger, party, buyerFromLedger(ledger, party.ledgerId, lists))
      if (payload) {
        await saveBuyerLedger(payload)
        // The list is read again, so the next comparison is against what was saved.
        ledgers.retry()
      }
      setConfirmedLedgerId(getLedgerId(ledger))
      return true
    }

    return true
  }

  const next = async () => {
    if (busyRef.current) return
    const found = validate(form, context, step.key)
    if (Object.keys(found).length > 0) {
      setErrors((previous) => ({ ...previous, ...found }))
      toast.error('Please correct the highlighted fields.')
      focusFirstError()
      return
    }

    busyRef.current = true
    setPhase('step')
    try {
      if (await saveStep()) {
        // Step 2's Next is the one moment the document number is asked for -
        // for the type chosen on Step 1 (a repeat for the same type asks nothing).
        // (Never while editing - the document keeps the number it was saved under.)
        if (step.key === INVOICE_STEP.BUYER && !editing) numbering.request()
        // ...and the party's order numbers, for a type that takes order products - buyer_id as the save sends it.
        // (A type that chooses its source keeps the party for when one is chosen - Prefill From.)
        if (step.key === INVOICE_STEP.BUYER && (orders.source || orders.choices.length > 0)) {
          const ledger = ledgers.byId.get(ledgerParty.ledgerId)
          orders.request(getLedgerId(ledger) ?? ledgerParty.ledgerId)
        }
        goTo(stepIndex + 1)
      }
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      busyRef.current = false
      setPhase('idle')
    }
  }

  // Another module's type names itself in its profile (label).
  const documentType = profile.label ? { label: profile.label } : findDocumentType(form.documentType)
  const busy = phase !== 'idle'
  const locked = (busy && phase !== 'download') || Boolean(saved) || Boolean(pendingEdit)
  const fileNameFor = (invoiceNo) => documentPdfFileName(documentType?.label, invoiceNo)

  /* ---- the E-Way Bill PDF ----
     With E-Way Bill ticked (Sales Invoice, Credit Note, Debit Note - the types
     that have the setting), the save's PDF step makes the E-Way Bill PDF right
     after the invoice's, and nothing is sent unless BOTH are made. The two then
     go up together in ONE save-document-pdf/ request - { id, file,
     e_way_bill_pdf }. A failed upload's retry sends the same two again, once;
     a failed PDF step makes both again. Without E-Way Bill: the invoice's PDF
     alone, as always. */
  const makeDocumentPdfs = (copies) => async () => {
    const invoice = await makeInvoicePdf(model, layoutRef, isChallanDoc ? copies : undefined)
    if (!makesEwayBill) return invoice
    try {
      return { invoice, ewayBill: await makeEwayBillPdf(model, form.documentType) }
    } catch (failure) {
      throw new Error(`The E-Way Bill PDF could not be generated: ${failure.message}`, { cause: failure })
    }
  }
  const uploadDocumentPdfs = (invoiceNo) => (documentId, pdfs) =>
    pdfs instanceof Uint8Array
      ? saveDocumentPdf(documentId, pdfs, fileNameFor(invoiceNo))
      : saveDocumentPdf(documentId, pdfs.invoice, fileNameFor(invoiceNo), {
          bytes: pdfs.ewayBill,
          fileName: documentPdfFileName('E-Way Bill', invoiceNo),
        })

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
      // A challan downloads as all three copies, one after another.
      const bytes = await makeInvoicePdf(model, layoutRef, isChallanDoc ? ALL_COPIES : undefined)
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
  const report = ({ outcome, saved: keep, error, uploaded, reply }, invoiceNo) => {
    const what = `${documentType?.label ?? 'Document'} ${invoiceNo}`
    // What goes with the document: its PDF (and its E-Way Bill PDF), or (a type that uploads its own) the file chosen.
    const attachment = uploadsFile ? 'file' : makesEwayBill ? 'PDFs' : 'PDF'
    const retry = uploadsFile ? 'Retry Upload' : 'Retry PDF'
    switch (outcome) {
      case SAVE_OUTCOME.DONE:
        toast.success(
          `${what} ${editing ? 'updated' : 'saved'}${uploadsFile && !uploaded ? '.' : makesEwayBill ? ', with its PDF and E-Way Bill PDF.' : `, with its ${attachment}.`}`,
        )
        // A Sales Order's PDF save answers with its stock - kept for Inventory Details.
        if (documentTypeValue === SALES_ORDER && reply?.stock && typeof reply.stock === 'object')
          setInventoryDetails({ documentId: keep?.documentId ?? null, documentNo: invoiceNo, stock: reply.stock })
        // Its purchasing goes on from that stock (only an order whose booking is done or skipped waits for it).
        if (documentTypeValue === SALES_ORDER && keep?.documentId != null) procurement.stockArrived(keep.documentId, reply?.stock ?? null)
        bookedRef.current = null
        challanStockFor.current = null
        setSaved(null)
        setEditing(null)
        setDocumentFile(null)
        setPrefilledFrom(null)
        clearPrefill()
        orders.clearSource()
        reset()
        setNumberingRound((round) => round + 1)
        goTo(0)
        onDocumentSaved?.()
        return
      case SAVE_OUTCOME.CREATE_FAILED:
        // Nothing was saved - every value is still in the form.
        toast.error(error.message)
        return
      case SAVE_OUTCOME.NO_DOCUMENT_ID:
        toast.error('The server did not return the saved document. Please check before saving again.')
        return
      case SAVE_OUTCOME.BOOKING_PAUSED:
        // The order is saved, its booking refused; its stock (and so its PDF) waits for Book Inventory or Skip booking.
        setSaved(keep)
        toast.info(`${what} is saved, but its inventory could not be booked. Press Book Inventory to try again - or Skip booking.`)
        return
      case SAVE_OUTCOME.PDF_FAILED:
        console.error('[Sales Invoice] PDF generation failed:', error)
        setSaved(keep)
        toast.error(`${what} was ${editing ? 'updated' : 'saved'}, but its PDF could not be generated: ${error.message} Press Retry PDF.`)
        return
      case SAVE_OUTCOME.UPLOAD_FAILED:
        console.error(`[Sales Invoice] ${attachment} upload failed:`, error)
        setSaved(keep)
        toast.error(`${what} was ${editing ? 'updated' : 'saved'}, but its ${attachment} could not be uploaded: ${error.message} Press ${retry}.`)
        return
      default:
    }
  }

  /**
   * Everything a new document is checked for before it is saved - the form,
   * then a ledger for every GST tax it charges. False (and the problem shown,
   * its step opened) when it cannot be saved yet.
   */
  const readyToSave = () => {
    const found = validate(form, context)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      const at = errorStep(found)
      if (at >= 0 && at !== stepIndex) goTo(at)
      toast.error('Some details need attention before the document can be saved.')
      focusFirstError()
      return false
    }

    // Every GST tax and rate it charges must have a ledger - none is ever assumed.
    if (gstCheck.status !== 'ok') {
      const productsStep = INVOICE_STEPS.findIndex((entry) => entry.key === INVOICE_STEP.PRODUCTS)
      if (stepIndex !== productsStep) goTo(productsStep)
      toast.error(
        gstCheck.status === 'missing'
          ? missingGstTypes(gstCheck.missing)
              .map(
                (type) =>
                  `${type.tax} ledger is missing (needed for ${type.rates.map((rate) => `${type.tax} ${rateText(rate)}%`).join(', ')}). Please create the required ${type.tax} ledger before creating this invoice.`,
              )
              .join(' ')
          : gstCheck.status === 'loading'
            ? 'The GST ledgers are still being checked. Please save again in a moment.'
            : 'The GST ledgers could not be checked. Press Retry, then save.',
      )
      return false
    }
    return true
  }

  /* ---- a challan's copies ----
     Save Challan first asks which copies to print. They go into ONE PDF for
     the ONE saved document - choosing three never saves three challans. A
     Retry PDF prints the same copies again (`copiesRef`). */
  const [copyDialog, setCopyDialog] = useState({ open: false, copies: ALL_COPIES })
  const copiesRef = useRef(ALL_COPIES)

  /** The Save button: a challan asks for its copies first (once the form is fine); anything else saves. */
  const onSaveClick = () => {
    if (busyRef.current) return
    if (isChallanDoc && !saved && !uploadsFile) {
      if (readyToSave()) setCopyDialog((previous) => ({ ...previous, open: true }))
      return
    }
    save(copiesRef.current)
  }

  const save = async (copies = ALL_COPIES, { skipBooking = false } = {}) => {
    if (busyRef.current) return
    busyRef.current = true
    copiesRef.current = copies

    try {
      let request = null
      // A document that already exists needs only its PDF - nothing is checked or created again.
      if (!saved) {
        if (!readyToSave()) return

        const dispatch = effectiveDispatch(form)
        const shipping = effectiveShipping(form)
        request = buildInvoiceSaveRequest({
          // Only what this type has - nothing hidden is saved.
          form: applicable,
          figures,
          // Each with the real ledger it is posted to - gst_charges is keyed by it.
          gstCharges: gstLedgers.map((entry) => ({ ...entry, rateText: rateText(entry.rate) })),
          company,
          dispatch: { ...dispatch, stateCode: stateCodeOf(dispatch.state) },
          shipping: { ...shipping, stateCode: stateCodeOf(shipping.state) },
          invoiceNo: invoiceNumberOf(form.document),
          ledgersById: ledgers.byId,
          banks: banks.list,
          productsByKey: products.byKey,
          lineVariantOf: lineVariant,
          // The ledger side is the buyer_id saved - the buyer on a sale, the supplier on a purchase.
          partyLedgerId: applicable[parties.ledger].ledgerId,
          rules: {
            goodsOnly: isChallanDoc,
            invoiceRef: showsDocumentField(form, 'challanInvoiceNo'),
            challanType: showsDocumentField(form, 'challanType'),
          },
          chargeLedgerSac: Boolean(flow.chargeLedgerSac),
          prefillFrom: editing
            ? editing.prefillFrom
            : buildPrefillFrom(prefilledFrom && prefill.sources.includes(prefilledFrom.documentFrom) ? prefilledFrom : null),
        })
      }

      const invoiceNo = saved?.invoiceNo ?? request.invoiceNo
      // A new Sales Order's stock is chosen BEFORE it is created (or, saved with
      // its booking refused, again before only the booking is sent). Closed -
      // nothing is created, nothing sent.
      let booking = null
      if (booksInventory && !skipBooking && (!saved || saved.booked === false)) {
        setPhase('booking')
        booking = await askBooking(invoiceNo, saved ? bookedRef.current : null)
        if (!booking) return
        bookedRef.current = booking.booked
      }
      // A new Challan with no Prefill From: its stock out of the warehouses first - once for these lines.
      if (!saved && takesChallanStock && challanStockFor.current !== linesTaken) {
        setPhase('booking')
        if (!(await takeChallanStock(invoiceNo))) return
        challanStockFor.current = linesTaken
      }
      const result = await runSaveWorkflow({
        // A retry of a type that uploads its own file sends the file chosen NOW (it may have been replaced).
        // (`booked` kept, so a retry never books the stock again.)
        saved: uploadsFile && saved ? { documentId: saved.documentId, invoiceNo: saved.invoiceNo, booked: saved.booked } : saved,
        invoiceNo,
        // Editing: the saved document is updated (PUT, its document_id) - never a new one made.
        createDocument: () => (editing ? updateBusinessDocument(editing.documentId, request) : createBusinessDocument(request)),
        // A new Sales Order with Inventory Management: booked with the quantities chosen, before the PDF (or skipped, as asked).
        book: booksInventory
          ? (documentId) => {
              procurement.orderSaved(orderSnapshot(documentId, invoiceNo))
              if (!booking) {
                procurement.bookingSkipped()
                return Promise.resolve('skipped')
              }
              return sendBooking(documentId, booking)
            }
          : booksStock
            ? (documentId) => bookStock(documentId, invoiceNo)
            : null,
        // Purchase Invoice / Inbound Challan: the chosen file, or none - never a PDF made from the form.
        makePdf: uploadsFile ? () => documentFile : makeDocumentPdfs(copies),
        uploadPdf: uploadsFile
          ? (documentId, file) => saveDocumentFile(documentId, file)
          : uploadDocumentPdfs(invoiceNo),
        onStage: setPhase,
      })
      // A new sale, saved with its PDF: offered for sharing with its buyer's company (after the form is cleared).
      const shareCheck =
        result.outcome === SAVE_OUTCOME.DONE && !editing && sharesWithBuyer
          ? {
              documentId: result.saved.documentId,
              documentNo: invoiceNo,
              documentType: form.documentType,
              buyerName: applicable.buyer.name,
              buyerGstin: applicable.buyer.gstin,
            }
          : null
      report(result, invoiceNo)
      if (shareCheck) offerSharing(shareCheck)
    } finally {
      busyRef.current = false
      setPhase('idle')
    }
  }

  /* ---- sharing with the buyer's company ----
     Once a NEW sale is saved (PDF and all), its buyer's name is looked for
     among the companies on Intelligere (tally/AllCompanyList/ - findBuyerCompany:
     case and spacing aside, never this company). Found, ShareInvoiceModal asks
     whether to share it; only its OK sends anything. One offer at a time. */
  const [shareOffer, setShareOffer] = useState(null)
  const offerSharing = async (saved) => {
    let list
    try {
      list = await getAllCompanies()
    } catch (failure) {
      // No list, no offer - the document itself is saved.
      console.warn('[Sales Invoice] The company list for sharing could not be read:', failure)
      return
    }
    const match = findBuyerCompany(list, { buyerName: saved.buyerName, buyerGstin: saved.buyerGstin, ownCompanyId: companyId })
    if (match) setShareOffer((current) => current ?? { ...saved, companyId, company: match })
  }

  /** Leaves a saved document whose PDF did not go up, and starts a fresh one. */
  const startNew = () => {
    // That order's purchasing ends with it - its PDF (and so its stock) is not coming.
    procurement.reset()
    bookedRef.current = null
    challanStockFor.current = null
    setSaved(null)
    setEditing(null)
    setPendingEdit(null)
    setDocumentFile(null)
    setPendingPrefill(null)
    setPrefilledFrom(null)
    clearPrefill()
    orders.clearSource()
    reset()
    // That document used its number: the next one is asked for at Step 2.
    setNumberingRound((round) => round + 1)
    goTo(0)
  }

  const saveWord = `${editing ? 'Update' : 'Save'} ${isInvoice ? 'Invoice' : (documentType?.label ?? 'Document')}`
  // A saved Sales Order whose booking was refused: Save books it.
  const bookingPending = Boolean(saved) && saved.booked === false
  const retryWord = uploadsFile ? 'Retry Upload' : 'Retry PDF'
  const saveLabel = {
    download: saved ? retryWord : saveWord,
    creating: 'Saving...',
    booking: 'Booking inventory...',
    pdf: uploadsFile ? 'Saving...' : 'Generating PDF...',
    uploading: uploadsFile ? 'Uploading file...' : 'Uploading PDF...',
  }[phase] ?? (bookingPending ? 'Book Inventory' : saved ? retryWord : saveWord)

  const stepProps = { invoice, disabled: locked }

  // The purchasing of the order Inventory Details shows - none for an order updated, or another order.
  const purchasing = Boolean(inventoryDetails) && procurement.order !== null && String(procurement.order.documentId) === String(inventoryDetails.documentId)
  const purchaseNote = !purchasing
    ? ''
    : {
        [PROCUREMENT_STATE.REQUIREMENTS_LOADING]: procurement.machine.error ? 'Its purchase requirements could not be calculated.' : 'Calculating its purchase requirements...',
        [PROCUREMENT_STATE.NO_PURCHASE_REQUIRED]: 'No purchase is needed.',
        [PROCUREMENT_STATE.QUOTATION_SUCCESS]: 'A request for quotation is sent.',
      }[procurement.state] ?? (QUOTATION_STATES.includes(procurement.state) ? 'A request for quotation is under way.' : '')

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

          {pendingEdit ? (
            <InlineAlert>Loading {String(pendingEdit.document_no ?? '').trim() || 'the document'} for editing...</InlineAlert>
          ) : null}
          {bookingPending ? (
            <InlineAlert
              action={
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={busy} onClick={() => save(copiesRef.current)}>
                    Book Inventory
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => save(copiesRef.current, { skipBooking: true })}>
                    Skip booking
                  </Button>
                </div>
              }
            >
              {saved.invoiceNo} is saved (document {saved.documentId}), but its inventory could not be booked - its PDF is made once it is (or once you skip booking). It will not be saved a second time.
            </InlineAlert>
          ) : saved ? (
            <InlineAlert
              action={
                <Button type="button" variant="outline" size="sm" icon={FilePlus} disabled={busy} onClick={startNew}>
                  Start new
                </Button>
              }
            >
              {saved.invoiceNo} is saved (document {saved.documentId}), but its {uploadsFile ? 'file' : 'PDF'} is not uploaded yet. Press{' '}
              {retryWord} - the document will not be saved a second time.
            </InlineAlert>
          ) : null}

          {inventoryDetails && !saved ? (
            // Not a problem - a notice, in the brand's colour (InlineAlert is for what went wrong).
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand-soft px-2.5 py-2 text-xs text-brand" role="status" data-testid="inventory-details-notice">
              <Boxes className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                {inventoryDetails.documentNo} is saved - see its products&apos; stock.{purchaseNote ? ` ${purchaseNote}` : ''}
              </span>
              <Button type="button" size="sm" onClick={() => setInventoryOpen(true)}>
                Inventory Details
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Dismiss inventory details"
                onClick={() => {
                  setInventoryDetails(null)
                  procurement.reset()
                }}
              >
                Dismiss
              </Button>
            </div>
          ) : null}
          {step.key === INVOICE_STEP.SELLER ? (
            <>
              <DocumentTypeCard {...stepProps} documentTypes={documentTypes} locked={Boolean(saved) || Boolean(editing)} prefill={prefill} orderSource={orders} />
              <SellerDetails {...stepProps} ledgers={ledgers} countries={countries} onSettingChange={changeSetting} />
            </>
          ) : null}
          {step.key === INVOICE_STEP.BUYER ? <BuyerDetails {...stepProps} ledgers={ledgers} countries={countries} /> : null}
          {step.key === INVOICE_STEP.DOCUMENT && orders.source ? (
            <OrderProducts orders={orders} partyLabel={parties.ledger === 'buyer' ? 'buyer' : 'supplier'} disabled={locked} />
          ) : null}
          {step.key === INVOICE_STEP.DOCUMENT ? (
            <DocumentStep {...stepProps} banks={banks} numbering={numbering} numberLocked={Boolean(saved) || Boolean(editing)} />
          ) : null}
          {step.key === INVOICE_STEP.PRODUCTS ? (
            <ProductsStep
              {...stepProps}
              products={products}
              ledgers={ledgers}
              figures={figures}
              mappings={mappings}
              gstLedgers={gstLedgers}
              gstCheck={gstCheck}
              buyerProducts={buyerProducts}
              orders={orders}
              partyLabel={parties.ledger === 'buyer' ? 'buyer' : 'supplier'}
              showMapping={chargesGst}
              mappingType={mappingType}
              chargeSac={
                chargeSacRule
                  ? {
                      erp,
                      companyId,
                      // The SAC is on the ledger now: the list is read again, and the charge's error goes.
                      onSaved: async (chargeId) => {
                        await ledgers.retry()
                        setErrors((previous) =>
                          Object.fromEntries(Object.entries(previous).filter(([key]) => key !== `charges.${chargeId}.ledgerId`)),
                        )
                      },
                    }
                  : null
              }
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
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" icon={ArrowLeft} disabled={stepIndex === 0 || busy} onClick={() => goTo(stepIndex - 1)}>
                Previous
              </Button>
              {/* Leaves the document being edited, unsaved, for a new one. */}
              {editing && !saved ? (
                <Button type="button" variant="outline" icon={X} disabled={busy} onClick={startNew}>
                  Cancel Edit
                </Button>
              ) : null}
            </div>

            {lastStep || saved ? (
              <Button type="button" variant="secondary" icon={saved ? RefreshCw : Save} loading={busy} disabled={Boolean(pendingEdit)} onClick={onSaveClick}>
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
          {uploadsFile ? (
            // No PDF from the form for this type: the user's own document, chosen here and uploaded on save.
            <DocumentFileUpload file={documentFile} onChange={setDocumentFile} disabled={busy} />
          ) : (
            <InvoicePreview
              model={model}
              onLayout={keepLayout}
              onDownload={download}
              downloading={phase === 'download'}
              disabled={busy && phase !== 'download'}
            />
          )}
        </aside>
      </div>

      {/* ---------------- Save Challan: which copies to print ---------------- */}
      <Modal
        open={copyDialog.open}
        onOpenChange={(open) => setCopyDialog((previous) => ({ ...previous, open }))}
        title={saveWord}
        description="The challan is saved once; each copy ticked is printed in its PDF under its own heading."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCopyDialog((previous) => ({ ...previous, open: false }))}>
              Cancel
            </Button>
            <Button
              type="button"
              icon={Save}
              disabled={copyDialog.copies.length === 0}
              onClick={() => {
                const copies = ALL_COPIES.filter((value) => copyDialog.copies.includes(value))
                setCopyDialog((previous) => ({ ...previous, open: false }))
                save(copies)
              }}
            >
              {saveWord}
            </Button>
          </div>
        }
      >
        <div className="space-y-2.5" role="group" aria-label="Challan copies">
          {CHALLAN_COPIES.map((copy) => (
            <CheckboxField
              key={copy.value}
              id={`challan-copy-${copy.value}`}
              label={copy.label}
              checked={copyDialog.copies.includes(copy.value)}
              onCheckedChange={(checked) =>
                setCopyDialog((previous) => ({
                  ...previous,
                  copies: checked ? [...new Set([...previous.copies, copy.value])] : previous.copies.filter((value) => value !== copy.value),
                }))
              }
            />
          ))}
          {copyDialog.copies.length === 0 ? <p className="text-xs text-destructive">Choose at least one copy.</p> : null}
        </div>
      </Modal>

      {shareOffer ? <ShareInvoiceModal offer={shareOffer} onClose={() => setShareOffer(null)} /> : null}

      {/* A new Challan's stock, taken out before it is saved - mounted only while the save waits for it. */}
      {challanStockAsk ? (
        <ChallanStockModal
          rows={challanStockAsk.rows}
          companyName={company.comp_name}
          documentNo={challanStockAsk.documentNo}
          onDone={() => settleChallanStock(true)}
          onClose={() => settleChallanStock(false)}
        />
      ) : null}
      {/* A saved purchase's stock, line by line - mounted only while a save waits for it. */}
      {stockAsk ? (
        <StockBookingModal
          items={stockAsk.items}
          documentId={stockAsk.documentId}
          documentNo={stockAsk.documentNo}
          onDone={() => {
            const resolve = stockAnswer.current
            stockAnswer.current = null
            setStockAsk(null)
            resolve?.('booked')
          }}
        />
      ) : null}
      {/* A new Sales Order's stock - mounted afresh each time a save asks, so nothing typed for one reaches another. */}
      {bookingAsk ? (
        <InventoryBookingModal
          open
          lines={applicable.lines}
          productsByKey={products.byKey}
          companyId={companyId}
          documentNo={bookingAsk.documentNo}
          initialBooked={bookingAsk.initialBooked}
          onConfirm={(items, booked) => settleBooking({ items, booked })}
          onClose={() => settleBooking(null)}
        />
      ) : null}
      <InventoryDetailsModal
        stock={inventoryOpen ? inventoryDetails?.stock : null}
        documentNo={inventoryDetails?.documentNo}
        procurement={purchasing ? procurement : null}
        onClose={() => setInventoryOpen(false)}
      />

      {/* Mounted only while a feature is being authenticated - its username and password go with it. */}
      {portalAuth ? (
        <PortalAuthModal key={portalAuth} setting={portalAuth} companyId={companyId} onAuthenticated={portalAuthenticated} onClose={() => setPortalAuth(null)} />
      ) : null}
    </div>
  )
}
