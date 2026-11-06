/**
 * KEYWORD MAPPING - accounting_entries/keyword_b2b/. One row per company; each
 * source keeps its own mapping, and a change to one never touches another.
 *
 *   POST   { source, company_id }            -> { keyword: ledger }  ({} when none)
 *   PUT    { source, company_id, mapping }   adds / changes keys -> the source's WHOLE
 *                                              mapping (201 the company's first, else 200)
 *   DELETE { source, company_id, mapping }   removes those keys (only the keys are read)
 *                                              -> { msg }
 *
 * `mapping` is JSON TEXT, not an object - the backend json.loads it.
 *
 *   source            stored in
 *   b2b               b2b_mapping_data
 *   cndn              cndn_mapping_data
 *   multi_party       multi_party_mapping_data       Sales Entries - Multi Ledger
 *   with_inventory    with_inventory_mapping_data    Sales Entries - With Inventory
 *   without_inventory without_inventory_mapping_data Sales Entries - Single Ledger
 *
 * Nothing here shows a message: a failure is an Error carrying the backend's
 * own text (Services/Global/apiService), for the screen to show.
 */

import { api } from '@/Services/Global/apiService'

const MAPPING_URL = 'accounting_entries/keyword_b2b/'

export const KEYWORD_SOURCE = Object.freeze({
  B2B: 'b2b',
  CNDN: 'cndn',
  MULTI_PARTY: 'multi_party',
  WITH_INVENTORY: 'with_inventory',
  WITHOUT_INVENTORY: 'without_inventory',
})

export const getKeywordMapping = (companyId, source) => api.post(MAPPING_URL, { source, company_id: companyId })

/** `mapping` is { keyword: ledger } - merged into what the source has. */
export const saveKeywordMapping = (companyId, source, mapping) =>
  api.put(MAPPING_URL, { source, company_id: companyId, mapping: JSON.stringify(mapping) })

export const deleteKeywordMapping = (companyId, source, keywords) =>
  api.delete(MAPPING_URL, {
    data: { source, company_id: companyId, mapping: JSON.stringify(Object.fromEntries(keywords.map((keyword) => [keyword, '']))) },
  })
