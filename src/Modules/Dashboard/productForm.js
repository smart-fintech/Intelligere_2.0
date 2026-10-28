/**
 * THE RULES OF THE PRODUCT FORM, with no screen attached.
 *
 * The form is not written down anywhere: it is worked out, every time, from
 * the company's Customised Fields (Inventory Master > Customised Fields).
 * This file is that working-out, as plain functions of the field list:
 *
 *   productFields(rows)                  the fields a product has, in order
 *   buildProductSteps(rows, { skuActive })   those fields cut into steps
 *   applicableSteps(steps, form)         ... without the reference fields the
 *                                        chosen Category has no use for
 *   productInputKind(field)              which control a field is drawn with
 *   productOptions(field)                a dropdown field's choices
 *   productFieldSpan(field)              how wide the field is, of 12
 *   checkProductStep(step, form)         everything wrong with a step
 *   collectProductValues(steps, form)    the values, ready for the payload
 *   prefillProductForm(steps, saved)     the form, filled from a saved SKU (Edit)
 *
 * and, for warehouse stock, which is not made of fields:
 *
 *   lockAllocations(allocations, warehouse)   the lines, all in one warehouse
 *   validateAllocations(allocations)     what is wrong with each line
 *
 * and, for raw-material and semi-finished references:
 *
 *   validateReferenceDraft(draft)        what is wrong with one about to be added
 *   allocationTotalError(allocations, quantity)   ... and with them together
 *   collectAllocations(allocations)      the lines, ready for the payload
 *
 * What the form holds is `values` (what is filled in once), `skuSets`
 * (one entry per SKU, each with its own values and warehouse lines) and
 * `allocations` (the warehouse lines of a product without SKUs, in step 1)
 * - see "SKU entries" below.
 *
 * Nothing here knows a field by name. "Item Name" and "Color" are whatever
 * the backend sent; a company with different fields gets a different form.
 *
 * A field is identified by its `field_name` - it is the label on screen, the
 * key its value is kept under while the form is open, and the key it is sent
 * under. Every property is read defensively: a field may arrive without
 * `sku_field`, `sku_no`, `options` or a size, and sizes and orders come as
 * text ("4") as often as numbers.
 */

import {
  CUSTOM_FIELD_TYPE_DROPDOWN,
  PRODUCT_FIELD_RAW_MATERIAL,
  PRODUCT_FIELD_SEMI_FINISHED,
  PRODUCT_FIELD_VENDOR_SELECT,
  PRODUCT_FIELDS_PER_STEP,
  PRODUCT_MAIN_FIELD_COUNT,
  isProductQuantityField,
  perSkuFieldRank,
} from '@/Constants/inventory'
import { toInputDate } from '@/Utils/date'
import { PRODUCT_FIELD, referencesOfCategory, savedValue } from './productList'

/* ------------------------------------------------------------------ */
/* Reading one field                                                  */
/* ------------------------------------------------------------------ */

/** A field's name - its label and its identifier. '' when it has none. */
export const productFieldName = (field) => String(field?.field_name ?? '').trim()

/** A property as lower-case text, so "File", "file" and " FILE " are one type. */
const lower = (value) => String(value ?? '').trim().toLowerCase()

/** A number out of text or a number; null for anything that is not one. */
const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** Whether a field belongs to the SKU details - strictly `sku_field: true`. */
export const isSkuField = (field) => field?.sku_field === true
/**
 * WHICH CONTROL A FIELD IS DRAWN WITH.
 *
 *   text | number | dropdown | date | file | long-text   the plain types
 *   vendor        any number of the company's vendors (vendor_select)
 *   raw-material  } references to the company's own products: a SKU of a
 *   semi-finished } Raw Material (raw_material) or Semi-Finished
 *                 } (semi_finished) product, a quantity and a wastage,
 *                 } as many as the user adds - see "References" below
 *   unsupported   a field this stage of the Product form cannot fill in
 *
 * A special field asks for its behaviour in `option_type` (with
 * `field_type: "custom"`), or names it as its `field_type`; both are looked
 * at. A `custom` field asking for nothing this form knows, and any type it
 * has never heard of, are `unsupported`: shown, so the user can see the
 * field exists, but not filled in, not validated and not sent. A field with
 * no type at all is a text box.
 */
export const PRODUCT_INPUT = Object.freeze({
  TEXT: 'text',
  NUMBER: 'number',
  DROPDOWN: 'dropdown',
  DATE: 'date',
  FILE: 'file',
  LONG_TEXT: 'long-text',
  VENDOR: 'vendor',
  RAW_MATERIAL: 'raw-material',
  SEMI_FINISHED: 'semi-finished',
  UNSUPPORTED: 'unsupported',
})

/** Whether a kind holds a list of references rather than one value. */
export const isReferenceInput = (kind) => kind === PRODUCT_INPUT.RAW_MATERIAL || kind === PRODUCT_INPUT.SEMI_FINISHED

const SPECIAL_KINDS = {
  [PRODUCT_FIELD_VENDOR_SELECT]: PRODUCT_INPUT.VENDOR,
  [PRODUCT_FIELD_RAW_MATERIAL]: PRODUCT_INPUT.RAW_MATERIAL,
  [PRODUCT_FIELD_SEMI_FINISHED]: PRODUCT_INPUT.SEMI_FINISHED,
}

