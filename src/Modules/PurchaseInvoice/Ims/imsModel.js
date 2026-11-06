/**
 * IMS - THE GST PORTAL'S INVOICE MANAGEMENT SYSTEM, as data: what
 * gst_portal_integration/ims/ answers and what saving the actions sends
 * (Services/Gst/gstReturnService fetchIms / saveImsActions). Plain functions: no
 * React, no requests.
 *
 *   readImsSections(reply)          -> [{ key, label, rows }] - the eight sections, in the
 *                                      portal's order (an empty or missing one with no rows),
 *                                      then any other list the reply holds
 *   imsColumns(rows)                -> the columns of a section: every field its rows have, in
 *                                      the order they come, but `Action` (the action control
 *                                      stands for it) - sections do not share their fields
 *   actionOf(row, changes, key)     -> the action shown: the one chosen, else the row's own
 *   withChange(changes, key, row, action)   -> changes with that choice - none when it is the
 *                                      row's own action again
 *   buildImsSaveSections(sections, changes, keyOf)
 *                                   -> { <section>: [{ ...the row exactly as fetched, change }] }
 *                                      - only the rows whose action changed; `Action` stays the
 *                                      status before (the backend sends it as prev_status)
 *   applySavedActions(sections, changes, keyOf)
 *                                   -> the sections with each saved row's Action and Status
 *                                      now the chosen one - nothing else of it changed
 *
 * A row is named by `${section}:${place in the section}` (keyOf) - the
 * portal's rows have no id of their own.
 */

/** The sections the backend answers, in this order. */
export const IMS_SECTIONS = Object.freeze([
  { key: 'b2b', label: 'B2B' },
  { key: 'b2ba', label: 'B2B Amendments' },
  { key: 'b2bcn', label: 'Credit Notes' },
  { key: 'b2bcna', label: 'Credit Note Amendments' },
  { key: 'b2bdn', label: 'Debit Notes' },
  { key: 'b2bdna', label: 'Debit Note Amendments' },
  { key: 'ecom', label: 'E-Commerce' },
  { key: 'ecoma', label: 'E-Commerce Amendments' },
])

/** The actions a row can be given; `status` is what the portal then calls it ("Status"). */
export const IMS_ACTIONS = Object.freeze([
  { value: 'A', label: 'Accept', status: 'Accepted' },
  { value: 'R', label: 'Reject', status: 'Rejected' },
  { value: 'P', label: 'Pending', status: 'Pending' },
  { value: 'N', label: 'No Action', status: 'No Action' },
])

export const ACTION_FIELD = 'Action'
export const STATUS_FIELD = 'Status'

const isRow = (row) => row !== null && typeof row === 'object' && !Array.isArray(row)

export const readImsSections = (reply) => {
  const source = isRow(reply) ? reply : {}
  const rowsOf = (key) => (Array.isArray(source[key]) ? source[key].filter(isRow) : [])
  const known = IMS_SECTIONS.map((section) => ({ ...section, rows: rowsOf(section.key) }))
  const extra = Object.keys(source)
    .filter((key) => Array.isArray(source[key]) && !IMS_SECTIONS.some((section) => section.key === key))
    .map((key) => ({ key, label: key.toUpperCase(), rows: rowsOf(key) }))
  return [...known, ...extra]
}

export const imsColumns = (rows) => {
  const columns = []
  rows.forEach((row) =>
    Object.keys(row).forEach((field) => {
      if (field !== ACTION_FIELD && !columns.includes(field)) columns.push(field)
    }),
  )
  return columns
}

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

export const actionOf = (row, changes, key) => changes[key] ?? (text(row[ACTION_FIELD]) || 'N')

export const withChange = (changes, key, row, action) => {
  const next = { ...changes }
  if (action === (text(row[ACTION_FIELD]) || 'N')) delete next[key]
  else next[key] = action
  return next
}

export const buildImsSaveSections = (sections, changes, keyOf) => {
  const body = {}
  sections.forEach((section) => {
    const rows = section.rows
      .map((row, index) => [row, changes[keyOf(section.key, index)]])
      .filter(([, change]) => change)
      .map(([row, change]) => ({ ...row, change }))
    if (rows.length > 0) body[section.key] = rows
  })
  return body
}

export const applySavedActions = (sections, changes, keyOf) =>
  sections.map((section) => ({
    ...section,
    rows: section.rows.map((row, index) => {
      const change = changes[keyOf(section.key, index)]
      if (!change) return row
      const status = IMS_ACTIONS.find((action) => action.value === change)?.status ?? row[STATUS_FIELD]
      return { ...row, [ACTION_FIELD]: change, [STATUS_FIELD]: status }
    }),
  }))

/** How many rows have an action chosen that is not saved yet. */
export const changeCount = (changes) => Object.keys(changes).length
