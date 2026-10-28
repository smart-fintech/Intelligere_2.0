import { useRef, useState } from 'react'

import { toast } from '@/Library/toast'
import { orderSourceOf, readOrderRows } from '@/Modules/SalesInvoice/orderProducts'
import { getOrderNumbers, getOrderProducts } from '@/Services/orderProductService'

const IDLE = Object.freeze({ status: 'idle', rows: [], error: null })

/**
 * The order products of the document being made (orderProducts):
 *
 *   const orders = useOrderProducts({ companyId, documentType, partyKey, onCheckedChange })
 *
 *   orders.source      the type its products come from (orderSourceOf), or null - nothing to offer
 *   orders.numbers     { status, rows, error } - the party's order numbers
 *   orders.chosen      the numbers ticked
 *   orders.products    { status, rows, error } - readOrderRows of the chosen orders' products
 *   orders.checked     the product rows ticked (their keys)
 *   orders.request(buyerId)   asks for the numbers - Step 2's Next; once per type and party
 *   orders.choose(numbers)    other orders ticked: the products listed are cleared
 *   orders.loadProducts()     OK - the chosen orders' products (one request at a time)
 *   orders.toggle(key)        a product row ticked or not - onCheckedChange(rows ticked)
 *
 * Everything belongs to the type and party (`partyKey` - the ledger chosen) it
 * was asked for: another buyer or type shows nothing of the last one's - no
 * numbers, products or ticks - until its own are asked for. Every request
 * carries a ticket; an answer to one since replaced is dropped.
 */
export default function useOrderProducts({ companyId, documentType, partyKey, onCheckedChange }) {
  const source = orderSourceOf(documentType)
  const current = source && partyKey ? `${documentType}|${partyKey}` : null
  // { key, buyerId, numbers, chosen, products, checked } - for one type and party.
  const [state, setState] = useState(null)
  const ticket = useRef(0)
  const own = state && state.key === current ? state : null

  const request = (buyerId) => {
    if (!current || !buyerId) return
    // Already asked for (or on its way) for this type and party - not asked again.
    if (own && own.numbers.status !== 'failed') return
    const mine = ++ticket.current
    const key = current
    setState({ key, buyerId, numbers: { status: 'loading', rows: [], error: null }, chosen: [], products: IDLE, checked: [] })
    getOrderNumbers({ buyerId, companyId, documentType: source })
      .then((rows) => {
        if (mine === ticket.current) setState((previous) => (previous?.key === key ? { ...previous, numbers: { status: 'ready', rows, error: null } } : previous))
      })
      .catch((failure) => {
        if (mine !== ticket.current) return
        const message = failure.message || `The ${source} numbers could not be loaded.`
        setState((previous) => (previous?.key === key ? { ...previous, numbers: { status: 'failed', rows: [], error: message } } : previous))
        toast.error(message)
      })
  }

  const choose = (numbers) => {
    if (!own) return
    ticket.current += 1
    setState({ ...own, chosen: numbers, products: IDLE, checked: [] })
    onCheckedChange?.([])
  }

  const loadProducts = () => {
    if (!own || own.products.status === 'loading') return
    if (own.chosen.length === 0) {
      toast.error(`Select at least one ${source} number.`)
      return
    }
    const mine = ++ticket.current
    const { key, buyerId, chosen } = own
    setState({ ...own, products: { status: 'loading', rows: [], error: null }, checked: [] })
    onCheckedChange?.([])
    getOrderProducts({ companyId, buyerId, documentType: source, documentNos: chosen })
      .then((reply) => {
        if (mine === ticket.current) setState((previous) => (previous?.key === key ? { ...previous, products: { status: 'ready', rows: readOrderRows(reply), error: null } } : previous))
      })
      .catch((failure) => {
        if (mine !== ticket.current) return
        const message = failure.message || 'The products could not be loaded.'
        setState((previous) => (previous?.key === key ? { ...previous, products: { status: 'failed', rows: [], error: message } } : previous))
        toast.error(message)
      })
  }

  const toggle = (rowKey) => {
    if (!own) return
    const checked = own.checked.includes(rowKey) ? own.checked.filter((key) => key !== rowKey) : [...own.checked, rowKey]
    setState({ ...own, checked })
    onCheckedChange?.(own.products.rows.filter((row) => checked.includes(row.key)))
  }

  return {
    source,
    numbers: own?.numbers ?? IDLE,
    chosen: own?.chosen ?? [],
    products: own?.products ?? IDLE,
    checked: own?.checked ?? [],
    request,
    choose,
    loadProducts,
    toggle,
    retryNumbers: () => own && request(own.buyerId),
  }
}
