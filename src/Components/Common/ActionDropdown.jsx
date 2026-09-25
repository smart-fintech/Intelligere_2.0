import { ChevronDown } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/Components/ui/dropdown-menu'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'

/**
 * One button, several actions behind it.
 *
 *   <ActionDropdown
 *     label="Add Ledger"
 *     options={[
 *       { label: 'Add Ledger Group', value: 'ledger_group' },
 *       { label: 'Add Ledger Creation', value: 'ledger_creation' },
 *     ]}
 *     onSelect={handleLedgerAction}
 *   />
 *
 *   const handleLedgerAction = (value) => { ...the screen's own business... }
 *
 * It is the app's <Button> with the shared dropdown menu under it, so it
 * looks like every other button on the page and takes the same props -
 * `variant`, `size`, `icon`, `loading`, `disabled`, `className`.
 *
 * ------------------------------------------------------------------
 * IT ONLY REPORTS WHAT WAS CHOSEN
 * ------------------------------------------------------------------
 * No screen's logic lives in here and it keeps no state of its own: it draws
 * the options and calls `onSelect` with the chosen `value`. What that value
 * means - a modal, a request, a route - is entirely the caller's, which is
 * what lets the same button serve ledgers today and anything else tomorrow.
 *
 * An option a page should not offer yet is simply left out of `options`
 * (that is how the Ledger page hides "Add Ledger Group" from a user who is
 * not on Tally), or passed with `disabled: true` to show it greyed out.
 *
 * Props:
 *   label      the button's text
 *   options    [{ label, value, icon?, disabled?, description?, variant? }]
 *              `variant: 'destructive'` draws that one option in red
 *   onSelect   (value, option) => void
 *   menuLabel  a small heading above the options. Optional
 *   align      which edge the menu lines up with: 'end' (default) | 'start'
 *   Everything else goes to <Button>.
 */
export function ActionDropdown({
  label,
  options = [],
  onSelect,
  menuLabel,
  align = 'end',
  disabled = false,
  className,
  children,
  ...buttonProps
}) {
  // Nothing to choose from: the button would open an empty box.
  if (options.length === 0) return null

  return (
    <DropdownMenu>
      {/* `asChild` hands the trigger's behaviour to our own Button, so this
          is the app's button in every way - not a second button style. */}
      <DropdownMenuTrigger asChild disabled={disabled}>
        {/* `group` is what lets the chevron below see the trigger's open
            state: Radix puts data-state on this button, and the icon styles
            itself from it. */}
        <Button type="button" disabled={disabled} className={cn('group', className)} {...buttonProps}>
          {label ?? children}
          {/* Turns over when the menu is open - the usual dropdown tell. */}
          <ChevronDown className="transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align}>
        {menuLabel ? (
          <>
            <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}

        {options.map((option) => {
          const Icon = option.icon

          return (
            <DropdownMenuItem
              key={option.value}
              disabled={option.disabled}
              variant={option.variant}
              onSelect={() => onSelect?.(option.value, option)}
            >
              {Icon ? <Icon /> : null}

              <span className="flex min-w-0 flex-col">
                <span className="truncate">{option.label}</span>
                {option.description ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ActionDropdown
