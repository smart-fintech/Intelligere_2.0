/**
 * The Product Form card, on the left of the simple Product page - laid out
 * and behaving like the Ledger Form on the Ledger Details page.
 *
 * ------------------------------------------------------------------
 * ONE FORM, TWO MODES
 * ------------------------------------------------------------------
 * There is no separate edit screen. `product` decides which mode this is:
 *
 *   product = null    ADD    clean fields
 *   product = {...}   EDIT   its values (a product of the list, as
 *                            toBasicProduct gives it)
 *
 * The fields start filled in from `product` as the component mounts. The
 * page gives this component a `key` that changes with the row being edited,
 * and after every save, so React remounts it and the initialiser runs again
 * - which is what keeps the form free of "copy the row into state" effects.
 *
 * ------------------------------------------------------------------
 * ONE FORM, TWO ERPs - WHICH SHARE NOTHING BUT THE FRAME
 * ------------------------------------------------------------------
 * `erp` picks the field list (BASIC_PRODUCT_FIELDS in productService), and
 * with it everything else: the form holds its values under THAT ERP's own
 * payload keys, so what is sent is the form with nothing renamed.
 *
 *   Intelligere   saved over HTTP: POST to add, PUT with the product's `id`
 *                 to change. The backend can decline an add because the
 *                 product already exists - that is said as a warning and
 *                 the form keeps what was typed. Has an optional Vendor.
 *
 *   Tally         saved over the app's shared WebSocket, exactly as the
 *                 Ledger form saves a ledger: the message is sent, and the
 *                 reply that comes back under the same module name with
 *                 action_status "stop_loader" ends it. An edit carries the
 *                 product's `stockitem_guid`. No Vendor - Tally's product
 *                 message has no place for one.
 *
 * ------------------------------------------------------------------
 * THE DROPDOWNS
 * ------------------------------------------------------------------
 *   Group      the company's product groups. A new one is added from the
 *              header's Add menu (StockGroupModal) - it reloads this list
 *              when it is done (refreshProductGroups)
 *   Unit       the units the backend lists
 *   HSN        the HSN list, searched by code or description, each code's
 *              description on hover (HsnSelector) - or a code typed in
 *   GST Rate   the GST slabs, and under it what the chosen rate is made of:
 *              CGST + SGST for a sale within the state, IGST for one across
 *              states. Both are shown - which applies belongs to a sale,
 *              not to a product - and it is only a reading aid: what is
 *              sent is the rate itself.
 *
 * A product saved with a group, unit or rate that is no longer in its list
 * still shows what it holds.
 *
 * WHEN THE GROUPS OR THE UNITS CANNOT BE LOADED nothing is said about it:
 * no error line, no toast. The dropdown is simply empty - "No options", and
 * shut - and the rest of the form works as usual; neither field is
 * required, so the product can still be saved. (A new group can still be
 * added with the "+", which then becomes the dropdown's one option.)
 *
 * Props:
 *   erp           BASIC_PRODUCT_ERP.TALLY or .INTELLIGERE
 *   product       the row being edited, or null to add one
 *   companyName   the active company - shown read-only, never typed
 *   groups        useProductGroups()
 *   units         useProductUnits()
 *   vendors       useVendorOptions() - Intelligere only
 *   onSaved()     after a successful save; the page reloads the list and
 *                 goes back to an empty form
 *   onCancel()    leaves edit mode
 */

import { useEffect, useRef, useState } from 'react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { Field, FormActions, FormGrid, SelectField } from '@/Components/Common/FormFields'
import { HsnSelector } from '@/Components/Common/HsnSelector'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { GST_RATES, gstBreakdown } from '@/Constants/gst'
import { toOptions } from '@/Constants/inventory'
import { useWebSocket } from '@/Hooks/useWebSocket'
import { toast } from '@/Library/toast'
import {
  BASIC_PRODUCT_CHOICES,
  BASIC_PRODUCT_ERP,
  BASIC_PRODUCT_FIELDS,
  TALLY_PRODUCT_ALTER_MODULE,
  TALLY_PRODUCT_CREATE_MODULE,
  buildIntelligereProductPayload,
  buildTallyProductAlterMessage,
  buildTallyProductCreateMessage,
  createIntelligereProduct,
  isProductAlreadyExists,
  updateIntelligereProduct,
} from '@/Services/productService'

