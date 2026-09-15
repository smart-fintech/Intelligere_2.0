/**
 * The spinning ring, and nothing else.
 *
 * This is the only place in the project that draws a spinner. The three
 * loaders in this folder all use it, so if the look of "something is
 * happening" ever changes, it changes here once.
 *
 * You will rarely import this directly - reach for <Loader /> instead. It is
 * exported for the odd case where a spinner has to sit inside something that
 * already has its own layout. A button is NOT one of those: Button has a
 * `loading` prop that draws this spinner and disables it for you -
 *
 *   <Button type="submit" loading={saving}>Save</Button>
 *
 * Props:
 *   size       xs | sm | md | lg | xl        (default md)
 *   className  extra classes - `text-*` sets the colour, because the ring
 *              is drawn in currentColor
 */

import { cn } from '@/Library/utils'

const SIZES = {
  xs: 'size-4 [stroke-width:3]',
  sm: 'size-5 [stroke-width:2.75]',
  md: 'size-8 [stroke-width:2.5]',
  lg: 'size-12 [stroke-width:2.25]',
  xl: 'size-16 [stroke-width:2]',
}

export default function Spinner({ size = 'md', className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      // `aria-hidden` because the loader around it already announces itself
      // to screen readers. Without this the ring would be read out twice.
      aria-hidden="true"
      className={cn('shrink-0 animate-spin text-primary', SIZES[size] ?? SIZES.md, className)}
    >
      {/* The faint full ring: the track the bright arc runs along. */}
      <circle cx="12" cy="12" r="10" stroke="currentColor" className="opacity-20" />

      {/* A quarter of that ring, drawn solid. Spinning the whole svg is what
          turns this into motion. */}
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  )
}
