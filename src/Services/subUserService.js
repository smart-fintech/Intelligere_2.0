/**
 * The sub users of the signed-in (parent) user (Create Sub User -> User).
 *
 *   POST  useraccount/subuser_list/   list them    { email }  - the parent's
 *   POST  useraccount/register/       create one   see below
 *   PUT   useraccount/subuser_list/   change one   see CHANGING ONE
 *
 * ------------------------------------------------------------------
 * CREATING ONE
 * ------------------------------------------------------------------
 *
 * ONE account, and under `subuser_details` one block per company the sub user
 * is given - keyed by that company's `company_id`:
 *
 *   {
 *     "email": "rahul@company.com", "password": "...", "name": "...",
 *     "role": "SubUser", "designation": "Team Lead",
 *     "subuser_details": {
 *       "2": {
 *         "parent_user_id": 13, "warehouse_id": [44],
 *         "Role Name": "Department Head",
 *         "active_modules": ["Invoice Create", "Repository"],
 *         "Permissions": { "IMS": false, "Edit": true, ... },
 *         "premium_modules": ["Challan", "Quotation"]
 *       },
 *       "3": { ...the same fields, for the next company... }
 *     }
 *   }
 *
 * The modules a company can hand out are its own `active_modules` and
 * `premium_modules` (tally/user-companies-list/, already in the store). The
 * permission keys are NOT per company: they are the fixed list below.
 *
 * A company's `features` (on the same record) decide one more thing: only a
 * company with "Multi Department" has roles to give, so "Role Name" is sent
 * for those companies and left out of the block for the rest - see
 * canAssignRole.
 *
 * ------------------------------------------------------------------
 * READING THEM BACK
 * ------------------------------------------------------------------
 * Each listed sub user carries the same `subuser_details`, one block per
 * company - but the list is not held to the shape that was sent: a block may
 * be filed under the company's NAME with its `company_id` inside, and its
 * `Permissions` may use other keys (`is_edit`, `is_view`):
 *
 *   "subuser_details": {
 *     "DDSPL1": { "Role Name": "Junior Manager", "Role Group": ["Sales"],
 *                 "company_id": 2812, "warehouse_id": [12],
 *                 "Permissions": { "is_edit": false, "is_view": true },
 *                 "active_modules": [...], "premium_modules": [...] }
 *   }
 *
 * So nothing below assumes a key or a permission name: getSubUserCompanies
 * reads whatever blocks and permissions are there.
 *
 * ------------------------------------------------------------------
 * CHANGING ONE
 * ------------------------------------------------------------------
 * Not the register body: no password, name or role, and the account's email
 * and designation go back as they were - they cannot be changed. Each block
 * names its parent by email, not id:
 *
 *   {
 *     "email": "...", "designation": "Junior Manager",
 *     "subuser_details": {
 *       "DDSPL1": { "Role Name": "...", "Role Group": [...],
 *                   "Permissions": { "is_edit": false, "is_view": true },
 *                   "warehouse_id": [12], "active_modules": [...],
 *                   "premium_modules": [...], "parent_email": "..." }
 *     }
 *   }
 *
 * A block the sub user already had is sent back as it was read, under the
 * same key, with only what the form changes put over it - so "Role Group",
 * `company_id` and anything else the form does not show go back untouched,
 * and each permission keeps the key it was stored under (`is_edit` stays
 * `is_edit`). A block for a company the user's own list does not have cannot
 * be shown, and goes back exactly as it came.
 */

import { PREMIUM_MODULE_INVENTORY_MANAGEMENT } from '@/Constants/inventory'
import { getEmail } from '@/Library/secureStorage'
import { SUB_USER_ROLE } from '@/Services/accessService'
import { api } from '@/Services/authService'
import { findCompanyById } from '@/Services/companyService'
import { hasInventoryManagement } from '@/Services/inventoryService'

const REGISTER_URL = 'useraccount/register/'
const SUB_USER_LIST_URL = 'useraccount/subuser_list/'

/** The permission keys - the same for every company, in the order they are shown. */
export const SUB_USER_PERMISSIONS = [
  'IMS',
  'Edit',
  'View',
  'GSTR1',
  'Create',
  'Delete',
  'E-Invoice',
  'E-WayBill',
  'Bank Details',
  'Ledger Details',
  'Product Details',
  'Accept X to Y Invoice',
]

