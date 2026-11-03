/**
 * The look of the entry cards (EntryCard - the voucher view), which keep the
 * old app's design: grey filled boxes with a soft shadow, small pale-blue
 * labels, a blue border. Everything else on the screen uses the project's
 * shared components; only the cards read these.
 */

/** The small label above a box in an entry. */
export const label = 'mb-1 block text-xs leading-tight text-[#8ba5c1] dark:text-brand-muted'

/** A grey filled box - read-only or typed into. */
export const box =
  'h-8 w-full min-w-0 rounded-md border-0 bg-[#e9ecef] px-2 text-[15px] text-[#212529] shadow-[0_1px_3px_rgba(0,0,0,0.2)] outline-none placeholder:text-[#8d9298] focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed dark:bg-muted dark:text-foreground'

/**
 * A SelectField drawn as one of those boxes. The field is the project's own;
 * only its trigger is restyled, through its data-slot.
 */
export const selectBox =
  '[&_[data-slot=select-trigger]]:h-8 [&_[data-slot=select-trigger]]:rounded-md [&_[data-slot=select-trigger]]:border-0 [&_[data-slot=select-trigger]]:bg-[#e9ecef] [&_[data-slot=select-trigger]]:px-2 [&_[data-slot=select-trigger]]:text-[15px] [&_[data-slot=select-trigger]]:text-[#212529] [&_[data-slot=select-trigger]]:shadow-[0_1px_3px_rgba(0,0,0,0.2)] [&_[data-slot=select-trigger]]:data-[placeholder]:text-[#8d9298] dark:[&_[data-slot=select-trigger]]:bg-muted dark:[&_[data-slot=select-trigger]]:text-foreground'

/** The same, without the arrow: the ledger of an entry reads as a box to click. */
export const selectBoxPlain = `${selectBox} [&_[data-slot=select-trigger]>svg:last-child]:hidden`

/** The blue outline button used all over the old screen. */
export const outlineButton =
  'inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-brand bg-transparent px-3 text-sm font-normal text-brand transition-colors hover:bg-brand hover:text-brand-foreground disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-brand'

/** Its red twin, for Delete. */
export const outlineDanger =
  'inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-[#dc3545] bg-transparent px-3 text-[#dc3545] transition-colors hover:bg-[#dc3545] hover:text-white disabled:cursor-not-allowed disabled:opacity-60'