const PLAIN_KINDS = {
  text: PRODUCT_INPUT.TEXT,
  number: PRODUCT_INPUT.NUMBER,
  [CUSTOM_FIELD_TYPE_DROPDOWN]: PRODUCT_INPUT.DROPDOWN,
  date: PRODUCT_INPUT.DATE,
  file: PRODUCT_INPUT.FILE,
  'long-text': PRODUCT_INPUT.LONG_TEXT,
}

export const productInputKind = (field) => {
  const type = lower(field?.field_type)
  const special = [type, lower(field?.option_type)].find((value) => value in SPECIAL_KINDS)

  if (special) return SPECIAL_KINDS[special]
  if (!type) return PRODUCT_INPUT.TEXT

  return PLAIN_KINDS[type] ?? PRODUCT_INPUT.UNSUPPORTED
}

/**
 * A dropdown field's choices, as `{ value, label, original }`.
 *
 * `value` is the choice as text, which is what a dropdown works in;
 * `original` is the choice exactly as the backend listed it (a GST rate may
 * be the number 18, not "18") and is what gets sent - see
 * collectProductValues. Blanks and repeats are dropped.
 */
export const productOptions = (field) => {
  const seen = new Set()

  return (Array.isArray(field?.options) ? field.options : []).reduce((options, original) => {
    const value = String(original ?? '').trim()
    if (!value || seen.has(value)) return options

    seen.add(value)
    options.push({ value, label: value, original })
    return options
  }, [])
}

/**
 * How wide a field is, in twelfths of the row - its `field_size`, which is a
 * column count on a 12-column grid. Anything that is not a whole number from
 * 1 to 12 falls back to a third of the row.
 */
export const DEFAULT_PRODUCT_FIELD_SPAN = 4

export const productFieldSpan = (field) => {
  const size = toNumber(field?.field_size)
  return Number.isInteger(size) && size >= 1 && size <= 12 ? size : DEFAULT_PRODUCT_FIELD_SPAN
}

/* ------------------------------------------------------------------ */
/* Which fields, in which order, in which step                         */
/* ------------------------------------------------------------------ */

/**
 * Sorts by a numeric property, smallest first. A field without a usable
 * number goes after those with one, and fields that tie keep the order they
 * arrived in (Array.sort is stable) - so a reply with no ordering at all
 * comes out exactly as the backend listed it.
 */
const sortedBy = (fields, read) =>
  [...fields].sort((left, right) => (read(left) ?? Infinity) - (read(right) ?? Infinity))

const orderOf = (field) => toNumber(field?.field_order)

/**
 * The fields a product has: every customised field that has a name and is
 * not hidden (`hide_field: true`, strictly), in `field_order`. A second
 * field with a name already taken is left out - two values cannot be kept,
 * or sent, under one name.
 */
export const productFields = (rows) => {
  const names = new Set()

  const usable = (Array.isArray(rows) ? rows : []).filter((field) => {
    const name = productFieldName(field)
    if (!field || !name || field.hide_field === true || names.has(name)) return false

    names.add(name)
    return true
  })

  return sortedBy(usable, orderOf)
}

/** A list cut into runs of at most `size`. */
const chunk = (list, size) => {
  const chunks = []
  for (let start = 0; start < list.length; start += size) chunks.push(list.slice(start, start + size))
  return chunks
}

/**
 * Whether a field belongs to ONE SKU rather than to the product: it is one
 * the backend keeps inside a `product_details` entry (PRODUCT_PER_SKU_FIELDS
 * - the quantity, the expiry date, the rate). For a product with SKUs each
 * SKU entry has its own; for a product without, it is a normal field.
 */
export const isDetailField = (field) => perSkuFieldRank(productFieldName(field)) !== -1

/** Where a per-SKU field comes in a SKU entry: its place in PRODUCT_PER_SKU_FIELDS, Unit Rate last. */
const detailRank = (field) => perSkuFieldRank(productFieldName(field))

/**
 * THE STEPS OF THE FORM.
 *
 *   [{ key, title, groups: [{ key, title, fields, ... }] }]
 *
 * Everything starts from productFields(rows): the visible fields, already in
 * `field_order`. They are then split, and a field is only ever in one part:
 *
 *   SKU fields      `sku_field: true`
 *   normal fields   `sku_field` false or missing
 *
 * `skuActive` is whether SKU details are part of this company's products at
 * all - the Master Details' setting, never worked out from the fields. It
 * gives two forms:
 *
 * A PRODUCT WITH SKUs  (SKU active, and the company has SKU fields)
 *
 *   Step 1 ends with ONE group, "SKU Details", which the form draws once per
 *   SKU entry (see "SKU entries" below). It holds everything that belongs
 *   to one SKU:
 *
 *     skuFields      the SKU fields, in `sku_no` order (then field order)
 *     detailFields   the per-SKU fields (isDetailField) - Quantity, Expiry
 *                    Date, Unit Rate, whichever the company has - in that
 *                    order, drawn right after the SKU fields. One of them
 *                    marked `sku_field` is still here, never a SKU field, so
 *                    it is never sent in `sku_details`
 *     withWarehouse  each entry has its own warehouse allocation
 *
 *   (`fields` is the two lists together.) Those fields are drawn NOWHERE
 *   else. In particular they are not counted for the top row: step 1 starts
 *   with the first PRODUCT_MAIN_FIELD_COUNT of the fields that are left, so
 *   when Quantity moves into the SKU entries the next field moves up into
 *   its place. The stock is each SKU's own, inside its entry.
 *
 * A PRODUCT WITHOUT SKUs  (anything else)
 *
 *   There is no SKU group. Every field is a normal one, a field marked
 *   `sku_field` included - marking it does not make it vanish - and each is
 *   drawn once, where the field order puts it. Step 1 ends with the
 *   WAREHOUSE group instead: where the product's stock is kept, right
 *   under its main fields. The group is not made of fields (it has none)
 *   - the form draws the warehouse allocation for it.
 *
 * So where the stock is kept is ALWAYS in step 1 and in one place only: a
 * SKU's inside its entry, a product's under its main fields. There is no
 * step of its own for it.
 *
 * Either way the normal fields after the first seven follow in steps of at
 * most PRODUCT_FIELDS_PER_STEP, still in field order. A step is only made
 * when it has something in it, so there is never an empty one - and a
 * company with no fields has no steps.
 */
