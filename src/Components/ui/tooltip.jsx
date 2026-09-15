import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/Library/utils"

/**
 * THE tooltip. Every hover/focus hint in the app is one of these, so a change
 * to how tooltips look or behave is made here and nowhere else.
 *
 *   <Tooltip text="Delete">
 *     <Button variant="destructive" size="icon-sm" aria-label="Delete">...</Button>
 *   </Tooltip>
 *
 *   <Tooltip text="Logout" side="bottom">...</Tooltip>
 *
 * A <Button> does not need wrapping: its `tooltip` prop renders this same
 * component (`<Button tooltip="Edit" tooltipSide="bottom" />`).
 *
 * ------------------------------------------------------------------
 * PROPS
 * ------------------------------------------------------------------
 *   text       what the tooltip says (a string, or a small bit of JSX).
 *              Empty = no tooltip, the child is rendered on its own, so a
 *              tooltip can be switched off without restructuring the JSX.
 *   side       "top" (default) | "bottom" | "left" | "right". The preferred
 *              side - if there is no room there it flips to the opposite one.
 *   align      "center" (default) | "start" | "end", along that side.
 *   delay      ms the pointer must rest before it opens. Default 200.
 *   className  extra classes for the bubble itself.
 *   children   ONE element that can hold a ref and receive props - a
 *              <Button>, <Link>, <button>, <span>... Its own props and click
 *              handlers are left untouched.
 *
 * ------------------------------------------------------------------
 * WHAT RADIX TAKES CARE OF (so nothing here has to)
 * ------------------------------------------------------------------
 *   - Opens on hover AND on keyboard focus; closes on leave, blur and Escape.
 *   - Links the bubble to the element with aria-describedby, for screen
 *     readers.
 *   - Rendered in a portal on <body>, so an `overflow: hidden` container, a
 *     table or the sidebar can never clip it.
 *   - Stays inside the window: flips side and shifts along it when needed.
 *   - Ignores touch, so a tap on a phone just clicks the button instead of
 *     popping a bubble up. That is why a tooltip must never be the ONLY
 *     place something is said: an icon-only button still needs its own
 *     aria-label.
 *
 * Note a DISABLED button fires no pointer events, so it shows no tooltip.
 */
function Tooltip({
  text,
  side = "top",
  align = "center",
  delay = 200,
  className,
  children,
}) {
  if (!text) return children

  return (
    // A provider per tooltip means it works anywhere - no app-wide setup to
    // forget, and nothing breaks inside a dialog or a portal.
    <TooltipPrimitive.Provider delayDuration={delay}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>

        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            data-slot="tooltip-content"
            side={side}
            align={align}
            sideOffset={6}
            // Clamps the bubble a few px away from the window edge.
            collisionPadding={8}
            className={cn(
              // No `overflow-hidden` here: the arrow is drawn just outside
              // this box and would be cut off.
              "z-50 max-w-xs rounded-md bg-primary px-3 py-1.5 text-xs text-balance text-primary-foreground shadow-md",
              "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
              "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
              className
            )}
          >
            {text}
            <TooltipPrimitive.Arrow className="fill-primary" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

export { Tooltip }
