import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'

/**
 * "Are you sure?" - the one place the app asks it.
 *
 * This is the existing Modal with a fixed pair of buttons, not a second
 * dialog implementation: the backdrop, the Escape key and the focus handling
 * all still come from there.
 *
 *   const [confirming, setConfirming] = useState(null)
 *
 *   <ConfirmDialog
 *     open={Boolean(confirming)}
 *     onOpenChange={() => setConfirming(null)}
 *     title="Delete bank"
 *     description={`Remove ${confirming?.bank_name}? This cannot be undone.`}
 *     confirmLabel="Delete"
 *     busy={deleting}
 *     onConfirm={handleDelete}
 *   />
 *
 * Props:
 *   open, onOpenChange   controlled by you, the same as Modal
 *   title                the question                (default "Are you sure?")
 *   description          the detail underneath
 *   confirmLabel         the button that does it     (default "Confirm")
 *   cancelLabel          the button that backs out   (default "Cancel")
 *   variant              the confirm button's look   (default "destructive" -
 *                        the red outline every Delete button uses)
 *   busy                 true while the action runs: both buttons are
 *                        disabled and the dialog cannot be dismissed, so the
 *                        action cannot be fired twice by a double click
 *   onConfirm            what to do when confirmed
 *
 * `onConfirm` is not awaited here and the dialog does not close itself. The
 * screen owns the request, so it decides when the dialog goes - normally
 * after the call has succeeded, which is what keeps the spinner on screen
 * until the work is really done.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title = 'Are you sure?',
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  busy = false,
  onConfirm,
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      // While the action is running the dialog cannot be dismissed by
      // accident - it would carry on regardless and the user would never see
      // whether it worked.
      closeOnBackdropClick={!busy}
      closeOnEsc={!busy}
      showCloseButton={!busy}
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>

          <Button type="button" variant={variant} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}
