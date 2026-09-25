import * as React from "react"

import { cn } from "@/Library/utils"

/**
 * The plain table building blocks, in the same shape as the rest of
 * Components/ui - you compose them yourself rather than passing a column
 * config:
 *
 *   <Table>
 *     <TableHeader>
 *       <TableRow><TableHead>Bank</TableHead></TableRow>
 *     </TableHeader>
 *     <TableBody>
 *       <TableRow><TableCell>HDFC Bank</TableCell></TableRow>
 *     </TableBody>
 *   </Table>
 *
 * A wide table scrolls sideways inside its own container rather than
 * stretching the page - that is the wrapper around <table> below. Pass
 * `containerClassName` to give that wrapper a height as well, which is what
 * a sticky header needs to stick to.
 *
 * COLUMN WIDTHS
 *   TableHead and TableCell take a `width` - a number of pixels, or any CSS
 *   length ('12rem', '20%'). Set it on the HEADER cell only: in a table laid
 *   out with `table-fixed` (which is what DataTable in Common/TableTools
 *   does) the header row decides every column, so the body cells below need
 *   nothing. See DataTable for how a column that is too narrow for its text
 *   behaves.
 */

/**
 * `width` as a style object, merged over anything the caller passed.
 *
 * A number means pixels, because that is what a column width is nearly
 * always written as. `minWidth` is there for a table that is NOT
 * `table-fixed`: fixed layout honours `width` exactly, auto layout treats it
 * as a suggestion and will still stretch a column to fit its content, so the
 * floor is what stops it.
 */
function widthStyle(width, style) {
  if (width == null) return style

  const value = typeof width === 'number' ? `${width}px` : width
  return { width: value, minWidth: value, ...style }
}

function Table({ className, containerClassName, ...props }) {
  return (
    // `containerClassName` is how a caller makes the header stick: give this
    // box a height (e.g. "max-h-[60vh] overflow-y-auto") and add
    // "sticky top-0 z-10 bg-card" to the TableHeader inside. Without a
    // height on the scroll box there is nothing for the header to stick to.
    <div
      data-slot="table-container"
      className={cn('relative w-full overflow-x-auto', containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, width, style, ...props }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-left align-middle font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      style={widthStyle(width, style)}
      {...props}
    />
  )
}

// `wrap` lets one cell run onto a second line instead of being cut off at
// the column's width - a description or an address, where seeing all of it
// matters more than every row being the same height.
function TableCell({ className, width, wrap, style, title, children, ...props }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-3 align-middle [&:has([role=checkbox])]:pr-0",
        // "p-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        wrap && "whitespace-normal break-words",
        className
      )}
      style={widthStyle(width, style)}
      // A cell of plain text that its column cuts off is still readable on
      // hover. Only plain text: anything else has no text to offer, and a
      // `title` the caller wrote itself is left alone.
      title={title ?? (!wrap && typeof children === "string" ? children : undefined)}
      {...props}
    >
      {children}
    </td>
  )
}

function TableCaption({ className, ...props }) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
