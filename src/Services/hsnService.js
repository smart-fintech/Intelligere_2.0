/**
 * THE HSN LIST - every HSN code and what it describes, for the Product
 * forms' HSN dropdown (HsnSelector).
 *
 *   GET inventory/product_hsn_list/
 *     -> [ { "hsn": "0101", "product_name": "LIVE HORSES, ASSES, MULES AND HINNIES." }, ... ]
 *
 * About 30,000 records that do not change while the app is open, so they are
 * asked for ONCE and kept in memory - not in Redux, not in any form's state.
 *
 *   loadHsnList()     the list - from memory once it is in; otherwise the
 *                     one request, shared by everyone who asks while it is
 *                     on its way. A failed request is forgotten, so the
 *                     next call (Retry) asks again.
 *   cachedHsnList()   the list if it is already in, else null
 *   findHsn(code)     one code's entry, or null - from an index built
 *                     once with the list, never per screen
 *   searchHsn(list, text, limit)   the codes starting with what is typed
 *
 * All four are the shared code-list behaviour (Services/codeList), which the
 * SAC list on the Ledger form is made from as well; only the URL and the two
 * column names are HSN's own. One entry per CODE: a code the reply lists
 * twice, with two descriptions, keeps both (`names`). Codes are text
 * throughout, so "01" stays "01".
 */

import { createCodeList } from '@/Services/codeList'

const hsn = createCodeList({
  url: 'inventory/product_hsn_list/',
  codeField: 'hsn',
  nameField: 'product_name',
})

export const cachedHsnList = hsn.cached
export const findHsn = hsn.find
export const loadHsnList = hsn.load
export const searchHsn = hsn.search
