import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { Modal } from '@/Components/Common/Modal'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import useCustomFields from '@/Hooks/useCustomFields'
import useMasterDetails from '@/Hooks/useMasterDetails'
import useProducts from '@/Hooks/useProducts'
import useVendorOptions from '@/Hooks/useVendorOptions'
import useWarehouseOptions from '@/Hooks/useWarehouseOptions'
import ProductFormModal from '@/Modules/Dashboard/Components/ProductFormModal'
import { buildProductSteps, PRODUCT_INPUT, productInputKind, stepFields } from '@/Modules/Dashboard/productForm'
import { hasSingleWarehouseLimit, isSkuManagementEnabled } from '@/Services/inventoryService'

/**
 * BOOK A SAVED PURCHASE'S STOCK - Purchase Invoice and Inbound Challan alike
 * (the workspace's save, saveWorkflow's `book`: after the document is
 * created, before its file / PDF is saved). Its product lines
 * (stockBookingItems), one at a time - "1 of 3" - each in the product form
 * the Products page uses (the company's own fields - buildProductSteps), as
 * its `booking`: filled from the product list for that product and SKU, the
 * line's Quantity and Unit Rate, the warehouse the user's to choose. Each is
 * saved on its own (the product POST, with the document's `document_id`),
 * then the next opens; after the last, onDone(). It cannot be closed: every
 * line's stock goes into a warehouse before the document's file is saved.
 *
 *   items         stockBookingItems(...).items - never empty
 *   documentId    the saved document's - sent with every product
 *   documentNo    for the title
 *   onDone()      every line booked
 */
export default function StockBookingModal({ items, documentId, documentNo, onDone }) {
  const { activeCompany, activeCompanyName: companyName } = useActiveCompany()
  const customFields = useCustomFields()
  const masterDetails = useMasterDetails()
  const products = useProducts()
  const warehouses = useWarehouseOptions(true)

  // The form, as the Products page works it out - it waits for the SKU setting and the fields.
  const skuActive = masterDetails.status === 'ready' && isSkuManagementEnabled(masterDetails.record)
  const steps = useMemo(() => buildProductSteps(customFields.rows, { skuActive }), [customFields.rows, skuActive])
  const needsVendors = steps.some((step) => stepFields(step).some((field) => productInputKind(field) === PRODUCT_INPUT.VENDOR))
  const vendors = useVendorOptions(needsVendors)
  const readyNow = masterDetails.status === 'ready' && customFields.status === 'ready' && products.status === 'ready' && steps.length > 0
  // Once in, the form stays: a list read again (the products, after each save) never takes it away mid-line.
  const [kept, setKept] = useState(null)
  if (readyNow && kept !== steps) setKept(steps)
  const formSteps = readyNow ? steps : kept
  const ready = Boolean(formSteps) && products.rows.length > 0
  const failed = [masterDetails, customFields, products].find((entry) => entry.status === 'failed') ?? null

  // The line being booked - each saved one is never shown again.
  const [index, setIndex] = useState(0)
  const item = items[index]

  if (!ready) {
    // Not closable either: nothing can be booked until the form is in.
    return (
      <Modal open onOpenChange={() => {}} title={`Book stock - ${documentNo || 'document'}`} size="md" closeOnBackdropClick={false} closeOnEsc={false} showCloseButton={false}>
        {failed && !readyNow ? (
          <InlineAlert action={<RetryButton onClick={failed.reload} />}>The product form could not be loaded. {failed.error}</InlineAlert>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" data-testid="stock-booking-loading">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading the product form...
          </p>
        )}
      </Modal>
    )
  }

  const last = index === items.length - 1
  return (
    <ProductFormModal
      // A fresh form for each line - nothing of one reaches the next.
      key={`${documentId}:${item.key}`}
      open
      onOpenChange={() => {}}
      steps={formSteps}
      companyName={companyName}
      vendors={vendors}
      warehouses={warehouses}
      products={products}
      singleWarehouse={hasSingleWarehouseLimit(activeCompany)}
      booking={{
        productKey: item.productKey,
        skuIndex: item.skuIndex,
        quantity: item.quantity,
        rate: item.rate,
        extra: { document_id: documentId },
        title: `Book stock - ${documentNo || 'document'} (${index + 1} of ${items.length})`,
        submitLabel: last ? 'Save Stock' : 'Save & Next',
      }}
      onSaved={() => (last ? onDone() : setIndex(index + 1))}
    />
  )
}
