import { cn } from '@/Library/utils'
import { outlineButton, outlineDanger } from '@/Modules/BankStatement/bankStatementStyles'

/**
 * The red "are you sure" line the old screen showed in place, under what it
 * asks about. `danger` makes the confirm button red, for a delete.
 */
export default function InlineConfirm({ message, confirmLabel, danger, onCancel, onConfirm }) {
  return (
    <div role="alert" className="mt-2 text-right">
      <p className={cn('mb-2 text-[#dc3545]', danger ? 'text-sm' : 'text-xs')}>{message}</p>
      <div className="inline-flex gap-2">
        <button type="button" className={cn(outlineButton, 'h-8 text-xs')} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={cn(danger ? outlineDanger : outlineButton, 'h-8 text-xs')} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}
