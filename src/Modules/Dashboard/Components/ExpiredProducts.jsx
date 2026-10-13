/**
 * The Expired Products view of the Inventory tab - the company's expired
 * stock, in the product table every product list uses.
 *
 *   POST inventory/expired_products/ { company_name }  (getExpiredProducts)
 *
 * The reply has the product list's own shape (readProducts), so it is drawn
 * by ProductTable as it is: a row per product - here with its Category and
 * Total Amount too - its SKUs and warehouses behind the arrow, and the full
 * record (`expiry_product_id`, `moved_at` and all) behind the eye. The
 * filters are the product table's, its Expiry range reading each SKU's
 * `product_details[].expiry_date`.
 *
 * READ-ONLY: no Edit is handed to the table, and there is no Delete - an
 * expired record is not changed through the product's own `product_id`.
 *
 * Read the first time the view is opened, kept while the user is elsewhere,
 * and read again on Refresh or when the company changes (useCompanyReport).
 */

import { AlertCircle, CalendarX, RefreshCw } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import useCompanyReport from '@/Hooks/useCompanyReport'
import { cn } from '@/Library/utils'
import { getExpiredProducts } from '@/Services/inventoryService'
import ProductTable from './ProductTable'

export default function ExpiredProducts({ enabled = true }) {
  const { activeCompanyName: companyName } = useActiveCompany()

  const expired = useCompanyReport(getExpiredProducts, enabled)
  const loading = expired.status === 'loading'

  const renderBody = () => {
    if (!companyName) {
      return (
        <StateMessage icon={CalendarX} title="No company selected">
          Choose a company in the header to see its expired products.
        </StateMessage>
      )
    }

    if (expired.rows.length > 0) return <ProductTable rows={expired.rows} withCategoryAndAmount />

    if (loading || expired.status === 'idle') return <ListSkeleton />

    if (expired.status === 'failed') {
      return (
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load the expired products"
          action={<RetryButton onClick={expired.reload} />}
        >
          {expired.error}
        </StateMessage>
      )
    }

    return (
      <StateMessage icon={CalendarX} title="No expired products">
        Nothing in this company&apos;s stock has expired.
      </StateMessage>
    )
  }

  return (
    <Panel
      title="Expired Products"
      meta={expired.rows.length > 0 ? `(Total Count: ${expired.rows.length})` : undefined}
      actions={
        <Button
          type="button"
          size="sm"
          onClick={expired.reload}
          disabled={!companyName || loading}
          aria-label="Refresh expired products"
        >
          <RefreshCw className={cn(loading && companyName && 'animate-spin')} />
          Refresh
        </Button>
      }
    >
      {expired.status === 'failed' && expired.rows.length > 0 ? (
        <InlineAlert action={<RetryButton onClick={expired.reload} />}>{expired.error}</InlineAlert>
      ) : null}

      {renderBody()}
    </Panel>
  )
}
