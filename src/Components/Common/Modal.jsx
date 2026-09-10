import { Dialog as DialogPrimitive } from 'radix-ui'
import { XIcon } from 'lucide-react'

import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/Components/ui/dialog'
import { cn } from '@/Library/utils'

/**
 * A reusable modal / popup.
 *
 * You control it with your own state, so it can be opened from anywhere:
 *
 *   const [open, setOpen] = useState(false)
 *
 *   <Modal open={open} onOpenChange={setOpen} title="Terms and Conditions">
 *     ...your content...
 *   </Modal>
 *
 * Everything is optional except `open` and `onOpenChange`:
 *
 *   size                  how wide the box is: xs | sm | md | lg | xl | full
 *   backdrop              what is behind it:   dark | blur | light | none
 *   title                 heading at the top
 *   description           smaller line under the heading
 *   footer                area at the bottom, usually for buttons
 *   showCloseButton       the X in the corner            (default true)
 *   closeOnBackdropClick  clicking outside closes it     (default true)
 *   closeOnEsc            the Escape key closes it       (default true)
 *   scrollable            long content scrolls inside it (default true)
 *   className             extra classes on the box itself
 *
 * Keyboard focus, background scroll locking and returning focus to whatever
 * opened the modal are all handled for you by the underlying Radix dialog.
 */

/* ------------------------------------------------------------------ */
/* The choices you can pass in                                        */
/* ------------------------------------------------------------------ */

// How wide the modal is on a normal screen. On phones every size is
// full width minus a small margin, which is why these only apply from `sm:`.
const SIZES = {
  xs: 'sm:max-w-xs',
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  xxl: 'sm:max-w-6xl',
  full: 'sm:max-w-[calc(100vw-4rem)]',
}

// What the page behind the modal looks like.
const BACKDROPS = {
  dark: 'bg-black/50',
  blur: 'bg-black/40 backdrop-blur-sm',
  light: 'bg-white/70',
  none: 'bg-transparent',
}

/* ------------------------------------------------------------------ */
/* The modal                                                          */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  size = 'md',
  backdrop = 'dark',
  showCloseButton = true,
  closeOnBackdropClick = true,
  closeOnEsc = true,
  scrollable = true,
  className,
  ...props
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} {...props}>
      {/* A portal puts the modal at the end of <body>, so no parent's
          overflow or z-index can ever cut it off. */}
      <DialogPortal>
        {/* ---- The backdrop ---- */}
        <DialogOverlay
          className={cn(
            // A slightly slower fade than the box gives a softer feel.
            'duration-300 ease-out',
            BACKDROPS[backdrop] ?? BACKDROPS.dark,
          )}
        />

        {/* ---- The box ---- */}
        <DialogPrimitive.Content
          className={cn(
            // Position: pinned to the centre of the screen.
            'fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            // Shape.
            'flex w-[calc(100%-2rem)] flex-col gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none',
            // Never taller than the screen.
            'max-h-[calc(100dvh-4rem)]',
            // Opening: fade and grow in. Closing: the reverse.
            // `ease-out` on the way in feels quick then settles;
            // Radix keeps the box mounted until the animation finishes.
            'duration-300 ease-out',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            SIZES[size] ?? SIZES.md,
            className,
          )}
          // When closing on outside click is switched off, cancel the event
          // so Radix leaves the modal open.
          onPointerDownOutside={(event) => {
            if (!closeOnBackdropClick) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (!closeOnEsc) event.preventDefault()
          }}
          // Radix warns when a dialog has no description. This says "there is
          // none, on purpose". When there IS one, DialogDescription wires the
          // link up itself, so we must not set the attribute at all.
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          {/* ---- Heading ----
              A title is always rendered because screen readers need one to
              announce the dialog. If you do not pass one, it is still there
              but hidden from view (`sr-only`). */}
          <div className={cn('space-y-1 text-primary', !title && !description && 'sr-only')}>
            <DialogTitle className={cn(!title && 'sr-only')}>
              {title ?? 'Dialog'}
            </DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </div>

          {/* ---- Your content ----
              `min-h-0` is what lets this shrink inside the flex column so the
              scrollbar appears here rather than on the whole page. */}
          <div className={cn('min-h-0 flex-1', scrollable && 'overflow-y-auto')}>
            {children}
          </div>

          {/* ---- Footer, only when you pass one ---- */}
          {footer ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}

          {/* ---- The X in the corner ---- */}
          {showCloseButton ? (
            <DialogClose
              className="absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:outline-none"
              aria-label="Close"
            >
              <XIcon className="size-4" />
            </DialogClose>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