/*
 * Inventory Management is not offered as a premium module to tick: in this
 * form it is the "Product Details" permission. Product Details is offered
 * only by a company with Inventory Management (hasInventoryManagement - its
 * `premium_modules` lists it), starts unticked like every other permission,
 * and when it is ticked the company's Inventory Management goes up with the
 * premium modules:
 *
 *   ticked        "Product Details": true,  "Inventory Management" in premium_modules
 *   not ticked    "Product Details": false, not in premium_modules
 *   company without Inventory Management     no "Product Details" key, and no
 *                                            Inventory Management
 *
 * The company record is left as it came; only what the form offers changes.
 */
const PRODUCT_DETAILS_PERMISSION = 'Product Details'

/** A company's module list, always as an array of names. */
const toModuleList = (modules) =>
  Array.isArray(modules) ? modules.filter((name) => typeof name === 'string' && name) : []

/**
 * What one company can hand to a sub user: { active, premium }. Inventory
 * Management is not among the premium modules - see Product Details above.
 */
export const getCompanyModules = (company) => ({
  active: toModuleList(company?.active_modules),
  premium: toModuleList(company?.premium_modules).filter((name) => name !== PREMIUM_MODULE_INVENTORY_MANAGEMENT),
})

/**
 * The permissions offered for one company, in the usual order: Product
 * Details only for a company with Inventory Management.
 */
export const getCompanyPermissions = (company) => {
  const withProductDetails = hasInventoryManagement(company)
  return SUB_USER_PERMISSIONS.filter((name) => name !== PRODUCT_DETAILS_PERMISSION || withProductDetails)
}

/**
 * The premium modules sent for one company: those ticked, and Inventory
 * Management when Product Details is - see Product Details above.
 */
const toPremiumModules = (company, config) => [
  ...getCompanyModules(company).premium.filter((name) => config.premiumModules.includes(name)),
  ...(hasInventoryManagement(company) && config.permissions.includes(PRODUCT_DETAILS_PERMISSION)
    ? [PREMIUM_MODULE_INVENTORY_MANAGEMENT]
    : []),
]

/* ------------------------------------------------------------------ */
/* What a company's plan allows                                       */
/* ------------------------------------------------------------------ */

/*
 * Entries of a company's `features`, spelt exactly as the backend sends them
 * (as with "Single Warehouse" - see hasSingleWarehouseLimit).
 */
const COMPANY_FEATURE_MULTI_DEPARTMENT = 'Multi Department'
const COMPANY_FEATURE_SINGLE_USER = 'Single User'
const COMPANY_FEATURE_MULTI_USER = 'Multi User'

/** Whether a company's `features` lists one. No list, or not in it, is no. */
const hasFeature = (company, feature) =>
  Array.isArray(company?.features) && company.features.includes(feature)

/**
 * Whether a sub user can be given a ROLE in this company: only a company
 * with "Multi Department" has departments, and so roles, to give. For any
 * other company the form shows no Role Name and none is sent.
 */
export const canAssignRole = (company) => hasFeature(company, COMPANY_FEATURE_MULTI_DEPARTMENT)

/**
 * The company's user plan as its `features` name it - "Single User",
 * "Multi User", or null when they name neither.
 *
 * This only SAYS which plan it is. How many sub users a plan allows is the
 * backend's rule, applied when the sub user is created; no number is kept or
 * checked here.
 */
export const getCompanyUserPlan = (company) =>
  hasFeature(company, COMPANY_FEATURE_SINGLE_USER)
    ? COMPANY_FEATURE_SINGLE_USER
    : hasFeature(company, COMPANY_FEATURE_MULTI_USER)
      ? COMPANY_FEATURE_MULTI_USER
      : null

/** True for a company on the "Single User" plan. */
export const isSingleUserCompany = (company) => getCompanyUserPlan(company) === COMPANY_FEATURE_SINGLE_USER

/** One company's part of the form, with nothing chosen yet. */
export const createCompanyConfig = () => ({
  roleName: '',
  // Warehouse ids as text - what the checkboxes work in (useWarehouseOptions).
  warehouseIds: [],
  activeModules: [],
  premiumModules: [],
  // The permission keys that are ticked; the rest go up as false.
  permissions: [],
})

/** A warehouse id as the number the backend filed it under, where it is one. */
const toWarehouseId = (id) => (Number.isNaN(Number(id)) ? id : Number(id))

/**
 * The form -> the body of the POST.
 *
 *   account        { email, password, name, designation }
 *   parentUserId   the signed-in user's id
 *   assignments    [{ company, config }] - one per company, `company` being its
 *                  record from the store and `config` its createCompanyConfig()
 *
 * A module is only sent for a company that has it, and a role only for a
 * company that can give one (canAssignRole), whatever the form holds.
 */
