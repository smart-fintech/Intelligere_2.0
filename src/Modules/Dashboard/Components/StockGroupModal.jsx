/**
 * Group creation, from the header's Add dropdown - one modal, two ERPs:
 *
 *   Tally         "Add Stock Group Creation" - Company, Stock Group Name,
 *                 Under - over the WebSocket (below)
 *   Intelligere   "Add Product Group Creation" - Company and Group Name -
 *                 POST inventory/product_group_list/
 *                 { company_name, group_name } (createProductGroup), which
 *                 answers { msg: "Product group created" }; a name already
 *                 in the list is refused before it is sent
 *
 * THE TALLY ONE:
 *
 * Three fields: the company it is for (shown, not chosen), the name of the
 * new stock group, and the existing group it sits under. Submit sends it to
 * Tally over the app's shared WebSocket as `product_group_create`
 * (buildTallyStockGroupCreateMessage).
 *
 * The same pattern as Add Ledger Group, step for step: the one shared
 * socket, sent and then waited on until `action_status` is "stop_loader",
 * with `status` deciding the kind of toast that carries the reply's own
 * `msg`. Success is only ever said once Tally has said it.
 *
 * The "Under" list is the company's product groups (useProductGroups - the
 * same list, and the same request, the Product form's Group dropdown uses),
 * asked for only while this modal is open. After Tally confirms, every screen
 * holding that list reads it again (refreshProductGroups), so the new group
 * is offered there as well.
 *
 * Props:
 *   open, onOpenChange  the usual controlled-modal pair
 *   companyName         the active company, which is how Tally knows it
 *   isTally             Tally (the WebSocket) or Intelligere (the API)
 */

import { useEffect, useRef, useState } from 'react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { Field, SelectField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import useProductGroups, { refreshProductGroups } from '@/Hooks/useProductGroups'
import { useWebSocket } from '@/Hooks/useWebSocket'
import { toast } from '@/Library/toast'
import {
  TALLY_STOCK_GROUP_CREATE_MODULE,
  buildTallyStockGroupCreateMessage,
  createProductGroup,
} from '@/Services/productService'

/** Safety net: the longest Submit waits for Tally's stop_loader - as for a ledger group. */
const TALLY_SAVE_TIMEOUT_MS = 2 * 60 * 1000

/** A long list gets a search box; a short one does not need it. */
const SEARCHABLE_FROM = 8

