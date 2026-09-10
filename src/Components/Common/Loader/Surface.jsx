/**
 * WHERE a loader sits on the screen.
 *
 * All three loaders in this folder answer the same question - "how much of
 * the screen am I covering?" - so the answer lives here once and each loader
 * just passes a `variant` through.
 *
 * The variants:
 *
 *   inline      A row: spinner and text side by side, taking only the space
 *               it needs. For a table cell, a list row, next to a button.
 *
 *   section     Centred inside whatever box it is in, with breathing room
 *               above and below. For a card body waiting on its data.
 *
 *   page        Centred in the main content area of a shell page. This is
 *               the usual choice for "the page's data has not arrived yet".
 *
 *   overlay     Covers the nearest positioned parent with a translucent
 *               sheet, so the content stays visible but greyed out and
 *               unclickable underneath. The parent MUST have `relative`
 *               on it, or the sheet will escape to the whole window.
 *               Use it when a form is saving and you do not want the fields
 *               replaced, only frozen.
 *
 *   fullscreen  Covers the entire window, above everything. For blocking
 *               work the user must wait out - signing in, a redirect, a
 *               file that must finish uploading. Page scrolling is locked
 *               while it is on screen.
 *
 * This file is internal to the Loader folder - screens import Loader,
 * ProgressLoader or FileUploadLoader, never this.
 */

import { useEffect } from 'react'

import { cn } from '@/Library/utils'

const VARIANTS = {
  inline: 'inline-flex flex-row items-center gap-2',
  section: 'flex w-full flex-col items-center justify-center gap-3 px-4 py-10',
  page: 'flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 p-6',
  overlay:
    'absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-[inherit] bg-background/70 p-6 backdrop-blur-[2px]',
  fullscreen:
    'fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background/85 p-6 backdrop-blur-sm',
}

export default function Surface({ variant = 'section', label, className, children }) {
  const blocking = variant === 'fullscreen'

  // A full screen loader sits over the page, so the page must not scroll
  // behind it. The class is put back the moment the loader unmounts, whether
  // the work succeeded or failed.
  useEffect(() => {
    if (!blocking) return

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [blocking])

  return (
    <div
      // `status` + `polite` makes a screen reader announce the label once,
      // without interrupting whatever it is currently reading.
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={typeof label === 'string' && label ? label : 'Loading'}
      className={cn(
        'text-center',
        // Fades in rather than snapping in, so a fast response does not
        // flash a loader at the user.
        'animate-in fade-in-0 duration-200',
        VARIANTS[variant] ?? VARIANTS.section,
        className,
      )}
    >
      {children}
    </div>
  )
}