export const buildSubUserPayload = ({ account, parentUserId, assignments }) => ({
  email: account.email.trim().toLowerCase(),
  password: account.password,
  name: account.name.trim(),
  role: SUB_USER_ROLE,
  designation: account.designation.trim(),
  subuser_details: Object.fromEntries(
    assignments.map(({ company, config }) => [
      String(company.comp_name),
      {
        parent_user_id: parentUserId,
        warehouse_id: config.warehouseIds.map(toWarehouseId),
        ...(canAssignRole(company) ? { 'Role Name': config.roleName } : {}),
        active_modules: getCompanyModules(company).active.filter((name) => config.activeModules.includes(name)),
        Permissions: toPermissionsBlock(company, config.permissions),
        premium_modules: toPremiumModules(company, config),
      },
    ]),
  ),
})

/**
 * Creates the sub user. `skipSession`: the parent stays signed in whatever
 * the reply carries - a new account's tokens must never replace theirs.
 */
export const registerSubUser = (payload) => api.post(REGISTER_URL, payload, { skipSession: true })

/* ------------------------------------------------------------------ */
/* Changing one                                                       */
/* ------------------------------------------------------------------ */

/**
 * A listed sub user as the Edit form starts from it:
 *
 *   account       { email, password: '', name, designation }
 *   assignments   [{ companyId, config, original }] - one per block whose
 *                 company is in `companies`, in the order they came.
 *                 `config` is the block read into createCompanyConfig()'s
 *                 shape; `original` is { key, block } as it arrived
 *   kept          [[key, block]] - the blocks the form cannot show (a company
 *                 not in `companies`, or a second block for one already read),
 *                 to be sent back untouched
 */
export const getSubUserEditValues = (subUser, companies) => {
  const assignments = []
  const kept = []

  Object.entries(readDetails(subUser?.subuser_details)).forEach(([key, block]) => {
    const entry = block && typeof block === 'object' ? toCompanyEntry(key, block) : null
    const company = entry ? findSubUserCompany(entry, companies) : null
    const companyId = company ? String(company.company_id) : null

    if (!companyId || assignments.some((assignment) => assignment.companyId === companyId)) {
      kept.push([key, block])
      return
    }

    assignments.push({
      companyId,
      config: {
        ...createCompanyConfig(),
        roleName: entry.roleName,
        warehouseIds: entry.warehouseIds,
        activeModules: entry.activeModules,
        premiumModules: entry.premiumModules,
        permissions: [
          ...new Set(
            entry.permissions
              .filter((permission) => permission.enabled)
              .map((permission) => toFormPermission(permission.key))
              .filter(Boolean),
          ),
        ],
      },
      original: { key, block },
    })
  })

  return {
    account: {
      email: subUser?.email ? String(subUser.email) : '',
      password: '',
      name: subUser?.name ? String(subUser.name) : '',
      designation: subUser?.designation ? String(subUser.designation) : '',
    },
    assignments,
    kept,
  }
}

/**
 * The Edit form -> the body of the PUT. See CHANGING ONE at the top.
 *
 *   subUser       the record from the list, as it came
 *   assignments   [{ company, config, original }] - `original` as
 *                 getSubUserEditValues gave it, absent for a company added
 *                 on the form
 *   kept          getSubUserEditValues' `kept`
 *
 * As when creating, a module is only sent for a company that has it, and a
 * role only for a company that can give one.
 */
export const buildSubUserUpdatePayload = ({ subUser, assignments, kept = [], parentEmail = getEmail() }) => ({
  email: subUser.email,
  designation: subUser.designation,
  subuser_details: Object.fromEntries([
    ...kept,
    ...assignments.map(({ company, config, original }) => {
      const block = original?.block ?? {}

      return [
        original?.key ?? String(company.comp_name),
        {
          ...block,
          ...(canAssignRole(company) ? { 'Role Name': config.roleName } : {}),
          Permissions: toPermissionsBlock(company, config.permissions, readDetails(block.Permissions)),
          warehouse_id: config.warehouseIds.map(toWarehouseId),
          active_modules: getCompanyModules(company).active.filter((name) => config.activeModules.includes(name)),
          premium_modules: toPremiumModules(company, config),
          parent_email: block.parent_email ?? parentEmail,
        },
      ]
    }),
  ]),
})

/** Saves the changes to a sub user. */
export const updateSubUser = (payload) => api.put(SUB_USER_LIST_URL, payload)

/* ------------------------------------------------------------------ */
/* The list                                                           */
/* ------------------------------------------------------------------ */

/**
 * Every sub user of the signed-in user. The email is the one saved at
 * sign-in, as for the company list (getUserCompanies) - no screen passes it.
 *
 * The records are handed back as the API sent them. A bare array, a
 * `{ data }` / `{ results }` wrapper, or an object holding the array under
 * some other name are all read; anything else is no sub users.
 */
