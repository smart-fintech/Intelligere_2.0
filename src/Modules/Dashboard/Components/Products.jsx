/**
 * The Product section of Inventory Details: adding a product for the active
 * company, in a dialog opened from here.
 *
 * THE PRODUCT LIST IS NOT HERE YET. How inventory/product/ lists a company's
 * products has not been confirmed (see the note in inventoryService), so
 * this page is, for now, the way in to Add Product. The table, its search,
 * filters and pager take this card's body when the list contract is known -
 * `handleSaved` below is where it will be read again after a save.
 *
 * ------------------------------------------------------------------
 * WHAT THE FORM IS MADE OF - ALL OF IT ALREADY IN THE APP
 * ------------------------------------------------------------------
 *   the fields           the company's Customised Fields    useCustomFields
 *   SKU on or off        the company's Master Details        useMasterDetails
 *   its vendors          the Vendor list                     useVendorOptions
 *   its warehouses       the Warehouse list                  useWarehouseOptions
 *
 * The first two are read from the store, shared with the tabs that own
 * them, so opening this section after either of those costs no request -
 * and a field added on the Customised Fields tab, or SKUs switched on in
 * Master Details, changes the form without a reload. The last two are asked
 * for only once the dialog has been opened (and, for vendors, only when a
 * field asks for one).
 *
 * ------------------------------------------------------------------
 * ONE DECISION
 * ------------------------------------------------------------------
 *   skuActive   "Enable SKU" is on in the company's Master Details.
 *
 * That alone decides between the two forms: a product with SKUs (the SKU
 * Details section in step 1, an entry per SKU, each with its own stock) and
 * a product without (one product, with a Warehouse step). It is never
 * worked out from the fields - a field marked `sku_field` says which fields
 * the SKU details are, not whether there are any - and the company's plan
 * (`premium_modules`) has no say in the form at all. Until the Master
 * Details have actually been read the form cannot be opened, rather than
 * drawn one way and redrawn the other.
 *
 * Nothing here is the form itself: that is ProductFormModal, and the rules
 * for cutting the fields into steps are in ../productForm.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { AlertCircle, Package, Plus } from 'lucide-react'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { ENV } from '@/Config/env'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import useCustomFields from '@/Hooks/useCustomFields'
import useMasterDetails from '@/Hooks/useMasterDetails'
import useVendorOptions from '@/Hooks/useVendorOptions'
import useWarehouseOptions from '@/Hooks/useWarehouseOptions'
import { isSkuManagementEnabled } from '@/Services/inventoryService'
import { selectCompanyStatus } from '@/Store/Slices/companySlice'
import {
  buildProductSteps,
  isSkuField,
  PRODUCT_INPUT,
  productFieldName,
  productInputKind,
  stepFields,
} from '../productForm'
import ProductFormModal from './ProductFormModal'

export default function Products() {
  const { activeCompanyId: companyId, activeCompanyName: companyName } = useActiveCompany()
  const companyStatus = useSelector(selectCompanyStatus)

  const customFields = useCustomFields()
  const masterDetails = useMasterDetails()

  /* ---------------- The one decision ---------------- */

  // The SKU setting is the Master Details' alone, so every form waits for
  // them - and for nothing else.
  const skuSettingKnown = masterDetails.status === 'ready'
  const skuActive = skuSettingKnown && isSkuManagementEnabled(masterDetails.record)

  /* ---------------- The form, worked out from the fields ---------------- */
  const steps = useMemo(() => buildProductSteps(customFields.rows, { skuActive }), [customFields.rows, skuActive])

  /* What decided the form, in the browser console (VITE_DEBUG_LOGS=true) -
     the same switch the company list logs under. When the SKU Details
     section is missing, this says which of its two conditions was not met:
     the Master Details setting, or the fields themselves. */
  useEffect(() => {
    if (!ENV.DEBUG_LOGS || !companyId || !skuSettingKnown) return

    console.log('[Product] Form:', {
      skuSetting: masterDetails.record?.sku,
      skuActive,
      skuFields: customFields.rows.filter(isSkuField).map(productFieldName),
      steps: steps.map((step) => `${step.title}: ${stepFields(step).map(productFieldName).join(', ')}`),
    })
  }, [companyId, skuSettingKnown, masterDetails.record, skuActive, customFields.rows, steps])

  const needsVendors = useMemo(
    () => steps.some((step) => stepFields(step).some((field) => productInputKind(field) === PRODUCT_INPUT.VENDOR)),
    [steps],
  )

  /* ---------------- The dialog ----------------
     `session` changes on every opening and is the dialog's `key`, so each
     one starts from an empty form - and, counting from zero, says whether
     the dialog has ever been opened. */
  const [dialog, setDialog] = useState({ open: false, session: 0 })

  const openDialog = () => setDialog((previous) => ({ open: true, session: previous.session + 1 }))
  const closeDialog = () => setDialog((previous) => ({ ...previous, open: false }))

  // Asked for once the dialog has been opened - a visit to this page alone
  // costs neither request. Every form has warehouse stock; only one with a
  // vendor field needs the vendors.
  const everOpened = dialog.session > 0
  const vendors = useVendorOptions(everOpened && needsVendors)
  const warehouses = useWarehouseOptions(everOpened)

  /** A product was saved: the dialog goes. (The list is read again here, once there is one.) */
  const handleSaved = () => closeDialog()

  // The form can be opened once there is something to build it from and
  // every decision above has an answer.
  const ready = Boolean(companyId) && skuSettingKnown && steps.length > 0

  const addButton = (
    <Button type="button" size="sm" icon={Plus} onClick={openDialog} disabled={!ready}>
      Add Product
    </Button>
  )

  /* ---------------- What fills the card ---------------- */
  const renderBody = () => {
    if (!companyId) {
      if (companyStatus === 'idle' || companyStatus === 'loading') return <ListSkeleton />

      return (
        <StateMessage icon={Package} title="No company selected">
          Choose a company in the header to add its products.
        </StateMessage>
      )
    }

    // The fields: nothing to build a form from until they are in.
    if (customFields.rows.length === 0) {
      if (customFields.status === 'loading') return <ListSkeleton />

      // Nothing tries again on its own; Retry is the only way.
      if (customFields.status === 'failed') {
        return (
          <StateMessage
            icon={AlertCircle}
            tone="error"
            title="Could not load the product fields"
            action={<RetryButton onClick={customFields.reload} />}
          >
            {customFields.error}
          </StateMessage>
        )
      }
    }

    // The SKU setting: without it nobody knows whether this product has SKU
    // details, so the form waits rather than guessing.
    if (!skuSettingKnown) {
      if (masterDetails.status === 'failed') {
        return (
          <StateMessage
            icon={AlertCircle}
            tone="error"
            title="Could not load the master details"
            action={<RetryButton onClick={masterDetails.reload} />}
          >
            {masterDetails.error}
          </StateMessage>
        )
      }

      return <ListSkeleton />
    }

    // The fields are in, and none of them can be shown.
    if (steps.length === 0) {
      return (
        <StateMessage icon={Package} title="No product fields">
          A product is made of the fields under Inventory Master &gt; Customised Fields. Add a field there, or
          un-hide one, to add products.
        </StateMessage>
      )
    }

    return (
      <StateMessage icon={Package} title="Add a product" action={addButton}>
        Enter the product&apos;s details step by step. Its fields come from Inventory Master &gt; Customised Fields.
      </StateMessage>
    )
  }

  return (
    <>
      <Panel title="Products" actions={addButton}>
        {renderBody()}
      </Panel>

      {/* Mounted only while there is a form to show, so a company with no
          fields (or one still loading) never renders an empty dialog. */}
      {ready ? (
        <ProductFormModal
          // The session, and the company: a fresh form each time it is
          // opened, and never one company's entries in another's form.
          key={`${companyId}#${dialog.session}`}
          open={dialog.open}
          onOpenChange={(next) => {
            if (!next) closeDialog()
          }}
          steps={steps}
          companyName={companyName}
          vendors={vendors}
          warehouses={warehouses}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  )
}
