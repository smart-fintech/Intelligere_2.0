/**
 * THE SAC LIST - every SAC code and the service it describes, for the Ledger
 * form's SAC Code dropdown (SacSelector).
 *
 *   GET inventory/sac_list/
 *     -> [ { "sac": "9954", "description": "Construction services" },
 *          { "sac": "995411", "description": "Construction services of ..." }, ... ]
 *
 * The same shape of thing as the HSN list, and made from the same shared
 * behaviour (Services/codeList): fetched once for the whole app, kept in
 * memory, indexed by code, searched by the code's opening digits.
 *
 *   loadSacList()     the list - from memory once it is in; otherwise the
 *                     one request, shared by everyone who asks while it is
 *                     on its way. A failed request is forgotten, so Retry
 *                     asks again.
 *   cachedSacList()   the list if it is already in, else null
 *   findSac(code)     one code's entry, or null
 *   searchSac(list, text, limit)   the codes starting with what is typed
 */

import { createCodeList } from '@/Services/codeList'

const sac = createCodeList({
  url: 'inventory/sac_list/',
  codeField: 'sac',
  nameField: 'description',
})

export const cachedSacList = sac.cached
export const findSac = sac.find
export const loadSacList = sac.load
export const searchSac = sac.search
