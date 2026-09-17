import { ChevronDown, ChevronUp, ChevronsUpDown, Search, X } from 'lucide-react'

import { Field } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/Components/ui/select'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/Components/ui/table'
import { cn } from '@/Library/utils'

/**
 * The controls that sit around a list: the filter row above it, the table
 * itself with its sortable column headers, and the pager underneath.
 *
 * All of them are driven by one `view` object from Hooks/useListView, so the
 * Bank and Ledger lists share the behaviour as well as the look and neither
 * has to write any of it.
 *
 * Nothing here talks to the network. Every one of these controls narrows or
 * re-orders rows that are already in the store.
 */

/** The value a "no filter" dropdown entry carries - Radix forbids "". */
const ANY = '__any__'

/**
 * How wide a column is when nobody says otherwise - wide enough for a name,
 * a date or a GST number, narrow enough that several fit on the screen.
 *
 * Per-column widths are the exception, not the rule: a column only needs one
 * when it holds something notably longer (an email) or shorter (a count,
 * the Actions buttons) than ordinary.
 */
export const DEFAULT_COLUMN_WIDTH = 160

/**
 * The filter row: one search box, a dropdown per filterable column, and a
 * Clear button that only appears when there is something to clear.
 *
 * `actions` is anything that belongs on the same row but is not a filter -
 * the Download button, on every list today. It sits at the right-hand end
 * (and wraps under the filters on a narrow screen), and the filters work
 * exactly the same with or without it.
 *
 * These are toolbar controls, so they use the compact 32px height (`h-8`,
 * `size="sm"`) rather than the 40px of a form field.
 */
