import { useId, useMemo, useRef, useState } from 'react'
import { CheckIcon, ChevronDownIcon, Search, X } from 'lucide-react'

import { FieldError, fieldLabelClass } from '@/Components/Common/FormFields'
import { Input } from '@/Components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/Components/ui/popover'
import { cn } from '@/Library/utils'

/**
 * The tick box of a row - drawn like ui/checkbox, but only a picture: the row
 * around it is what is clicked and what screen readers hear as selected (a
 * real checkbox is a <button>, which may not sit inside the Select all one).
 */
function Tick({ checked }) {
  return (
    <span
      aria-hidden
      data-state={checked ? 'checked' : 'unchecked'}
      className="grid size-4 shrink-0 place-content-center rounded-[4px] border border-input shadow-xs data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30"
    >
      {checked ? <CheckIcon className="size-3.5" /> : null}
    </span>
  )
}

/**
 * A labelled dropdown that picks SEVERAL of a list - the Voucher Types of
 * Fetch from Tally. Looks and behaves like the form's other dropdowns:
 *
 *   closed   the box shows each choice as a chip (x removes it) and a
 *            clear-all x; many chips wrap, and past a few rows the chip
 *            area scrolls instead of growing the form
 *   open     a search box, "Select all" (over what the search shows), and
 *            one row per option with its tick box. A click or Enter ticks or
 *            unticks; the arrow keys move; Escape or a click outside closes
 *            it - the choices stay.
 *
 * `options` are plain strings (the value is what is shown and sent).
 * `value` is the chosen ones, as an array; `onChange(next)` gets the new
 * array - in the order the options are listed, whatever order they were
 * ticked in.
 *
 * The list opens in a portal above everything (a modal included), so no
 * container can clip it. It is a modal popover: inside a dialog, only a
 * nested scroll lock lets the list scroll with the wheel.
 *
 * `placeholder` is what an empty box says - the caller also uses it to say
 * the list is loading or empty (`disabled` then).
 */
