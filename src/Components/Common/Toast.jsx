import { cn } from '@/Library/utils'

/**
 * The look of a single toast.
 *
 * You never place this component yourself - it is rendered for you when you
 * call `toast.success(...)`, `toast.error(...)` and so on from
 * @/Library/toast.
 *
 * There are four kinds: success, warning, error and info. Each one has its
 * own colours, its own icon and its own progress bar.
 */

/* ------------------------------------------------------------------ */
/* Colours for each kind                                              */
/* ------------------------------------------------------------------ */

const STYLES = {
  success: {
    box: 'bg-green-50 border-green-200 border-l-green-700',
    icon: 'fill-green-700',
    bar: 'bg-green-700',
  },
  warning: {
    box: 'bg-yellow-50 border-yellow-200 border-l-yellow-700',
    icon: 'fill-yellow-700',
    bar: 'bg-yellow-700',
  },
  error: {
    box: 'bg-red-50 border-red-200 border-l-red-400',
    icon: 'fill-red-400',
    bar: 'bg-red-400',
  },
  info: {
    box: 'bg-blue-50 border-blue-200 border-l-blue-700',
    icon: 'fill-blue-700',
    bar: 'bg-blue-700',
  },
}

/* ------------------------------------------------------------------ */
/* Icons - one per kind                                               */
/* ------------------------------------------------------------------ */

// Each icon has its own viewBox, so both are kept together here.
const ICONS = {
  success: {
    viewBox: '0 0 330 330',
    paths: [
      'M165 0C74.019 0 0 74.019 0 165s74.019 165 165 165 165-74.019 165-165S255.981 0 165 0m0 300c-74.44 0-135-60.561-135-135S90.56 30 165 30s135 60.561 135 135-60.561 135-135 135',
      'm226.872 106.664-84.854 84.853-38.89-38.891c-5.857-5.857-15.355-5.858-21.213-.001-5.858 5.858-5.858 15.355 0 21.213l49.496 49.498a15 15 0 0 0 10.606 4.394h.001c3.978 0 7.793-1.581 10.606-4.393l95.461-95.459c5.858-5.858 5.858-15.355 0-21.213s-15.355-5.859-21.213-.001',
    ],
  },
  warning: {
    viewBox: '0 0 486.463 486.463',
    paths: [
      'M243.225 333.382c-13.6 0-25 11.4-25 25s11.4 25 25 25c13.1 0 25-11.4 24.4-24.4.6-14.3-10.7-25.6-24.4-25.6',
      'M474.625 421.982c15.7-27.1 15.8-59.4.2-86.4l-156.6-271.2c-15.5-27.3-43.5-43.5-74.9-43.5s-59.4 16.3-74.9 43.4l-156.8 271.5c-15.6 27.3-15.5 59.8.3 86.9 15.6 26.8 43.5 42.9 74.7 42.9h312.8c31.3 0 59.4-16.3 75.2-43.6m-34-19.6c-8.7 15-24.1 23.9-41.3 23.9h-312.8c-17 0-32.3-8.7-40.8-23.4-8.6-14.9-8.7-32.7-.1-47.7l156.8-271.4c8.5-14.9 23.7-23.7 40.9-23.7 17.1 0 32.4 8.9 40.9 23.8l156.7 271.4c8.4 14.6 8.3 32.2-.3 47.1',
      'M237.025 157.882c-11.9 3.4-19.3 14.2-19.3 27.3.6 7.9 1.1 15.9 1.7 23.8 1.7 30.1 3.4 59.6 5.1 89.7.6 10.2 8.5 17.6 18.7 17.6s18.2-7.9 18.7-18.2c0-6.2 0-11.9.6-18.2 1.1-19.3 2.3-38.6 3.4-57.9.6-12.5 1.7-25 2.3-37.5 0-4.5-.6-8.5-2.3-12.5-5.1-11.2-17-16.9-28.9-14.1',
    ],
  },
  error: {
    viewBox: '0 0 512 512',
    paths: [
      'M256 0C114.508 0 0 114.497 0 256c0 141.493 114.497 256 256 256 141.492 0 256-114.497 256-256C512 114.507 397.503 0 256 0m0 472c-119.384 0-216-96.607-216-216 0-119.385 96.607-216 216-216 119.384 0 216 96.607 216 216 0 119.385-96.607 216-216 216',
      'M343.586 315.302 284.284 256l59.302-59.302c7.81-7.81 7.811-20.473.001-28.284-7.812-7.811-20.475-7.81-28.284 0L256 227.716l-59.303-59.302c-7.809-7.811-20.474-7.811-28.284 0s-7.81 20.474.001 28.284L227.716 256l-59.302 59.302c-7.811 7.811-7.812 20.474-.001 28.284 7.813 7.812 20.476 7.809 28.284 0L256 284.284l59.303 59.302c7.808 7.81 20.473 7.811 28.284 0s7.81-20.474-.001-28.284',
    ],
  },
  info: {
    viewBox: '0 0 330 330',
    paths: [
      'M165 0C74.019 0 0 74.02 0 165.001S74.019 330 165 330s165-74.018 165-164.999S255.981 0 165 0m0 300c-74.44 0-135-60.56-135-134.999S90.56 30 165 30s135 60.562 135 135.001S239.439 300 165 300',
      'M164.998 70c-11.026 0-19.996 8.976-19.996 20.009 0 11.023 8.97 19.991 19.996 19.991s19.996-8.968 19.996-19.991c0-11.033-8.97-20.009-19.996-20.009m.002 70c-8.284 0-15 6.716-15 15v90c0 8.284 6.716 15 15 15s15-6.716 15-15v-90c0-8.284-6.716-15-15-15',
    ],
  },
}

