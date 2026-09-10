/**
 * The small calculations the loaders share.
 *
 * They live apart from the components on purpose: a file that exports both
 * components and plain functions breaks Vite's fast refresh, so anything
 * that is not a component belongs here.
 *
 * Screens can use them directly - `uploadPercent` in particular, which is
 * what you hand to axios:
 *
 *   import { uploadPercent } from '@/Components/Common/Loader'
 *
 *   api.post(url, body, {
 *     onUploadProgress: (event) => setPercent(uploadPercent(event)),
 *   })
 */

/**
 * Anything -> a safe 0-100.
 *
 * Never trust the caller's number: a request can report more bytes than it
 * expected, a step counter can overshoot, a fetch can hand back NaN. This
 * clamps whatever arrives, and returns null when there is no real number at
 * all - which is the loaders' signal to show the "length unknown" animation
 * rather than a figure they cannot stand behind.
 */
export function toPercent(value, max = 100) {
  if (value === null || value === undefined) return null

  const number = Number(value)
  const total = Number(max) || 100
  if (!Number.isFinite(number) || total <= 0) return null

  return Math.min(100, Math.max(0, Math.round((number / total) * 100)))
}

/**
 * One axios upload event -> a percentage.
 *
 * Returns null when the browser cannot say how big the body is, which does
 * happen with streamed requests.
 */
export function uploadPercent(event) {
  if (!event) return null

  // Newer axios works `progress` out itself, as a 0-1 fraction.
  if (typeof event.progress === 'number') return Math.round(event.progress * 100)
  if (!event.total) return null

  return toPercent(event.loaded, event.total)
}

/**
 * 20480 -> "20 KB". Sizes the user can actually read.
 */
export function formatBytes(bytes) {
  const number = Number(bytes)
  if (!Number.isFinite(number) || number <= 0) return ''

  const units = ['B', 'KB', 'MB', 'GB']
  let value = number
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value = value / 1024
    unit += 1
  }

  // Whole numbers for bytes and KB, one decimal from MB up - "1.4 MB" reads
  // better than "1 MB", while "1.0 KB" is just noise.
  return `${value.toFixed(unit >= 2 ? 1 : 0)} ${units[unit]}`
}
