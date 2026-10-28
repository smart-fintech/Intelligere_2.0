import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, PackageX } from 'lucide-react'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { automaticBooking, bookedOf, bookingItemsOf, buildBookingBody, checkBooking, hasBookingProblems, totalBooked } from '@/Modules/SalesInvoice/inventoryBooking'
import { toDecimalInput } from '@/Modules/SalesInvoice/salesInvoiceForm'
import { bookInventory } from '@/Services/inventoryBookingService'
import { getWarehouses } from '@/Services/inventoryService'

const cell = 'px-2 py-1.5'
const quantity = (value) => String(Number(Number(value).toFixed(3)))

/**
 * BOOK THE SALES ORDER'S STOCK - once the order is saved, before its PDF
 * (the workspace's save: saveWorkflow's `book`). Each product on its own:
 * its name and order quantity, then the warehouses that hold its SKU -
 * Warehouse Name, Contact No., Available Quantity, Book Quantity (typed) and
 * Remaining Quantity (available - booked, as it is typed). OK works only once
 * it all checks out (inventoryBooking's checkBooking - each product booked for
 * its whole order quantity) and sends inventory/inventory_booking/ once, however often
 * pressed: booked - the server's message, onBooked(reply, booked); refused -
 * its message, the modal stays open with every quantity, to try again.
 * Closing it books nothing (onClose) - the order stays saved.
 *
 * NOTHING TO CHOOSE, NOTHING ASKED. When no product has more than one
 * warehouse to book from (automaticBooking), the first booking is sent at
 * once, each product whole from its warehouse, without the modal showing -
 * the very request OK would send, checked the same way. Refused, the modal
 * opens with those quantities filled in, to try again. Opened again to
 * change the booking (initialBooked), it always shows.
 *
 *   open
 *   lines           the order's lines
 *   productsByKey   the product list's products - where each SKU's stock is
 *   companyId, companyName
 *   documentId, documentNo   the saved order
 *   initialBooked   the quantities it opens with - the booking made, when it
 *                   is opened again to change it
 */
