/**
 * The Sales Invoice form's state, and the one set of functions that change
 * it - so every card writes to the form the same way and none of them keeps
 * a copy of its own:
 *
 *   const invoice = useSalesInvoiceForm(company)
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
 *
 *   invoice.addCharge() / updateCharge(id, changes) / removeCharge(id)
 *   invoice.applyDocumentDefaults(reply)   invoice/last-document-number/'s answer -
 *                               only into fields the user has not touched yet
 *   invoice.reset()             a new, empty invoice for the same company
 *
 * The form starts from the company it is given, once. The page mounts it
 * afresh (a `key`) when the company changes, so no effect copies a company in.
 */

import { useCallback, useRef, useState } from 'react'

import {
  commitEntryToLines,
  createInvoiceForm,
  emptyAddress,
  newChargeRow,
  newInvoiceLine,
  withDocumentDefaults,
} from '@/Modules/SalesInvoice/salesInvoiceForm'

/** Every error key that starts with `prefix` - a removed row's errors go with it. */
const withoutErrorsOf = (errors, prefix) =>
  Object.fromEntries(Object.entries(errors).filter(([key]) => !key.startsWith(prefix)))

export default function useSalesInvoiceForm(company) {
  const [form, setForm] = useState(() => createInvoiceForm(company))
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
      setForm((previous) =>
        field ? { ...previous, [section]: { ...previous[section], [field]: value } } : { ...previous, [section]: value },
      )
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
    setForm((previous) => ({ ...previous, entry: newInvoiceLine(), editingLineId: null }))
    setErrors((previous) => withoutErrorsOf(previous, 'entry.'))
  }, [])

  const removeLine = useCallback((id) => {
    setForm((previous) => ({
      ...previous,
      lines: previous.lines.filter((line) => line.id !== id),
      // Removing the line being edited ends the edit, so Update cannot re-add it.
      ...(previous.editingLineId === id ? { entry: newInvoiceLine(), editingLineId: null } : null),
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

  const reset = useCallback(() => {
    touched.current = new Set()
    setForm(createInvoiceForm(company))
    setErrors({})
  }, [company])

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
    removeLine,
    addCharge,
    updateCharge,
    removeCharge,
    applyDocumentDefaults,
    reset,
  }
}