const GST_OPTIONS = toOptions(GST_RATES)

/** The choice that means "no vendor" - a dropdown cannot be emptied once set. */
const NO_VENDOR = '__none__'

/** A long list gets a search box; a short one does not need it. */
const SEARCHABLE_FROM = 8

/**
 * Safety net for a Tally save: the longest the form waits for Tally's
 * stop_loader. The reply normally ends the wait long before this.
 */
const TALLY_SAVE_TIMEOUT_MS = 2 * 60 * 1000

/** What a number box may hold while it is being typed: "", "12.", ".5" - never a minus. */
const NUMBER_IN_PROGRESS = /^\d*\.?\d*$/

/** A number as people type one, once they have finished. */
const NUMBER_PATTERN = /^(\d+\.?\d*|\.\d+)$/

/** A saved value as a form value - null becomes '', numbers become text. */
const textOf = (value) => (value === null || value === undefined ? '' : String(value))

/**
 * A dropdown's options plus the saved value when the list does not have it,
 * so a product saved with one this list does not offer still shows what it
 * holds.
 */
const withSaved = (options, saved) =>
  !saved || options.some((option) => option.value === saved)
    ? options
    : [...options, { value: saved, label: saved }]

const initialForm = (fields, product) =>
  Object.fromEntries(fields.map(({ key, from }) => [key, product ? textOf(product[from]).trim() : '']))

/** The vendor a product was saved with, as the dropdown's value - '' when it has none. */
const initialVendor = (product) => {
  const id = product?.vendors?.[0]?.id
  return id === null || id === undefined ? '' : String(id)
}