export default function StockGroupModal({ open, onOpenChange, companyName, isTally = true }) {
  const [name, setName] = useState('')
  const [under, setUnder] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Whether a save of THIS modal's is in flight, where the socket callback
  // can read it.
  const savingRef = useRef(false)
  const timerRef = useRef(null)

  // The "Under" choices - only fetched while the modal is open.
  const groups = useProductGroups(open)
  const loadingGroups = groups.status === 'loading' && groups.options.length === 0

  /** Back to ready, with no timer left running. */
  const finish = () => {
    savingRef.current = false
    clearTimeout(timerRef.current)
    timerRef.current = null
    setSaving(false)
  }

  /** Empty again, so the next opening does not start on old text. */
  const reset = () => {
    setName('')
    setUnder('')
    setErrors({})
  }

  /* The app's shared WebSocket - no second connection. Only this modal's own
     product_group_create reply counts. */
  const { send } = useWebSocket({
    module: TALLY_STOCK_GROUP_CREATE_MODULE,
    onMessage: (data) => {
      const reply = data?.res
      if (!reply || reply.return_module_name !== TALLY_STOCK_GROUP_CREATE_MODULE) return

      // Not a save this modal started, or one already finished.
      if (!savingRef.current) return

      // Tally can send progress first; only stop_loader ends the wait.
      if (reply.action_status !== 'stop_loader') return

      // Stopped before `status` is read, so no branch below can leave the
      // button spinning.
      finish()

      if (reply.status === 'error') {
        // What was typed stays, so it can be fixed and sent again.
        toast.error(reply.msg || 'Tally could not create the stock group.')
        return
      }

      toast.success(reply.msg || 'Stock group created successfully.')

      refreshProductGroups()
      reset()
      onOpenChange?.(false)
    },
  })

  // Nothing of a save may outlive the modal.
  useEffect(
    () => () => {
      savingRef.current = false
      clearTimeout(timerRef.current)
    },
    [],
  )

  const validate = () => {
    const found = {}
    const trimmed = name.trim()

    if (!trimmed) found.name = isTally ? 'Stock group name is required' : 'Group name is required'
    else if (!isTally && groups.options.some((option) => option.value.toLowerCase() === trimmed.toLowerCase())) {
      found.name = 'This group already exists'
    }

    // Only Tally places a group under another.
    if (isTally && !under) found.under = 'Please select the group it comes under'
    return found
  }

  /** Intelligere: one request, answered there and then. */
  const saveByApi = async () => {
    savingRef.current = true
    setSaving(true)

    try {
      const response = await createProductGroup(companyName, name.trim())
      finish()
      toast.success(response?.msg || 'Product group created')
      refreshProductGroups()
      reset()
      onOpenChange?.(false)
    } catch (failure) {
      // `failure.message` is the backend's own `msg` (see authService);
      // what was typed stays, to send again.
      finish()
      toast.error(failure.message || 'The group could not be created.')
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (savingRef.current) return

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    if (!companyName?.trim()) {
      toast.error('Select a company before adding a group.')
      return
    }

    if (!isTally) {
      await saveByApi()
      return
    }

    savingRef.current = true
    setSaving(true)

    const delivered = await send(buildTallyStockGroupCreateMessage({ companyName, name, under }))

    // Already answered, or the modal has gone away.
    if (!savingRef.current) return

    if (!delivered) {
      console.error('[Stock Group] WebSocket error:', `${TALLY_STOCK_GROUP_CREATE_MODULE} could not be sent`)
      finish()
      toast.error('Could not reach the live server. Please try again.')
      return
    }

    timerRef.current = setTimeout(() => {
      if (!savingRef.current) return
      finish()
      toast.error('Tally did not finish creating the stock group in time. Please try again.')
    }, TALLY_SAVE_TIMEOUT_MS)
  }

  /** Closing mid-save would leave the reply with nowhere to go. */
  const handleOpenChange = (next) => {
    if (!next && savingRef.current) return
    if (!next) reset()
    onOpenChange?.(next)
  }

  const underPlaceholder = loadingGroups
    ? 'Loading...'
    : groups.options.length === 0
      ? 'No stock groups found'
      : 'Select stock group'

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title={isTally ? 'Add Stock Group Creation' : 'Add Product Group Creation'}
      size="md"
      closeOnBackdropClick={!saving}
      closeOnEsc={!saving}
      // The first field is the company, read-only: nothing to focus there.
      autoFocus={false}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <Field
          id="stock_group_company"
          label="Company Name"
          required
          readOnly
          value={companyName || 'No company selected'}
        />

        <Field
          id="stock_group_name"
          label={isTally ? 'Stock Group Name' : 'Group Name'}
          required
          autoComplete="off"
          placeholder={isTally ? 'New stock group' : 'New product group'}
          value={name}
          error={errors.name}
          disabled={saving}
          onChange={(event) => {
            setName(event.target.value)
            setErrors((previous) => ({ ...previous, name: undefined }))
          }}
        />

        {/* Nothing retries on its own; Retry is the only way. (Intelligere has
            no Under: the list there only guards against a repeated name.) */}
        {isTally && groups.status === 'failed' && groups.options.length === 0 ? (
          <InlineAlert action={<RetryButton onClick={groups.reload} />}>
            Stock groups could not be loaded. {groups.error}
          </InlineAlert>
        ) : null}

        {isTally ? (
          <SelectField
            id="stock_group_under"
            label="Under"
            required
            placeholder={underPlaceholder}
            options={groups.options}
            value={under}
            error={errors.under}
            disabled={saving || groups.options.length === 0}
            searchable={groups.options.length >= SEARCHABLE_FROM}
            searchPlaceholder="Search stock group..."
            onValueChange={(value) => {
              setUnder(value)
              setErrors((previous) => ({ ...previous, under: undefined }))
            }}
          />
        ) : null}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={saving} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>

          <Button type="submit" loading={saving} disabled={!companyName}>
            {saving ? 'Saving...' : 'Submit'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
