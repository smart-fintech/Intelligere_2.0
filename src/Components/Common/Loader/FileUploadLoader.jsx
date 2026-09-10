/**
 * LOADER 3 OF 3 - the one for files going up.
 *
 * A panel that lists every file being uploaded, with its own bar and its own
 * percentage, plus one overall figure across the whole batch. It also shows
 * how each file ended: a tick, or the reason it failed.
 *
 * Use it:
 *   import { FileUploadLoader, useUploadProgress } from '@/Components/Common/Loader'
 *
 *   const upload = useUploadProgress()
 *
 *   const send = async (picked) => {
 *     upload.start(picked)                    // picked = a FileList or an array
 *     for (const file of picked) {
 *       const body = new FormData()
 *       body.append('file', file)
 *       try {
 *         await api.post('mail/upload/', body, upload.track(file))
 *         upload.done(file)
 *       } catch (error) {
 *         upload.fail(file, error.message)
 *       }
 *     }
 *   }
 *
 *   {upload.active ? (
 *     <FileUploadLoader variant="fullscreen" files={upload.files} />
 *   ) : null}
 *
 * You do not have to use the hook. Anything with a name and a number works:
 *
 *   <FileUploadLoader files={[{ name: 'ledger.xlsx', size: 20480, progress: 62 }]} />
 *
 * One file and one number is the shortest form of all:
 *
 *   <FileUploadLoader name="ledger.xlsx" value={62} />
 *
 * Props:
 *   files        array of { name, size, progress, status, error }. Native
 *                File objects are accepted too - name and size are read off
 *                them, and `value` is used as the progress.
 *   name, size   the single-file shorthand, instead of `files`
 *   value        overall percentage. Left out, it is worked out from the
 *                files - weighted by size when every size is known.
 *   title        heading of the panel. Default "Uploading files".
 *   variant      inline | section | page | overlay | fullscreen (default section)
 *   onCancel     shows a Cancel button and calls this when it is pressed
 *   show         render only when true. Default true.
 *   className    extra classes on the wrapper
 *
 * A file's `status` is one of:
 *   'pending' | 'uploading' | 'success' | 'error'
 * Leave it out and it is worked out from the number: 100 means done.
 */

import { CircleAlert, CircleCheck, CloudUpload, File as FileIcon } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'

import { formatBytes, toPercent } from './helpers'
import Spinner from './Spinner'
import Surface from './Surface'
import { ProgressBar } from './ProgressLoader'

/* ------------------------------------------------------------------ */
/* Making one tidy list out of whatever was passed in                  */
/* ------------------------------------------------------------------ */

function normalise({ files, name, size, value }) {
  // The single-file shorthand becomes a list of one, so there is only one
  // shape to render below.
  const list = Array.isArray(files) ? files : files ? [files] : name ? [{ name, size }] : []

  return list.map((entry, index) => {
    const raw = entry ?? {}
    const percent = toPercent(
      // Whichever of these the caller happened to use. For a bare File
      // object none of them exist, so the shared `value` prop is used.
      raw.progress ?? raw.percent ?? raw.value ?? (list.length === 1 ? value : undefined),
    )

    const status =
      raw.status ??
      (raw.error ? 'error' : percent === 100 ? 'success' : percent === null ? 'pending' : 'uploading')

    return {
      id: raw.id ?? raw.uid ?? `${raw.name ?? 'file'}-${index}`,
      name: raw.name || 'Untitled file',
      size: raw.size,
      percent,
      status,
      error: raw.error,
    }
  })
}

/**
 * The number for the whole batch.
 *
 * When every file's size is known the figure is weighted by size, because a
 * 40 MB file finishing is not the same amount of work as a 4 KB one. When a
 * size is missing anywhere, a plain average is the honest fallback.
 */
