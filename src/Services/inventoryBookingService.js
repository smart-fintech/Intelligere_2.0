/**
 * A SALES ORDER'S STOCK, BOOKED - once the order is saved:
 *
 *   POST inventory/inventory_booking/   { company_name, document_id, products: [{ "Product Name",
 *        sku_code, quantity, warehouse: [{ id, book_qty }] }] }   (Modules/SalesInvoice/inventoryBooking)
 *        -> { msg: "Sales order booked successfully" }
 */

import { api } from '@/Services/authService'

const INVENTORY_BOOKING_URL = 'inventory/inventory_booking/'

/** Books the stock - a reply saying it failed (success: false) is thrown. */
export const bookInventory = (body) =>
  api.post(INVENTORY_BOOKING_URL, body).then((reply) => {
    if (reply && typeof reply === 'object' && reply.success === false) throw new Error(reply.msg || 'The stock could not be booked.')
    return reply
  })
