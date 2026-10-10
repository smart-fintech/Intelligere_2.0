/**
 * ONE FIELD OF THE PRODUCT FORM, drawn from its customised-field definition.
 *
 *   <ProductFieldInput field={field} value={values[name]} error={errors[name]}
 *                      onChange={(value) => setValue(name, value)} vendors={vendors} />
 *
 * The definition decides everything: its `field_name` is the label, its
 * type picks the control (productInputKind), `options` fill a dropdown and
 * `is_required` puts the asterisk on. Every control is one the app's other
 * forms already use (Components/Common/FormFields) - this file only chooses
 * between them.
 *
 *   text        a text box
 *   number      a text box that takes digits, one decimal point and a minus
 *   dropdown    a dropdown of the field's own options
 *   date        the browser's date box
 *   long-text   a multi-line box
 *   file        a file picker - and, once a file is chosen, its name with a
 *               Remove button, so the choice is still there to see after
 *               going to another step and back
 *   vendor      a dropdown of the company's vendors
 *   unsupported a greyed-out box that says so (see productInputKind)
 *
 * Props:
 *   field      the customised field, as the backend sent it
 *   value      what the form holds for it: text, or a File (or null) for a file
 *   error      the message to show under it
 *   disabled   the form is saving
 *   onChange(value)
 *   vendors    useVendorOptions() - only read for a vendor field
 *
 * It takes its own place in the grid it is drawn in - see spanClass below -
 * so put it straight inside a `grid grid-cols-12`.
 */

import { useId } from 'react'
import { Paperclip, X } from 'lucide-react'