// The little cross on the dismiss button.
const CLOSE_ICON_PATH =
  'M194.8 164.77 323.013 36.555c8.343-8.34 8.343-21.825 0-30.164-8.34-8.34-21.825-8.34-30.164 0L164.633 134.605 36.422 6.391c-8.344-8.34-21.824-8.34-30.164 0-8.344 8.34-8.344 21.824 0 30.164l128.21 128.215L6.259 292.984c-8.344 8.34-8.344 21.825 0 30.164a21.27 21.27 0 0 0 15.082 6.25c5.46 0 10.922-2.09 15.082-6.25l128.21-128.214 128.216 128.214a21.27 21.27 0 0 0 15.082 6.25c5.46 0 10.922-2.09 15.082-6.25 8.343-8.34 8.343-21.824 0-30.164zm0 0'

/* ------------------------------------------------------------------ */
/* The toast itself                                                   */
/* ------------------------------------------------------------------ */

export function Toast({
  type = 'info',
  title,
  description,
  duration,
  // Changes every time this message is raised again. Used as the progress
  // bar's key so the bar restarts from full - see the note beside it below.
  restartKey,
  onDismiss,
}) {
  // Fall back to "info" if an unknown kind is ever passed in.
  const style = STYLES[type] ?? STYLES.info
  const icon = ICONS[type] ?? ICONS.info

  return (
    <div
      className={cn(
        'relative w-full max-w-sm min-w-xs overflow-hidden rounded-md border border-l-4 p-4',
        style.box,
      )}
      role="alert"
    >
      <div className="flex items-start gap-2.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={cn('size-[18px] shrink-0 overflow-visible', style.icon)}
          viewBox={icon.viewBox}
          aria-hidden="true"
        >
          {icon.paths.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>

        <div>
          <p className="text-sm leading-tight font-medium text-slate-900">{title}</p>
          {/* The second line only appears when a description was passed. */}
          {description ? (
            <p className="mt-1 text-xs text-slate-600">{description}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss alert"
          className="ml-auto flex items-center rounded opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="size-2.5 cursor-pointer fill-slate-500"
            aria-hidden="true"
            viewBox="0 0 329.269 329"
          >
            <path d={CLOSE_ICON_PATH} />
          </svg>
        </button>
      </div>

      {/*
        The progress bar. It shrinks from full width to nothing over exactly
        the same time the toast stays open, so when the bar runs out the toast
        disappears. The animation itself lives in index.css, keyed off the
        `data-toast-progress` attribute.

        The `key` matters: when the same message is raised again, sonner
        restarts its own countdown, so the bar has to start over too. Changing
        the key replaces the element, and a fresh element replays the
        animation from full width.
      */}
      <span
        key={restartKey}
        data-toast-progress
        className={cn('absolute inset-x-0 bottom-0 h-1', style.bar)}
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  )
}
