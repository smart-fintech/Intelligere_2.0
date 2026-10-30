/**
 * One product's forecast, month by month, as columns - drawn here (the app
 * has no chart library), in the brand colour, one series so no legend:
 *
 *   <ForecastChart points={[{ key, label, prediction }]} unit="nos" label="Forecast of ..." />
 *
 * A value axis with a few round steps and faint grid lines; the highest
 * month labelled; every column says its month and value on hover or focus.
 * Many months scroll sideways rather than squeezing the columns. The table
 * beside it (AIForecasting) carries every number, so nothing is chart-only.
 */

import { useMemo, useState } from 'react'

import { cn } from '@/Library/utils'
import { formatForecastValue as formatValue } from '@/Modules/Dashboard/forecasting'


/** The smallest round number (1, 2, 2.5 or 5 x 10^n) at or above `value`. */
const niceCeiling = (value) => {
  if (!(value > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((multiple) => multiple * power >= value)
  return step * power
}

const TICKS = 4
const PLOT_HEIGHT = 'h-48'

export default function ForecastChart({ points, unit, label }) {
  const [hovered, setHovered] = useState(null)
  const max = useMemo(() => niceCeiling(Math.max(0, ...points.map((point) => point.prediction))), [points])
  const peak = useMemo(() => points.reduce((best, point) => (best === null || point.prediction > best.prediction ? point : best), null), [points])
  const ticks = Array.from({ length: TICKS + 1 }, (_, index) => (max / TICKS) * (TICKS - index))

  return (
    <figure className="min-w-0 rounded-md border border-border bg-card p-3" aria-label={label}>
      <div className="flex gap-2">
        {/* The value axis - its steps line up with the grid lines. */}
        <div className={cn('relative w-12 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums', PLOT_HEIGHT)} aria-hidden>
          {ticks.map((tick, index) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${(index / TICKS) * 100}%` }}>
              {formatValue(tick)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto pb-1">
          <div style={{ minWidth: `${points.length * 2.25}rem` }}>
            <div className={cn('relative', PLOT_HEIGHT)}>
              {ticks.map((tick, index) => (
                <div
                  key={tick}
                  aria-hidden
                  className={cn('absolute inset-x-0 border-t', index === TICKS ? 'border-border' : 'border-dashed border-border/60')}
                  style={{ top: `${(index / TICKS) * 100}%` }}
                />
              ))}
              <ul className="absolute inset-0 flex items-end gap-0.5 px-1" role="list">
                {points.map((point) => {
                  const height = Math.max(0, (point.prediction / max) * 100)
                  const showing = hovered === point.key
                  const labelled = showing || point.key === peak?.key
                  return (
                    <li
                      key={point.key}
                      tabIndex={0}
                      aria-label={`${point.label}: ${formatValue(point.prediction)}${unit ? ` ${unit}` : ''}`}
                      onMouseEnter={() => setHovered(point.key)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(point.key)}
                      onBlur={() => setHovered(null)}
                      // The whole column is the target, not just the bar.
                      className="group relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
                    >
                      {labelled ? (
                        <span
                          className={cn(
                            'pointer-events-none absolute z-10 -translate-y-full rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap tabular-nums',
                            showing ? 'bg-foreground text-background shadow-sm' : 'text-foreground',
                          )}
                          style={{ bottom: `calc(${height}% + 2px)` }}
                        >
                          {showing ? `${point.label}: ` : ''}
                          {formatValue(point.prediction)}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          'w-full max-w-7 rounded-t-[4px] bg-brand transition-opacity animate-in fade-in-0 slide-in-from-bottom-2 duration-500',
                          hovered && !showing ? 'opacity-40' : 'opacity-100',
                          'group-focus-visible:ring-2 group-focus-visible:ring-ring/60',
                        )}
                        style={{ height: `${height}%` }}
                      />
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="mt-1 flex gap-0.5 px-1" aria-hidden>
              {points.map((point) => (
                <span key={point.key} className="flex-1 truncate text-center text-[10px] text-muted-foreground">
                  {point.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      {unit ? <figcaption className="mt-1 text-right text-[10px] text-muted-foreground">Values in {unit}</figcaption> : null}
    </figure>
  )
}