export function TableFilters({ view, searchPlaceholder = 'Search', actions }) {
  const fields = Object.entries(view.filterFields)

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Field
        type="search"
        icon={Search}
        value={view.search}
        onChange={(event) => view.setSearch(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        className="w-full sm:w-64"
        inputClassName="h-8"
      />

      {fields.map(([field, label]) => (
        <Select
          key={field}
          // Radix treats "" as "nothing chosen", so the "any" entry needs a
          // value of its own; it is turned back into "" on the way out.
          value={view.filters[field] || ANY}
          onValueChange={(value) => view.setFilter(field, value === ANY ? '' : value)}
        >
          <SelectTrigger size="sm" aria-label={`Filter by ${label}`} className="w-full sm:w-44">
            <SelectValue placeholder={label} />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value={ANY}>All {label}</SelectItem>
            {(view.filterOptions[field] ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {view.isFiltered ? (
        <Button type="button" variant="ghost" size="sm" icon={X} onClick={view.clear}>
          Clear
        </Button>
      ) : null}

      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/**
 * The list table.
 *
 *   <DataTable head={<><SortableHead ...>Bank</SortableHead> ... <PlainHead>Actions</PlainHead></>}>
 *     {rows.map((row) => (
 *       <TableRow key={row.id} data-state={row.id === editingId ? 'selected' : undefined}>
 *         <TableCell>...</TableCell>
 *       </TableRow>
 *     ))}
 *   </DataTable>
 *
 * SCROLLING
 *   Down: it does not. The table is as tall as its rows (the pager keeps
 *   that to one page) and the page's own scroller - <main> in AppLayout -
 *   carries it, so there is never a scrollbar inside a scrollbar.
 *   Sideways: yes, inside its own box, when the columns are wider than the
 *   space - and only the table moves, never the page.
 *
 * THE ACTIONS COLUMN STAYS PUT
 *   The LAST column is pinned to the right edge (`position: sticky; right: 0`)
 *   with an opaque background, so scrolling a wide table sideways slides the
 *   data underneath it and the Edit / Delete buttons never scroll away. Every
 *   list puts its actions last, which is why this needs no prop.
 *
 * COLUMN WIDTHS
 *   The table lays out `table-fixed`, so a column is as wide as it is told
 *   to be and NOT as wide as the longest thing in it. One cell of runaway
 *   text can no longer squeeze every other column off the screen.
 *
 *   Each column is `defaultColumnWidth` wide unless its header asks for
 *   something else, which it does through SortableHead / PlainHead:
 *
 *     <SortableHead view={view} field="comp_email" width={220}>Email</SortableHead>
 *     <PlainHead width={110} className="text-right">Actions</PlainHead>
 *
 *   Text too long for its column is cut off with an ellipsis rather than
 *   widening it. A cell that should run onto a second line instead says so
 *   itself: <TableCell wrap>.
 *
 *   The table is still at least as wide as its box, so a few narrow columns
 *   share out the space left over; when the widths add up to more than fits,
 *   it scrolls sideways exactly as it always has.
 *
 * The cell borders, the cell padding and the tint of the selected row (the
 * one open in the form - mark it with data-state="selected") are all set
 * here, so a page's rows are only TableRow and TableCell with no classes.
 * They are on the cells, and opaque, because the pinned column has to cover
 * whatever slides beneath it - a translucent tint would let it show through.
 */
export function DataTable({ head, children, defaultColumnWidth = DEFAULT_COLUMN_WIDTH }) {
  return (
    <Table
      containerClassName="rounded-md border border-border"
      // The width a column falls back to, read by the `[&_th]:w-[...]` rule
      // below - one place to set it for the whole table.
      style={{ '--table-col-width': `${defaultColumnWidth}px` }}
      className={cn(
        'border-separate border-spacing-0 [&_tr]:border-0',
        // Widths are obeyed, not negotiated: `table-fixed` takes them from
        // the header row, and a header with no width of its own gets the
        // default. An inline `width` from SortableHead / PlainHead wins over
        // this, being a style rather than a class.
        'table-fixed [&_th]:w-[var(--table-col-width)]',
        // What happens to text that does not fit: cut off with an ellipsis.
        // (A `wrap` cell has no `nowrap` left, so it wraps inside the same
        // width instead - the ellipsis simply never comes up.)
        '[&_td]:overflow-hidden [&_td]:text-ellipsis [&_th]:overflow-hidden',
        // Cells: the row divider and the padding.
        '[&_td]:border-b [&_td]:border-border/60 [&_td]:py-2',
        // The pinned Actions column, in the body and the header, with a
        // hairline on its left so it reads as sitting above the data.
        '[&_td:last-child]:sticky [&_td:last-child]:right-0 [&_td:last-child]:bg-card',
        '[&_th:last-child]:sticky [&_th:last-child]:right-0 [&_th:last-child]:z-10 [&_th:last-child]:bg-muted',
        '[&_td:last-child]:shadow-[inset_1px_0_0_var(--border)] [&_th:last-child]:shadow-[inset_1px_0_0_var(--border)]',
        // The row open in the form, then the row under the pointer - both
        // opaque, so the pinned cell matches the rest of its row.
        '[&_tr[data-state=selected]>td]:bg-brand-soft [&_tbody_tr:hover>td]:bg-muted',
      )}
    >
      <TableHeader className="bg-muted">
        <TableRow className="hover:bg-transparent">{head}</TableRow>
      </TableHeader>

      <TableBody>{children}</TableBody>
    </Table>
  )
}

/** The lettering every column header uses, sortable or not. */
const HEAD_TEXT = 'text-xs font-semibold tracking-wide uppercase'

/**
 * A column header you can click to sort by.
 *
 * The arrow says what will happen as much as what has happened: faint
 * up-and-down until the column is in use, then the direction it is sorted.
 */
export function SortableHead({ view, field, children, className, width }) {
  const active = view.sort?.field === field
  const Icon = !active ? ChevronsUpDown : view.sort.direction === 'asc' ? ChevronUp : ChevronDown

  return (
    <TableHead width={width} className={cn('border-b border-border p-0', className)}>
      <button
        type="button"
        onClick={() => view.toggleSort(field)}
        // `aria-sort` belongs on the cell, but the clickable thing is this
        // button - so the label says which way it is sorted out loud.
        aria-label={`Sort by ${children}${active ? ` (${view.sort.direction}ending)` : ''}`}
        className={cn(
          'flex w-full cursor-pointer items-center gap-1 px-3 py-2 text-left transition-colors',
          HEAD_TEXT,
          active ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {/* The heading gives way before the arrow does, so a narrow column
            still shows which way it is sorted. */}
        <span className="truncate">{children}</span>
        <Icon className={cn('size-3.5 shrink-0', !active && 'opacity-40')} />
      </button>
    </TableHead>
  )
}

/**
 * A plain, non-sortable header, so a row of headings looks consistent.
 *
 * Like SortableHead it takes an optional `width` for its column - most often
 * on the Actions column, which needs less room than a column of data.
 */
export function PlainHead({ children, className, width }) {
  return (
    <TableHead
      width={width}
      className={cn('border-b border-border px-3 py-2 text-muted-foreground', HEAD_TEXT, className)}
    >
      {children}
    </TableHead>
  )
}

const PAGE_SIZES = [
  { label: '10', value: 10 },
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: 'All', value: 'all' },
]
/**
 * The rows-per-page picker, the count, and the page buttons.
 *
 * It hides itself when everything fits on one page and the default page size
 * is in use - there is nothing to say about a list of four rows.
 */
export function TablePager({ view }) {
  // Check if "All" was explicitly chosen
  const isAll = view.pageSize === 'all' || view.pageSize >= 999999

  // Calculate actual rows displayed
  const effectivePageSize = isAll ? (view.total || 1) : Number(view.pageSize)
  const first = view.total === 0 ? 0 : (view.page - 1) * effectivePageSize + 1
  const last = isAll ? view.total : Math.min(view.page * effectivePageSize, view.total)

  if (view.pageCount <= 1 && view.pageSize === PAGE_SIZES[0].value) return null

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <Select
          value={isAll ? 'all' : String(view.pageSize)}
          onValueChange={(value) => {
            if (value === 'all') {
              // Set to sentinel value representing "All"
              view.setPageSize(999999)
            } else {
              view.setPageSize(Number(value))
            }
          }}
        >
          <SelectTrigger size="sm" aria-label="Rows per page" className="w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((option) => (
              <SelectItem key={String(option.value)} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span>
          {first}-{last} of {view.total}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={view.page <= 1}
          onClick={() => view.setPage(view.page - 1)}
        >
          Previous
        </Button>

        <span className="px-2">
          Page {view.page} of {isAll ? 1 : (view.pageCount || 1)}
        </span>

        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={view.page >= (view.pageCount || 1) || isAll}
          onClick={() => view.setPage(view.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
