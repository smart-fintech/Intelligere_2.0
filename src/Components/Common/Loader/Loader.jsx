/**
 * LOADER 1 OF 3 - the plain one.
 *
 * "Something is happening and I cannot tell you how far along it is."
 * A spinner, optionally with a line of text. Use it for every wait whose
 * length is unknown: fetching a page, saving a form, signing in.
 *
 * Use it:
 *   import { Loader } from '@/Components/Common/Loader'
 *
 *   // the page's data has not arrived yet
 *   if (status === 'loading') return <Loader variant="page" label="Loading profile..." />
 *
 *   // inside a card that is waiting on its own request
 *   <Loader variant="section" label="Loading referrals..." />
 *
 *   // next to something, on one line
 *   <Loader variant="inline" size="xs" label="Checking..." />
 *
 *   // freeze a form while it saves - the parent needs `relative`
 *   <div className="relative">
 *     {saving ? <Loader variant="overlay" label="Saving..." /> : null}
 *     ...fields...
 *   </div>
 *
 *   // block the whole window
 *   {redirecting ? <Loader variant="fullscreen" label="Signing you in..." /> : null}
 *
 * Props:
 *   variant      inline | section | page | overlay | fullscreen  (default section)
 *                See Surface.jsx for what each one covers.
 *   label        the line under (or beside) the spinner. Optional.
 *   description  a fainter second line, for "this can take a minute".
 *   size         xs | sm | md | lg | xl. Left alone, it is chosen to suit
 *                the variant, so you usually do not pass it.
 *   show         pass a boolean to render conditionally instead of writing
 *                `{loading ? <Loader /> : null}` yourself. Default true.
 *   className    extra classes on the wrapper.
 */

import { cn } from '@/Library/utils'

import Spinner from './Spinner'
import Surface from './Surface'

// A page-wide wait deserves a bigger spinner than one sitting in a table row.
// Passing `size` yourself overrides this.
const SIZE_FOR_VARIANT = {
  inline: 'sm',
  section: 'md',
  page: 'lg',
  overlay: 'md',
  fullscreen: 'lg',
}

export function Loader({
  variant = 'section',
  label,
  description,
  size,
  show = true,
  className,
}) {
  if (!show) return null

  const isInline = variant === 'inline'
  const spinnerSize = size ?? SIZE_FOR_VARIANT[variant] ?? 'md'

  return (
    <Surface variant={variant} label={label} className={className}>
      <Spinner size={spinnerSize} />

      {label || description ? (
        <div className={cn(isInline ? 'text-left' : 'space-y-1')}>
          {label ? (
            <p
              className={cn(
                'font-medium text-muted-foreground',
                isInline ? 'text-sm' : 'text-sm sm:text-base',
              )}
            >
              {label}
            </p>
          ) : null}

          {description && !isInline ? (
            <p className="text-xs text-muted-foreground/80">{description}</p>
          ) : null}
        </div>
      ) : null}
    </Surface>
  )
}

export default Loader
