import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import { cn } from '@/Library/utils'

/**
 * THE VIEW SWITCH - the radio buttons a screen's views are chosen with, in
 * one bordered strip, the chosen one tinted: Sales Invoice's Create
 * Document / History / Voucher, the Inventory tab's Product / Custom Report
 * / Expired Products.
 *
 *   <ViewSwitch
 *     options={[{ value: 'create', label: 'Create Document' }, ...]}
 *     value={view}
 *     onValueChange={setView}
 *     label="Sales Invoice view"
 *     idPrefix="view"
 *   />
 *
 *   options        [{ value, label }]
 *   label          what the group is, for a screen reader
 *   idPrefix       each button's id is `${idPrefix}-${value}` - unique on the page
 *   className      optional - the strip's place in its screen
 */
export function ViewSwitch({ options, value, onValueChange, label, idPrefix, className }) {
  return (
    <RadioGroup
      value={value}
      onValueChange={onValueChange}
      aria-label={label}
      className={cn(
        'flex flex-wrap items-center justify-center gap-2 rounded-lg border border-border bg-card p-1 shadow-xs',
        className,
      )}
    >
      {options.map((option) => (
        <Label
          key={option.value}
          htmlFor={`${idPrefix}-${option.value}`}
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
            value === option.value ? 'bg-brand-soft font-semibold text-brand' : 'text-muted-foreground hover:text-brand',
          )}
        >
          <RadioGroupItem id={`${idPrefix}-${option.value}`} value={option.value} />
          {option.label}
        </Label>
      ))}
    </RadioGroup>
  )
}

export default ViewSwitch
