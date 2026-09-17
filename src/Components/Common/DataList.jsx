import { AlertCircle, Pencil, RefreshCw, Trash2 } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { Skeleton } from '@/Components/ui/skeleton'
import { cn } from '@/Library/utils'

/**
 * The pieces every list page shares: what it shows while loading, what it
 * shows when there is nothing to show or something failed, and the buttons
 * on each row.
 *
 * Bank Details and Ledger Details both use all of them, so they live here
 * rather than being copied into each - the two lists then look the same
 * without anyone having to keep them in step.
 */

/**
 * The shape of a table, drawn while the real rows are on their way.
 *
 * `rows` is how many placeholder lines to draw - roughly what the page
 * expects to receive, so the card does not jump when the data lands.
 */
export function ListSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-4 py-2">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4">
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-32 sm:block" />
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  )
}

/**
 * A message in the middle of a card - an empty list, or one that failed.
 *
 *   <StateMessage icon={AlertCircle} tone="error" title="Could not load"
 *                 action={<RetryButton onClick={retry} />}>
 *     {error}
 *   </StateMessage>
 *
 * `tone` is 'muted' for an ordinary empty state and 'error' for a failure,
 * which is the only difference in how it is coloured.
 */
export function StateMessage({ icon: Icon, tone = 'muted', title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span
        className={cn(
          'mb-4 flex size-12 items-center justify-center rounded-full',
          tone === 'error'
            ? 'bg-destructive/10 text-destructive'
            : 'bg-brand-soft text-brand dark:bg-brand/15',
        )}
      >
        <Icon className="size-6" />
      </span>

      <p className={cn('font-medium', tone === 'error' ? 'text-destructive' : 'text-foreground')}>
        {title}
      </p>

      {children ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</p>
      ) : null}

      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/**
 * A one-line problem shown ABOVE content that is still usable - a refresh
 * that failed while the old rows are still on screen, a dropdown whose
 * options could not be loaded. (When there is nothing left to show, use
 * StateMessage instead.)
 *
 *   <InlineAlert action={<RetryButton onClick={reload} />}>{error}</InlineAlert>
 */
export function InlineAlert({ action, children }) {
  return (
    <div
      role="alert"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
    >
      <AlertCircle className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  )
}

/**
 * The Retry button. Nothing in this app retries a failed request on its own
 * - this is the only way, which is why it is one component everywhere.
 */
export function RetryButton({ onClick, label = 'Retry' }) {
  return (
    <Button type="button" variant="outline" size="sm" icon={RefreshCw} onClick={onClick}>
      {label}
    </Button>
  )
}

/**
 * The Edit and Delete buttons on one row.
 *
 * Edit uses the blue action style and Delete the red destructive one - the
 * same two looks as every other Save and Delete button in the app, at icon
 * size.
 *
 * `label` names the record for screen readers - "Edit HDFC Bank" rather than
 * a page of identical "Edit" buttons. `onEdit` and `onDelete` are called with
 * no arguments; the caller already knows which row it drew.
 */
export function RowActions({ label, onEdit, onDelete }) {
  return (
    <div className="flex justify-end gap-1.5">
      <Button
        type="button"
        variant='iconEdit'
        size="icon-sm"
        tooltip="Edit"
        aria-label={`Edit ${label}`}
        icon={Pencil}
        onClick={onEdit}
      />

      <Button
        type="button"
        variant="iconDelete"
        size="icon-sm"
        tooltip="Delete"
        aria-label={`Delete ${label}`}
        icon={Trash2}
        onClick={onDelete}
      />
    </div>
  )
}
