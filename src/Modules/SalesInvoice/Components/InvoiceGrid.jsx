import { Panel } from '@/Components/Common/Panel'
import { cn } from '@/Library/utils'

/**
 * THE SALES INVOICE FORM'S LAYOUT, in one place, so every card lines up the
 * same way.
 *
 * The form shares the screen with the preview, so its columns follow the
 * width of the FORM, not of the window: the workspace marks the form column
 * `@container`, and the grid counts columns against it -
 *
 *   narrower than 24rem   1 column
 *   24rem and up          2 columns
 *   32rem and up          3 columns
 *
 * An ordinary field takes one column. An address or a note takes two
 * (WIDE_FIELD), leaving the third for a field beside it; FULL_FIELD is for
 * the rare thing that genuinely needs the whole row.
 */
export const WIDE_FIELD = '@sm:col-span-1'
export const FULL_FIELD = 'col-span-full'

export function InvoiceGrid({ className, children }) {
  return (
    <div className={cn('grid grid-cols-1 gap-x-3 gap-y-2 @sm:grid-cols-2 @lg:grid-cols-3', className)}>{children}</div>
  )
}

/** A card of the form - the app's Panel, with the padding trimmed so a long form stays short. */
export function InvoiceCard({ className, ...props }) {
  return <Panel className={cn('py-3', className)} {...props} />
}