export default function BasicProductForm({ erp, product, companyName, groups, units, vendors, onSaved, onCancel }) {
  const editing = Boolean(product)
  const isTally = erp === BASIC_PRODUCT_ERP.TALLY
  const fields = BASIC_PRODUCT_FIELDS[erp]

  const [initial] = useState(() => ({ form: initialForm(fields, product), vendor: initialVendor(product) }))
  const [form, setForm] = useState(initial.form)
  const [vendor, setVendor] = useState(initial.vendor)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // One handler for every field; editing a field clears its error.
  const setField = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }))
    setErrors((previous) => ({ ...previous, [key]: undefined }))
  }

  const validate = () => {
    const found = {}

    fields.forEach(({ key, label, required, numeric }) => {
      const value = form[key].trim()

      if (!value) {
        if (required) found[key] = `${label} is required`
      } else if (numeric && !NUMBER_PATTERN.test(value)) {
        found[key] = 'Enter a valid number'
      }
    })

    return found
  }

  /* ---------------------------------------------------------------- */
  /* Tally: saving over the WebSocket                                 */
  /* ---------------------------------------------------------------- */

  // The Tally save in flight - the module its reply comes back under - or
  // null. A ref: the socket callback reads it.
  const tallySaveRef = useRef(null)
  const tallyTimerRef = useRef(null)

  const endTallySave = () => {
    tallySaveRef.current = null
    clearTimeout(tallyTimerRef.current)
    tallyTimerRef.current = null
    setSubmitting(false)
  }

  /**
   * The app's shared WebSocket - no new connection. Only the reply to this
   * form's own save counts, and only its stop_loader ends it.
   */
  const { send } = useWebSocket({
    onMessage: (data) => {
      const reply = data?.res
      const moduleName = tallySaveRef.current
      if (!reply || !moduleName || reply.return_module_name !== moduleName) return
      if (reply.action_status !== 'stop_loader') return

      endTallySave()

      if (reply.status === 'error') {
        toast.error(reply.msg || 'Tally could not save the product.')
        return
      }

      toast.success(reply.msg || (editing ? 'Product updated successfully.' : 'Product added successfully.'))
      onSaved?.()
    },
  })

  // Nothing of a Tally save may outlive the form.
  useEffect(
    () => () => {
      tallySaveRef.current = null
      clearTimeout(tallyTimerRef.current)
    },
    [],
  )

  /** Sends the Tally create / alter; the reply finishes it (see onMessage). */
  const saveToTally = async () => {
    // Tally finds the stock item by its own identifier, so an edit without
    // one cannot be sent - and is never sent under a made-up one.
    if (editing && !product.guid) {
      toast.error('This product has no Tally identifier, so it cannot be edited. Use Sync Now and try again.')
      return
    }

    const moduleName = editing ? TALLY_PRODUCT_ALTER_MODULE : TALLY_PRODUCT_CREATE_MODULE
    const message = editing
      ? buildTallyProductAlterMessage(companyName, form, product.guid)
      : buildTallyProductCreateMessage(companyName, form)

    tallySaveRef.current = moduleName
    setSubmitting(true)

    const delivered = await send(message)

    // Already answered, or the form has gone away.
    if (tallySaveRef.current !== moduleName) return

    if (!delivered) {
      console.error('[Product Tally] WebSocket error:', `${moduleName} could not be sent`)
      endTallySave()
      toast.error('Could not reach the live server. Please try again.')
      return
    }

    tallyTimerRef.current = setTimeout(() => {
      if (tallySaveRef.current !== moduleName) return
      endTallySave()
      toast.error('Tally did not finish saving the product in time. Please try again.')
    }, TALLY_SAVE_TIMEOUT_MS)
  }

  /* ---------------------------------------------------------------- */
  /* Intelligere: saving over HTTP                                    */
  /* ---------------------------------------------------------------- */

  const saveToIntelligere = async () => {
    // The backend finds the product by its id - never by its name.
    if (editing && (product.product_id === null || product.product_id === undefined)) {
      toast.error('This product has no identifier, so it cannot be edited. Refresh the list and try again.')
      return
    }

    /* The vendor. One the user has not touched goes back exactly as the
       product came with it - so an edit of the name never drops a vendor
       that is no longer in the list, or the others of a product saved with
       several. Only a change replaces it. */
    const chosen = vendors.options.find((option) => option.value === vendor)
    const vendorList =
      editing && vendor === initial.vendor ? product.vendors : chosen ? [{ id: chosen.id, name: chosen.label }] : []

    const payload = buildIntelligereProductPayload(companyName, form, vendorList)

    setSubmitting(true)

    try {
      const response = editing
        ? await updateIntelligereProduct(product.product_id, payload)
        : await createIntelligereProduct(payload)

      // Declined, not failed: nothing was created, so nothing is cleared or
      // reloaded - the user changes the name and tries again.
      if (isProductAlreadyExists(response)) {
        toast.warning(response.msg)
        return
      }

      toast.success(response?.msg || (editing ? 'Product updated successfully' : 'Product created successfully'))
      onSaved?.()
    } catch (failure) {
      // `failure.message` is the backend's own `msg` (see authService).
      toast.error(failure.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    // Enter in a box arrives here too, even while Save is off.
    if (submitting) return

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const unchanged = fields.every(({ key }) => form[key].trim() === initial.form[key]) && vendor === initial.vendor
    if (editing && unchanged) {
      toast.info('Nothing has been changed.')
      return
    }

    // Cannot normally happen - the button is disabled without one - but a
    // product with no owner is worth refusing out loud.
    if (!companyName) {
      toast.error('Select a company before saving a product.')
      return
    }

    if (isTally) saveToTally()
    else saveToIntelligere()
  }

  /* ---------------------------------------------------------------- */
  /* Drawing one field                                                */
  /* ---------------------------------------------------------------- */

  const renderField = ({ key, label, required, numeric, choices, gstRate, hsn }) => {
    const id = `basic-product-${key}`

    if (hsn) {
      return (
        <HsnSelector
          key={key}
          id={id}
          label={label}
          required={required}
          value={form[key]}
          error={errors[key]}
          disabled={submitting}
          onChange={(value) => setField(key, value)}
        />
      )
    }

    if (choices === BASIC_PRODUCT_CHOICES.GROUPS) {
      const loading = groups.status === 'loading' && groups.options.length === 0
      const options = withSaved(groups.options, form[key])

      return (
        <SelectField
          key={key}
          id={id}
          label={label}
          required={required}
          // A list that could not be loaded is simply an empty one - see
          // "The dropdowns" at the top.
          placeholder={loading ? 'Loading...' : options.length === 0 ? 'No options' : 'Select'}
          options={options}
          value={form[key]}
          error={errors[key]}
          disabled={submitting || loading || options.length === 0}
          searchable={groups.options.length >= SEARCHABLE_FROM}
          searchPlaceholder="Search group..."
          onValueChange={(value) => setField(key, value)}
        />
      )
    }

    if (choices === BASIC_PRODUCT_CHOICES.UNITS) {
      const loading = units.status === 'loading'
      const options = withSaved(units.options, form[key])

      return (
        <SelectField
          key={key}
          id={id}
          label={label}
          required={required}
          placeholder={loading ? 'Loading...' : options.length === 0 ? 'No options' : 'Select'}
          options={options}
          value={form[key]}
          error={errors[key]}
          disabled={submitting || loading || options.length === 0}
          searchable={units.options.length >= SEARCHABLE_FROM}
          searchPlaceholder="Search unit..."
          onValueChange={(value) => setField(key, value)}
        />
      )
    }

    if (gstRate) {
      const tax = gstBreakdown(form[key])

      return (
        <div key={key} className="space-y-1">
          <SelectField
            id={id}
            label={label}
            required={required}
            placeholder="Select"
            options={withSaved(GST_OPTIONS, form[key])}
            value={form[key]}
            error={errors[key]}
            disabled={submitting}
            onValueChange={(value) => setField(key, value)}
          />
          {/* What the rate is made of - both readings, see the note at the top. */}
          {tax ? (
            <p className="text-xs leading-snug text-muted-foreground">
              CGST {tax.cgst}% + SGST {tax.sgst}%, or IGST {tax.igst}%
            </p>
          ) : null}
        </div>
      )
    }

    return (
      <Field
        key={key}
        id={id}
        label={label}
        required={required}
        inputMode={numeric ? 'decimal' : undefined}
        autoComplete="off"
        // The name is the one field worth the whole row.
        className={key === 'product_name' ? 'sm:col-span-2' : undefined}
        value={form[key]}
        error={errors[key]}
        disabled={submitting}
        onChange={(event) => {
          // A keystroke that would stop it being a number is not taken.
          if (!numeric || NUMBER_IN_PROGRESS.test(event.target.value)) setField(key, event.target.value)
        }}
      />
    )
  }

  const vendorChoices = [{ value: NO_VENDOR, label: 'No vendor' }, ...vendors.options]
  const loadingVendors = vendors.status === 'loading'

  return (
    <>
      <Panel title={editing ? 'Edit Product' : 'Product Form'}>
        {/* A product can still be saved without a vendor. */}
        {!isTally && vendors.status === 'failed' ? (
          <InlineAlert action={<RetryButton onClick={vendors.retry} />}>
            Vendors could not be loaded. {vendors.error}
          </InlineAlert>
        ) : null}

        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          {/* Read-only: the company comes from the header's picker, and this
              is here so the user can see what they are filing under. */}
          <Field
            id="basic-product-company"
            label="Selected Company"
            required
            readOnly
            value={companyName || 'No company selected'}
          />

          <FormGrid>
            {fields.map(renderField)}

            {/* Optional, and Intelligere's alone - see the note at the top. */}
            {isTally ? null : (
              <SelectField
                id="basic-product-vendor"
                label="Vendor"
                placeholder={
                  loadingVendors ? 'Loading...' : vendors.options.length === 0 ? 'No vendors found' : 'Select vendor'
                }
                options={vendorChoices}
                value={vendor}
                disabled={submitting || loadingVendors || vendors.options.length === 0}
                searchable={vendors.options.length >= SEARCHABLE_FROM}
                searchPlaceholder="Search vendor..."
                onValueChange={(value) => setVendor(value === NO_VENDOR ? '' : value)}
              />
            )}
          </FormGrid>

          {/* Cancel only exists while editing - there is nothing to go back
              to from an empty form. */}
          <FormActions>
            {editing ? (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
                Cancel
              </Button>
            ) : null}

            <Button type="submit" loading={submitting} disabled={!companyName}>
              {submitting ? 'Saving...' : editing ? 'Update Product' : 'Add Product'}
            </Button>
          </FormActions>
        </form>
      </Panel>
    </>
  )
}
