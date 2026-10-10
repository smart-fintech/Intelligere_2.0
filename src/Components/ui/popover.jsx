import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/Library/utils"

/**
 * A small box that opens next to the element that asked for it - the
 * shadcn/ui wrapper around Radix's popover, in the same shape as ui/dialog
 * and ui/dropdown-menu beside it.
 *
 * Screens rarely use this directly: Components/Common/ConfirmPopover puts a
 * question and two buttons in one, which is what a Delete button wants.
 * Reach for these parts when a popover needs to hold something else.
 *
 * Radix gives the behaviour - focus moves in on opening and back to the
 * trigger on closing, Escape and an outside click close it, and a portal so
 * no parent's overflow (a scrolling table, say) can clip it. It also keeps
 * the box inside the window: it flips to the opposite side and slides along
 * the edge when there is no room where it was asked to open.
 */

function Popover({ ...props }) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

/** For a popover that should sit next to something other than its trigger. */
function PopoverAnchor({ ...props }) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverContent({ className, align = "center", sideOffset = 8, collisionPadding = 8, ...props }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        // Clamps the box a few px away from the window edge.
        collisionPadding={collisionPadding}
        className={cn(
          // No `overflow-hidden` here: the arrow is drawn just outside this
          // box and would be cut off.
          "z-50 w-72 rounded-md border border-border bg-card p-4 text-sm text-foreground shadow-md outline-none",
          // Never wider than the screen, whatever width it is given.
          "max-w-[calc(100vw-1rem)] origin-(--radix-popover-content-transform-origin)",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

/**
 * The little pointer joining the box to its trigger. Goes inside
 * PopoverContent; Radix turns it to face whichever side the box opened on.
 *
 * It is the card colour, pulled 1px over the box's border so the two read as
 * one shape, and the drop shadow redraws that border along its two edges.
 */
function PopoverArrow({ className, ...props }) {
  return (
    <PopoverPrimitive.Arrow
      data-slot="popover-arrow"
      width={12}
      height={6}
      className={cn("-translate-y-px fill-card drop-shadow-[0_1px_0_var(--border)]", className)}
      {...props}
    />
  )
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent, PopoverArrow }
