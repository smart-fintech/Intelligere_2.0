import { Fragment, useId, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, SlidersHorizontal, X } from 'lucide-react'

import { Field, fieldLabelClass, OPTIONS_PAGE } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/Components/ui/popover'
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

/** A filter with nothing to offer, or nothing drawn - one array, so memos built on it hold. */
const NO_OPTIONS = []

/**
 * How many options a filter longer than OPTIONS_PAGE draws at a time - a
 * box's worth and more. Radix draws every drawn option again several times
 * as the list opens, so this is what opening it costs; the search box and
 * scrolling reach the rest.
 */
const FILTER_PAGE = 30

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
 * `moreFilters` is for a list with more filters than a row has room for: the
 * fields named in it (keys of the view's `filterFields`) are tucked behind
 * one "More Filters" button, in a small popover, instead of each taking a
 * dropdown's width on the row. The button says how many of them are set, so
 * a filter that is out of sight is never forgotten. Without it every filter
 * sits on the row, as on the Bank and Ledger lists.
 *
 * `moreLayout` says how they are tucked away:
 *
 *   'popover'  (default) a small box under the button - for a few short
 *              dropdowns (Customised Fields' yes/no filters)
 *   'panel'    a section that opens UNDER the row, the page's full width,
 *              its filters in a grid of labelled boxes that wraps onto as
 *              many rows as it needs: one column on a phone, up to four on
 *              a wide screen. For a list whose extra filters are many, or
 *              have long names and values - a product's SKU attributes.
 *              The button opens and closes it, with a chevron that says
 *              which; `moreTitle` heads it.
 *
 * Either way the button counts the tucked filters that are set, so one
 * out of sight is never forgotten, and Clear clears them with the rest.
 *
 * `extra` is a filter that is not a dropdown - a DateRangeFilter, say -
 * drawn on the row after the dropdowns. Its value is the page's to keep,
 * so the page's `view.isFiltered` and `view.clear` cover it too.
 *
 * These are toolbar controls, so they use the compact 32px height (`h-8`,
 * `size="sm"`) rather than the 40px of a form field.
 */
export function TableFilters({
  view,
  searchPlaceholder = 'Search',
  actions,
  moreFilters = [],
  moreLayout = 'popover',
  moreTitle,
  extra = null,
}) {
  const fields = Object.entries(view.filterFields)
  const onRow = fields.filter(([field]) => !moreFilters.includes(field))
  const tucked = fields.filter(([field]) => moreFilters.includes(field))
  const tuckedInUse = tucked.filter(([field]) => view.filters[field]).length
  const moreLabel = `More Filters${tuckedInUse > 0 ? ` (${tuckedInUse})` : ''}`

  // The panel's open state - the popover keeps its own.
  const [moreOpen, setMoreOpen] = useState(false)
  const panelId = useId()
  const asPanel = moreLayout === 'panel' && tucked.length > 0

  return (
    <div className="mb-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
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

        {onRow.map(([field, label]) => (
          <FilterSelect
            key={field}
            view={view}
            field={field}
            label={label}
            anyLabel={`All ${label}`}
            className="w-full sm:w-44"
          />
        ))}

        {extra}

        {asPanel ? (
          <Button
            type="button"
            variant={moreOpen ? 'secondary' : 'outline'}
            size="sm"
            icon={SlidersHorizontal}
            aria-expanded={moreOpen}
            aria-controls={panelId}
            onClick={() => setMoreOpen((open) => !open)}
          >
            {moreLabel}
            <ChevronDown className={cn('size-3.5 transition-transform', moreOpen && 'rotate-180')} />
          </Button>
        ) : tucked.length > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" icon={SlidersHorizontal}>
                {moreLabel}
              </Button>
            </PopoverTrigger>

            {/* Each one under its own label here, as there is room for it -
                which also lets the "any" entry be a plain "All". */}
            <PopoverContent align="start" className="w-64 space-y-2.5 p-3">
              {tucked.map(([field, label]) => (
                <div key={field} className="space-y-1">
                  <p className={fieldLabelClass}>{label}</p>
                  <FilterSelect view={view} field={field} label={label} anyLabel="All" className="w-full" />
                </div>
              ))}
            </PopoverContent>
          </Popover>
        ) : null}

        {view.isFiltered ? (
          <Button type="button" variant="ghost" size="sm" icon={X} onClick={view.clear}>
            Clear
          </Button>
        ) : null}

        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>

      {/* The panel: under the row, the row's own width, never wider. Each
          filter is a label over a full-width box in a grid that wraps -
          a long name is cut short with the whole of it on hover, and a long
          value inside the box the same way. */}
      {asPanel && moreOpen ? (
        <section id={panelId} aria-label={moreTitle || 'More filters'} className="rounded-md border border-border bg-muted/30 p-3">
          {moreTitle ? (
            <p className="mb-2.5 text-xs font-semibold text-brand">
              {moreTitle}
              <span className="font-normal text-muted-foreground"> ({tucked.length})</span>
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tucked.map(([field, label]) => (
              <div key={field} className="min-w-0 space-y-1">
                <p className={cn(fieldLabelClass, 'truncate')} title={label}>
                  {label}
                </p>
                <FilterSelect view={view} field={field} label={label} anyLabel="All" className="w-full min-w-0" />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

/**
 * A date range on the filter row - two of the browser's date boxes, in the
 * row's compact height:
 *
 *   <DateRangeFilter label="Expiry" from={from} to={to} onChange={({ from, to }) => ...} />
 *
 * `from` and `to` are YYYY-MM-DD, or '' for an open end. Neither box lets
 * the other pass it: `to` cannot be set before `from`.
 */
export function DateRangeFilter({ label, from = '', to = '', onChange }) {
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
      <span className="text-xs whitespace-nowrap text-muted-foreground">{label}</span>
      <Field
        type="date"
        value={from}
        max={to || undefined}
        onChange={(event) => onChange({ from: event.target.value, to })}
        aria-label={`${label} from`}
        className="w-36"
        inputClassName="h-8"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Field
        type="date"
        value={to}
        min={from || undefined}
        onChange={(event) => onChange({ from, to: event.target.value })}
        aria-label={`${label} to`}
        className="w-36"
        inputClassName="h-8"
      />
    </div>
  )
}

/**
 * One filter dropdown: "any", then every value the rows hold for that field
 * (see `filterOptions` in useListView).
 *
 * `view.renderFilterOption(field, option, item)` is optional: it is handed
 * each option's <SelectItem> and returns what to draw in its place - the
 * item wrapped in a tooltip, say, for a choice whose own text is a code that
 * says little by itself (a SKU code, and the SKU's details).
 *
 * A LONG LIST IS DRAWN AS SelectField DRAWS ONE - a product list's SKU Code
 * filter can offer tens of thousands of codes, and Radix mounts every item
 * it is given, closed or open, on every redraw of the filter row:
 *   - closed, only the chosen option is mounted (Radix shows its text)
 *   - open, the first FILTER_PAGE, and the next lot as the list is
 *     scrolled to its end
 *   - a list longer than that gets a search box ("contains", as
 *     SelectField's), so any value can be reached without scrolling to it
 * A short list is drawn whole, exactly as before.
 */
function FilterSelect({ view, field, label, anyLabel, className }) {
  const options = view.filterOptions[field] ?? NO_OPTIONS
  const chosen = view.filters[field] || ''
  const searchable = options.length > OPTIONS_PAGE
  // A short list is drawn whole; a long one a lot at a time.
  const page = searchable ? FILTER_PAGE : OPTIONS_PAGE

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(page)

  const term = searchable ? search.trim().toLowerCase() : ''
  const matches = useMemo(
    () => (term ? options.filter((option) => option.toLowerCase().includes(term)) : options),
    [options, term],
  )

  const drawn = useMemo(() => {
    if (!open) return chosen ? [chosen] : NO_OPTIONS

    const first = matches.length > limit ? matches.slice(0, limit) : matches
    // The chosen one on top when the list has not got to it yet.
    return chosen && !first.includes(chosen) && matches.includes(chosen) ? [chosen, ...first] : first
  }, [open, chosen, matches, limit])

  const drawMore = (event) => {
    const list = event.currentTarget
    if (list.scrollHeight - list.scrollTop - list.clientHeight > 200) return

    setLimit((count) => (count < matches.length ? count + page : count))
  }

  return (
    <Select
      // Radix treats "" as "nothing chosen", so the "any" entry needs a
      // value of its own; it is turned back into "" on the way out.
      value={chosen || ANY}
      onValueChange={(value) => view.setFilter(field, value === ANY ? '' : value)}
      onOpenChange={(next) => {
        setOpen(next)
        setLimit(page)
        if (!next) setSearch('')
      }}
    >
      {/* A value too long for its box is cut short with "..." - never
          spilled over the next control - and shown in full on hover. */}
      <SelectTrigger
        size="sm"
        aria-label={`Filter by ${label}`}
        title={view.filters[field] || undefined}
        className={cn(
          'min-w-0 *:data-[slot=select-value]:block! *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate *:data-[slot=select-value]:text-left',
          className,
        )}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>

      {/* As wide as its box at least, and never wider than the screen -
          a long option wraps instead of running off it. */}
      <SelectContent
        className="max-w-[min(24rem,calc(100vw-2rem))]"
        searchable={searchable}
        searchPlaceholder={`Search ${label}`}
        searchValue={search}
        // A new search starts from the first lot of its own matches.
        onSearchChange={(text) => {
          setSearch(text)
          setLimit(page)
        }}
        onViewportScroll={drawMore}
      >
        <SelectItem value={ANY}>{anyLabel}</SelectItem>
        {drawn.map((option) => {
          const item = <SelectItem value={option}>{option}</SelectItem>
          return <Fragment key={option}>{view.renderFilterOption ? view.renderFilterOption(field, option, item) : item}</Fragment>
        })}
        {open && term && matches.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">No matches for &ldquo;{search.trim()}&rdquo;</p>
        ) : null}
      </SelectContent>
    </Select>
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
 * A ROW THAT OPENS
 *   A row can be followed by a second <TableRow> holding ONE cell that spans
 *   every column (`colSpan`) - the details the row above opens out into.
 *   Such a cell is left alone by the rules for the pinned Actions column and
 *   for the tint under the pointer, so it lays out as a plain full-width box.
 *   Do not put a <table> inside it: the rules here reach every cell beneath
 *   this table, a nested table's included.
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
        // `:not([colspan])`: a cell that spans the row - the details a row
        // opens out into, see "A ROW THAT OPENS" above - is the last cell of
        // ITS row too, but it is not the Actions column and is not pinned.
        '[&_td:last-child:not([colspan])]:sticky [&_td:last-child:not([colspan])]:right-0 [&_td:last-child:not([colspan])]:bg-card',
        '[&_th:last-child]:sticky [&_th:last-child]:right-0 [&_th:last-child]:z-10 [&_th:last-child]:bg-muted',
        '[&_td:last-child:not([colspan])]:shadow-[inset_1px_0_0_var(--border)] [&_th:last-child]:shadow-[inset_1px_0_0_var(--border)]',
        // The row open in the form, then the row under the pointer - both
        // opaque, so the pinned cell matches the rest of its row. A spanning
        // cell is not a row of data, so the pointer does not tint it.
        '[&_tr[data-state=selected]>td]:bg-brand-soft [&_tbody_tr:hover>td:not([colspan])]:bg-muted',
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
