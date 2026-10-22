import { useDeferredValue, useMemo, useState } from 'react'

/**
 * Filtering, sorting and paging for a list that is already in memory.
 *
 * The Bank and Ledger lists both keep every row in the store, so none of
 * this costs a request - it is all done here, in the browser, and typing in
 * a filter box never reaches the network.
 *
 *   const view = useListView(banks, {
 *     searchFields: ['bank_name', 'account_no'],
 *     filterFields: { bank_name: 'Bank', company_name: 'Company' },
 *   })
 *
 *   view.rows          the rows to draw for the current page
 *   view.total         how many rows survived the filters
 *   view.search        / view.setSearch
 *   view.filters       / view.setFilter(field, value)
 *   view.clear()       reset search, filters and page
 *   view.isFiltered    true when anything is narrowing the list
 *   view.sort          { field, direction } - direction is 'asc' | 'desc'
 *   view.toggleSort(field)
 *   view.page          / view.setPage / view.pageCount
 *   view.pageSize      / view.setPageSize
 *
 * `options`:
 *   searchFields   the fields the one search box looks through
 *   filterFields   { field: label } for the per-column dropdowns; the
 *                  choices are taken from whatever values the rows hold
 *   initialSort    { field, direction } to start sorted
 *   initialPageSize  rows per page, default 10
 */

/** Everything compares as lower-case text, so sorting works on any column. */
const asText = (value) => String(value ?? '').toLowerCase()

/**
 * `numeric` keeps "Account 10" after "Account 9" instead of before it. One
 * collator, made once: localeCompare(b, undefined, { numeric: true }) gives
 * the same order but sets one up on every comparison - most of a second on
 * a list of tens of thousands.
 */
const naturalOrder = new Intl.Collator(undefined, { numeric: true }).compare

export function useListView(
  rows,
  { searchFields = [], filterFields = {}, initialSort = null, initialPageSize = 10 } = {},
) {
  const [search, setSearch] = useState('')
  // One entry per column dropdown that is actually set to something.
  const [filters, setFilters] = useState({})
  const [sort, setSort] = useState(initialSort)
  // The order the rows are drawn in follows the chosen sort a moment
  // later: the header shows the click at once, and a long list is sorted
  // in a render of its own rather than inside the click (useDeferredValue).
  const sortedBy = useDeferredValue(sort)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const filterKeys = Object.keys(filterFields)

  /* `searchFields` and `filterFields` are usually module-level constants in
     the caller, but a caller that passes a literal would build a new array on
     every render and defeat the memos below. Joining them into a string makes
     the dependency the CONTENT of the list rather than its identity - and
     these two lines also keep the dependency arrays to plain names, which is
     what the project's lint rule requires. */
  const filterKey = filterKeys.join('|')
  const searchKey = searchFields.join('|')

  /**
   * The choices in each column dropdown, taken from the rows themselves - so
   * a filter can only ever offer a value that is really there, and a new
   * column needs no new list of options.
   */
  const filterOptions = useMemo(() => {
    const found = {}

    filterKeys.forEach((field) => {
      const values = new Set()
      rows.forEach((row) => {
        const value = row[field]
        if (value !== null && value !== undefined && value !== '') values.add(String(value))
      })
      found[field] = Array.from(values).sort((a, b) => a.localeCompare(b))
    })

    return found
    // filterKeys is derived from filterKey - see the note where it is built.
  }, [rows, filterKey]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The rows in the order the chosen column puts them - sorted BEFORE the
   * search box and the dropdowns narrow them, so typing a search only
   * filters, and a long list is not sorted again on every keystroke. The
   * rows left are in exactly the order sorting them afterwards would give:
   * sort is stable, so rows that compare equal keep their order.
   */
  const ordered = useMemo(() => {
    if (!sortedBy?.field) return rows

    // Each row's text is worked out once, not twice per comparison, and the
    // rows are sorted as a copy - Array.sort rearranges in place, and `rows`
    // is the store's array, which must never be touched.
    const direction = sortedBy.direction === 'desc' ? -1 : 1
    return rows
      .map((row) => ({ row, text: asText(row[sortedBy.field]) }))
      .sort((a, b) => direction * naturalOrder(a.text, b.text))
      .map(({ row }) => row)
  }, [rows, sortedBy])

  /** The rows left after the search box and the column dropdowns, in that order. */
  const sorted = useMemo(() => {
    const query = search.trim().toLowerCase()

    return ordered.filter((row) => {
      if (query && !searchFields.some((field) => asText(row[field]).includes(query))) {
        return false
      }

      // Every dropdown that is set has to match; an unset one is ignored.
      return Object.entries(filters).every(
        ([field, value]) => !value || String(row[field] ?? '') === value,
      )
    })
    // searchFields is derived from searchKey - see the note where it is built.
  }, [ordered, search, filters, searchKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  // Deleting the last row of the last page would otherwise leave the user on
  // a page that no longer exists, looking at nothing.
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * pageSize

  const paged = useMemo(
    () => sorted.slice(start, start + pageSize),
    [sorted, start, pageSize],
  )

  /** Clicking a column header: ascending, then descending, then unsorted. */
  const toggleSort = (field) => {
    setSort((previous) => {
      if (previous?.field !== field) return { field, direction: 'asc' }
      if (previous.direction === 'asc') return { field, direction: 'desc' }
      return null
    })
    setPage(1)
  }

  /** Changing a filter always returns to the first page. */
  const setFilter = (field, value) => {
    setFilters((previous) => ({ ...previous, [field]: value }))
    setPage(1)
  }

  const changeSearch = (value) => {
    setSearch(value)
    setPage(1)
  }

  const clear = () => {
    setSearch('')
    setFilters({})
    setPage(1)
  }

  const changePageSize = (size) => {
    setPageSize(size)
    setPage(1)
  }

  return {
    rows: paged,
    total: sorted.length,
    search,
    setSearch: changeSearch,
    filters,
    setFilter,
    filterOptions,
    filterFields,
    clear,
    isFiltered: Boolean(search.trim()) || Object.values(filters).some(Boolean),
    sort,
    toggleSort,
    page: safePage,
    setPage,
    pageCount,
    pageSize,
    setPageSize: changePageSize,
  }
}
