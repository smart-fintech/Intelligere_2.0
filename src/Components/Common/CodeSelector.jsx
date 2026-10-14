import { memo, useDeferredValue, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { FieldError, FieldLabel } from '@/Components/Common/FormFields'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/Components/ui/select'
import { tooltipBubbleClass } from '@/Components/ui/tooltip'
import { cn } from '@/Library/utils'

/**
 * How many matches the list draws at once - never the whole 30,000. The
 * dropdown re-renders every drawn option several times while it opens and
 * positions itself, so this number is what opening costs: 20 opens as fast
 * as the form's other dropdowns, 50 took three to four times as long.
 */
const SHOWN = 20

/** The choice that empties the field - Radix wants a value for every item. */
const CLEAR = '__clear__'

const NO_MATCHES = []

/** Room the tooltip needs beside the list before it goes to the other side (max-w-sm). */
const TIP_WIDTH = 384
const TIP_GAP = 6

/**
 * One code in the list - nothing but the code. Memoised, so a keystroke or
 * a moving tooltip redraws only the options that actually changed.
 */
const CodeOption = memo(function CodeOption({ code, describedBy }) {
  return (
    // `textValue`: Radix would otherwise read each option's text from the
    // page as it mounts, and draw the option again with it.
    <SelectItem value={code} textValue={code} data-code={code} aria-describedby={describedBy}>
      {code}
    </SelectItem>
  )
})

/**
 * A field that picks ONE code out of a long list of codes - the HSN Code on
 * a Product form, the SAC Code on the Ledger form. Both are this; they
 * differ only in which list they are given (see HsnSelector, SacSelector).
 *
 * Only the code is listed; hovering it, or moving to it with the arrow keys,
 * shows what it describes in a tooltip. A click, or Enter on the highlighted
 * code, chooses it; Escape closes the list. A chosen code can be cleared
 * ("Clear").
 *
 * The value is the code alone, as text - what the form already held and
 * sends. A record saved with a code the list does not have still shows it.
 *
 * KEPT LIGHT, because the list is long and the forms around it are big:
 *   - at most SHOWN codes are drawn, and only while the list is OPEN -
 *     closed, the dropdown holds the chosen code alone (Radix keeps every
 *     option mounted, open or not, to know the chosen one's text)
 *   - ONE tooltip for the whole list, moved to whichever code has the
 *     highlight (Radix highlights on hover and on the arrow keys alike) -
 *     not a tooltip set up on every option
 *   - typing never waits for the list: the box takes the keystroke at once
 *     and the matches follow in React's deferred render (useDeferredValue),
 *     which the next keystroke can interrupt
 *   - the search runs over the cached list, codes starting with what is
 *     typed, and stops at SHOWN; a code is looked up in the service's own
 *     index (`find`), never in a copy of the list built per screen
 *
 * Props:
 *   codes     what useHsnList / useSacList returned: { status, list, retry }
 *   find(code)              the service's index
 *   search(list, text, n)   the service's search
 *   noun      what one code is called in a message - "HSN code", "SAC code"
 *   placeholder, searchPlaceholder
 *   id, label, required, error, value, onChange(code), disabled, className
 */
export function CodeSelector({
  codes,
  find,
  search,
  noun,
  placeholder,
  searchPlaceholder,
  id,
  label,
  required = false,
  error,
  value = '',
  onChange,
  disabled = false,
  className,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  // The highlighted code and where it is: { code, element, rect }, or null.
  const [tip, setTip] = useState(null)
  const tipId = useId()

  const code = String(value ?? '').trim()

  const matches = useMemo(
    () => (open ? search(codes.list, deferred, SHOWN) : NO_MATCHES),
    [open, codes.list, deferred, search],
  )

  // Closed: the chosen code alone. Open: the matches, with the chosen code
  // on top when they do not have it (Radix shows its text only while it is drawn).
  const shown = useMemo(() => {
    const chosen = code ? (find(code) ?? { code, names: [] }) : null
    if (!open) return chosen ? [chosen] : NO_MATCHES
    return chosen && !matches.some((entry) => entry.code === code) ? [chosen, ...matches] : matches
  }, [open, code, matches, find])

  // A line under the list: still loading, failed, nothing found, or cut short.
  const note =
    codes.status === 'loading'
      ? `Loading ${noun}s...`
      : codes.status === 'failed'
        ? `${noun}s could not be loaded.`
        : matches.length === 0
          ? `No ${noun} matches${deferred.trim() ? ` "${deferred.trim()}"` : ''}.`
          : matches.length === SHOWN
            ? `Showing the first ${SHOWN} matches - type more to narrow them.`
            : null

  /** The tooltip follows the highlight: an option focused, by pointer or keys - anything else hides it. */
  const followHighlight = (event) => {
    const element = event.target.closest?.('[data-code]')
    setTip(element ? { code: element.dataset.code, element, rect: element.getBoundingClientRect() } : null)
  }

  const tipEntry = tip ? find(tip.code) : null
  // Beside the list on the right, or on its left when the window has no room.
  const tipOnRight = tip ? tip.rect.right + TIP_GAP + TIP_WIDTH <= window.innerWidth : true

  const errorId = id ? `${id}-error` : undefined

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <FieldLabel htmlFor={id} required={required}>
          {label}
        </FieldLabel>
      ) : null}

      <Select
        value={code}
        disabled={disabled}
        onValueChange={(next) => onChange?.(next === CLEAR ? '' : next)}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) return
          setQuery('')
          setTip(null)
        }}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          title={code ? find(code)?.names.join('\n') : undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-required={required || undefined}
          aria-describedby={error ? errorId : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent
          searchable
          searchPlaceholder={searchPlaceholder}
          searchValue={query}
          onSearchChange={setQuery}
          onFocus={followHighlight}
          // A scrolled list moves the highlighted option; the tooltip goes with it.
          onViewportScroll={() => setTip((current) => current && { ...current, rect: current.element.getBoundingClientRect() })}
        >
          {open && code ? (
            <SelectItem value={CLEAR} className="text-muted-foreground">
              Clear
            </SelectItem>
          ) : null}

          {shown.map((entry) => (
            <CodeOption key={entry.code} code={entry.code} describedBy={tip?.code === entry.code ? tipId : undefined} />
          ))}

          {open && note ? <p className="px-2 py-2 text-center text-xs text-muted-foreground">{note}</p> : null}
        </SelectContent>
      </Select>

      {/* The one tooltip - the app's own look, on <body> so nothing clips it. */}
      {tip
        ? createPortal(
            <div
              id={tipId}
              role="tooltip"
              data-side={tipOnRight ? 'right' : 'left'}
              className={cn(tooltipBubbleClass, 'pointer-events-none fixed max-w-sm text-left whitespace-pre-line')}
              style={{
                top: tip.rect.top,
                ...(tipOnRight
                  ? { left: tip.rect.right + TIP_GAP }
                  : { right: window.innerWidth - tip.rect.left + TIP_GAP }),
              }}
            >
              {tipEntry?.names.length ? tipEntry.names.join('\n') : 'No description available'}
            </div>,
            document.body,
          )
        : null}

      {codes.status === 'failed' ? (
        <p className="text-xs text-muted-foreground">
          {noun} list could not be loaded.{' '}
          <button type="button" className="cursor-pointer font-medium text-brand underline-offset-2 hover:underline" onClick={codes.retry}>
            Retry
          </button>
        </p>
      ) : null}

      <FieldError id={errorId}>{error}</FieldError>
    </div>
  )
}

export default CodeSelector
