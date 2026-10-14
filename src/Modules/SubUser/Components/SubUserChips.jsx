/**
 * The small labels the sub user list and its details are written in: a
 * company, a role, a module - each a Chip, and a run of them a ChipList.
 *
 *   <ChipList items={row.activeModules} max={2} />
 *
 * `max` is for a table cell: that many are shown and the rest become one
 * "+N more" chip, which names them on hover (and on keyboard focus). Without
 * it every item is shown, as in the details. An item is never shown twice.
 *
 *   tone   'brand'    a company
 *          'outline'  a role, a role group
 *          'muted'    a module, a warehouse (the default)
 */

import { Tooltip } from '@/Components/ui/tooltip'
import { cn } from '@/Library/utils'

const TONES = {
  brand: 'bg-brand-soft text-brand dark:bg-brand/15',
  outline: 'border border-border text-foreground',
  muted: 'bg-muted text-muted-foreground',
}

/** One label. Text too long for its place is cut short, and whole on hover. */
export function Chip({ tone = 'muted', className, children, ...props }) {
  return (
    <span
      title={typeof children === 'string' ? children : undefined}
      className={cn(
        'inline-block max-w-full truncate rounded-full px-2 py-0.5 align-middle text-xs font-medium',
        TONES[tone] ?? TONES.muted,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export function ChipList({ items = [], max, tone, empty = '--', className }) {
  const unique = [...new Set(items)]
  if (unique.length === 0) return <span className="text-sm text-muted-foreground">{empty}</span>

  const shown = max ? unique.slice(0, max) : unique
  const rest = unique.slice(shown.length)

  return (
    <span className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {shown.map((item) => (
        <Chip key={item} tone={tone}>
          {item}
        </Chip>
      ))}

      {rest.length > 0 ? (
        <Tooltip text={rest.join(', ')}>
          <Chip tone={tone} tabIndex={0} className="cursor-default">
            +{rest.length} more
          </Chip>
        </Tooltip>
      ) : null}
    </span>
  )
}
