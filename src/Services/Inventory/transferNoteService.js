/**
 * Transfer Notes - stock moved from one warehouse to another.
 */

import { QUERY } from '@/Constants/queryKeys'
import { invalidateQueries } from '@/Library/queryCache'
import { api } from '@/Services/Global/apiService'
import { changesProducts } from '@/Services/Product/productCache'

/*
 * ONE URL, FOUR JOBS - AND THE LIST IS A **POST**:
 *
 *   POST    inventory/transfer_notes/   list them   { company_name, warehouse_id? }
 *   POST    inventory/transfer_notes/   add one     { company_name, transfer_no, transfer_date (DD-MM-YYYY),
 *                                                     vehicle_no, declaration, from_warehouse_id,
 *                                                     to_warehouse_id, products: [{ product_id, quantity, remark }] }
 *           -> { msg, id, transfer_note_file }
 *   PUT     inventory/transfer_notes/   change one  the same body with the note's `id`
 *           -> { msg, transfer_note_file }
 *   DELETE  inventory/transfer_notes/   remove one  { company_name, id }  -> { msg }
 *
 * The list answers with [{ id, transfer_no, transfer_date (DD/MM/YYYY), vehicle_no,
 * declaration, from_warehouse: {...}, to_warehouse: {...}, products: [{ product_id,
 * "Product Name", sku_code, sku_details, "HSN Code", "Per Unit", quantity, remark,
 * moved: [{ sr_no, quantity }] }], transfer_note_file, created_at }] (see transferNotes).
 *
 * A note moves stock between warehouses, so a create, change or delete that
 * succeeded reads the transfer notes again - at once where they are on
 * screen - and marks the product list stale (its warehouse quantities moved).
 */
const TRANSFER_NOTE_URL = 'inventory/transfer_notes/'

const changesTransferNotes = (request) =>
  changesProducts(request).then((reply) => {
    invalidateQueries(QUERY.TRANSFER_NOTES, { refetchActive: true })
    return reply
  })

/** The company's notes - one warehouse's (`warehouseId`), or all of them when it is not given. */
export const getTransferNotes = ({ companyName, warehouseId }) =>
  api.post(TRANSFER_NOTE_URL, { company_name: companyName, ...(warehouseId ? { warehouse_id: warehouseId } : null) })

export const createTransferNote = (body) => changesTransferNotes(api.post(TRANSFER_NOTE_URL, body))

export const updateTransferNote = (body) => changesTransferNotes(api.put(TRANSFER_NOTE_URL, body))

/** A DELETE with a body has to be put under `data` for axios to send it. */
export const deleteTransferNote = ({ companyName, id }) =>
  changesTransferNotes(api.delete(TRANSFER_NOTE_URL, { data: { company_name: companyName, id } }))
