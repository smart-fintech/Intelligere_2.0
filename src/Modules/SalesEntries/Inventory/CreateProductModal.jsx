import { useSelector } from 'react-redux'

import { Modal } from '@/Components/Common/Modal'
import useProductGroups from '@/Hooks/useProductGroups'
import useProductUnits from '@/Hooks/useProductUnits'
import useVendorOptions from '@/Hooks/useVendorOptions'
import BasicProductForm from '@/Modules/Dashboard/Components/BasicProductForm'
import { BASIC_PRODUCT_ERP } from '@/Services/productService'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'

/**
 * CREATE the stock item a product line needs - the Product page's form
 * (BasicProductForm) in a dialog, filled in from the line: its name, HSN and
 * GST rate. A Tally user's product goes over the WebSocket, as on that page.
 *
 *   product    the line (readInventoryInvoice), or null (closed)
 *   onCreated  after the save - the screen reads the products again, and the
 *              line then matches the new stock item
 */
export default function CreateProductModal({ product, companyName, onClose, onCreated }) {
  const isTally = useSelector(selectIsTallyErp)
  const erp = isTally ? BASIC_PRODUCT_ERP.TALLY : BASIC_PRODUCT_ERP.INTELLIGERE
  const groups = useProductGroups(Boolean(product))
  const units = useProductUnits()
  const vendors = useVendorOptions(Boolean(product) && !isTally)

  return (
    <Modal
      open={Boolean(product)}
      onOpenChange={(next) => (next ? null : onClose())}
      title="Create stock item"
      description={product ? `For "${product.name}" (HSN ${product.hsn || '--'})` : undefined}
      size="lg"
    >
      {product ? (
        <BasicProductForm
          key={product.key}
          erp={erp}
          product={null}
          // "18.0" from the file is the form's "18".
          defaults={{ name: product.name, hsn: product.hsn, gstRate: product.gstRate ? String(Number(product.gstRate)) : '' }}
          companyName={companyName}
          groups={groups}
          units={units}
          vendors={vendors}
          onSaved={onCreated}
          onCancel={onClose}
        />
      ) : null}
    </Modal>
  )
}