export const PRODUCT_GROUP = Object.freeze({ MAIN: 'main', SKU: 'sku', MORE: 'more', WAREHOUSE: 'warehouse' })

export const buildProductSteps = (rows, { skuActive = false } = {}) => {
  // Sorted by field_order first; every split below keeps that order.
  const fields = productFields(rows)

  // Quantity, Expiry Date and Unit Rate are never SKU fields, even when
  // marked `sku_field`: they are the entry's own, never in its sku_details.
  const isSkuOnly = (field) => isSkuField(field) && !isDetailField(field)
  const sku = skuActive ? sortedBy(fields.filter(isSkuOnly), (field) => toNumber(field.sku_no)) : []
  // SKU management with no SKU field to tell one SKU from another is a
  // product without SKUs.
  const hasSkus = sku.length > 0

  const normal = hasSkus ? fields.filter((field) => !isSkuOnly(field)) : fields
  const perSku = hasSkus ? sortedBy(normal.filter(isDetailField), detailRank) : []
  // What is filled in once for the product - the top row and the later
  // steps are cut from this, so a per-SKU field never takes a place in them.
  const perProduct = hasSkus ? normal.filter((field) => !isDetailField(field)) : normal

  const main = perProduct.slice(0, PRODUCT_MAIN_FIELD_COUNT)
  const later = chunk(perProduct.slice(PRODUCT_MAIN_FIELD_COUNT), PRODUCT_FIELDS_PER_STEP)

  const steps = []

  if (main.length > 0 || hasSkus) {
    const groups = [{ key: PRODUCT_GROUP.MAIN, title: null, fields: main }].filter((group) => group.fields.length > 0)

    if (hasSkus) {
      groups.push({
        key: PRODUCT_GROUP.SKU,
        title: 'SKU Details',
        fields: [...sku, ...perSku],
        skuFields: sku,
        detailFields: perSku,
        withWarehouse: true,
      })
    } else {
      // Without SKUs the stock is the product's own: under its main fields.
      groups.push({ key: PRODUCT_GROUP.WAREHOUSE, title: null, fields: [] })
    }

    steps.push({ key: 'main', title: 'Main Details', groups })
  }

  later.forEach((group, index) => {
    steps.push({
      key: `more-${index + 1}`,
      // Numbered only when there is more than one, so a short form does not
      // promise a "2" that never comes.
      title: later.length > 1 ? `Additional Details ${index + 1}` : 'Additional Details',
      groups: [{ key: PRODUCT_GROUP.MORE, title: null, fields: group }],
    })
  })

  return steps
}

/**
 * THE STEPS AS THE FORM SHOWS THEM NOW - the reference fields the product's
 * Category has no use for taken out (referencesOfCategory):
 *
 *   Raw Material    no raw-material and no semi-finished field
 *   Semi-Finished   the raw-material field only
 *   Finished        both
 *
 * The Category is the value of the company's field called "Category" (any
 * capitals or spacing), wherever it is - filled in once, or in the first
 * SKU entry. A field with no value yet, or a category not listed above,
 * has neither. A company with no Category field at all keeps both, as
 * before.
 *
 * Worked out on every draw, so changing Category shows or hides them at
 * once. Everything the form does - draw, check, send - goes by these
 * steps, so a field taken out is neither required nor sent (its list goes
 * as []). Its value stays in the form: choosing a category that has it
 * again brings it back as it was. A step left with nothing in it is left
 * out; step 1 never is.
 */
export const applicableSteps = (steps, { values = {}, skuSets = [] } = {}) => {
  const categoryField = steps.flatMap(stepFields).find((field) => productFieldName(field) === PRODUCT_FIELD.CATEGORY)
  if (!categoryField) return steps

  const name = productFieldName(categoryField)
  const shown = referencesOfCategory(values[name] || skuSets[0]?.values?.[name] || '')

  const keep = (field) => {
    const kind = productInputKind(field)
    if (kind === PRODUCT_INPUT.RAW_MATERIAL) return shown.raw
    if (kind === PRODUCT_INPUT.SEMI_FINISHED) return shown.semiFinished
    return true
  }

  return steps
    .map((step) => ({
      ...step,
      groups: step.groups.map((group) => ({
        ...group,
        fields: group.fields.filter(keep),
        ...(group.key === PRODUCT_GROUP.SKU
          ? { skuFields: group.skuFields.filter(keep), detailFields: group.detailFields.filter(keep) }
          : {}),
      })),
    }))
    .filter(
      (step, index) =>
        index === 0 ||
        step.groups.some(
          (group) => group.fields.length > 0 || group.key === PRODUCT_GROUP.SKU || group.key === PRODUCT_GROUP.WAREHOUSE,
        ),
    )
}

