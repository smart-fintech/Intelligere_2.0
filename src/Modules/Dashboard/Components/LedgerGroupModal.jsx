/**
 * "Add Ledger Group" - Tally only.
 *
 * Three fields: the company it is for (shown, not chosen), the name of the
 * new group, and the existing group it sits under. Submit sends it to Tally
 * over the app's shared WebSocket as `ledger_group_create`.
 *
 * ------------------------------------------------------------------
 * NOTHING NEW UNDER IT
 * ------------------------------------------------------------------
 * The socket is the one shared connection, used exactly as the Ledger Form's
 * Tally save uses it - sent, then waited on until `action_status` is
 * "stop_loader", with `status` deciding which kind of toast carries the
 * reply's own `msg`. The group list in the dropdown is the SAME list the
 * Ledger Form's "Select Ledger Group" reads, straight from the store, so a
 * group created here appears there as soon as `onCreated` has reloaded it.
 * The payload's shape belongs to ledgerService, not to this screen.
 *
 * Props:
 *   open, onOpenChange  the usual controlled-modal pair
 *   companyId           the active company - what the group is filed under
 *   companyName         the same company by name, which is how Tally knows it
 *   groups              the ledger groups from the store (the "Under" list)
 *   onCreated()         reloads the group list after Tally confirms
 */

import { useEffect, useRef, useState } from 'react'

import { Modal } from '@/Components/Common/Modal'
import { Field, SelectField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { useWebSocket } from '@/Hooks/useWebSocket'
import { toast } from '@/Library/toast'
import {
  LEDGER_GROUP_CREATE_MODULE,
  buildLedgerGroupCreateMessage,
} from '@/Services/ledgerService'

/**
 * Safety net: the longest Submit waits for Tally's stop_loader. The reply
 * normally ends the wait long before this - the same guard, and the same
 * two minutes, as the Ledger Form's Tally save.
 */
const TALLY_SAVE_TIMEOUT_MS = 2 * 60 * 1000

export default function LedgerGroupModal({
  open,
  onOpenChange,
  companyId,
  companyName,
  groups = [],
  onCreated,
}) {
  const [name, setName] = useState('')
  const [under, setUnder] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Whether a save of THIS modal's is in flight, where the socket callback
  // can read it: that callback was registered on mount and would otherwise
  // see the first render's value.
  const savingRef = useRef(false)
  const timerRef = useRef(null)

  /** Back to ready, with no timer left running. */
  const finish = () => {
    savingRef.current = false
    clearTimeout(timerRef.current)
    timerRef.current = null
    setSaving(false)
  }

  /** Empty again, so the next "Add Ledger Group" does not open on old text. */
  const reset = () => {
    setName('')
    setUnder('')
    setErrors({})
  }

  /**
   * The app's shared WebSocket - no second connection. Only this modal's own
   * ledger_group_create reply counts.
   */
  const { send } = useWebSocket({
    module: LEDGER_GROUP_CREATE_MODULE,
    onMessage: (data) => {
      // { res: { return_module_name, action_status, status, msg, company_name } }
      const reply = data?.res
      if (!reply || reply.return_module_name !== LEDGER_GROUP_CREATE_MODULE) return

      // Not a save this modal started, or one already finished.
      if (!savingRef.current) return

      // Tally can send progress first; only stop_loader ends the wait.
      if (reply.action_status !== 'stop_loader') return

      // Stopped before `status` is read, so no branch below can leave the
      // button spinning.
      finish()

      if (reply.status === 'error') {
        // The group stays on screen with what was typed, so it can be fixed
        // and sent again.
        toast.error(reply.msg || 'Tally could not create the ledger group.')
        return
      }

      toast.success(reply.msg || 'Ledger group created successfully.')

      // The Ledger Form's dropdown reads the same list, so reloading it is
      // what makes the new group usable there straight away.
      onCreated?.()
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

  /** Both fields are required - a group needs a name and somewhere to sit. */
  const validate = () => {
    const found = {}
    if (!name.trim()) found.name = 'Ledger group name is required'
    if (!under) found.under = 'Please select a ledger group'
    return found
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (savingRef.current) return

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    if (!companyName?.trim()) {
      toast.error('Select a company before adding a ledger group.')
      return
    }

    savingRef.current = true
    setSaving(true)

    const delivered = await send(
      buildLedgerGroupCreateMessage({ companyId, companyName, name, under }),
    )

    // Already answered, or the modal has gone away.
    if (!savingRef.current) return

    if (!delivered) {
      console.error('[Ledger Group] WebSocket error:', `${LEDGER_GROUP_CREATE_MODULE} could not be sent`)
      finish()
      toast.error('Could not reach the live server. Please try again.')
      return
    }

    timerRef.current = setTimeout(() => {
      if (!savingRef.current) return
      finish()
      toast.error('Tally did not finish creating the ledger group in time. Please try again.')
    }, TALLY_SAVE_TIMEOUT_MS)
  }

  /** Closing mid-save would leave the reply with nowhere to go. */
  const handleOpenChange = (next) => {
    if (!next && savingRef.current) return
    if (!next) reset()
    onOpenChange?.(next)
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title="Add Ledger Group"
      size="md"
      // A click outside or Escape must not throw away a save in progress.
      closeOnBackdropClick={!saving}
      closeOnEsc={!saving}
      /* Opens with nothing focused. The first field is the company, which is
         filled in already and read-only, so focusing it would open the modal
         with that name highlighted as if it were asking to be replaced. The
         user clicks whichever field they actually want. */
      autoFocus={false}
    >
      {/* The form's own submit, so Enter in either field saves - as on the
          Ledger Form. The buttons sit inside it for the same reason. */}
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {/* ---- The company, shown rather than chosen: it comes from the
            header's picker, and this is here so the user can see what they
            are adding to. The Ledger Form shows it the same way. ---- */}
        <Field
          id="ledger_group_company"
          label="Company Name"
          required
          readOnly
          value={companyName || 'No company selected'}
        />

        <Field
          id="ledger_group_name"
          label="Ledger Group Name"
          required
          placeholder="New ledger group"
          value={name}
          error={errors.name}
          disabled={saving}
          onChange={(event) => {
            setName(event.target.value)
            setErrors((previous) => ({ ...previous, name: undefined }))
          }}
        />

        {/* ---- The parent group. The same options, from the same store, as
            the Ledger Form's "Select Ledger Group" - `user_show_group` is
            both what is shown and what is sent. ---- */}
        <SelectField
          id="ledger_group_under"
          label="Select Ledger Group"
          required
          placeholder={groups.length === 0 ? 'Loading...' : 'Select Ledger Group'}
          value={under}
          error={errors.under}
          disabled={saving || groups.length === 0}
          onValueChange={(value) => {
            setUnder(value)
            setErrors((previous) => ({ ...previous, under: undefined }))
          }}
          options={groups.map((group) => ({
            value: group.user_show_group,
            label: group.user_show_group,
          }))}
        />

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>

          <Button type="submit" loading={saving} disabled={!companyId}>
            {saving ? 'Saving...' : 'Submit'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
