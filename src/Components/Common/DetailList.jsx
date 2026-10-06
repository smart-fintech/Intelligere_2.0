import { fieldLabelClass } from '@/Components/Common/FormFields'
import { cn } from '@/Library/utils'
import { orDash } from '@/Utils/display'

/**
 * Saved values, read-only, as label | value rows - the "view" side of a
 * record that also has a form.
 *
 *   <DetailList>
 *     <DetailItem label="Company Name">{record.company}</DetailItem>
 *     <DetailItem label="Barcode"><YesNo value={record.barcode} /></DetailItem>
 *   </DetailList>
 *
 * From `sm` up each row is the label on the left and the value beside it,
 * which keeps a dozen values to a dozen short lines; on a phone the label
 * sits above its value instead, so neither is squeezed.
 *
 * The label wears the same lettering as a form field's label, so switching a
 * record between viewing and editing does not change how it reads. A value
 * the backend has not filled in shows as "--" (see orDash).
 */
export function DetailList({ className, children }) {
  return <dl className={cn('grid grid-cols-2 divide-y divide-border rounded-md border border-border', className)}>{children}</dl>
}

export function DetailItem({ label, className, children }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-center sm:gap-4',
        className,
      )}
    >
      <dt className={fieldLabelClass}>{label}</dt>
      <dd className="min-w-0 text-sm font-medium break-words text-foreground">
        {typeof children === 'string' || typeof children === 'number' || children == null
          ? orDash(children)
          : children}
      </dd>
    </div>
  )
}

/**
 * A boolean as a small pill - green for true, grey for false. Yes / No
 * unless told otherwise:  <YesNo value={row.is_active} yes="Active" no="Inactive" />
 */
export function YesNo({ value, yes = 'Yes', no = 'No' }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        value
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {value ? yes : no}
    </span>
  )
}