/** The SKU group of the form - what each SKU entry is made of - or undefined for a product without SKUs. */
export const skuGroupOf = (steps) =>
  steps.flatMap((step) => step.groups).find((group) => group.key === PRODUCT_GROUP.SKU)

/** Whether a step is where the warehouse allocation of a product without SKUs is filled in. */
export const isWarehouseStep = (step) =>
  (step?.groups ?? []).some((group) => group.key === PRODUCT_GROUP.WAREHOUSE)

/** Every field of a step, whichever group it is in. */
export const stepFields = (step) => (step?.groups ?? []).flatMap((group) => group.fields)

/* ------------------------------------------------------------------ */
/* Values                                                             */
/* ------------------------------------------------------------------ */

/** What a field holds before anything is entered: no file, no references or vendors, or empty text. */
export const emptyProductValue = (field) => {
  const kind = productInputKind(field)
  if (kind === PRODUCT_INPUT.FILE) return null
  return isReferenceInput(kind) || kind === PRODUCT_INPUT.VENDOR ? [] : ''
}

/**
 * The vendors a vendor field holds, as the list of their identifiers (as
 * text, which is what the dropdown works in). A field holds a list; a single
 * identifier - how the field held its one vendor before it took several - is
 * read as a list of one, and nothing as none.
 */
export const productVendorIds = (value) => {
  if (Array.isArray(value)) return value.map(String)
  return value === null || value === undefined || String(value).trim() === '' ? [] : [String(value)]
}

/** Whether a value is "nothing entered": no value, no file, no references, or only spaces. */
const isBlank = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0)

/** A number as people type one: 12, 12.5, .5, -3 - no letters, no "1e5". */
const NUMBER_PATTERN = /^-?(\d+\.?\d*|\.\d+)$/

/** A date as a date box gives one - and a real day, so not the 31st of February. */
const isRealDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/**
 * What is wrong with one field's value, or undefined when nothing is.
 *
 * Required comes from the field (`is_required`), never from its name. A
 * field that is not required may be left empty whatever its type; one that
 * holds something is checked against its type. An `unsupported` field
 * cannot be filled in, so it is never held against the user.
 */
export const validateProductField = (field, value) => {
  const kind = productInputKind(field)
  if (kind === PRODUCT_INPUT.UNSUPPORTED) return undefined

  // A required reference field wants at least one reference added (OK).
  if (isBlank(value)) return field.is_required === true ? `${productFieldName(field)} is required` : undefined
  if (isReferenceInput(kind)) return undefined

  if (kind === PRODUCT_INPUT.NUMBER && !NUMBER_PATTERN.test(String(value).trim())) return 'Enter a valid number'
  if (kind === PRODUCT_INPUT.DATE && !isRealDate(String(value))) return 'Enter a valid date'

  // A choice made before the field's options were changed is no longer one.
  if (kind === PRODUCT_INPUT.DROPDOWN && !productOptions(field).some((option) => option.value === value)) {
    return 'Please select an option from the list'
  }

  return undefined
}

/* ------------------------------------------------------------------ */
/* SKU entries                                                        */
/* ------------------------------------------------------------------ */

/*
 * WHERE THE FORM KEEPS WHAT IS TYPED:
 *
 *   values        { field_name: value }   every field filled in once for the
 *                                         product
 *   skuSets       [{ id, values, allocations }]   one per SKU - a product
 *                                         WITH SKUs only
 *   allocations   the warehouse lines of a product WITHOUT SKUs
 *
 * A SKU entry is everything that belongs to ONE SKU, and one object of the
 * request's `product_details`:
 *
 *   values        its SKU fields (Fabric Type, Color, Size ... whatever the
 *                 company has marked `sku_field`) and its per-SKU fields
 *                 (Quantity, Expiry Date, Unit Rate), by field name
 *   allocations   its own warehouse lines - see "Warehouse allocation" below
 *
 * The form starts with one and "Add SKU" appends another, a copy of the
 * entry above it (copySkuSet); each is drawn from the same fields and
 * keeps its own values. `id` is only the entry's
 * own key on screen. NOTHING is shared between two entries - each has its
 * own `values` object and its own `allocations` list - so typing into one
 * cannot reach another.
 *
 * A product without SKUs has no entries on screen: its quantity, rate and
 * expiry date are normal fields in `values`, and its stock is the one
 * `allocations` list, under the main fields of step 1. (The form still
 * holds one empty entry, which is simply never drawn or sent.)
 */

/** A new, empty SKU entry - nothing in it is copied from any other. */
export const emptySkuSet = (id) => ({ id, values: {}, allocations: [] })

