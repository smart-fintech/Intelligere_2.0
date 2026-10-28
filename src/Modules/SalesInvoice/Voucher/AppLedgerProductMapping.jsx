import { useRef, useState } from 'react'
import { AlertCircle, Inbox, Send, X } from 'lucide-react'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { QUERY } from '@/Constants/queryKeys'
import { useQuery } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { getAppLedgerProducts, saveAppMapping } from '@/Services/appLedgerProductService'

const cell = 'px-2 py-1.5'
const orDash = (value) => (value ? value : '--')
const percent = (value) => (value && Number.isFinite(Number(value)) ? `${Number(value)}%` : orDash(value))
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

const LEDGER_COLUMNS = [
  { key: 'name', label: 'Ledger Name', className: 'font-medium' },
  { key: 'group', label: 'Ledger Group' },
  { key: 'platform', label: 'Platform', className: 'capitalize' },
]
const PRODUCT_COLUMNS = [
  { key: 'name', label: 'Product Name', className: 'font-medium' },
  { key: 'hsn', label: 'HSN Code' },
  { key: 'gstRate', label: 'GST Rate', align: 'right', render: (row) => percent(row.gstRate) },
  { key: 'unit', label: 'Unit' },
  { key: 'sellingRate', label: 'Selling Rate', align: 'right' },
  { key: 'category', label: 'Category' },
  { key: 'group', label: 'Group' },
]

