/**
 * A SALES ORDER'S PURCHASING, ON A SCREEN - the workflow of procurement.js
 * with its requests made:
 *
 *   const procurement = useProcurement({ companyId })
 *
 *   procurement.state, .machine     where the workflow is (PROCUREMENT_STATE)
 *   procurement.actions             which buttons work (procurementActions)
 *   procurement.tree, .lines, .parts, .problems
 *                                   the requirements, what is to be bought (with
 *                                   its vendors), each vendor's part, what is wrong
 *   procurement.vendorStep          whether raw materials are ticked - they get
 *                                   their vendors on a step of their own
 *
 * The workspace tells it what happened to the order - orderSaved(order),
 * openBooking(), bookingClosed(), bookingConfirmed(booked), bookingSkipped(),
 * stockArrived(documentId, stock) - and each only dispatches, so a call made
 * from inside a save that started renders ago still lands on the current
 * state. The requirements are asked for once Request for Quotation is
 * pressed (an effect, keyed by the machine's `attempt`, whose late answers
 * are dropped) - and only once: pressed again, the answer already there is used.
 *
 * Each vendor's request is sent on its own (download(vendorKey)), one at a
 * time - a press while one is on its way does nothing. Once the server accepts
 * it, the vendor's Word file ("<vendor>_Request_Quotation.docx" - its products
 * and the quantities entered) is saved; refused, no file.
 */

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { toast } from '@/Library/toast'
import { downloadQuotationDocx } from '@/Modules/SalesInvoice/Document/quotationDocx'
import {
  EMPTY_CHOICES,
  PROCUREMENT_EVENT as EVENT,
  PROCUREMENT_STATE as STATE,
  allocate,
  allocationsAreValid,
  buildQuotationBody,
  buildQuotationDocument,
  buildRequirementBody,
  checkAllocations,
  checkSelection,
  hasQuotation,
  hasVendorStep,
  initialProcurement,
  methodsAreValid,
  procurementActions,
  procurementReducer,
  purchaseLines,
  readRequirement,
  requirementProductsOf,
  resolveVendors,
  selectionIsValid,
  setDirect,
  togglePick,
  toggleVendor,
  vendorParts,
  withDefaultAllocations,
} from '@/Modules/SalesInvoice/procurement'
import { getOrderRequirement, requestQuotation } from '@/Services/procurementService'

const NONE = []

