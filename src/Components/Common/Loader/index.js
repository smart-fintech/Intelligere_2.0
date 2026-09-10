/**
 * EVERY LOADING SCREEN IN THE PROJECT, IN ONE PLACE.
 *
 * Import from the folder, never from the files inside it:
 *
 *   import { Loader, ProgressLoader, FileUploadLoader } from '@/Components/Common/Loader'
 *
 * ------------------------------------------------------------------
 * Which one do I want?
 * ------------------------------------------------------------------
 *
 *   <Loader />              Plain spinner. The length of the wait is
 *                           unknown. This covers almost everything:
 *                           fetching a page, saving a form, signing in.
 *
 *   <ProgressLoader />      Spinner with a real percentage - a ring or a
 *                           bar. Only when a genuine number exists.
 *
 *   <FileUploadLoader />    Files going up: one bar per file, one figure
 *                           for the batch, and how each one ended.
 *
 * ------------------------------------------------------------------
 * How much of the screen does it cover?
 * ------------------------------------------------------------------
 * All three take the same `variant`, so the answer is worded the same way
 * everywhere:
 *
 *   inline      a row, taking only the space it needs
 *   section     centred inside its card or box
 *   page        centred in the main content area          <- usual choice
 *   overlay     a sheet over the nearest `relative` parent
 *   fullscreen  the whole window, scrolling locked
 *
 * ------------------------------------------------------------------
 * Also exported, for the odd case
 * ------------------------------------------------------------------
 *   Spinner              the bare ring, e.g. inside a button
 *   ProgressBar          the bar on its own, inside your own layout
 *   useUploadProgress    tracks which file is at what percent
 *   uploadPercent        one axios progress event -> a number
 *   toPercent            anything -> a safe 0-100, or null if unknown
 *   formatBytes          20480 -> "20 KB"
 */

export { default as Spinner } from './Spinner'
export { Loader, default } from './Loader'
export { ProgressLoader, ProgressBar } from './ProgressLoader'
export { FileUploadLoader } from './FileUploadLoader'
export { toPercent, uploadPercent, formatBytes } from './helpers'
export { useUploadProgress } from './useUploadProgress'
