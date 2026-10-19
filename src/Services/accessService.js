/**
 * WHAT A SUB USER MAY DO - the rules, in one place.
 *
 * A sub user's companies come from tally/user-companies-list/ like anybody's,
 * but each company record also carries what that sub user was given in it:
 *
 *   { comp_name, active_modules, premium_modules, warehouse_id,
 *     Permissions: { "View": true, "Create": true, "Edit": false,
 *                    "Delete": false, "Product Details": true,
 *                    "Ledger Details": false, "Bank Details": false, ... } }
 *
 * Three SECTIONS are governed here - Product Details, Ledger Details and
 * Bank Details - and four ACTIONS on each - View, Create, Edit, Delete. An
 * action on a section is allowed only when ALL of these hold, for the
 * company the user is working in:
 *
 *   1. the section's own permission is true       Permissions["Bank Details"]
 *   2. the action's permission is true            Permissions["View"]
 *   3. the company is entitled to the section     SECTION_ENTITLEMENTS below
 *
 * Every check is `=== true`: a permission that is missing, false, or anything
 * else is a no. The permissions are always the ACTIVE company's own record,
 * so moving to another company changes the answer with it.
 *
 * Only a sub user is held to this. Anybody else - the main user, or a session
 * with no role saved (one that began before the role was kept, until its next
 * sign-in) - may do everything, exactly as before these rules.
 *
 * THIS IS THE SCREEN'S SIDE ONLY. Hiding a button stops nobody who calls the
 * API directly: the backend must refuse the same things on its own.
 */

import { hasInventoryManagement } from '@/Services/inventoryService'

/** The `role` a sub user signs in with (and is registered with). */
export const SUB_USER_ROLE = 'SubUser'

/** What a link to a section the user may not view says, on hover and focus. */
export const NO_VIEW_MESSAGE = "You don't have permission to view this module."

/** The sections, by their permission key - spelt exactly as the backend sends it. */
export const ACCESS_SECTIONS = {
  PRODUCT: 'Product Details',
  LEDGER: 'Ledger Details',
  BANK: 'Bank Details',
}

/** The actions, by their permission key, and the name each has in an answer. */
const ACTIONS = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
}

/**
 * What a company must have for a section to be offered at all, beyond the
 * permissions. Only the mapping the app already has is used: Product Details
 * is Inventory Management's (see hasInventoryManagement, and the sub user
 * form, which gives Product Details only with it). Ledger and Bank Details
 * have no module of their own in the app, so they are not held to one.
 */
const SECTION_ENTITLEMENTS = {
  [ACCESS_SECTIONS.PRODUCT]: hasInventoryManagement,
}

/* ------------------------------------------------------------------ */
/* Product modules a company has                                      */
/* ------------------------------------------------------------------ */

/**
 * Names compared as the backend may write them - case, spaces and
 * punctuation ignored - the same rule the premium recharge page uses, so
 * "Sales Invoice" and "sales-invoice" are one module.
 */
const compactName = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Whether a module list (`active_modules`, `premium_modules`) holds any of `names`. */
export const listsModule = (list, names) => {
  const wanted = new Set(names.map(compactName))
  return (Array.isArray(list) ? list : []).some((entry) => wanted.has(compactName(entry)))
}

/**
 * Whether the company - the active company's record from
 * tally/user-companies-list/, which for a sub user is what they were given -
 * has a product module: its `active_modules` lists the module's key
 * (Constants/dashboardModules, PRODUCT_MODULES).
 */
export const hasActiveModule = (company, moduleKey) => listsModule(company?.active_modules, [moduleKey])

/** True for the sub user role. */
export const isSubUserRole = (role) => role === SUB_USER_ROLE

/** Whether a company record grants one permission. Missing or not `true` is no. */
const hasPermission = (company, key) => {
  const permissions = company?.Permissions
  return Boolean(permissions) && typeof permissions === 'object' && permissions[key] === true
}

/** Whether the company is entitled to a section - see SECTION_ENTITLEMENTS. */
const isEntitled = (company, section) => {
  const entitled = SECTION_ENTITLEMENTS[section]
  return entitled ? entitled(company) === true : true
}

/** Everything allowed - the answer for anybody who is not a sub user. */
export const FULL_ACCESS = Object.freeze({ view: true, create: true, edit: true, delete: true, any: true })

/** Nothing allowed. */
export const NO_ACCESS = Object.freeze({ view: false, create: false, edit: false, delete: false, any: false })

/**
 * What the user may do with one section of one company:
 *
 *   { view, create, edit, delete, any }   - `any`: at least one of them
 *
 *   subUser   true when the signed-in user is a sub user (isSubUserRole)
 *   company   the company being worked in - its record from the company list
 *   section   one of ACCESS_SECTIONS
 */
export const getSectionAccess = ({ subUser, company }, section) => {
  if (!subUser) return FULL_ACCESS
  if (!hasPermission(company, section) || !isEntitled(company, section)) return NO_ACCESS

  const access = Object.fromEntries(
    Object.entries(ACTIONS).map(([action, key]) => [action, hasPermission(company, key)]),
  )
  return { ...access, any: Object.values(access).some(Boolean) }
}