export default function useProcurement({ companyId }) {
  const [machine, dispatch] = useReducer(procurementReducer, initialProcurement)
  const { state, order, stock, error, attempt, requirement: tree } = machine

  /* ---- the requirements: asked for once Request for Quotation is pressed ---- */
  const calculating = state === STATE.REQUIREMENTS_LOADING && Boolean(stock) && !error
  useEffect(() => {
    if (!calculating) return undefined
    let current = true
    const { products } = requirementProductsOf(stock)
    // Nothing short of stock - nothing to ask (the server refuses an empty list).
    const asked = products.length === 0 ? Promise.resolve({}) : getOrderRequirement(buildRequirementBody({ companyName: order.companyName, documentNo: order.documentNo, products }))
    asked
      .then((reply) => current && dispatch({ type: EVENT.REQUIREMENTS_LOADED, attempt, requirement: readRequirement(reply) }))
      .catch((failure) => current && dispatch({ type: EVENT.REQUIREMENTS_FAILED, attempt, message: failure.message }))
    return () => {
      current = false
    }
  }, [calculating, attempt, stock, order])

  /* ---- the choices - apart from the machine; a new calculation starts them afresh ---- */
  const [choices, setChoices] = useState(EMPTY_CHOICES)
  const [choicesFor, setChoicesFor] = useState(tree)
  if (choicesFor !== tree) {
    setChoicesFor(tree)
    setChoices(EMPTY_CHOICES)
  }

  /* ---- what is to be bought, and what is wrong ---- */
  const vendorsByNode = useMemo(() => new Map(tree ? Object.values(tree.byId).map((node) => [node.id, resolveVendors(node)]) : []), [tree])
  const vendorsOf = (node) => vendorsByNode.get(node.id) ?? NONE
  const lines = useMemo(() => (tree ? purchaseLines(tree, choices, (node) => vendorsByNode.get(node.id) ?? NONE) : []), [tree, choices, vendorsByNode])
  const parts = useMemo(() => vendorParts(lines), [lines])
  const selectionProblems = useMemo(() => checkSelection(lines), [lines])
  const allocationProblems = useMemo(() => checkAllocations(lines, choices), [lines, choices])

  const vendorStep = hasVendorStep(lines)
  const actions = procurementActions(machine, {
    methodsValid: methodsAreValid(selectionProblems, lines),
    selectionValid: selectionIsValid(selectionProblems),
    allocationsValid: allocationsAreValid(allocationProblems),
  })

  /** One vendor's request, as it would be sent now. */
  const requestFor = (vendorKey) => (order ? buildQuotationBody({ order, companyId, lines, choices, vendorKey }) : null)

  /* ---- a vendor's request for quotation - one at a time, however often pressed ---- */
  const sending = useRef(false)
  // `document` - the vendor's Word file, saved only once the request is accepted.
  const send = (submission, document) => {
    sending.current = true
    dispatch({ type: EVENT.SUBMIT, submission })
    requestQuotation(submission.body)
      .then((reply) => {
        const message = reply?.msg || 'The request for quotation was sent.'
        toast.success(message)
        dispatch({ type: EVENT.SUBMIT_SUCCEEDED, message })
        try {
          downloadQuotationDocx(document)
        } catch {
          toast.error('The request was sent, but its Word file could not be made. Press Download to try again.')
        }
      })
      .catch((failure) => {
        toast.error(failure.message || 'The request for quotation could not be sent.')
        // No answer at all (status null) - it may have reached the server.
        dispatch({ type: EVENT.SUBMIT_FAILED, message: failure.message, ambiguous: failure.status === null })
      })
      .finally(() => {
        sending.current = false
      })
  }

  return {
    machine,
    state,
    order,
    tree,
    choices,
    lines,
    parts,
    actions,
    vendorStep,
    vendorsOf,
    problems: { selection: selectionProblems, allocations: allocationProblems },
    /** Whether a vendor has anything to be asked for - a quantity above 0. */
    hasRequestFor: (vendorKey) => hasQuotation(requestFor(vendorKey)),

    // What happened to the order - each only dispatches.
    orderSaved: (savedOrder) => dispatch({ type: EVENT.ORDER_SAVED, order: savedOrder }),
    openBooking: () => dispatch({ type: EVENT.OPEN_BOOKING }),
    bookingClosed: () => dispatch({ type: EVENT.BOOKING_CLOSED }),
    bookingConfirmed: (booked) => dispatch({ type: EVENT.BOOKING_CONFIRMED, booked }),
    bookingSkipped: () => dispatch({ type: EVENT.BOOKING_SKIPPED }),
    stockArrived: (documentId, orderStock) => dispatch({ type: EVENT.STOCK_READY, documentId, stock: orderStock }),
    reset: () => dispatch({ type: EVENT.RESET }),

    // What the user does.
    editBooking: () => actions.editBooking && dispatch({ type: EVENT.EDIT_BOOKING }),
    loadRequirements: () => dispatch({ type: EVENT.LOAD_REQUIREMENTS }),
    setDirect: (nodeId, on) => setChoices((current) => setDirect(current, tree, nodeId, on, vendorsOf)),
    togglePick: (nodeId) => setChoices((current) => togglePick(current, tree, nodeId)),
    toggleVendor: (requirement, key) => setChoices((current) => toggleVendor(current, requirement, key)),
    allocate: (requirement, key, text) => setChoices((current) => allocate(current, requirement, key, text)),
    continueOn: () => {
      if (!actions.continue) return
      // Into the review: a product with no quantities yet is asked of its first vendor for all of it.
      if (state === STATE.VENDOR_SELECTION || !vendorStep) setChoices((current) => withDefaultAllocations(current, lines))
      dispatch({ type: EVENT.CONTINUE, valid: true, vendorStep })
    },
    back: () => actions.back && !sending.current && dispatch({ type: EVENT.BACK, vendorStep }),
    download: (vendorKey) => {
      if (!actions.download || sending.current) return
      const body = requestFor(vendorKey)
      // The file from the same lines and quantities as the request.
      if (hasQuotation(body)) send({ vendorKey, body }, buildQuotationDocument({ order, lines, choices, vendorKey }))
    },
  }
}
