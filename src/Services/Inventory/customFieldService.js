/**
 * A company's Customised Fields - the fields its inventory products are made
 * of (Inventory Details' Customised Fields tab, read through useCustomFields).
 */

import { toList } from '@/Services/Global/apiHelpers'
import { api } from '@/Services/Global/apiService'

/*
 * ONE URL, ONE METHOD - the body alone says which job it is:
 *
 *   POST  inventory/company_dynamic_fields/   list them    { company_name }
 *   POST  inventory/company_dynamic_fields/   add one      { company_name, custom_fields: { ...field } }
 *   POST  inventory/company_dynamic_fields/   change one   { company_name, custom_fields: { ...the WHOLE field } }
 *
 * `custom_fields` is ONE field, not a list. A change sends the field
 * complete - every property it came with, edited or not - so nothing the
 * form does not show is lost on the way back.
 *
 * The list answers with a bare array of:
 *
 *   { "sr_no": 2, "field_name": "Category", "field_type": "dropdown",
 *     "field_size": "2", "field_order": 2, "options": ["Raw Material", ...],
 *     "option_type": "single", "is_required": true, "hide_field": false,
 *     "customizedReport": true, "invoice_description": false,
 *     "sku_field": true, "sku_no": 1 }          <- the last two only on some
 *
 * The property names are the backend's own, mixed casing included
 * (`customizedReport`), and are never renamed here or in the form.
 *
 * THERE IS NO DELETE HERE YET. How this endpoint removes a field has not
 * been confirmed, and a guessed method or body could remove the wrong thing;
 * it is added as one function below once the contract is known.
 */
const CUSTOM_FIELDS_URL = 'inventory/company_dynamic_fields/'

/**
 * The customised fields of one company. The name comes from the caller,
 * which reads it from the active company in the store - never from a form.
 * Without one there is nothing to ask for.
 */
export const getCustomFields = async (companyName) => {
  if (!companyName) return []

  return toList(await api.post(CUSTOM_FIELDS_URL, { company_name: companyName }))
}

/**
 * Adds a field, or changes one - the same call either way. `field` is the
 * complete field as the backend names its properties.
 */
export const saveCustomField = (companyName, field) =>
  api.post(CUSTOM_FIELDS_URL, { company_name: companyName, custom_fields: field })