export const getSubUsers = async (email = getEmail()) => {
  if (!email) return []

  const response = await api.post(SUB_USER_LIST_URL, { email })
  const list = Array.isArray(response)
    ? response
    : Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response?.results)
        ? response.results
        : response && typeof response === 'object'
          ? Object.values(response).find(Array.isArray) ?? []
          : []

  return list.filter((record) => record && typeof record === 'object')
}

/** `subuser_details` as an object, whether it arrived as one or as JSON text. */
const readDetails = (details) => {
  let value = details
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/** One value or a list of them, always as a list of text with the blanks left out. */
const toTextList = (value) =>
  (Array.isArray(value) ? value : [value])
    .filter((entry) => entry !== null && entry !== undefined && entry !== '')
    .map(String)

/**
 * A permission key as words: `is_edit` -> "Edit", `bank_details` -> "Bank
 * Details". A key that is already written for reading ("E-WayBill") is kept.
 */
const toPermissionLabel = (key) =>
  /^[a-z0-9_]+$/.test(key)
    ? key
      .replace(/^is_/, '')
      .replace(/_/g, ' ')
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    : key

/**
 * The companies a listed sub user has, one entry per block of its
 * `subuser_details`:
 *
 *   { key, companyId, roleName, roleGroups, warehouseIds, activeModules,
 *     premiumModules, permissions: [{ key, label, enabled }] }
 *
 * `key` is what the block was filed under - a company name or a company_id,
 * see resolveSubUserCompany. Lists are text; a missing one is empty.
 */
export const getSubUserCompanies = (subUser) =>
  Object.entries(readDetails(subUser?.subuser_details))
    .filter(([, config]) => config && typeof config === 'object')
    .map(([key, config]) => toCompanyEntry(key, config))

/** One block of `subuser_details` read into an entry - see getSubUserCompanies. */
const toCompanyEntry = (key, config) => ({
  key,
  companyId: config.company_id ?? null,
  roleName: config['Role Name'] ? String(config['Role Name']) : '',
  roleGroups: toTextList(config['Role Group']),
  warehouseIds: toTextList(config.warehouse_id),
  activeModules: toTextList(config.active_modules),
  premiumModules: toTextList(config.premium_modules),
  permissions: Object.entries(readDetails(config.Permissions)).map(([permission, value]) => ({
    key: permission,
    label: toPermissionLabel(permission),
    enabled: value === true,
  })),
})

/** A permission key reduced to its letters: `is_e_invoice` and "E-Invoice" are both "einvoice". */
const permissionWord = (key) =>
  toPermissionLabel(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** The form's permission (SUB_USER_PERMISSIONS) a stored key stands for - `is_edit` -> "Edit" - or undefined. */
const toFormPermission = (key) => SUB_USER_PERMISSIONS.find((name) => permissionWord(name) === permissionWord(key))

/**
 * The ticked permissions -> one company's `Permissions`: every permission the
 * company offers (getCompanyPermissions), true or false; one it does not
 * offer is left out. Over `stored` (a block's own, when it is changed), each
 * goes under the key it was stored under, and keys the form does not know
 * stay as they were.
 */
const toPermissionsBlock = (company, selected, stored = {}) => {
  const offered = getCompanyPermissions(company)
  const block = { ...stored }
  SUB_USER_PERMISSIONS.forEach((name) => {
    const storedKeys = Object.keys(stored).filter((key) => toFormPermission(key) === name)

    if (!offered.includes(name)) {
      storedKeys.forEach((key) => delete block[key])
      return
    }

    block[storedKeys[0] ?? name] = selected.includes(name)
  })
  return block
}

/**
 * The user's company one of those entries is, or null: by the block's own
 * `company_id`, then by its key - a company_id or a company name, depending
 * on how it was filed.
 */
const findSubUserCompany = (entry, companies) =>
  findCompanyById(companies, entry.companyId) ??
  findCompanyById(companies, entry.key) ??
  companies?.find((company) => company.comp_name === entry.key) ??
  null

/**
 * Which company one of those entries is: { name, companyId }, from the
 * user's companies (the store's list) - see findSubUserCompany. A company
 * that is not in the list keeps the key as its name, which is the name the
 * backend filed it under.
 */
export const resolveSubUserCompany = (entry, companies) => {
  const company = findSubUserCompany(entry, companies)

  return {
    name: company?.comp_name || entry.key,
    companyId: entry.companyId ?? company?.company_id ?? null,
  }
}
