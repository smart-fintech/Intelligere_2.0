/**
 * The bookkeeping behind <FileUploadLoader />.
 *
 * Keeping "which file is at what percent" in a screen's own useState is the
 * bit that ends up rewritten on every upload page, so it lives here instead.
 * The hook holds the list, and hands you the axios options that keep it up
 * to date.
 *
 *   const upload = useUploadProgress()
 *
 *   const send = async (picked) => {
 *     upload.start(picked)                 // a FileList or an array of File
 *
 *     for (const file of picked) {
 *       const body = new FormData()
 *       body.append('file', file)
 *       try {
 *         // `track` returns { onUploadProgress }, so spread anything else in:
 *         //   api.post(url, body, { ...upload.track(file), params: { id } })
 *         await api.post('mail/upload/', body, upload.track(file))
 *         upload.done(file)
 *       } catch (error) {
 *         upload.fail(file, error.message)
 *       }
 *     }
 *
 *     upload.reset()                       // hide the panel once finished
 *   }
 *
 *   {upload.active ? <FileUploadLoader variant="fullscreen" files={upload.files} /> : null}
 *
 * What you get back:
 *   files    the array to hand straight to <FileUploadLoader />
 *   active   true from `start` until `reset` - use it to show the panel
 *   start    (files) begin tracking a batch; replaces any previous one
 *   track    (file) axios options that report that file's progress
 *   set      (file, percent) for uploads that are not axios
 *   done     (file) mark it finished
 *   fail     (file, message) mark it failed, with the reason to display
 *   reset    () clear everything and hide the panel
 */

import { useCallback, useRef, useState } from 'react'

import { uploadPercent } from './helpers'

/**
 * Files are matched by name and size rather than by identity, because a
 * FormData round trip or a re-render can leave you holding a different
 * object for the same file.
 */
const keyOf = (file) => `${file?.name ?? 'file'}:${file?.size ?? 0}`

export function useUploadProgress() {
  const [files, setFiles] = useState([])
  const [active, setActive] = useState(false)

  // The abort controllers of the calls in flight, so `cancel` can stop them.
  const controllers = useRef(new Map())

  /** Changes one file in the list, leaving the rest untouched. */
  const patch = useCallback((file, changes) => {
    const key = keyOf(file)
    setFiles((current) =>
      current.map((row) => (row.id === key ? { ...row, ...changes } : row)),
    )
  }, [])

  const start = useCallback((picked) => {
    // A FileList is not an array, so it is spread into one first.
    const list = Array.from(picked ?? [])

    controllers.current.clear()
    setFiles(
      list.map((file) => ({
        id: keyOf(file),
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'pending',
      })),
    )
    setActive(list.length > 0)
  }, [])

  const track = useCallback(
    (file) => {
      const controller = new AbortController()
      controllers.current.set(keyOf(file), controller)

      return {
        signal: controller.signal,
        onUploadProgress: (event) =>
          patch(file, { progress: uploadPercent(event), status: 'uploading' }),
      }
    },
    [patch],
  )

  const set = useCallback(
    (file, percent) => patch(file, { progress: percent, status: 'uploading' }),
    [patch],
  )

  const done = useCallback(
    (file) => patch(file, { progress: 100, status: 'success', error: undefined }),
    [patch],
  )

  const fail = useCallback(
    (file, message) => patch(file, { status: 'error', error: message }),
    [patch],
  )

  /** Stops every request still in flight. Pass this to the panel's onCancel. */
  const cancel = useCallback(() => {
    controllers.current.forEach((controller) => controller.abort())
    controllers.current.clear()
    setActive(false)
  }, [])

  const reset = useCallback(() => {
    controllers.current.clear()
    setFiles([])
    setActive(false)
  }, [])

  return { files, active, start, track, set, done, fail, cancel, reset }
}

export default useUploadProgress
