/**
 * A company's saved Master Details, read-only, with the Edit button that
 * turns them into the form (MasterDetailsForm). In the same order as the
 * form, so switching between the two keeps every value where it was.
 *
 * Props:
 *   record    the saved record
 *   compName  the active company's name - shown when the record has no name
 *   email     the signed-in user's email - likewise
 *   samples   useSampleInvoices(), to preview the chosen invoice format
 *   onEdit()  switches to the form
 */

import { useState } from 'react'
import { Eye, Pencil } from 'lucide-react'

import { DetailItem, DetailList, YesNo } from '@/Components/Common/DetailList'
import { FormActions } from '@/Components/Common/FormFields'
import { ImagePreviewModal } from '@/Components/Common/ImagePreview'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { invoiceFormatLabel } from '@/Constants/inventory'

export default function MasterDetailsView({ record, compName, email, samples, onEdit }) {
  const [previewing, setPreviewing] = useState(false)

  const pdfFormat = record.pdf_format == null ? '' : String(record.pdf_format)
  const format = samples.formats.find((entry) => entry.value === pdfFormat)

  return (
    <Panel title="Master Details">
      <DetailList className="">
        <DetailItem label="Company Name">{record.company || compName}</DetailItem>
        <DetailItem label="Email">{record.user || email}</DetailItem>
        <DetailItem label="Industry Type">{record.industry_type}</DetailItem>
        <DetailItem label="Business Type">{record.business_type}</DetailItem>
        <DetailItem label="Inventory Valuation Method">{record.fifo_lifo}</DetailItem>
        <DetailItem label="Invoice Format">
          {pdfFormat ? (
            <span className="flex flex-wrap items-center gap-2">
              {invoiceFormatLabel(pdfFormat)}
              {/* Once the sample images have arrived: that one image, large. */}
              {format ? (
                <Button type="button" variant="ghost" size="xs" icon={Eye} onClick={() => setPreviewing(true)}>
                  Preview
                </Button>
              ) : null}
            </span>
          ) : null}
        </DetailItem>
        <DetailItem label="Allow Negative Inventory">
          <YesNo value={record.is_negative} />
        </DetailItem>
        <DetailItem label="Enable Barcode">
          <YesNo value={record.barcode} />
        </DetailItem>
        <DetailItem label="Enable SKU">
          <YesNo value={record.sku} />
        </DetailItem>
        <DetailItem label="Dead Stock">{record.dead_stock}</DetailItem>
        <DetailItem label="Expiry Alert Days">{record.expiry_alert_days}</DetailItem>
      </DetailList>

      <FormActions className="mt-3 border-t-0 pt-0 pb-1">
        <Button type="button" icon={Pencil} onClick={onEdit}>
          Edit Master Details
        </Button>
      </FormActions>

      {format ? (
        <ImagePreviewModal
          open={previewing}
          onOpenChange={setPreviewing}
          src={format.src}
          title={invoiceFormatLabel(pdfFormat)}
        />
      ) : null}
    </Panel>
  )
}