/** A value of its own: a list or an object copied all the way down; a File (never changed) as it is. */
const ownCopy = (value) => {
  if (value === null || typeof value !== 'object') return value
  if (typeof File !== 'undefined' && value instanceof File) return value
  return structuredClone(value)
}

/**
 * A new SKU entry that starts as a COPY OF ANOTHER - what Add SKU makes,
 * from the entry above it, since the next SKU of a product is usually the
 * last one with a field or two changed.
 *
 * Everything the entry holds is copied: its SKU fields, its own fields
 * (Quantity, Expiry Date, Unit Rate and any other), anything else it holds,
 * and every warehouse line - warehouse, quantity, level, shelf and rack.
 * The copy is its own all the way down: lists and objects are copied, not
 * shared, and each line gets a new key from `newLineId()` - so changing
 * the copy changes nothing in the entry it came from.
 */
export const copySkuSet = (id, from, newLineId) => ({
  id,
  values: Object.fromEntries(Object.entries(from?.values ?? {}).map(([name, value]) => [name, ownCopy(value)])),
  allocations: (from?.allocations ?? []).map((line) => ({ ...line, id: newLineId() })),
})

/** Whether anything has been put into an entry - what makes removing it worth asking about. */
export const skuSetHasData = (set) =>
  set.allocations.length > 0 || Object.values(set.values).some((value) => !isBlank(value))

/** `{ field_name: message }` for some fields against the values they are kept in. */
const validateFields = (fields, values) =>
  fields.reduce((errors, field) => {
    const name = productFieldName(field)
    const message = validateProductField(field, values[name])

    if (message) errors[name] = message
    return errors
  }, {})

/** Where a step comes in the form. */
const stepIndexOf = (steps, key) => steps.findIndex((entry) => entry.key === key)

/** The step the quantity field is in, or -1 when the company's product has none. */
const quantityStepIndex = (steps) =>
  steps.findIndex((entry) => stepFields(entry).some((field) => isProductQuantityField(productFieldName(field))))

/**
 * EVERYTHING WRONG WITH ONE STEP.
 *
 *   { fields, sets, lines, total, passes }
 *
 *   fields   { field_name: message } for the step's normal fields
 *   sets     { [entry id]: { fields, lines, total } } - for each SKU entry
 *            with something wrong: its fields the same way, its warehouse
 *            lines (see validateAllocations) and what is wrong with those
 *            lines taken together (see allocationTotalError). An entry with
 *            nothing wrong is not in it.
 *   lines, total   the same two, for the warehouse lines of a product
 *            without SKUs
 *   passes   nothing is wrong anywhere in the step
 *
 * Every SKU entry is checked on its own, against its own values: a required
 * field is required of each entry, and each entry's warehouse lines are
 * held to THAT entry's quantity - never to another's, nor to a total.
 *
 * `form` is what the form holds - `values`, `skuSets`, `allocations` - and
 * `steps` the whole form: the quantity field may be in another step than the
 * warehouse lines it limits.
 *
 * `final` is the check before saving, when every step has been seen. It
 * matters for one case: a product without SKUs has its warehouse lines in
 * step 1, and a company may have put its Quantity field in a LATER step.
 * Stock entered against a quantity the user has not reached yet is not
 * held against step 1 on Next - they could never get to the box that
 * settles it - but it is on the final check, like everything else.
 */
export const checkProductStep = (step, { steps, values, skuSets, allocations }, { final = false } = {}) => {
  const fields = {}
  const sets = {}
  let lines = {}
  let total

  step.groups.forEach((group) => {
    if (group.key === PRODUCT_GROUP.SKU) {
      skuSets.forEach((set) => {
        const found = {
          fields: validateFields(group.fields, set.values),
          lines: group.withWarehouse ? validateAllocations(set.allocations) : {},
          total: group.withWarehouse
            ? allocationTotalError(set.allocations, productQuantity(steps, set.values))
            : undefined,
        }

        if (Object.keys(found.fields).length > 0 || Object.keys(found.lines).length > 0 || found.total) {
          sets[set.id] = found
        }
      })
    } else if (group.key === PRODUCT_GROUP.WAREHOUSE) {
      const quantity = productQuantity(steps, values)
      // Not entered yet, and its box is in a step still to come.
      const notReached = !final && !quantity.entered && quantityStepIndex(steps) > stepIndexOf(steps, step.key)

      lines = validateAllocations(allocations)
      total = notReached ? undefined : allocationTotalError(allocations, quantity)
    } else {
      Object.assign(fields, validateFields(group.fields, values))
    }
  })

  return {
    fields,
    sets,
    lines,
    total,
    passes:
      Object.keys(fields).length === 0 && Object.keys(sets).length === 0 && Object.keys(lines).length === 0 && !total,
  }
}

