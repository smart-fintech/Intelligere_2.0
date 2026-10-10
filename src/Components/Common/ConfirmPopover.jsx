import { useId } from 'react'

import { Button } from '@/Components/ui/button'
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from '@/Components/ui/popover'

/**
 * "Are you sure?", asked right beside the button that was clicked.
 *
 * The small sibling of ConfirmDialog, with the same props so one can be
 * swapped for the other:
 *
 *   ConfirmPopover   a quick question about one thing on screen - delete
 *                    this row, remove this item, disable this record. It
 *                    opens next to the button and the page stays in view.
 *   ConfirmDialog    a confirmation that deserves the whole screen's
 *                    attention, or needs more room to explain itself.
 *
 * It wraps the button that opens it:
 *
 *   const [confirming, setConfirming] = useState(false)
 *
 *   <ConfirmPopover
 *     open={confirming}
 *     onOpenChange={setConfirming}
 *     title="Delete bank?"
 *     description={`Are you sure you want to delete "${bank.bank_name}"?`}
 *     confirmLabel="Delete"
 *     busy={deleting}
 *     onConfirm={handleDelete}
 *   >
 *     <Button variant="iconDelete" size="icon-sm" icon={Trash2} aria-label="Delete bank" />
 *   </ConfirmPopover>
 *
 * Props:
 *   open, onOpenChange   controlled by you, the same as ConfirmDialog. The
 *                        child's click opens it - it needs no onClick.
 *   title                the question                (default "Are you sure?")
 *   description          the detail underneath
 *   confirmLabel         the button that does it     (default "Confirm")
 *   cancelLabel          the button that backs out   (default "Cancel")
 *   variant              the confirm button's look   (default "destructive" -
 *                        the red outline every Delete button uses)
 *   busy                 true while the action runs: both buttons are
 *                        disabled and the popover cannot be dismissed, so
 *                        the action cannot be fired twice by a double click
 *   onConfirm            what to do when confirmed
 *   side, align          where it opens against the button (default below
 *                        it, right edges in line - a row's buttons sit at
 *                        the right of a table). Only a preference: it flips
 *                        and slides to stay inside the window.
 *   children             ONE element that can hold a ref and receive props -
 *                        normally a <Button>.
 *
 * `onConfirm` is not awaited here and the popover does not close itself. The
 * screen owns the request, so it decides when the popover goes - normally
 * after the call has succeeded, which also leaves it open for another try
 * when the call fails.
 *
 * Cancel, Escape and a click anywhere else all close it. Focus lands on
 * Cancel when it opens, so a stray Enter never confirms.
 */
export function ConfirmPopover({
  open,
  onOpenChange,
  title = 'Are you sure?',
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  busy = false,
  onConfirm,
  side = 'top',
  align = 'end',
  children,
}) {
  const titleId = useId()
  const descriptionId = useId()

  // While the action is running the popover cannot be dismissed by accident
  // - it would carry on regardless and the user would never see whether it
  // worked.
  const handleOpenChange = (next) => {
    if (!busy) onOpenChange(next)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>

      <PopoverContent
        side={side}
        align={align}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="space-y-3 p-3"
      >
        <div className="space-y-1">
          <p id={titleId} className="font-semibold text-primary">
            {title}
          </p>

          {description ? (
            // A long name with no spaces wraps instead of widening the box.
            <p id={descriptionId} className="text-xs wrap-break-word text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => handleOpenChange(false)}>
            {cancelLabel}
          </Button>

          <Button type="button" variant={variant} size="sm" loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>

        <PopoverArrow />
      </PopoverContent>
    </Popover>
  )
}
