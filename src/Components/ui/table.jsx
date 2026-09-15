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
 */

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

function TableHead({ className, ...props }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-left align-middle font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
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