/**
 * THE VALUES, READY FOR THE PAYLOAD.
 *
 *   { fields, details, vendors, files }
 *
 *   fields    [{ name, value }] for every field filled in once, in the
 *             order the form shows them
 *   details   one per `product_details` entry, in the order on screen:
 *               { sku: [{ name, value }],      its SKU fields, in SKU order
 *                 fields: [{ name, value }],   its per-SKU fields
 *                 warehouses: [...] }          its lines - see collectAllocations
 *             A product with SKUs gives one per SKU entry. A product
 *             without gives exactly one, with no `sku` and no `fields` (its
 *             quantity, rate and expiry are in the top `fields`) and the
 *             product's own warehouse lines.
 *   vendors   [{ id, name }] - every vendor the vendor fields hold, each
 *             once, in the order they were chosen in
 *   files     { name: File } for the File fields that hold one
 *   references   { raw: [...], semiFinished: [...] } - what the
 *             raw-material and semi-finished fields filled in once hold,
 *             each reference exactly as it was added (already in the
 *             request's shape - see buildProductReference). A SKU entry
 *             with such a field of its own has `references` too.
 *
 * Each value is what the backend takes for its type, not what the box held:
 *
 *   text, long-text   trimmed text
 *   number            the number AS TEXT ("23") - this endpoint takes its
 *                     quantities and rates as text
 *   dropdown          the option EXACTLY as the backend listed it
 *   date              YYYY-MM-DD, or null when none was picked
 *   vendor            not here - under `vendors`, as the vendor's own
 *                     identifier and the name the company knows it by
 *   file              not here - under `files`, by its field's name (and,
 *                     for a file that belongs to one SKU entry, its number)
 *   raw-material,     not here - under `references`
 *   semi-finished
 *
 * A field left empty is still sent ("" - or null for a date), so every
 * product, and every SKU entry, carries the same keys. An `unsupported`
 * field has no value and is not sent at all.
 *
 * This says nothing about the shape of the request - that is
 * buildProductPayload in Services/inventoryService, the only place it is
 * built.
 */
export const collectProductValues = (steps, { values, skuSets, allocations }, { vendorOptions = [] } = {}) => {
  const fields = []
  const vendors = []
  const files = {}
  const references = emptyReferences()

  const put = (field, source, target, fileKey = (name) => name, into = references) => {
    const name = productFieldName(field)
    const kind = productInputKind(field)
    const value = source[name]

    if (kind === PRODUCT_INPUT.UNSUPPORTED) return

    if (isReferenceInput(kind)) {
      if (Array.isArray(value)) into[REFERENCE_LIST[kind]].push(...value)
      return
    }

    if (kind === PRODUCT_INPUT.FILE) {
      if (value) files[fileKey(name)] = value
      return
    }

    if (kind === PRODUCT_INPUT.VENDOR) {
      // One that is no longer offered (deleted since) has no name to send
      // and is left out, as it always was; one held twice is sent once.
      productVendorIds(value).forEach((vendorValue) => {
        const chosen = vendorOptions.find((option) => option.value === vendorValue)
        if (chosen && !vendors.some((vendor) => vendor.id === chosen.id)) vendors.push({ id: chosen.id, name: chosen.label })
      })
      return
    }

    if (kind === PRODUCT_INPUT.DATE) {
      target.push({ name, value: isBlank(value) ? null : value })
    } else if (isBlank(value)) {
      target.push({ name, value: '' })
    } else if (kind === PRODUCT_INPUT.DROPDOWN) {
      target.push({ name, value: productOptions(field).find((option) => option.value === value)?.original ?? '' })
    } else {
      target.push({ name, value: String(value).trim() })
    }
  }

  steps.forEach((step) => {
    step.groups.forEach((group) => {
      // The SKU group is gathered per entry, below.
      if (group.key !== PRODUCT_GROUP.SKU) group.fields.forEach((field) => put(field, values, fields))
    })
  })

  const skuGroup = skuGroupOf(steps)

  const details = skuGroup
    ? skuSets.map((set, index) => {
        const detail = {
          sku: [],
          fields: [],
          warehouses: collectAllocations(set.allocations),
          references: emptyReferences(),
        }
        const fileKey = (name) => `${name} [SKU ${index + 1}]`

        skuGroup.skuFields.forEach((field) => put(field, set.values, detail.sku, fileKey, detail.references))
        skuGroup.detailFields.forEach((field) => put(field, set.values, detail.fields, fileKey, detail.references))
        return detail
      })
    : [{ sku: [], fields: [], warehouses: collectAllocations(allocations), references: emptyReferences() }]

  return { fields, details, vendors, files, references }
}

/* ------------------------------------------------------------------ */
/* Edit - the form, filled from what a SKU was saved with               */
/* ------------------------------------------------------------------ */

/**
 * THE FORM, FILLED FROM A SAVED SKU - `saved` is productEditSource's
 * answer. What it gives the form to start from:
 *
 *   { values, skuValues, skuLines, lines }
 *
 *   values      the fields filled in once, by field name
 *   skuValues   the SKU entry's own (a product with SKUs): its SKU fields
 *               and its Quantity, Expiry Date and Unit Rate
 *   skuLines    its warehouse lines (a product with SKUs)
 *   lines       the product's warehouse lines (a product without)
 *
 * Each field is looked up by its name (savedValue): a SKU field in the SKU's
 * details first, a per-SKU field in the entry first, any other field in the
 * product first. A value is put into the form the way the form holds it -
 * a date as YYYY-MM-DD, anything else as text. A vendor field holds its
 * vendors' ids, and a raw-material or semi-finished field the SKU's current
 * references - in each case the first such field takes them all, so none is
 * sent twice, and any other starts empty.
 * A file cannot be put back into a file box, and a field nothing is found
 * for starts empty.
 */
