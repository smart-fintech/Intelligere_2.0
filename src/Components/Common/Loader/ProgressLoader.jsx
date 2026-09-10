/**
 * LOADER 2 OF 3 - the one that counts.
 *
 * "Something is happening and I know exactly how far along it is."
 * Use it whenever a real number is available: a report being generated
 * step by step, a multi-stage import, a long download.
 *
 * If you do NOT have a number, use <Loader /> instead. A percentage that
 * sits at 0 or jumps about is worse than an honest spinner.
 *
 * Use it:
 *   import { ProgressLoader } from '@/Components/Common/Loader'
 *
 *   // a ring in the middle of the page
 *   <ProgressLoader variant="page" value={percent} label="Preparing your report" />
 *
 *   // a slim bar under a heading
 *   <ProgressLoader shape="bar" value={percent} label="Syncing companies" />
 *
 *   // blocking the window until it finishes
 *   <ProgressLoader variant="fullscreen" value={percent} label="Please wait"
 *                   description="Do not close this tab." />
 *
 * Counting steps rather than percent? Pass them and the percentage is
 * worked out for you:
 *
 *   <ProgressLoader value={done} max={total} label="Step 3 of 8" />
 *
 * Do not know the number YET? Pass value={null} and it shows a moving
 * stripe instead of a false figure, then switches to real counting the
 * moment a number arrives.
 *
 * Props:
 *   value        0-100 by default, or 0-`max`. null/undefined = unknown.
 *   max          what `value` counts up to. Default 100.
 *   shape        circle | bar         (default circle)
 *   variant      inline | section | page | overlay | fullscreen (default section)
 *   label        the line under the indicator
 *   description  a fainter second line
 *   size         xs | sm | md | lg | xl - the ring's diameter
 *   showValue    print the number too. Default true.
 *   show         render only when true. Default true.
 *   className    extra classes on the wrapper
 */

import { cn } from '@/Library/utils'

import { toPercent } from './helpers'
import Spinner from './Spinner'
import Surface from './Surface'

/* ------------------------------------------------------------------ */
/* The ring                                                            */
/* ------------------------------------------------------------------ */

// Diameter of the ring, and how big the number inside it is.
const RING_SIZES = {
  xs: { box: 40, stroke: 4, text: 'text-[10px]' },
  sm: { box: 56, stroke: 5, text: 'text-xs' },
  md: { box: 76, stroke: 6, text: 'text-sm' },
  lg: { box: 104, stroke: 7, text: 'text-lg' },
  xl: { box: 136, stroke: 8, text: 'text-2xl' },
}

function Ring({ percent, size, showValue }) {
  const { box, stroke, text } = RING_SIZES[size] ?? RING_SIZES.md

  // The circle is drawn inside the box with half the stroke kept clear on
  // every side, otherwise the thick line would be clipped at the edges.
  const radius = (box - stroke) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div className="relative shrink-0" style={{ width: box, height: box }}>
      {/* Rotated so the fill starts at 12 o'clock rather than 3 o'clock. */}
      <svg width={box} height={box} aria-hidden="true" className="-rotate-90">
        {/* The track. */}
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-primary/15"
        />

        {/* The filled part. `strokeDasharray` makes one dash exactly as long
            as the whole circle, and `strokeDashoffset` rubs out the portion
            that is not done yet - so an offset of 0 is 100%. */}
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * percent) / 100}
          className="stroke-primary transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>

      {showValue ? (
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center font-semibold text-primary tabular-nums',
            text,
          )}
        >
          {percent}%
        </span>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The bar                                                             */
/* ------------------------------------------------------------------ */

/**
 * Exported on its own as well, because a bar is often wanted inside
 * something that already has a layout - a table row, an upload card:
 *
 *   <ProgressBar percent={62} />
 */
export function ProgressBar({ percent, className }) {
  // A null percent means the length is not known, so a stripe slides across
  // the track instead of filling it.
  const unknown = percent === null

  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-primary/15', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      // A progressbar with no `valuenow` is exactly how "indeterminate" is
      // spelled for assistive tech, so it is left off on purpose.
      {...(unknown ? {} : { 'aria-valuenow': percent })}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary',
          unknown
            ? 'w-1/3 animate-[loader-sweep_1.2s_ease-in-out_infinite]'
            : 'transition-[width] duration-300 ease-out',
        )}
        style={unknown ? undefined : { width: percent + '%' }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The loader                                                          */
/* ------------------------------------------------------------------ */

export function ProgressLoader({
  value,
  max = 100,
  shape = 'circle',
  variant = 'section',
  label,
  description,
  size = 'md',
  showValue = true,
  show = true,
  className,
}) {
  if (!show) return null

  const percent = toPercent(value, max)
  const isInline = variant === 'inline'

  return (
    <Surface variant={variant} label={label} className={className}>
      {shape === 'circle' ? (
        // No number yet? A ring stuck at zero looks broken, so the plain
        // spinner stands in until the first real figure arrives.
        percent === null ? (
          <Spinner size={size} />
        ) : (
          <Ring percent={percent} size={size} showValue={showValue} />
        )
      ) : (
        <div className={cn('space-y-1.5', isInline ? 'w-40' : 'w-full max-w-sm')}>
          <ProgressBar percent={percent} />
          {showValue && percent !== null ? (
            <p className="text-right text-xs font-semibold text-primary tabular-nums">
              {percent}%
            </p>
          ) : null}
        </div>
      )}

      {label || description ? (
        <div className="space-y-1">
          {label ? (
            <p className="text-sm font-medium text-muted-foreground sm:text-base">
              {label}
            </p>
          ) : null}
          {description ? (
            <p className="text-xs text-muted-foreground/80">{description}</p>
          ) : null}
        </div>
      ) : null}
    </Surface>
  )
}

export default ProgressLoader
