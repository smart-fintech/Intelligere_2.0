/**
 * The Sales Invoice form's state, and the one set of functions that change
 * it - so every card writes to the form the same way and none of them keeps
 * a copy of its own:
 *
 *   const invoice = useSalesInvoiceForm(company)
 *   const invoice = useSalesInvoiceForm(company, createPurchaseForm)   another
 *                               module's form (its own starting values)
 *
 *   invoice.form                the values (see createInvoiceForm)
 *   invoice.errors              { 'seller.email': 'Enter a valid email', ... }
 *   invoice.setErrors(found)
 *   invoice.setField('seller.name', value)     one field; clears its error
 *   invoice.setFields('buyer', { ...values })  several fields of one card
 *   invoice.setSameAs('dispatch', checked)     the two "Same as" boxes (unticked = card cleared)
 *
 *   products - one entry form, and the lines already added:
 *   invoice.updateEntry((entry) => next, fields)   the entry form
 *   invoice.commitEntry()       Add Product / Update: the entry becomes a line
 *                               (or replaces the line being edited), the form empties
 *   invoice.editLine(id)        loads an added line back into the entry form
 *   invoice.cancelEntry()       empties the entry form, ends an edit
 *   invoice.removeLine(id)
 *   invoice.setEntryMode('product' | 'service')   the Product / Service choice -
 *                               a new line is entered as that kind (an edit
 *                               in progress is ended, the entry form emptied)
 *
 *   invoice.addCharge() / updateCharge(id, changes) / removeCharge(id)
 *   invoice.applyDocumentDefaults(reply)   invoice/last-document-number/'s answer -
 *                               only into fields the user has not touched yet
 *   invoice.reset()             a new, empty invoice for the same company
 *   invoice.load(form)          a whole form in place of this one (History's
 *                               Edit) - every field counts as the user's, so no
 *                               server default (document number, With
 *                               Discount) is laid over it
 *
 * The form starts from the company it is given, once. The page mounts it
 * afresh (a `key`) when the company changes, so no effect copies a company in.
 */

import { useCallback, useRef, useState } from 'react'

import {
  LINE_KIND,
  commitEntryToLines,
  createInvoiceForm,
  documentProfile,
  emptyAddress,
  entryModeOf,
  newChargeRow,
  newInvoiceLine,
  isEntryDirty,
  isServiceLine,
  withDocumentDefaults,
} from '@/Modules/SalesInvoice/salesInvoiceForm'

/** Every error key that starts with `prefix` - a removed row's errors go with it. */
const withoutErrorsOf = (errors, prefix) =>
  Object.fromEntries(Object.entries(errors).filter(([key]) => !key.startsWith(prefix)))

