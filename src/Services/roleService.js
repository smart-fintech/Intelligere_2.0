/**
 * The roles of the company the user is working in (Create Sub User -> Role).
 *
 * ONE endpoint does all four jobs - the method and the body say which:
 *
 *   POST    tally/company_roles/   list them    { company }
 *   POST    tally/company_roles/   add one      { company, role_name, under_role,
 *                                                 payment_permission, role_group }
 *   PUT     tally/company_roles/   change one   { role_obj_id, role_id, ...fields }
 *   DELETE  tally/company_roles/   remove one   { company_id, role_id }
 *
 * Nothing here catches an error: the shared axios setup (Services/authService)
 * already turns a failure into an Error carrying the backend's own text.
 */

import { api } from '@/Services/authService'

const COMPANY_ROLES_URL = 'tally/company_roles/'

/** The groups a role can belong to - the options of the Role Group field. */
export const ROLE_GROUPS = [
  'Management',
  'Finance',
  'Procurement',
  'Stores',
  'Sales',
  'Production',
  'Dispatch',
]

/**
 * The list reply is one record per company holding its roles:
 *
 *   { role_obj_id: 10, company_id: 12, roles: [{ role_id, role_name, ... }] }
 *
 * Each role is handed back with its record's `role_obj_id` on it (the PUT
 * needs both ids from the row). An array of such records, or a
 * `{ data }` wrapper, is read the same way; anything else is no roles.
 */
const toRoleList = (response) => {
  const body = response?.data && !Array.isArray(response) && !response.roles ? response.data : response
  const records = Array.isArray(body) ? body : body ? [body] : []

  return records.flatMap((record) =>
    (Array.isArray(record?.roles) ? record.roles : [])
      .filter((role) => role && role.role_id != null)
      .map((role) => ({ ...role, role_obj_id: role.role_obj_id ?? record.role_obj_id })),
  )
}

/** Every role of one company. No company, no request. */
export const getCompanyRoles = async (companyId) => {
  if (!companyId) return []
  return toRoleList(await api.post(COMPANY_ROLES_URL, { company_id: companyId }))
}

/**
 * Adds a role: { company, role_name, under_role, payment_permission, role_group }.
 * (The list still answers each role as role_name / under_role.)
 */
export const createCompanyRole = (payload) => api.post(COMPANY_ROLES_URL, payload)

/** Changes a role: { role_obj_id, role_id, role_name, under_role, payment_permission, role_group }. */
export const updateCompanyRole = (payload) => api.put(COMPANY_ROLES_URL, payload)

/** Removes a role. A DELETE body goes under `data` for axios. */
export const deleteCompanyRole = (companyId, roleId) =>
  api.delete(COMPANY_ROLES_URL, { data: { company_id: companyId, role_id: roleId } })
