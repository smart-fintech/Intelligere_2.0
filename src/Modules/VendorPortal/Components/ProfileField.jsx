import { Plus, Trash2 } from 'lucide-react'

import {
  CheckboxField,
  Field,
  FieldError,
  FieldLabel,
  FileField,
  SelectField,
  TextareaField,
} from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { Input } from '@/Components/ui/input'
import { cn } from '@/Library/utils'
import { DocumentButton } from '@/Modules/Procurement/Components/DocumentPreview'
import { fileName } from '@/Modules/Procurement/procurement'
import { emptyRecord, profileErrorKey } from '@/Modules/Procurement/vendorProfile'

/**
 * One field of the vendor profile form, by its type (Modules/Procurement/
 * vendorProfile describes them): a box, a dropdown, a set of tick boxes, an
 * open list of values, repeatable records, or a document.
 *
 *   id        the input's id, and the start of its children's
 *   path      where its messages are kept in `errors` (profileErrorKey parts)
 *   errors    every message of the form, by profileErrorKey
 *   onChange  called with the field's whole new value
 */

/** A stored value the options do not list still shows as chosen. */
const withValue = (options, value) => (value && !options.includes(value) ? [...options, value] : options)

function AddButton({ label, onClick, disabled }) {
  return (
    <Button type="button" variant="outline" size="xs" icon={Plus} disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  )
}

function RemoveButton({ label, onClick, disabled }) {
  return (
    <Button
      type="button"
      variant="iconDelete"
      size="icon-sm"
      icon={Trash2}
      tooltip={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    />
  )
}

function DocumentInput({ id, field, value, onChange, disabled, error }) {
  const stored = typeof value === 'string' && value ? value : null
  return (
    <div className="space-y-1.5">
      <FileField
        id={id}
        label={field.label}
        accept="image/*,application/pdf"
        disabled={disabled}
        error={error}
        // A stored document by its name; its preview is the View beside it.
        value={stored ? { name: fileName(stored) } : value}
        onChange={onChange}
      />
      {stored ? <DocumentButton url={stored} title={field.label} /> : null}
    </div>
  )
}

function ListInput({ id, field, value, onChange, disabled }) {
  const items = Array.isArray(value) ? value : []
  const itemLabel = field.itemLabel || 'Item'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={`${id}-0`}>{field.label}</FieldLabel>
        <AddButton label={`Add ${itemLabel}`} disabled={disabled} onClick={() => onChange([...items, ''])} />
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          None added.
        </p>
      ) : (
        items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              id={`${id}-${index}`}
              value={item ?? ''}
              disabled={disabled}
              placeholder={`${itemLabel} ${index + 1}`}
              aria-label={`${field.label} ${index + 1}`}
              onChange={(event) => onChange(items.map((row, at) => (at === index ? event.target.value : row)))}
            />
            <RemoveButton
              label={`Remove ${itemLabel} ${index + 1}`}
              disabled={disabled}
              onClick={() => onChange(items.filter((_, at) => at !== index))}
            />
          </div>
        ))
      )}
    </div>
  )
}

function ChecksInput({ id, field, value, onChange, disabled }) {
  const chosen = Array.isArray(value) ? value : []
  // Stored values the options do not list stay tickable.
  const options = [...field.options, ...chosen.filter((item) => item && !field.options.includes(item))]
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {options.map((option, index) => (
        <CheckboxField
          key={option}
          id={`${id}-${index}`}
          label={option}
          disabled={disabled}
          checked={chosen.includes(option)}
          onCheckedChange={(checked) =>
            onChange(checked ? [...chosen, option] : chosen.filter((item) => item !== option))
          }
        />
      ))}
    </div>
  )
}

function RepeatInput({ id, field, value, onChange, path, errors, disabled }) {
  const records = Array.isArray(value) ? value : []
  const itemLabel = field.itemLabel || 'Entry'
  const add = () => onChange([...records, emptyRecord(field.fields)])

  return (
    <div className="space-y-3">
      {records.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
          No {itemLabel.toLowerCase()} added yet.
        </p>
      ) : (
        records.map((record, index) => (
          <div key={index} className="rounded-md border border-border bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-brand">
                {itemLabel} {index + 1}
              </p>
              <RemoveButton
                label={`Remove ${itemLabel} ${index + 1}`}
                disabled={disabled}
                onClick={() => onChange(records.filter((_, at) => at !== index))}
              />
            </div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              {field.fields.map((subField) => (
                <ProfileField
                  key={subField.key}
                  id={`${id}-${index}-${subField.key}`}
                  field={subField}
                  value={record?.[subField.key]}
                  path={[...path, index, subField.key]}
                  errors={errors}
                  disabled={disabled}
                  onChange={(next) =>
                    onChange(records.map((row, at) => (at === index ? { ...row, [subField.key]: next } : row)))
                  }
                />
              ))}
            </div>
          </div>
        ))
      )}
      <AddButton label={field.addLabel || `Add ${itemLabel}`} disabled={disabled} onClick={add} />
    </div>
  )
}

export default function ProfileField({ id, field, value, onChange, path, errors = {}, disabled, className }) {
  const error = errors[profileErrorKey(...path)]
  const wide = field.wide ? 'sm:col-span-2 lg:col-span-3' : null

  switch (field.type) {
    case 'repeat':
      return (
        <RepeatInput
          id={id}
          field={field}
          value={value}
          onChange={onChange}
          path={path}
          errors={errors}
          disabled={disabled}
        />
      )
    case 'multiselect':
      return <ChecksInput id={id} field={field} value={value} onChange={onChange} disabled={disabled} />
    case 'list':
      return (
        <div className={cn(wide, className)}>
          <ListInput id={id} field={field} value={value} onChange={onChange} disabled={disabled} />
          <FieldError>{error}</FieldError>
        </div>
      )
    case 'file':
      return (
        <div className={cn(wide, className)}>
          <DocumentInput id={id} field={field} value={value} onChange={onChange} disabled={disabled} error={error} />
        </div>
      )
    case 'select':
      return (
        <SelectField
          id={id}
          label={field.label}
          className={cn(wide, className)}
          value={value || ''}
          placeholder="Select"
          disabled={disabled}
          error={error}
          options={withValue(field.options, value).map((option) => ({ value: option, label: option }))}
          onValueChange={onChange}
          onClear={() => onChange('')}
        />
      )
    case 'textarea':
      return (
        <TextareaField
          id={id}
          label={field.label}
          className={cn(wide, className)}
          rows={3}
          value={value ?? ''}
          disabled={disabled}
          error={error}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    default:
      return (
        <Field
          id={id}
          label={field.label}
          className={cn(wide, className)}
          type={field.type === 'number' || field.type === 'date' ? field.type : 'text'}
          min={field.type === 'number' ? 0 : undefined}
          value={value ?? ''}
          disabled={disabled}
          error={error}
          onChange={(event) => onChange(event.target.value)}
        />
      )
  }
}
