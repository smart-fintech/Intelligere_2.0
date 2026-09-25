"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { Select as SelectPrimitive } from "radix-ui"

import { cn } from "@/Library/utils"

function Select({
  ...props
}) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  ...props
}) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  ...props
}) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-10 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

// function SelectContent({
//   className,
//   children,
//   position = "item-aligned",
//   align = "center",
//   ...props
// }) {
//   return (
//     <SelectPrimitive.Portal>
//       <SelectPrimitive.Content
//         data-slot="select-content"
//         className={cn(
//           "relative z-50 min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
//           position === "popper" &&
//             "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
//           className
//         )}
//         position={position}
//         align={align}
//         {...props}
//       >
//         <SelectPrimitive.Viewport
//           className={cn(
//             "p-1",
//             position === "popper" &&
//               "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
//           )}
//         >
//           {children}
//         </SelectPrimitive.Viewport>
//       </SelectPrimitive.Content>
//     </SelectPrimitive.Portal>
//   )
// }

function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  searchable = false,
  searchPlaceholder = "Search...",
  searchValue = "",
  onSearchChange,
  ...props
}) {
  /* This draws the search box; it does NOT decide what the box does to the
     list. The filtering belongs to whoever owns the options - SelectField in
     Components/Common/FormFields - because that is where the options exist as
     data. Picking rendered children apart to guess which ones match (reading
     `child.type` and `child.props.children`) quietly kept anything it did not
     recognise, which showed the whole list as though nothing had been typed. */
  /* ----------------------------------------------------------------
     Keeping the cursor in the search box
     ----------------------------------------------------------------
     Radix moves focus to the selected option whenever the set of options
     changes - its own effect, in @radix-ui/react-select:

       const focusSelectedItem = useCallback(
         () => focusFirst([selectedItem, content]),
         [focusFirst, selectedItem, content])
       useEffect(() => { if (isPositioned) focusSelectedItem() },
         [isPositioned, focusSelectedItem])

     Filtering unmounts and remounts items, so `selectedItem` becomes a
     different node, the callback is rebuilt, the effect runs again and it
     calls .focus() on an option - taking the cursor out of the box the user
     is typing in. That is why one character used to arrive and then nothing.

     Radix's effect runs before this one (React runs a child's effects before
     its parent's), so putting the cursor back afterwards settles it. It is
     done only when the options have just been filtered, never on every
     render, so moving to the list with the arrow keys still works. */
  const searchInputRef = React.useRef(null)

  const keepSearchFocused = React.useCallback(() => {
    const input = searchInputRef.current
    if (input && document.activeElement !== input) input.focus()
  }, [])

  /* Twice: now, and again on the next frame.
     ----------------------------------------------------------------
     The second one is what actually matters, and only for a list that has
     something selected - which is why a Country box (India by default) lost
     the cursor while State and City, with nothing chosen yet, did not.

     Radix records the selected option through a REF CALLBACK:

       setSelectedItem(node)      // @radix-ui/react-select

     A ref callback runs after the commit that remounted the options, and the
     state it sets schedules ANOTHER commit. `focusSelectedItem` is rebuilt in
     that later commit and its effect steals the focus there - after this
     effect has already run for the keystroke. So the cursor is put back on
     the next frame as well, by which time that has happened.

     Nothing here runs unless the filter text changed, so moving into the list
     with the arrow keys is untouched. */
  React.useEffect(() => {
    if (!searchable) return undefined

    keepSearchFocused()
    const frame = requestAnimationFrame(keepSearchFocused)
    return () => cancelAnimationFrame(frame)
  }, [searchable, searchValue, keepSearchFocused])

  /* The keys the LIST needs, which must reach Radix: moving through the
     options, choosing one, and leaving. Everything else is the user typing,
     and must not reach Radix's own type-ahead - that jumps to an option and
     takes the focus with it, which is the same problem by another route. */
  const handleSearchKeyDown = (event) => {
    const forList = ["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape", "Tab"]
    if (!forList.includes(event.key)) event.stopPropagation()
  }

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "relative z-50 max-h-[--radix-select-content-available-height] min-w-[8rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
          "data-[side=bottom]:slide-in-from-top-2",
          "data-[side=left]:slide-in-from-right-2",
          "data-[side=right]:slide-in-from-left-2",
          "data-[side=top]:slide-in-from-bottom-2",
          "data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0",
          "data-[state=closed]:zoom-out-95",
          "data-[state=open]:animate-in",
          "data-[state=open]:fade-in-0",
          "data-[state=open]:zoom-in-95",

          // Keep dropdown width equal to trigger
          "w-[var(--radix-select-trigger-width)]",

          className
        )}
        position={position}
        align={align}
        {...props}
      >
        {/* No key handling on the wrapper below: it would catch what the
            input deliberately lets through on its way up to the list. */}
        {searchable && (
          <div className="sticky top-0 z-10 bg-popover p-2">
            <input
              ref={searchInputRef}
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              onKeyDown={handleSearchKeyDown}
            />
          </div>
        )}

        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            "max-h-[300px] overflow-y-auto"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}


export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