export default function useSalesInvoiceForm(company, createForm = createInvoiceForm) {
  const [form, setForm] = useState(() => createForm(company))
  const [errors, setErrors] = useState({})

  // The fields the user has changed by hand - an answer from the server that
  // arrives later never overwrites one of them.
  const touched = useRef(new Set())

  const clearErrors = useCallback((keys) => {
    setErrors((previous) => {
      if (!keys.some((key) => previous[key])) return previous
      const next = { ...previous }
      keys.forEach((key) => delete next[key])
      return next
    })
  }, [])

  /** 'note' sets form.note; 'seller.name' sets form.seller.name. */
  const setField = useCallback(
    (path, value) => {
      const [section, field] = path.split('.')
      touched.current.add(path)
      setForm((previous) => {
        const next = field
          ? { ...previous, [section]: { ...previous[section], [field]: value } }
          : { ...previous, [section]: value }
        // Reverse Charge Applicable forces Service: the entry form becomes a
        // service one (a product half typed in cannot stay). Unticked, the
        // Product / Service choice is back as it was - Product unless Service
        // was picked - except that a service half typed in is kept, with the
        // choice on Service. A line being edited is left alone either way.
        // Another document type: the entry form follows what that type enters
        // a line as (entryModeOf) - a type with no services (Challan) or no
        // Reverse Charge box takes the entry back to the choice. A service
        // half typed in is kept, with the choice on Service, where services
        // are taken.
        if (path === 'documentType' && !next.editingLineId) {
          const mode = entryModeOf(next)
          if (next.entry.kind !== mode) {
            const keepService = documentProfile(next).services && isServiceLine(next.entry) && isEntryDirty(next.entry)
            return keepService ? { ...next, entryMode: LINE_KIND.SERVICE } : { ...next, entry: newInvoiceLine(mode) }
          }
        }
        if (path === 'settings.reverseCharge' && !next.editingLineId) {
          if (value) {
            if (!isServiceLine(next.entry)) return { ...next, entry: newInvoiceLine(LINE_KIND.SERVICE) }
          } else if (isServiceLine(next.entry) && isEntryDirty(next.entry)) {
            return { ...next, entryMode: LINE_KIND.SERVICE }
          } else if (next.entry.kind !== next.entryMode) {
            return { ...next, entry: newInvoiceLine(next.entryMode) }
          }
        }
        return next
      })
      clearErrors([path])
    },
    [clearErrors],
  )

  const setFields = useCallback(
    (section, values) => {
      Object.keys(values).forEach((field) => touched.current.add(`${section}.${field}`))
      setForm((previous) => ({ ...previous, [section]: { ...previous[section], ...values } }))
      clearErrors(Object.keys(values).map((field) => `${section}.${field}`))
    },
    [clearErrors],
  )

  /**
   * "Same as Seller Details" (card 'dispatch') / "Same as Buyer Details"
   * (card 'shipping'). Ticked, the card shows its source, live and locked
   * (effectiveDispatch / effectiveShipping). Unticked, the card is emptied
   * and unlocked: nothing copied or typed before is kept. Only that card's
   * fields change - never the seller, the buyer or anything else.
   */
  const setSameAs = useCallback((card, checked) => {
    const flag = card === 'dispatch' ? 'dispatchSameAsSeller' : 'shippingSameAsBuyer'

    setForm((previous) => ({ ...previous, [flag]: checked, [card]: emptyAddress() }))
    setErrors((previous) => withoutErrorsOf(previous, `${card}.`))
  }, [])

  /* ---- products: the entry form and the added lines ---- */

  const updateEntry = useCallback(
    (change, fields = []) => {
      setForm((previous) => ({ ...previous, entry: change(previous.entry) }))
      clearErrors(fields.map((field) => `entry.${field}`))
    },
    [clearErrors],
  )

  /** Add Product / Update - see commitEntryToLines. */
  const commitEntry = useCallback(() => {
    setForm(commitEntryToLines)
    setErrors((previous) => {
      const next = withoutErrorsOf(previous, 'entry.')
      delete next.lines
      return next
    })
  }, [])

  const editLine = useCallback((id) => {
    setForm((previous) => {
      const line = previous.lines.find((current) => current.id === id)
      return line ? { ...previous, entry: { ...line }, editingLineId: id } : previous
    })
    setErrors((previous) => withoutErrorsOf(previous, 'entry.'))
  }, [])

  const cancelEntry = useCallback(() => {
    setForm((previous) => ({ ...previous, entry: newInvoiceLine(entryModeOf(previous)), editingLineId: null }))
    setErrors((previous) => withoutErrorsOf(previous, 'entry.'))
  }, [])

  /** Product / Service - a new line is entered as that kind; the entry form starts empty. */
  const setEntryMode = useCallback((mode) => {
    if (mode !== LINE_KIND.PRODUCT && mode !== LINE_KIND.SERVICE) return
    setForm((previous) => {
      const next = { ...previous, entryMode: mode }
      const kind = entryModeOf(next)
      if (previous.entryMode === mode && previous.entry.kind === kind) return previous
      return { ...next, entry: newInvoiceLine(kind), editingLineId: null }
    })
    setErrors((previous) => withoutErrorsOf(previous, 'entry.'))
  }, [])

  const removeLine = useCallback((id) => {
    setForm((previous) => ({
      ...previous,
      lines: previous.lines.filter((line) => line.id !== id),
      // Removing the line being edited ends the edit, so Update cannot re-add it.
      ...(previous.editingLineId === id ? { entry: newInvoiceLine(entryModeOf(previous)), editingLineId: null } : null),
    }))
    setErrors((previous) => withoutErrorsOf(previous, `lines.${id}.`))
  }, [])

  /* ---- other charges ---- */

  const addCharge = useCallback(() => {
    setForm((previous) => ({ ...previous, charges: [...previous.charges, newChargeRow()] }))
  }, [])

  const updateCharge = useCallback(
    (id, changes) => {
      setForm((previous) => ({
        ...previous,
        charges: previous.charges.map((charge) => (charge.id === id ? { ...charge, ...changes } : charge)),
      }))
      clearErrors(Object.keys(changes).map((field) => `charges.${id}.${field}`))
    },
    [clearErrors],
  )

  const removeCharge = useCallback((id) => {
    setForm((previous) => ({ ...previous, charges: previous.charges.filter((charge) => charge.id !== id) }))
    setErrors((previous) => withoutErrorsOf(previous, `charges.${id}.`))
  }, [])

  /* ---- defaults from the server ---- */

  /** invoice/last-document-number/'s answer - only into fields the user has not touched (withDocumentDefaults). */
  const applyDocumentDefaults = useCallback((reply) => {
    setForm((previous) => withDocumentDefaults(previous, reply, touched.current))
  }, [])

  const load = useCallback((next) => {
    touched.current = new Set(['document.autoIncrement', 'document.invoiceNoParts', 'withDiscount'])
    setForm({ ...next, entry: newInvoiceLine(entryModeOf(next)), editingLineId: null })
    setErrors({})
  }, [])

  const reset = useCallback(() => {
    touched.current = new Set()
    setForm(createForm(company))
    setErrors({})
  }, [company, createForm])

  return {
    form,
    errors,
    setErrors,
    setField,
    setFields,
    setSameAs,
    updateEntry,
    commitEntry,
    editLine,
    cancelEntry,
    setEntryMode,
    removeLine,
    addCharge,
    updateCharge,
    removeCharge,
    applyDocumentDefaults,
    load,
    reset,
  }
}
