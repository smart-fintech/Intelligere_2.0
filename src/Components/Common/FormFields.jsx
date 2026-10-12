import { useMemo, useState } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'

import { Input } from '@/Components/ui/input'
import { Label } from '@/Components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/Components/ui/select'
import { Switch } from '@/Components/ui/switch'
import { Textarea } from '@/Components/ui/textarea'
import { cn } from '@/Library/utils'

/**
 * THE FORM KIT - every form in the app is built from these pieces, so a label,
 * a field, an error message or a row of buttons looks the same on the login
 * page, in the Add company dialog and in the Ledger form.
 *
 *   <FormGrid>
 *     <Field id="name" label="Name" required value={...} error={errors.name} onChange={...} />
 *     <SelectField id="state" label="State" options={...} value={...} onValueChange={...} />
 *     <TextareaField id="address" label="Address" className="sm:col-span-2" ... />
 *   </FormGrid>
 *
 *   <FormActions>
 *     <Button type="button" variant="ghost" onClick={cancel}>Cancel</Button>
 *     <Button type="submit" loading={saving}>Save</Button>
 *   </FormActions>
 *
 * What each piece standardises:
 *
 *   FieldLabel     the label: size, weight, colour, the red asterisk
 *   FieldError     the message under a field that failed validation
 *   Field          a labelled text box, optionally with an icon, a fixed
 *                  prefix ("+91") or something on its right (a button)
 *   PasswordField  a Field with the show / hide eye built in
 *   TextareaField  a labelled multi-line box
 *   SelectField    a labelled dropdown
 *   SwitchField    a labelled on/off switch ("Fill from GSTIN")
 *   ToggleField    a setting row: label left, switch and On / Off right
 *   FormGrid       two columns from `sm` up, one on a phone
 *   FormActions    the row of buttons at the bottom of a form
 *
 * None of them knows anything about a particular form: no validation, no
 * field names, no submitting. The control itself - height, border, focus
 * ring, error border - comes from Components/ui (Input, Textarea, Select), so
 * it is the same even where a control is used without a label.
 *
 * ACCESSIBILITY, done once here so no form has to remember it:
 *   - every label is tied to its control (`htmlFor` / `id`)
 *   - `required` shows the asterisk AND sets aria-required
 *   - an error sets aria-invalid and is linked with aria-describedby, so a
 *     screen reader reads the message when the field is focused
 */

/* ------------------------------------------------------------------ */
/* Label and error                                                    */
/* ------------------------------------------------------------------ */

/**
 * The label lettering: muted brand blue, small and medium weight - quieter
 * than the headings so the card title still leads, but clearly part of the
 * brand.
 *
 * Exported for the one case FieldLabel cannot cover: a heading over a GROUP
 * of controls (a set of radio buttons), which is not a <label> for any single
 * one of them. Put it on that heading so it still reads as a label.
 */
export const fieldLabelClass = 'text-xs leading-none font-medium text-brand-muted'

/**
 * The label above a field.
 *
 * Required fields get a red asterisk, which screen readers skip - they hear
 * aria-required on the control instead.
 */
export function FieldLabel({ htmlFor, required, className, children }) {
  return (
    <Label htmlFor={htmlFor} className={cn('gap-0.5', fieldLabelClass, className)}>
      {children}
      {required ? (
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
      ) : null}
    </Label>
  )
}

/**
 * The validation message under a field. `id` is what the control's
 * aria-describedby points at - use errorId() to build it.
 */
export function FieldError({ id, children }) {
  if (!children) return null

  return (
    <p id={id} className="text-xs text-destructive">
      {children}
    </p>
  )
}

/** The id an error message gets, so its control can point at it. */
const errorId = (id) => (id ? `${id}-error` : undefined)

/** The aria attributes every control gets from its field. */
const controlAria = (id, { error, required }) => ({
  'aria-invalid': Boolean(error) || undefined,
  'aria-required': required || undefined,
  'aria-describedby': error ? errorId(id) : undefined,
})

/* ------------------------------------------------------------------ */
/* Text boxes                                                         */
/* ------------------------------------------------------------------ */

/**
 * A labelled text box.
 *
 *   icon       a lucide icon drawn inside the box on the left, in brand blue.
 *              Decorative - `pointer-events-none` lets a click on it land in
 *              the input behind.
 *   prefix     fixed text after the icon, e.g. "+91" before a mobile number
 *   children   something on the right INSIDE the box - a small button such as
 *              the password eye. Position it with "absolute inset-y-0 right-0".
 *   required   the asterisk, and aria-required
 *   className       the whole block - use it for grid spans ("sm:col-span-2")
 *   inputClassName  the box itself - e.g. "uppercase", or "h-8" in a toolbar
 *
 * With no `label` there is no <label> at all, for a box whose purpose is
 * given some other way (pass an aria-label then).
 */
