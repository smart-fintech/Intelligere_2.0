import { useState } from 'react'
import { Check, Eye, ImageOff } from 'lucide-react'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'

/**
 * AN IMAGE SHOWN SMALL, WITH AN EYE TO SEE IT LARGE.
 *
 *   <ImageThumbnail src={url} title="Format 1" />                 look only
 *
 *   <ImageThumbnail src={url} title="Format 1"                    one of a
 *                   selected={value === '1'}                       set to pick
 *                   onSelect={() => setValue('1')} />              from
 *
 *   <ImagePreviewModal open={open} onOpenChange={setOpen}         the large
 *                      src={url} title="Format 1" />              view alone
 *
 * The thumbnail shows the top of the image - enough to recognise a document -
 * at a fixed size, so a row of them lines up whatever the images' own sizes.
 * The eye in its top-right corner opens the whole image in a modal, scaled to
 * fit the screen without cropping.
 *
 * WITH `onSelect` the card itself is the choice: clicking it calls onSelect,
 * the chosen one gets a brand border and a tick, and it announces itself as a
 * radio - so put a set of them inside an element with role="radiogroup".
 * Without `onSelect`, clicking the card opens the preview, like the eye.
 *
 * AN IMAGE THAT FAILS TO LOAD shows "Preview unavailable" in its place and
 * its eye is switched off; nothing around it is affected.
 */

/* ------------------------------------------------------------------ */
/* The large view                                                     */
/* ------------------------------------------------------------------ */

export function ImagePreviewModal({ open, onOpenChange, src, title }) {
  // Keyed on the address, so a different image starts out unbroken.
  const [failedSrc, setFailedSrc] = useState(null)
  const broken = failedSrc === src

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title || 'Preview'}
      // The widest dialog short of edge-to-edge, with tighter padding and no
      // footer - the X closes it - so the image gets nearly all of the box.
      size="md"
      className="gap-3 p-4 sm:p-5"
      // Nothing to type in; focus the box itself rather than the X.
      autoFocus={false}
    >
      <div className="flex min-h-48 items-center justify-center rounded-md bg-muted/40">
        {src && !broken ? (
          // object-contain: the whole image, at its own proportions, never
          // cropped. Its height is what is left of the screen once the
          // dialog's margin, padding and title are taken off, so a tall
          // invoice fits without the box scrolling.
          <img
            src={src}
            alt={title || 'Preview'}
            className="mx-auto block max-h-[calc(100dvh-9rem)] w-auto max-w-full object-contain"
            onError={() => setFailedSrc(src)}
          />
        ) : (
          <BrokenImage />
        )}
      </div>
    </Modal>
  )
}

/** What stands in for an image that could not be loaded. */
function BrokenImage({ compact = false }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 p-3 text-center text-muted-foreground">
      <ImageOff className={compact ? 'size-5' : 'size-8'} />
      <span className="text-xs">Preview unavailable</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The thumbnail                                                      */
/* ------------------------------------------------------------------ */

/**
 * Props:
 *   src        the image address
 *   title      the caption under it, and the modal's heading
 *   selected   true for the chosen card of a set
 *   onSelect   makes the card a choice - see above
 *   disabled   the card cannot be chosen (the eye still works)
 *   className  extra classes on the card - a width, usually
 */
export function ImageThumbnail({ src, title, selected = false, onSelect, disabled = false, className }) {
  const [previewing, setPreviewing] = useState(false)
  const [failedSrc, setFailedSrc] = useState(null)
  const broken = !src || failedSrc === src
  const selectable = typeof onSelect === 'function'

  const handleCardClick = () => {
    if (selectable) {
      if (!disabled) onSelect()
    } else if (!broken) {
      setPreviewing(true)
    }
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-md border bg-card shadow-xs transition-colors',
        selected ? 'border-brand ring-2 ring-brand/30' : 'border-border',
        selectable && !disabled && !selected && 'hover:border-brand/50',
        className,
      )}
    >
      {/* The card: the choice when selectable, otherwise the preview. The eye
          is a sibling rather than a child, as a button cannot hold a button. */}
      <button
        type="button"
        onClick={handleCardClick}
        disabled={selectable ? disabled : broken}
        role={selectable ? 'radio' : undefined}
        aria-checked={selectable ? selected : undefined}
        aria-label={selectable ? title : `Preview ${title || 'image'}`}
        className={cn(
          // ring-inset: the card clips its rounded corners, which would
          // otherwise clip the focus ring too.
          'block w-full text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset',
          'cursor-pointer disabled:cursor-default',
        )}
      >
        <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-muted/40">
          {broken ? (
            <BrokenImage compact />
          ) : (
            // object-top: an invoice is recognised by its heading, so that is
            // the part a small card keeps.
            <img
              src={src}
              alt=""
              loading="lazy"
              className="size-full object-cover object-top"
              onError={() => setFailedSrc(src)}
            />
          )}
        </div>

        {title ? (
          <div
            className={cn(
              'flex items-center justify-between gap-1 border-t px-2 py-1 text-xs font-medium',
              selected ? 'border-brand/30 bg-brand-soft text-brand dark:bg-brand/15' : 'border-border text-foreground',
            )}
          >
            <span className="truncate">{title}</span>
            {selected ? <Check className="size-3.5 shrink-0" strokeWidth={3} /> : null}
          </div>
        ) : null}
      </button>

      {/* The eye: always reachable, even on a card that cannot be chosen. */}
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        icon={Eye}
        tooltip="Preview"
        aria-label={`Preview ${title || 'image'}`}
        disabled={broken}
        onClick={() => setPreviewing(true)}
        className="absolute top-1 right-1 bg-card/90 text-brand shadow-sm backdrop-blur-sm"
      />

      <ImagePreviewModal open={previewing} onOpenChange={setPreviewing} src={src} title={title} />
    </div>
  )
}