export default function InventoryBookingModal({ open, lines, productsByKey, companyId, companyName, documentId, documentNo, initialBooked = null, onBooked, onClose }) {
  // The company's warehouses - their names and contact numbers.
  const [warehouses, setWarehouses] = useState([])
  useEffect(() => {
    if (!open) return undefined
    let current = true
    getWarehouses(companyId)
      .then((list) => current && setWarehouses(Array.isArray(list) ? list : []))
      .catch(() => {
        // Without the list the stock still shows - only names and contact numbers are missing.
      })
    return () => {
      current = false
    }
  }, [open, companyId])

  const items = useMemo(() => bookingItemsOf({ lines, productsByKey, warehouses }), [lines, productsByKey, warehouses])
  // Taken once, as it opens - the warehouse list only names the warehouses, it never adds one.
  const [automatic] = useState(() => (initialBooked ? null : automaticBooking(items)))
  const [booked, setBooked] = useState(() => initialBooked ?? automatic ?? {})
  const [sending, setSending] = useState(false)
  // While the automatic booking is on its way the modal stays hidden; refused, it shows.
  const [hidden, setHidden] = useState(Boolean(automatic))
  const busy = useRef(false)
  const problems = checkBooking(items, booked)
  // OK works only with every quantity valid (the workflow's confirmBooking).
  const valid = !hasBookingProblems(problems)
  // A wrong number shows as it is typed; a product not fully booked once something is typed for it.
  const typedFor = (key) => Object.values(booked[key] ?? {}).some((value) => String(value ?? '').trim() !== '')
  const shown = { cells: problems.cells, items: Object.fromEntries(Object.entries(problems.items).filter(([key]) => typedFor(key))) }

  const type = (itemKey, warehouseId, text) =>
    setBooked((current) => ({ ...current, [itemKey]: { ...current[itemKey], [warehouseId]: toDecimalInput(text) } }))

  /** Sends the booking - true once it is booked; refused, its message, and false. */
  const deliver = (quantities) => {
    const body = buildBookingBody({ companyName, documentId, items, booked: quantities })
    // Nothing any warehouse holds - nothing to book.
    if (body.products.length === 0) {
      onBooked(null, quantities)
      return Promise.resolve(true)
    }
    return bookInventory(body)
      .then((reply) => {
        toast.success(reply?.msg || 'The stock was booked.')
        onBooked(reply, quantities)
        return true
      })
      .catch((failure) => {
        toast.error(failure.message || 'The stock could not be booked.')
        return false
      })
  }

  const confirm = async () => {
    if (busy.current || !valid) return
    busy.current = true
    setSending(true)
    await deliver(booked)
    busy.current = false
    setSending(false)
  }

  // The automatic booking - sent once, as the modal opens (`busy` keeps a second mount from sending it again).
  useEffect(() => {
    if (!open || !automatic || busy.current) return
    busy.current = true
    deliver(automatic).then((done) => {
      busy.current = false
      if (!done) setHidden(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only as it opens
  }, [])

  return (
    <Modal
      open={open && !hidden}
      onOpenChange={(next) => !next && !busy.current && onClose()}
      title={`Book inventory - ${documentNo || 'Sales Order'}`}
      description="Book each product's order quantity from the warehouses that hold it."
      size="xl"
      autoFocus={false}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {valid ? null : <p className="mr-auto text-xs text-muted-foreground">Book each product&apos;s whole order quantity to continue.</p>}
          <Button type="button" variant="outline" disabled={sending} onClick={onClose}>
            Close
          </Button>
          <Button type="button" icon={Check} loading={sending} disabled={sending || !valid} onClick={confirm}>
            OK
          </Button>
        </div>
      }
    >
      <div className="space-y-4" data-testid="inventory-booking">
        {items.map((item) => {
          const total = totalBooked(item, booked)
          const error = shown.items[item.key]
          return (
            <section key={item.key} className="space-y-1.5 rounded-md border border-border p-3" aria-label={`Booking of ${item.productName}`} data-testid="booking-item">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold break-words text-brand">
                  {item.productName || 'Product'}
                  {item.skuCode ? <span className="ml-2 text-xs font-normal text-muted-foreground">{item.skuCode}</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Order Quantity <span className="font-semibold text-foreground tabular-nums" data-testid="booking-order-qty">{quantity(item.orderQty)}</span>
                  {item.warehouses.length ? (
                    <>
                      {' '}
                      - Booked <span className={cn('font-semibold tabular-nums', error ? 'text-destructive' : 'text-foreground')} data-testid="booking-total">{quantity(total)}</span>
                    </>
                  ) : null}
                </p>
              </div>
              {item.warehouses.length === 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="booking-no-stock">
                  <PackageX className="size-3.5" aria-hidden="true" />
                  No warehouse holds this product - nothing to book.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className={cn(cell, 'font-medium')}>Warehouse Name</th>
                        <th className={cn(cell, 'font-medium')}>Contact No.</th>
                        <th className={cn(cell, 'text-right font-medium')}>Available Quantity</th>
                        <th className={cn(cell, 'w-36 font-medium')}>Book Quantity</th>
                        <th className={cn(cell, 'text-right font-medium')}>Remaining Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.warehouses.map((warehouse) => {
                        const value = bookedOf(booked, item.key, warehouse.id) ?? 0
                        const remaining = warehouse.available - Math.max(0, value)
                        const cellError = shown.cells[`${item.key}:${warehouse.id}`]
                        return (
                          <tr key={warehouse.id} className="border-t border-border align-top" data-testid="booking-warehouse">
                            <td className={cn(cell, 'break-words')}>{warehouse.name}</td>
                            <td className={cell}>{warehouse.contact || '--'}</td>
                            <td className={cn(cell, 'text-right tabular-nums')}>{quantity(warehouse.available)}</td>
                            <td className={cell}>
                              <input
                                type="text"
                                inputMode="decimal"
                                aria-label={`Book quantity of ${item.productName} from ${warehouse.name}`}
                                aria-invalid={Boolean(cellError)}
                                className="h-8 w-full rounded-md border border-input bg-card px-2 text-right text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
                                value={booked[item.key]?.[warehouse.id] ?? ''}
                                disabled={sending}
                                onChange={(event) => type(item.key, warehouse.id, event.target.value)}
                              />
                              {cellError ? <p className="mt-0.5 text-[11px] text-destructive">{cellError}</p> : null}
                            </td>
                            <td className={cn(cell, 'text-right font-semibold tabular-nums', remaining < 0 && 'text-destructive')} data-testid="booking-remaining">
                              {quantity(remaining)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {error ? (
                <p className="text-xs text-destructive" role="alert" data-testid="booking-item-error">
                  {error}
                </p>
              ) : null}
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
