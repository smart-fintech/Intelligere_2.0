import { useState } from 'react'
import { Star } from 'lucide-react'

import { cn } from '@/Library/utils'

/**
 * A rating as a row of stars - to choose one, or just to show one.
 *
 *   <StarRating label="Product Quality" half value={form.quality}
 *               onChange={(rating) => setField('quality', rating)} />
 *
 *   <StarRating label="Product Quality" value={row.quality} readOnly size="sm" />
 *
 * Props:
 *   value      the rating, a number from 0 (none) to `max`
 *   onChange   called with the rating that was chosen, always a NUMBER -
 *              3 for the third star, 3.5 for three and a half
 *   max        how many stars there are                       (default 5)
 *   half       let half stars be chosen: 0.5, 1, 1.5 ... `max`. Without it
 *              only whole stars can be.
 *   label      what is being rated - read out by a screen reader, since the
 *              stars themselves say nothing. The visible label is the
 *              caller's to draw, beside it.
 *   readOnly   show the rating without letting it be changed
 *   disabled   as on any control - while a form is saving, say
 *   invalid    marks it as failing validation
 *   size       'md' in a form (default), 'sm' in a table or a popover
 *
 * CHOOSING
 *   Click a star for that many. With `half`, the LEFT half of a star is the
 *   half below it - the left of the fourth star is 3.5, its right is 4 - and
 *   the row previews what a click would give as the pointer moves over it.
 *
 * A HALF IS ALWAYS DRAWN
 *   Whether or not halves can be chosen, a rating that arrives as 3.5 is
 *   shown as three and a half stars, so what is saved is what is seen.
 *
 * ACCESSIBILITY
 *   It is a slider: one tab stop, the arrow keys move the rating one step up
 *   or down (Home and End jump to the ends), and it is announced as "Product
 *   Quality, 3.5 out of 5". Read-only, it is a single image saying the same.
 */

const SIZES = {
  sm: 'size-3.5',
  md: 'size-5',
}

/** How much of one star is filled, 0 to 1 - the third star of a 2.5 rating is half. */
const fillOf = (rating, star) => Math.max(0, Math.min(1, rating - (star - 1)))

export function StarRating({
  value = 0,
  onChange,
  max = 5,
  half = false,
  label,
  readOnly = false,
  disabled = false,
  invalid = false,
  size = 'md',
  className,
}) {
  // The rating under the pointer, so the row previews what a click would give.
  const [hover, setHover] = useState(0)

  const rating = Number(value) || 0
  const stars = Array.from({ length: max }, (_, index) => index + 1)

  if (readOnly) {
    return (
      <span
        role="img"
        aria-label={`${label ? `${label}: ` : ''}${rating} out of ${max}`}
        className={cn('inline-flex items-center gap-0.5 align-middle', className)}
      >
        {stars.map((star) => (
          <StarShape key={star} fill={fillOf(rating, star)} size={size} />
        ))}
      </span>
    )
  }

  // The smallest change there is, and so the lowest rating that can be chosen.
  const step = half ? 0.5 : 1

  /** The rating the pointer is on: this star, or - on its left half - the half below it. */
  const ratingAt = (event, star) => {
    if (!half) return star

    const box = event.currentTarget.getBoundingClientRect()
    return event.clientX - box.left < box.width / 2 ? star - 0.5 : star
  }

  /** Arrow keys: one step up or down. Home and End: the lowest and the highest. */
  const handleKeyDown = (event) => {
    let next = null

    // From a rating between two steps (a saved 3.5, whole stars only) the
    // next one up is 4 and the next one down is 3.
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.floor(rating / step) * step + step
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.ceil(rating / step) * step - step
    else if (event.key === 'Home') next = step
    else if (event.key === 'End') next = max

    if (next === null) return

    event.preventDefault()
    onChange?.(Math.min(max, Math.max(step, next)))
  }

  const shown = hover || rating

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={rating}
      aria-valuetext={`${rating} out of ${max}`}
      aria-disabled={disabled || undefined}
      aria-invalid={invalid || undefined}
      className={cn(
        'inline-flex items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      onMouseLeave={() => setHover(0)}
      onKeyDown={handleKeyDown}
    >
      {stars.map((star) => (
        <span
          key={star}
          className="cursor-pointer p-0.5"
          onClick={(event) => onChange?.(ratingAt(event, star))}
          onMouseMove={(event) => setHover(ratingAt(event, star))}
        >
          <StarShape fill={fillOf(shown, star)} size={size} />
        </span>
      ))}
    </div>
  )
}

/**
 * One star: a grey outline, with the gold one laid over it and cut off at
 * `fill` of its width - which is all a half star is.
 */
function StarShape({ fill, size }) {
  const box = SIZES[size] ?? SIZES.md

  return (
    <span aria-hidden="true" className={cn('relative block shrink-0', box)}>
      <Star className={cn(box, 'text-muted-foreground/40')} />

      {fill > 0 ? (
        <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
          {/* Its own full size, not the clipped box's - or it would shrink
              instead of being cut. */}
          <Star className={cn(box, 'max-w-none fill-amber-400 text-amber-400')} />
        </span>
      ) : null}
    </span>
  )
}
