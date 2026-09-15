/**
 * What a screen shows for a value the backend has not filled in.
 *
 *   orDash('HDFC')     -> 'HDFC'
 *   orDash(null)       -> '--'
 *   orDash(undefined)  -> '--'
 *   orDash('   ')      -> '--'
 *   orDash(0)          -> 0        (a real value, not a missing one)
 *
 * So a list never prints "null" or "undefined", and an empty cell still
 * lines up with the ones around it. Dates have their own fallback - see
 * formatDate / formatLongDate in Utils/date.
 */
export const orDash = (value) =>
  value === null || value === undefined || String(value).trim() === '' ? '--' : value
