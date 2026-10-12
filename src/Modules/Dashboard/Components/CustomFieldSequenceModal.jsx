/**
 * The Sequence dialog of Customised Fields: the company's fields as cards,
 * dragged into the order they are used in everywhere - the Product form
 * first of all, which lays its fields out by `field_order`.
 *
 *   1  ⋮⋮ Item Name        Text                     [↑] [↓]
 *   2  ⋮⋮ Category         Dropdown                 [↑] [↓]
 *   3  ⋮⋮ Color            Text · SKU field          [↑] [↓]
 *
 * A card is moved by dragging it (the browser's own drag and drop - no
 * library) or with its arrows, which also work from the keyboard and on a
 * touch screen, where dragging does not. Nothing is sent until Save.
 *
 * ------------------------------------------------------------------
 * SAVE CHANGES field_order AND NOTHING ELSE
 * ------------------------------------------------------------------
 * The cards are numbered 1, 2, 3 ... from the top, and each field whose
 * `field_order` that changes is saved through the same call Edit uses
 * (saveCustomField - POST inventory/company_dynamic_fields/ with ONE field
 * under `custom_fields`): the field exactly as the backend sent it, every
 * property untouched, with only `field_order` replaced. A field already in
 * its place is not sent. The number keeps the type the field had it in - a
 * field whose order came as "2" is sent "5", one that came as 2 is sent 5.
 *
 * They are saved one after another. If any fails the dialog stays open
 * with the order as arranged, says how many could not be saved, and the
 * list is read again - so Save once more sends only what is still out of
 * place. When all are saved it closes and the list is read again.
 *
 * Props:
 *   open, onOpenChange   controlled by the list, the same as Modal
 *   fields        the fields as the backend sent them (useCustomFields().rows)
 *   companyName   the active company - sent with each field
 *   onSaved()     after every change was saved - the list closes this and reloads
 *   onPartlySaved()   after some were saved and some were not - the list reloads
 */

import { useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { customFieldTypeLabel } from '@/Constants/inventory'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { saveCustomField } from '@/Services/inventoryService'

/** A field's own key: its `sr_no`, or its name for one without. */
const keyOf = (field) => String(field?.sr_no ?? field?.field_name ?? '')

/** A field_order as a number - Infinity when there is none, so it sorts last. */
const orderOf = (field) => {
  const number = Number(field?.field_order)
  return field?.field_order !== null && field?.field_order !== '' && Number.isFinite(number) ? number : Infinity
}

/** The fields' keys in their current order - the same rule the Product form sorts by (stable). */
const initialOrder = (fields) =>
  [...fields].sort((left, right) => orderOf(left) - orderOf(right)).map(keyOf)

/** `order` with one key moved to another place. */
const moved = (order, key, toIndex) => {
  const rest = order.filter((entry) => entry !== key)
  rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, key)
  return rest
}

/** The new field_order, in the type the field had it in. */
const orderValue = (field, position) => (typeof field.field_order === 'string' ? String(position) : position)

export default function CustomFieldSequenceModal({ open, onOpenChange, fields, companyName, onSaved, onPartlySaved }) {
  // Keys, top to bottom. Taken from the fields once, as the dialog opens
  // (the list gives it a new `key` every time).
  const [order, setOrder] = useState(() => initialOrder(fields))
  const [dragging, setDragging] = useState(null)
  const [saving, setSaving] = useState(false)

  // The fields as they are NOW, by key - after a partial save the list is
  // read again, and Save compares against what is really stored.
  const byKey = new Map(fields.map((field) => [keyOf(field), field]))
  const cards = order.map((key) => byKey.get(key)).filter(Boolean)
  // A field that arrived after the dialog opened goes at the end.
  const unplaced = fields.filter((field) => !order.includes(keyOf(field)))
  const arranged = [...cards, ...unplaced]

  const move = (key, toIndex) => setOrder(moved(arranged.map(keyOf), key, toIndex))

  const save = async () => {
    const changes = arranged
      .map((field, index) => ({ field, position: index + 1 }))
      .filter(({ field, position }) => orderOf(field) !== position)

    if (changes.length === 0) {
      toast.info('The sequence has not changed.')
      return
    }

    setSaving(true)
    let failed = 0
    let lastError = ''

    // One after another: the endpoint takes one field per request.
    for (const { field, position } of changes) {
      try {
        await saveCustomField(companyName, { ...field, field_order: orderValue(field, position) })
      } catch (failure) {
        failed += 1
        lastError = failure.message
      }
    }

    setSaving(false)

    if (failed === 0) {
      toast.success('Field sequence saved')
      onSaved?.()
      return
    }

    toast.error(`${failed} of ${changes.length} fields could not be saved. ${lastError}`)
    onPartlySaved?.()
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Field Sequence"
      size="md"
      closeOnBackdropClick={!saving}
      closeOnEsc={!saving}
      showCloseButton={!saving}
      autoFocus={false}
      footer={
        <>
          <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" loading={saving} disabled={!companyName || arranged.length === 0} onClick={save}>
            {saving ? 'Saving...' : 'Save Sequence'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 p-1">
        <p className="text-xs text-muted-foreground">
          Drag the cards, or use the arrows, to set the order the fields appear in. Nothing changes until you save.
        </p>

        <ol className="space-y-1.5">
          {arranged.map((field, index) => {
            const key = keyOf(field)
            const name = field.field_name || 'Unnamed field'
            const notes = [
              customFieldTypeLabel(field.field_type),
              field.sku_field ? 'SKU field' : null,
              field.hide_field ? 'Hidden' : null,
            ].filter(Boolean)

            return (
              <li
                key={key}
                draggable={!saving}
                onDragStart={(event) => {
                  setDragging(key)
                  event.dataTransfer.effectAllowed = 'move'
                  // Some browsers start no drag without data.
                  event.dataTransfer.setData('text/plain', key)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (dragging && dragging !== key) move(dragging, index)
                }}
                onDrop={(event) => event.preventDefault()}
                onDragEnd={() => setDragging(null)}
                className={cn(
                  'flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 shadow-xs transition-colors',
                  !saving && 'cursor-grab active:cursor-grabbing',
                  dragging === key && 'border-brand bg-brand-soft opacity-70 dark:bg-brand/15',
                )}
              >
                <span className="w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground" title={name}>
                    {name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{notes.join(' · ')}</span>
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  icon={ArrowUp}
                  tooltip="Move up"
                  aria-label={`Move ${name} up`}
                  disabled={saving || index === 0}
                  onClick={() => move(key, index - 1)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  icon={ArrowDown}
                  tooltip="Move down"
                  aria-label={`Move ${name} down`}
                  disabled={saving || index === arranged.length - 1}
                  onClick={() => move(key, index + 1)}
                />
              </li>
            )
          })}
        </ol>
      </div>
    </Modal>
  )
}
