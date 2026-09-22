import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { Input } from '@/Components/ui/input'
import { cn } from '@/Library/utils'

/**
 * [-] [ 5 ] [+] - a whole number between `min` and `max`.
 *
 * The box can be typed in. What is typed is kept as text while the user is
 * typing (so clearing it to type "12" works), and only a whole number within
 * the limits is handed up - no minus sign, no decimals, no letters. Leaving
 * the box puts the last valid number back. Arrow Up/Down step it too.
 *
 *   label       what the number counts, for screen readers ("companies", "E-Invoice")
 *   appearance  'default', or 'classic' - the old payment page's plain -/+
 *               and grey number box
 */
export function NumberStepper({
  value,
  onChange,
  min = 0,
  max,
  label,
  size = 'default',
  appearance = 'default',
  className,
}) {
  const [draft, setDraft] = useState(null)
  const shown = draft ?? String(value)
  const compact = size === 'sm'
  const classic = appearance === 'classic'
  const buttonVariant = classic ? 'ghost' : 'outline'

  const commit = (text) => {
    if (!/^\d+$/.test(text)) return
    const number = Number(text)
    if (number >= min && number <= max) onChange(number)
  }

  const invalid = draft !== null && (!/^\d+$/.test(draft) || Number(draft) < min || Number(draft) > max)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        type="button"
        variant={buttonVariant}
        size={compact || classic ? 'icon-sm' : 'icon'}
        aria-label={`Decrease ${label}`}
        icon={Minus}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      />

      <Input
        type="text"
        inputMode="numeric"
        aria-label={label}
        className={cn(
          'text-center font-semibold',
          classic
            ? 'h-8 w-20 border-0 bg-muted text-sm text-brand shadow-sm read-only:bg-muted'
            : compact
              ? 'h-8 w-20 text-sm'
              : 'w-20 text-base',
        )}
        value={shown}
        onChange={(event) => {
          const text = event.target.value.replace(/\D/g, '').slice(0, String(max).length)
          setDraft(text)
          commit(text)
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') onChange(Math.min(max, value + 1))
          if (event.key === 'ArrowDown') onChange(Math.max(min, value - 1))
        }}
        aria-invalid={invalid}
      />

      <Button
        type="button"
        variant={buttonVariant}
        size={compact || classic ? 'icon-sm' : 'icon'}
        aria-label={`Increase ${label}`}
        icon={Plus}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      />
    </div>
  )
}