export const prefillProductForm = (steps, saved) => {
  const values = {}
  const skuValues = {}
  const given = new Set()

  const fill = (field, target, objects) => {
    const name = productFieldName(field)
    const kind = productInputKind(field)

    if (kind === PRODUCT_INPUT.UNSUPPORTED || kind === PRODUCT_INPUT.FILE) return

    if (kind === PRODUCT_INPUT.VENDOR) {
      if (given.has(kind)) return
      given.add(kind)
      target[name] = saved.vendors
        .map((vendor) => vendor?.id)
        .filter((id) => id !== undefined && id !== null)
        .map(String)
      return
    }

    if (isReferenceInput(kind)) {
      if (given.has(kind)) return
      given.add(kind)
      target[name] = [...(kind === PRODUCT_INPUT.RAW_MATERIAL ? saved.references.raw : saved.references.semiFinished)]
      return
    }

    const value = savedValue(objects, name)
    if (value === undefined) return

    target[name] = kind === PRODUCT_INPUT.DATE ? toInputDate(value) : String(value).trim()
  }

  const ofProduct = [saved.product, saved.variant, saved.entry]
  const ofEntry = [saved.entry, saved.variant, saved.product]

  steps.forEach((step) => {
    step.groups.forEach((group) => {
      if (group.key === PRODUCT_GROUP.SKU) {
        group.skuFields.forEach((field) => fill(field, skuValues, [saved.sku, ...ofEntry]))
        // The entry's own first; one saved inside sku_details before is still found.
        group.detailFields.forEach((field) => fill(field, skuValues, [...ofEntry, saved.sku]))
        return
      }

      // Without SKUs a field marked `sku_field` is a normal one - but it was
      // saved among the SKU details all the same.
      group.fields.forEach((field) =>
        fill(
          field,
          values,
          isDetailField(field) ? [...ofEntry, saved.sku] : isSkuField(field) ? [saved.sku, ...ofEntry] : ofProduct,
        ),
      )
    })
  })

  const hasSkus = Boolean(skuGroupOf(steps))

  return {
    values,
    skuValues,
    skuLines: hasSkus ? saved.warehouses : [],
    lines: hasSkus ? [] : saved.warehouses,
  }
}

/* ------------------------------------------------------------------ */
/* References - raw materials and semi-finished goods                  */
/* ------------------------------------------------------------------ */

/*
 * A raw-material or semi-finished field holds a LIST of references, each
 * added with OK in ProductReferencePicker: one SKU of one of the
 * company's products, how much of it goes in, and how much is wasted.
 * The form keeps each reference exactly as the request carries it
 * (buildProductReference in Services/inventoryService), so nothing has to
 * be worked out again when the product is saved.
 *
 * What is being chosen, before OK, is a draft:
 *
 *   { product, sku, qty, wastage }   product and sku are the chosen
 *                                    options' values; the two amounts are
 *                                    text as typed
 */

/** Which list of `references` a kind of field adds to. */
const REFERENCE_LIST = {
  [PRODUCT_INPUT.RAW_MATERIAL]: 'raw',
  [PRODUCT_INPUT.SEMI_FINISHED]: 'semiFinished',
}

const emptyReferences = () => ({ raw: [], semiFinished: [] })

/**
 * What is wrong with a draft, as `{ product, sku, qty, wastage }`
 * messages - empty when it can be added. The amounts follow the rules of
 * a warehouse quantity: digits and one decimal point, never a minus.
 * The quantity has to be more than 0; the wastage may be 0.
 *
 * `skuIds` is the SKUs the chosen product offers, and `taken` the SKUs
 * this field already holds a reference to (but not the one being
 * edited): a SKU is referenced once, and changed by editing it.
 */
export const validateReferenceDraft = (draft, { skuIds = [], taken = [] } = {}) => {
  const errors = {}

  if (!draft.product) errors.product = 'Select a product'
  else if (!draft.sku || !skuIds.includes(draft.sku)) errors.sku = 'Select a SKU'
  else if (taken.includes(draft.sku)) errors.sku = 'This SKU is already added - edit it in the list instead'

  const qty = quantityOf(draft.qty)
  if (isBlank(draft.qty)) errors.qty = 'Quantity is required'
  else if (qty === null) errors.qty = 'Enter a valid quantity'
  else if (qty === 0) errors.qty = 'Must be more than 0'

  if (isBlank(draft.wastage)) errors.wastage = 'Wastage is required'
  else if (quantityOf(draft.wastage) === null) errors.wastage = 'Enter a valid wastage'

  return errors
}

/* ------------------------------------------------------------------ */
/* Warehouse allocation - where the product's stock is kept            */
/* ------------------------------------------------------------------ */

/*
 * An allocation is one line of warehouse stock - a SKU entry's own, or
 * the product's when it has no SKUs:
 *
 *   { id, warehouse, warehouse_quantity, level, shelf, rack_no }
 *
 * `id` is only the line's own key on screen. `warehouse` is the chosen
 * warehouse's identifier as text ('' until one is chosen); the other four
 * are text exactly as typed, under the names the backend gives them.
 *
 * No allocation is needed at all. But a line that exists names its
 * warehouse and how much is there; where in it - level, shelf and rack -
 * is optional, and sent as typed ('' when left empty).
 * And however many lines there are, together they cannot hold more than
 * the quantity they belong to: a SKU entry's lines are held to that
 * entry's own quantity, never to another's.
 */