import { Field, FieldError, FieldLabel, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { formatBytes } from '@/Components/Common/Loader'
import { Button } from '@/Components/ui/button'
import { Input } from '@/Components/ui/input'
import { cn } from '@/Library/utils'
import {
  PRODUCT_INPUT,
  productFieldName,
  productFieldSpan,
  productInputKind,
  productOptions,
} from '../productForm'

/** A long list of options gets a search box; a short one does not need it. */
const SEARCHABLE_FROM = 8

/** What a number box may hold while it is being typed: "", "-", "12.", ".5". */
const NUMBER_IN_PROGRESS = /^-?\d*\.?\d*$/

/*
 * HOW WIDE A FIELD IS - its place in the 12-column grid every group of
 * product fields is drawn in (`grid grid-cols-12`).
 *
 * A field's `field_size` is a column count on a 12-column row, and from `xl`
 * up that is what it gets - except that a 1-column field is given 2: a
 * twelfth of the row is too narrow to read a dropdown's value in.
 *
 * Below `xl` twelfths are too fine for the room there is, so sizes fall into
 * three widths instead, and on a phone every field takes the whole row:
 *
 *   size     phone   sm (640+)   lg (1024+)   xl (1280+)
 *   1 - 2    full    a third     a quarter    2 of 12
 *   3 - 4    full    a half      a third      as sized
 *   5 - 6    full    full        a half       as sized
 *   7 - 12   full    full        full         as sized
 *
 * Written out in full because Tailwind only ships a class it can read in the
 * source - one put together at run time ("xl:col-span-" + size) would not exist.
 */
const XL_SPAN = {
  2: 'xl:col-span-2',
  3: 'xl:col-span-3',
  4: 'xl:col-span-4',
  5: 'xl:col-span-5',
  6: 'xl:col-span-6',
  7: 'xl:col-span-7',
  8: 'xl:col-span-8',
  9: 'xl:col-span-9',
  10: 'xl:col-span-10',
  11: 'xl:col-span-11',
  12: 'xl:col-span-12',
}

/** A multi-line box or a file's name needs more than the narrowest widths. */
const MINIMUM_SPAN = {
  [PRODUCT_INPUT.LONG_TEXT]: 4,
  [PRODUCT_INPUT.FILE]: 3,
}

const spanClass = (field, kind) => {
  const span = Math.max(productFieldSpan(field), MINIMUM_SPAN[kind] ?? 2)

  return cn(
    'col-span-12',
    span <= 2 && 'sm:col-span-4 lg:col-span-3',
    span > 2 && span <= 4 && 'sm:col-span-6 lg:col-span-4',
    span > 4 && span <= 6 && 'lg:col-span-6',
    XL_SPAN[span],
  )
}

export default function ProductFieldInput({ field, value, error, disabled, onChange, vendors }) {
  const id = useId()
  const label = productFieldName(field)
  const kind = productInputKind(field)
  const required = field.is_required === true
  const className = spanClass(field, kind)

  const common = { id, label, required, error, disabled, className }

  if (kind === PRODUCT_INPUT.DROPDOWN) {
    const options = productOptions(field)

    return (
      <SelectField
        {...common}
        placeholder={options.length === 0 ? 'No options' : 'Select'}
        options={options}
        value={value ?? ''}
        disabled={disabled || options.length === 0}
        searchable={options.length >= SEARCHABLE_FROM}
        searchPlaceholder="Search..."
        onValueChange={onChange}
      />
    )
  }

  if (kind === PRODUCT_INPUT.VENDOR) {
    const loading = vendors.status === 'loading'
    const failed = vendors.status === 'failed'

    return (
      <SelectField
        {...common}
        // The form shows the reason, and Retry, above the fields.
        error={error || (failed ? 'Vendors could not be loaded' : undefined)}
        placeholder={loading ? 'Loading...' : vendors.options.length === 0 ? 'No vendors found' : 'Select vendor'}
        options={vendors.options}
        value={value ?? ''}
        disabled={disabled || loading || vendors.options.length === 0}
        searchable={vendors.options.length >= SEARCHABLE_FROM}
        searchPlaceholder="Search vendor..."
        onValueChange={onChange}
      />
    )
  }

  if (kind === PRODUCT_INPUT.LONG_TEXT) {
    return <TextareaField {...common} rows={2} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
  }

  if (kind === PRODUCT_INPUT.DATE) {
    return <Field {...common} type="date" value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
  }

  if (kind === PRODUCT_INPUT.NUMBER) {
    return (
      <Field
        {...common}
        inputMode="decimal"
        autoComplete="off"
        value={value ?? ''}
        // A keystroke that would stop it being a number is simply not taken.
        onChange={(event) => {
          if (NUMBER_IN_PROGRESS.test(event.target.value)) onChange(event.target.value)
        }}
      />
    )
  }

  if (kind === PRODUCT_INPUT.FILE) {
    return (
      <div className={cn('space-y-1.5', className)}>
        <FieldLabel htmlFor={id} required={required}>
          {label}
        </FieldLabel>

        {value ? (
          // A file box cannot be told what it holds, so a chosen file is
          // shown as its name instead - the same height as the box it replaces.
          <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-card pr-1 pl-3 text-sm shadow-xs">
            <Paperclip className="size-4 shrink-0 text-brand" />
            <span className="min-w-0 flex-1 truncate" title={value.name}>
              {value.name}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(value.size)}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              icon={X}
              tooltip="Remove"
              aria-label={`Remove ${value.name}`}
              disabled={disabled}
              onClick={() => onChange(null)}
            />
          </div>
        ) : (
          <Input
            id={id}
            type="file"
            disabled={disabled}
            aria-invalid={Boolean(error) || undefined}
            aria-required={required || undefined}
            onChange={(event) => onChange(event.target.files?.[0] ?? null)}
          />
        )}

        <FieldError>{error}</FieldError>
      </div>
    )
  }

  if (kind === PRODUCT_INPUT.UNSUPPORTED) {
    // Shown so the field is not a surprise later, but it holds nothing: it
    // is not required of the user and nothing is sent for it.
    return (
      <Field
        id={id}
        label={label}
        className={className}
        disabled
        value=""
        readOnly
        placeholder="Not available yet"
        title="This field will be available in a later update"
      />
    )
  }

  return <Field {...common} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
}