/** One list - a tick box per row, and one in the heading for all of them. */
function MappingTable({ title, noun, rows, columns, chosen, onToggle, onToggleAll, disabled }) {
  const all = rows.length > 0 && rows.every((row) => chosen.has(String(row.id)))
  const some = !all && rows.some((row) => chosen.has(String(row.id)))
  return (
    <section className="space-y-1.5" aria-label={title}>
      <p className="text-xs font-semibold tracking-wide text-brand uppercase">
        {title} <span className="font-normal text-muted-foreground normal-case">({rows.length})</span>
      </p>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground" data-testid={`mapping-empty-${noun}`}>
          No {noun}s to map.
        </p>
      ) : (
        <div className="max-h-[30vh] overflow-auto rounded-md border border-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className={cn(cell, 'w-10')}>
                  <Checkbox
                    aria-label={`Select every ${noun}`}
                    checked={all ? true : some ? 'indeterminate' : false}
                    disabled={disabled}
                    onCheckedChange={(on) => onToggleAll(on === true)}
                  />
                </th>
                {columns.map((column) => (
                  <th key={column.key} className={cn(cell, 'font-medium', column.align === 'right' && 'text-right')}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)} className="border-t border-border" data-testid={`mapping-${noun}-row`}>
                  <td className={cell}>
                    <Checkbox
                      aria-label={`Select ${row.name || `${noun} ${row.id}`}`}
                      checked={chosen.has(String(row.id))}
                      disabled={disabled}
                      onCheckedChange={() => onToggle(String(row.id))}
                    />
                  </td>
                  {columns.map((column) => (
                    <td key={column.key} className={cn(cell, 'break-words', column.align === 'right' && 'text-right tabular-nums', column.className)}>
                      {column.render ? column.render(row) : orDash(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/**
 * THE VOUCHER VIEW'S MAPPING - in the panel beside the voucher, in place of
 * its PDF (TallyVouchers' Mapping). The company's ledgers and products for
 * this document type (POST invoice/app-ledger-product/ - asked when it opens,
 * through the shared cache: one request however often it renders), each list
 * with a tick box per row; Show Map sends the ticked ones' ids (PUT - ledger
 * by ledger_obj_id, product by product_id), once however often pressed.
 * Done: the server's message, nothing ticked, the lists read again. Refused:
 * its message, and every tick kept to try again.
 *
 * The parent mounts it afresh (a `key`) for another company or document type,
 * so no tick of one reaches the other.
 *
 *   companyName    the active company's comp_name
 *   documentType   'Sales Invoice' | 'Purchase Invoice'
 *   onClose()
 */
export default function AppLedgerProductMapping({ companyName, documentType, onClose }) {
  const lists = useQuery({
    key: companyName ? [QUERY.APP_LEDGER_PRODUCTS, companyName, documentType] : null,
    fetch: () =>
      getAppLedgerProducts({ companyName, documentType }).catch((failure) => {
        toast.error(failure.message || 'The ledgers and products could not be loaded.')
        throw failure
      }),
  })
  const [chosen, setChosen] = useState({ ledgers: new Set(), products: new Set() })
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)

  const ledgers = lists.data?.ledgers ?? []
  const products = lists.data?.products ?? []
  // Only what the lists still hold counts - and is sent.
  const ledgerIds = ledgers.filter((row) => chosen.ledgers.has(String(row.id))).map((row) => row.id)
  const productIds = products.filter((row) => chosen.products.has(String(row.id))).map((row) => row.id)
  const count = ledgerIds.length + productIds.length

  const toggle = (list, id) =>
    setChosen((current) => {
      const next = new Set(current[list])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...current, [list]: next }
    })
  const toggleAll = (list, rows, on) => setChosen((current) => ({ ...current, [list]: on ? new Set(rows.map((row) => String(row.id))) : new Set() }))

  const showMap = async () => {
    if (busy.current || count === 0) return
    busy.current = true
    setSaving(true)
    try {
      const reply = await saveAppMapping({ companyName, ledgerIds, productIds })
      toast.success(reply?.msg || 'The ledgers and products were sent.')
      setChosen({ ledgers: new Set(), products: new Set() })
      lists.reload()
    } catch (failure) {
      // Every tick stays - to try again.
      toast.error(failure.message || 'The mapping could not be sent.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const loaded = lists.status === 'ready' || (lists.data && lists.status === 'loading')
  return (
    <div className="flex h-[75vh] flex-col" aria-label="Ledger and product mapping">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="truncate text-sm font-semibold text-brand">Mapping - {documentType}</p>
        <Button type="button" variant="ghost" size="sm" icon={X} aria-label="Close mapping" onClick={onClose} />
      </div>

      <div className={cn('min-h-0 flex-1 space-y-4 overflow-auto p-3', lists.status === 'loading' && lists.data && 'opacity-60')}>
        {lists.status === 'failed' && !lists.data ? (
          <StateMessage icon={AlertCircle} tone="error" title="Could not load the ledgers and products" action={<RetryButton onClick={lists.reload} />}>
            {lists.error}
          </StateMessage>
        ) : !loaded ? (
          <ListSkeleton rows={6} />
        ) : ledgers.length === 0 && products.length === 0 ? (
          <StateMessage icon={Inbox} title="Nothing to map">
            There are no ledgers or products to map for {documentType}.
          </StateMessage>
        ) : (
          <>
            <MappingTable
              title="Ledgers"
              noun="ledger"
              rows={ledgers}
              columns={LEDGER_COLUMNS}
              chosen={chosen.ledgers}
              disabled={saving}
              onToggle={(id) => toggle('ledgers', id)}
              onToggleAll={(on) => toggleAll('ledgers', ledgers, on)}
            />
            <MappingTable
              title="Products"
              noun="product"
              rows={products}
              columns={PRODUCT_COLUMNS}
              chosen={chosen.products}
              disabled={saving}
              onToggle={(id) => toggle('products', id)}
              onToggleAll={(on) => toggleAll('products', products, on)}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
        <p className="text-xs text-muted-foreground" data-testid="mapping-selection">
          {count === 0 ? 'Select the ledgers and products to map.' : `${plural(ledgerIds.length, 'ledger')} and ${plural(productIds.length, 'product')} selected`}
        </p>
        <Button type="button" size="sm" icon={Send} loading={saving} disabled={saving || count === 0 || !loaded} onClick={showMap}>
          Show Map
        </Button>
      </div>
    </div>
  )
}