export function MultiSelectField({
  id,
  label,
  required,
  error,
  options,
  value,
  onChange,
  disabled,
  placeholder = 'Select',
  searchPlaceholder = 'Search',
  className,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef(null)
  const reactId = useId()
  const labelId = `${id ?? reactId}-label`
  const listId = `${id ?? reactId}-list`
  const errorId = error ? `${id ?? reactId}-error` : undefined

  const chosen = useMemo(() => new Set(value), [value])
  const term = search.trim().toLowerCase()
  const shown = useMemo(() => (term ? options.filter((option) => option.toLowerCase().includes(term)) : options), [options, term])
  const allShownChosen = shown.length > 0 && shown.every((option) => chosen.has(option))

  /** Back in the options' own order - what the request is built from. */
  const commit = (nextSet) => onChange(options.filter((option) => nextSet.has(option)))

  const toggle = (option) => {
    const next = new Set(chosen)
    if (next.has(option)) next.delete(option)
    else next.add(option)
    commit(next)
  }

  const toggleAllShown = () => {
    const next = new Set(chosen)
    shown.forEach((option) => (allShownChosen ? next.delete(option) : next.add(option)))
    commit(next)
  }

  const show = (next) => {
    if (disabled && next) return
    setOpen(next)
    if (!next) {
      setSearch('')
      setActive(0)
    }
  }

  /** Keeps the highlighted row in view as the arrow keys move it. */
  const moveTo = (index) => {
    setActive(index)
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  const onSearchKey = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (shown.length) moveTo(Math.min(shown.length - 1, active + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (shown.length) moveTo(Math.max(0, active - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (shown[active] !== undefined) toggle(shown[active])
    }
  }

  const onBoxKey = (event) => {
    if (event.target !== event.currentTarget) return // a chip's x has its own keys
    if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      show(true)
    }
  }

  const activeId = shown[active] !== undefined ? `${listId}-${active}` : undefined

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <span id={labelId} className={fieldLabelClass}>
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </span>
      ) : null}

      <Popover open={open} onOpenChange={show} modal>
        <PopoverAnchor asChild>
          {/* A div, not a button: the chips' x buttons sit inside it. */}
          <div
            id={id}
            role="combobox"
            tabIndex={disabled ? -1 : 0}
            aria-labelledby={label ? labelId : undefined}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-disabled={disabled || undefined}
            aria-invalid={Boolean(error) || undefined}
            aria-required={required || undefined}
            aria-describedby={errorId}
            onClick={() => show(!open)}
            onKeyDown={onBoxKey}
            className={cn(
              'flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md border border-input bg-card py-1.5 pr-2 pl-2 text-sm shadow-xs transition-[color,box-shadow] outline-none',
              'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30',
              'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
              open && 'border-ring ring-[3px] ring-ring/50',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {value.length === 0 ? (
              <span className="flex-1 truncate px-1 text-muted-foreground">{placeholder}</span>
            ) : (
              // Wraps; past three rows it scrolls rather than stretching the form.
              <div className="flex max-h-[5.25rem] flex-1 flex-wrap gap-1 overflow-y-auto">
                {value.map((option) => (
                  <span
                    key={option}
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-brand/20 bg-brand-soft py-0.5 pr-1 pl-2 text-xs font-medium text-brand"
                  >
                    <span className="truncate">{option}</span>
                    {disabled ? null : (
                      <button
                        type="button"
                        aria-label={`Remove ${option}`}
                        className="rounded-sm p-0.5 text-brand/70 outline-none hover:bg-brand/10 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/50"
                        onClick={(event) => {
                          event.stopPropagation()
                          toggle(option)
                        }}
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {value.length > 0 && !disabled ? (
              <button
                type="button"
                aria-label={`Clear all ${label ?? ''}`.trim()}
                className="rounded-sm p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                onClick={(event) => {
                  event.stopPropagation()
                  onChange([])
                }}
              >
                <X className="size-4" />
              </button>
            ) : null}
            <ChevronDownIcon className={cn('size-4 shrink-0 opacity-50 transition-transform', open && 'rotate-180')} />
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-(--radix-popover-trigger-width) min-w-56 p-0"
          // The search box takes the focus, not the first tick box.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            event.currentTarget.querySelector('input')?.focus()
          }}
        >
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setActive(0)
                }}
                onKeyDown={onSearchKey}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={listId}
                aria-activedescendant={activeId}
                className="h-8 pl-8"
              />
            </div>
          </div>

          {options.length > 1 && shown.length > 0 ? (
            <button
              type="button"
              data-select-all
              aria-pressed={allShownChosen}
              className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm font-medium outline-none hover:bg-accent focus-visible:bg-accent"
              onClick={toggleAllShown}
            >
              <Tick checked={allShownChosen} />
              {term ? `Select all matches (${shown.length})` : `Select all (${options.length})`}
            </button>
          ) : null}

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-labelledby={label ? labelId : undefined}
            className="max-h-60 overflow-y-auto overscroll-contain p-1"
          >
            {shown.map((option, index) => (
              <div
                key={option}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={chosen.has(option)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm select-none',
                  index === active && 'bg-accent text-accent-foreground',
                )}
                onMouseMove={() => index !== active && setActive(index)}
                onClick={() => toggle(option)}
              >
                <Tick checked={chosen.has(option)} />
                <span className="truncate">{option}</span>
              </div>
            ))}
            {shown.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                {term ? <>No matches for &ldquo;{search.trim()}&rdquo;</> : 'Nothing to choose from.'}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            <span>{value.length} selected</span>
            {value.length > 0 ? (
              <button type="button" className="font-medium text-brand outline-none hover:underline focus-visible:underline" onClick={() => onChange([])}>
                Clear
              </button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      <FieldError id={errorId}>{error}</FieldError>
    </div>
  )
}
