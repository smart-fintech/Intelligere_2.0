import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CircleCheck, ImageOff, Printer } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import chequeGuide from '@/Assets/Images/cheque.jpg'
import { CHEQUE_PAGE_SIZE_HINT } from '@/Constants/chequePrinting'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { printChequeImage } from '@/Modules/ChequePrinting/printCheque'

/**
 * One or many cheques, printed one at a time - each goes into the printer by
 * hand, which is why there is no Print All. After a print the next one not yet
 * printed comes up. A printed cheque stays and can be printed again: a browser
 * cannot say whether the dialog was printed from or cancelled.
 *
 *   <ChequeViewer images={urls} />
 *
 * The screen remounts it (`key`) for a new set of cheques.
 */

/** Which way a cheque goes in: the blank cheque, with arrows moving the way it feeds. */
function FeedGuide() {
  return (
    <div className="relative overflow-hidden rounded-md border border-border">
      <img src={chequeGuide} alt="A blank cheque, showing which way it goes into the printer" className="block w-full" />
      {[0, 1, 2].map((second) => (
        <ChevronRight
          key={second}
          aria-hidden="true"
          className="absolute top-1/2 left-0 size-7 -translate-y-1/2 animate-[cheque-feed_3s_linear_infinite] text-foreground opacity-0 motion-reduce:hidden"
          style={{ animationDelay: `${second}s` }}
          strokeWidth={3}
        />
      ))}
    </div>
  )
}

/**
 * A cheque's image, or what stands in for it - only an icon when `compact`, for
 * a thumbnail with no room for words. Keyed on the address by whoever draws it.
 */
export function ChequeImage({ src, alt, compact = false, className }) {
  const [broken, setBroken] = useState(false)

  if (!src || broken) {
    return (
      <div className={cn(className, 'flex flex-col items-center justify-center gap-1 bg-muted/40 text-muted-foreground')}>
        <ImageOff className="size-5" />
        {compact ? null : <span className="text-xs">Image unavailable</span>}
      </div>
    )
  }
  return <img src={src} alt={alt} loading="lazy" className={className} onError={() => setBroken(true)} />
}

export default function ChequeViewer({ images }) {
  const [index, setIndex] = useState(0)
  const [printed, setPrinted] = useState(() => new Set())
  const [printing, setPrinting] = useState(false)

  const current = images[index]
  const allPrinted = images.every((url) => printed.has(url))

  const print = async () => {
    setPrinting(true)
    try {
      await printChequeImage(current)
      const next = new Set(printed).add(current)
      setPrinted(next)
      const waiting = images.findIndex((url) => !next.has(url))
      if (waiting !== -1) setIndex(waiting)
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="space-y-3">
      {allPrinted ? (
        <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-2.5 py-2 text-sm text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
          <CircleCheck className="size-4 shrink-0" />
          {images.length > 1 ? 'All cheques sent to the printer.' : 'Cheque sent to the printer.'}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_3fr]">
        <div className="min-w-0 space-y-1.5">
          <h3 className="text-xs font-medium text-brand-muted">Place the cheque in this way</h3>
          <FeedGuide />
        </div>

        <div className="min-w-0 space-y-1.5">
          <h3 className="text-xs font-medium text-brand-muted">
            Cheque {index + 1} of {images.length}
          </h3>
          <a href={current} target="_blank" rel="noreferrer" title="Open at full size" className="block">
            <ChequeImage key={current} src={current} alt={`Cheque ${index + 1}`} className="block min-h-24 w-full rounded-md border border-border" />
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{CHEQUE_PAGE_SIZE_HINT}</p>

        <div className="ml-auto flex items-center gap-2">
          {images.length > 1 ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                icon={ChevronLeft}
                tooltip="Previous cheque"
                aria-label="Previous cheque"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                icon={ChevronRight}
                tooltip="Next cheque"
                aria-label="Next cheque"
                disabled={index === images.length - 1}
                onClick={() => setIndex(index + 1)}
              />
            </>
          ) : null}
          <Button type="button" variant="secondary" size="sm" icon={Printer} loading={printing} onClick={print}>
            {printed.has(current) ? 'Print Again' : 'Print Cheque'}
          </Button>
        </div>
      </div>

      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto p-0.5" aria-label="All cheques">
          {images.map((url, position) => (
            <li key={url} className="relative w-28 shrink-0">
              <button
                type="button"
                aria-label={`Show cheque ${position + 1}`}
                aria-current={position === index || undefined}
                onClick={() => setIndex(position)}
                className={cn(
                  'block w-full cursor-pointer overflow-hidden rounded-md border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  position === index ? 'border-brand ring-2 ring-brand/30' : 'border-border hover:border-brand/50',
                )}
              >
                <ChequeImage compact src={url} alt="" className="block h-14 w-full object-cover" />
              </button>
              {printed.has(url) ? (
                <span className="pointer-events-none absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Check className="size-3" strokeWidth={3} aria-label="Printed" />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