export function Field({
  id,
  label,
  required,
  icon: Icon,
  prefix,
  error,
  className,
  inputClassName,
  children,
  ...props
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <FieldLabel htmlFor={id} required={required}>
          {label}
        </FieldLabel>
      ) : null}

      <div className="relative">
        {Icon || prefix ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center gap-2 pl-3 text-brand">
            {Icon ? <Icon className="size-4" /> : null}
            {prefix ? <span className="text-sm text-muted-foreground">{prefix}</span> : null}
          </span>
        ) : null}

        <Input
          id={id}
          className={cn(
            Icon && prefix ? 'pl-18' : Icon ? 'pl-9' : prefix ? 'pl-12' : null,
            children && 'pr-10',
            inputClassName,
          )}
          {...controlAria(id, { error, required })}
          {...props}
        />

        {children}
      </div>

      <FieldError id={errorId(id)}>{error}</FieldError>
    </div>
  )
}

/**
 * A password box with the show / hide eye on its right.
 *
 * Whether it is showing is kept here, because nothing outside the box ever
 * needs to know.
 */
export function PasswordField({ icon = Lock, ...props }) {
  const [visible, setVisible] = useState(false)

  return (
    <Field {...props} icon={icon} type={visible ? 'text' : 'password'}>
      <button
        type="button"
        onClick={() => setVisible((shown) => !shown)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-md text-brand-light transition-colors outline-none hover:text-brand focus-visible:text-brand"
      >
        {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </button>
    </Field>
  )
}

/**
 * A labelled multi-line box, for a value that runs past one line.
 *
 * `rows` sets the starting height - an address wants three or four, a note
 * more. It has no icon slot: an icon floating beside several lines of text
 * reads as clutter rather than as a label.
 */
export function TextareaField({ id, label, required, error, className, rows = 3, ...props }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>

      <Textarea id={id} rows={rows} {...controlAria(id, { error, required })} {...props} />

      <FieldError id={errorId(id)}>{error}</FieldError>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Choices                                                            */
/* ------------------------------------------------------------------ */

/** How many options a dropdown draws at a time - see SelectField. */
const OPTIONS_PAGE = 100

/**
 * A labelled dropdown.
 *
 * `options` is a list of `{ value, label }` - the caller maps its own data
 * into that shape, so this never has to know what it is showing. An
 * option may add a `title`, shown when it is hovered.
 * `searchable` adds a filter box to the top of a long list (the states).
 * `size="sm"` draws the compact 32px box, to sit beside a Field given
 * inputClassName="h-8" in a form that has to stay short.
 */
export function SelectField({
  id,
  label,
  required,
  icon: Icon,
  error,
  value,
  onValueChange,
  placeholder,
  options,
  disabled,
  searchable,
  searchPlaceholder,
  size,
  className,
}) {
  /* What is typed in the search box, and the options left after it.
     ----------------------------------------------------------------
     The filtering is done HERE, on `options`, because this is where the
     choices exist as data: a plain case-insensitive "contains" on what the
     user sees, with the value as the fallback for an option that has no
     label. The box itself is drawn by SelectContent, which is handed the
     text and the already-filtered list - it does not inspect anything.

     The search is emptied whenever the list closes, so opening it again
     always starts on the full set rather than on the last search. */
  const [search, setSearch] = useState('')

  const term = searchable ? search.trim().toLowerCase() : ''

  const visibleOptions = useMemo(() => {
    if (!term) return options
    return options.filter((option) =>
      String(option.label ?? option.value ?? '').toLowerCase().includes(term),
    )
  }, [options, term])

  /* How many of them are drawn.
     ----------------------------------------------------------------
     Radix mounts EVERY <SelectItem> it is given - even while the list is
     closed, to know the chosen one's text - so a company's 6000 ledgers were
     6000 mounted options before the dropdown had ever been opened. Only the
     first OPTIONS_PAGE are drawn, and scrolling near the end of them draws
     the next lot (drawMore below); the search still looks through all of
     them. A short list is under the limit and is drawn whole, as before.

     The chosen option is always drawn, at the top when it is further down
     than the list has got to: Radix shows its text in the trigger only while
     it is mounted. */
  const [limit, setLimit] = useState(OPTIONS_PAGE)

  const drawnOptions = useMemo(() => {
    if (visibleOptions.length <= limit) return visibleOptions

    const drawn = visibleOptions.slice(0, limit)
    if (!value || drawn.some((option) => option.value === value)) return drawn

    const chosen = visibleOptions.find((option) => option.value === value)
    return chosen ? [chosen, ...drawn] : drawn
  }, [visibleOptions, limit, value])

  const drawMore = (event) => {
    const list = event.currentTarget
    if (list.scrollHeight - list.scrollTop - list.clientHeight > 200) return

    setLimit((drawn) => (drawn < visibleOptions.length ? drawn + OPTIONS_PAGE : drawn))
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>

      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        onOpenChange={(open) => {
          if (open) return
          setSearch('')
          setLimit(OPTIONS_PAGE)
        }}
      >
        {/* The icon goes INSIDE the trigger rather than absolutely on top of
            it, so the chosen value is laid out beside it and never sits
            underneath. */}
        <SelectTrigger id={id} size={size} className="w-full" {...controlAria(id, { error, required })}>
          {/* Brand blue, matching the icon in a Field. */}
          {Icon ? <Icon className="size-4 shrink-0 text-brand" /> : null}
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          searchValue={search}
          // A new search starts from the first lot of its own matches.
          onSearchChange={(text) => {
            setSearch(text)
            setLimit(OPTIONS_PAGE)
          }}
          onViewportScroll={drawMore}
        >
          {drawnOptions.map((option) => (
            <SelectItem key={option.value} value={option.value} title={option.title}>
              {option.label}
            </SelectItem>
          ))}

          {/* An empty list with no word of explanation reads as broken. */}
          {searchable && visibleOptions.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              No matches for &ldquo;{search.trim()}&rdquo;
            </p>
          ) : null}
        </SelectContent>
      </Select>

      <FieldError id={errorId(id)}>{error}</FieldError>
    </div>
  )
}

/**
 * A labelled on/off switch - the label on the left, in brand blue, and the
 * whole label clickable.
 */
export function SwitchField({ id, label, checked, onCheckedChange, disabled, className }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Label htmlFor={id} className="cursor-pointer text-xs font-medium text-brand">
        {label}
      </Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  )
}

/**
 * A setting that is either on or off, as a full-width row: the label (and an
 * optional line under it) on the left, the switch on the right with "On" /
 * "Off" spelled out beside it, so the state reads without decoding the
 * switch's colour.
 *
 *   <ToggleField id="barcode" label="Enable Barcode"
 *                checked={form.barcode} onCheckedChange={(on) => setField('barcode', on)} />
 *
 * `stacked` puts the label ABOVE a text-box-sized box holding the switch,
 * exactly where a Field puts its label above its input - so a row of
 * switches lines up with a row of fields, and three fit side by side where
 * three full rows would not.
 *
 * SwitchField is the compact one for inside a toolbar or beside a field;
 * this is the one for a list of settings.
 */
export function ToggleField({ id, label, description, checked, onCheckedChange, disabled, stacked, className }) {
  const descriptionId = description && id ? `${id}-description` : undefined

  const control = (
    <div className="flex shrink-0 items-center gap-2">
      <span
        aria-hidden="true"
        className={cn('w-6 text-xs font-medium', !stacked && 'text-right', checked ? 'text-brand' : 'text-muted-foreground')}
      >
        {checked ? 'On' : 'Off'}
      </span>
      <Switch
        id={id}
        checked={Boolean(checked)}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-describedby={descriptionId}
      />
    </div>
  )

  if (stacked) {
    return (
      <div className={cn('space-y-1.5', className)}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <div
          className={cn(
            'flex h-9 items-center rounded-md border border-border bg-card px-3',
            disabled && 'opacity-80',
          )}
        >
          {control}
        </div>
        {description ? (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={cn(
        // min-h-9: the height of a text box, so a switch sits level with
        // the fields beside it in a grid.
        'flex min-h-9 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-1.5',
        disabled && 'opacity-80',
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className={cn(fieldLabelClass, !disabled && 'cursor-pointer')}>
          {label}
        </Label>
        {description ? (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {control}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Layout                                                             */
/* ------------------------------------------------------------------ */

/**
 * Fields two to a row from `sm` up, one on a phone. A field that needs the
 * whole row (an address) takes className="sm:col-span-2".
 */
export function FormGrid({ className, children }) {
  return (
    <div className={cn('grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2', className)}>
      {children}
    </div>
  )
}

/**
 * The buttons at the bottom of a form, right-aligned under a hairline, with
 * the main action last. (A dialog's buttons go in Modal's `footer`, which
 * lays them out the same way.)
 */
export function FormActions({ className, children }) {
  return (
    <div className={cn('flex flex-wrap justify-end gap-2 border-t border-border pt-3', className)}>
      {children}
    </div>
  )
}