/** A new, empty line. */
export const emptyAllocation = (id) => ({
  id,
  warehouse: '',
  warehouse_quantity: '',
  level: '',
  shelf: '',
  rack_no: '',
})

/**
 * THE LINES, ALL IN ONE WAREHOUSE - for a company whose plan allows only
 * one (see hasSingleWarehouseLimit in Services/inventoryService).
 *
 * `warehouse` is that warehouse's identifier as text, or '' while it is
 * not known (the list is still loading, failed, or is empty). Every line
 * comes back holding it, whatever it held before - so no line of such a
 * company can name a second warehouse, and while the one warehouse is not
 * known every line fails validateAllocations ("Select a warehouse")
 * rather than being sent with a warehouse nobody chose. Nothing else of a
 * line is touched, and a line already right is returned as it is.
 */
export const lockAllocations = (allocations, warehouse) =>
  allocations.map((line) => (line.warehouse === warehouse ? line : { ...line, warehouse }))

/** A quantity as people type one - no minus: stock in a warehouse is not negative. */
const QUANTITY_PATTERN = /^(\d+\.?\d*|\.\d+)$/

/** A typed quantity as a number, or null when it is not one. */
const quantityOf = (text) => {
  const trimmed = String(text ?? '').trim()
  return QUANTITY_PATTERN.test(trimmed) ? Number(trimmed) : null
}

/**
 * THE QUANTITY SOME ALLOCATIONS ARE CHECKED AGAINST. `values` is where
 * that quantity is kept: a SKU entry's own values for its lines, the
 * product's for a product without SKUs.
 *
 *   { exists, entered, value }
 *
 *   exists    the company's product has a quantity field at all (the one
 *             called PRODUCT_QUANTITY_FIELD - "Quantity"). Without one
 *             there is nothing to check allocations against.
 *   entered   something has been typed into it
 *   value     that as a number, or null when it is empty or not a number
 */
export const productQuantity = (steps, values) => {
  const field = steps
    .flatMap(stepFields)
    .find((entry) => isProductQuantityField(productFieldName(entry)))

  if (!field) return { exists: false, entered: false, value: null }

  const typed = values[productFieldName(field)]
  return { exists: true, entered: !isBlank(typed), value: quantityOf(typed) }
}

/** Everything allocated so far - the lines whose quantity is a number, added up. */
export const allocatedQuantity = (allocations) =>
  allocations.reduce((total, allocation) => total + (quantityOf(allocation.warehouse_quantity) ?? 0), 0)

/** A number for a message: 300 not 300.0000000001, 12.5 not 12.50. */
export const tidyQuantity = (number) => String(Number(number.toFixed(6)))

/**
 * What is wrong with the allocations taken TOGETHER, or undefined.
 *
 * Checked every time the form draws, not only on Next - so the message
 * appears the moment a line pushes the total over, and equally the moment
 * the product's quantity is lowered beneath what is already allocated.
 */
export const allocationTotalError = (allocations, quantity) => {
  const total = allocatedQuantity(allocations)

  // Nothing allocated, or no quantity field to hold it to.
  if (total === 0 || !quantity.exists) return undefined

  if (!quantity.entered) return 'Enter the quantity before allocating it to a warehouse.'
  if (quantity.value === null) return 'The quantity is not a valid number.'

  // A hair of tolerance: 0.1 + 0.2 must not "exceed" 0.3.
  if (total - quantity.value > 1e-9) {
    return `Allocated ${tidyQuantity(total)}, but the quantity is ${tidyQuantity(quantity.value)}. Reduce the warehouse quantities or raise the quantity.`
  }

  return undefined
}

/**
 * What is wrong with each line: `{ [line id]: { property: message } }`, with
 * an entry only for a line that has something wrong - so an empty object
 * means every line is complete.
 */
export const validateAllocations = (allocations) =>
  allocations.reduce((errors, allocation) => {
    const found = {}

    if (!allocation.warehouse) found.warehouse = 'Select a warehouse'

    if (isBlank(allocation.warehouse_quantity)) found.warehouse_quantity = 'Quantity is required'
    else if (quantityOf(allocation.warehouse_quantity) === null) found.warehouse_quantity = 'Enter a valid quantity'
    else if (quantityOf(allocation.warehouse_quantity) === 0) found.warehouse_quantity = 'Must be more than 0'

    if (Object.keys(found).length > 0) errors[allocation.id] = found
    return errors
  }, {})

/**
 * The allocations as the backend takes them:
 *
 *   [{ id: "42", warehouse_quantity: "300", level: "1", shelf: "sh-1", rack_no: "A-1" }]
 *
 * `id` is the WAREHOUSE's identifier - the one the warehouse list gave it,
 * as text - and never the line's own key. Everything is trimmed text.
 */
export const collectAllocations = (allocations) =>
  allocations.map((allocation) => ({
    id: allocation.warehouse,
    warehouse_quantity: String(allocation.warehouse_quantity).trim(),
    level: String(allocation.level).trim(),
    shelf: String(allocation.shelf).trim(),
    rack_no: String(allocation.rack_no).trim(),
  }))