function overallPercent(rows) {
  if (rows.length === 0) return null

  const known = rows.filter((row) => row.percent !== null)
  if (known.length === 0) return null

  const weighed = rows.every((row) => Number(row.size) > 0)
  if (weighed) {
    const total = rows.reduce((sum, row) => sum + Number(row.size), 0)
    const done = rows.reduce(
      (sum, row) => sum + Number(row.size) * ((row.percent ?? 0) / 100),
      0,
    )
    return toPercent(done, total)
  }

  const sum = rows.reduce((total, row) => total + (row.percent ?? 0), 0)
  return Math.round(sum / rows.length)
}

/* ------------------------------------------------------------------ */
/* One row                                                             */
/* ------------------------------------------------------------------ */

function FileRow({ row }) {
  const failed = row.status === 'error'
  const finished = row.status === 'success'

  return (
    <li className="flex items-center gap-3 py-2.5">
      {/* Left: what state this one file is in, at a glance. */}
      <span className="shrink-0">
        {failed ? (
          <CircleAlert className="size-5 text-destructive" />
        ) : finished ? (
          <CircleCheck className="size-5 text-emerald-600" />
        ) : row.status === 'uploading' ? (
          <Spinner size="sm" />
        ) : (
          <FileIcon className="size-5 text-muted-foreground" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          {/* `truncate` needs the `min-w-0` above it, or a long file name
              would stretch the row instead of being cut short. */}
          <span className="truncate text-sm font-medium text-foreground" title={row.name}>
            {row.name}
          </span>

          <span
            className={cn(
              'shrink-0 text-xs font-semibold tabular-nums',
              failed ? 'text-destructive' : finished ? 'text-emerald-600' : 'text-primary',
            )}
          >
            {failed ? 'Failed' : finished ? 'Done' : row.percent === null ? '' : `${row.percent}%`}
          </span>
        </div>

        {/* The bar disappears once the file is settled - a full green bar
            next to a tick says the same thing twice. */}
        {failed || finished ? null : <ProgressBar percent={row.percent} className="mt-1.5 h-1.5" />}

        {/* The size line doubles as the place the failure reason goes. */}
        {failed && row.error ? (
          <p className="mt-1 text-xs text-destructive">{row.error}</p>
        ) : row.size ? (
          <p className="mt-1 text-xs text-muted-foreground">{formatBytes(row.size)}</p>
        ) : null}
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* The loader                                                          */
/* ------------------------------------------------------------------ */

export function FileUploadLoader({
  files,
  name,
  size,
  value,
  title = 'Uploading files',
  variant = 'section',
  onCancel,
  show = true,
  className,
}) {
  if (!show) return null

  const rows = normalise({ files, name, size, value })
  const overall = value !== undefined && value !== null ? toPercent(value) : overallPercent(rows)

  const busy = rows.filter((row) => row.status === 'uploading' || row.status === 'pending').length
  const failed = rows.filter((row) => row.status === 'error').length

  return (
    <Surface variant={variant} label={title} className={className}>
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 text-left shadow-sm">
        {/* ---- Heading: what is happening, and how far along ---- */}
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <CloudUpload className="size-5 text-primary" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">
              {rows.length === 0
                ? 'Preparing...'
                : busy > 0
                  ? `${busy} of ${rows.length} still going`
                  : failed > 0
                    ? `${failed} of ${rows.length} could not be uploaded`
                    : `All ${rows.length} uploaded`}
            </p>
          </div>

          {overall === null ? null : (
            <span className="shrink-0 text-base font-semibold text-primary tabular-nums">
              {overall}%
            </span>
          )}
        </div>

        {/* ---- The whole batch as one bar ---- */}
        <ProgressBar percent={overall} className="mt-3" />

        {/* ---- Then each file on its own line ----
            Capped in height so twenty files scroll inside the panel instead
            of pushing it past the bottom of the screen. */}
        {rows.length > 0 ? (
          <ul className="mt-1 max-h-64 divide-y divide-border/60 overflow-y-auto">
            {rows.map((row) => (
              <FileRow key={row.id} row={row} />
            ))}
          </ul>
        ) : null}

        {/* ---- Cancel, only when the screen gave us something to call ---- */}
        {onCancel ? (
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        ) : null}
      </div>
    </Surface>
  )
}

export default FileUploadLoader
