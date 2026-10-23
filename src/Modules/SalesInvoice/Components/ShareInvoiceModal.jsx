import { useRef, useState } from 'react'
import { Share2 } from 'lucide-react'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { shareInvoice } from '@/Services/invoiceSharingService'

/**
 * SHARE WITH THE BUYER'S COMPANY - offered once a document is saved and its
 * buyer is itself a company on Intelligere (findBuyerCompany). OK shares it
 * (POST invoice/xy-invoice/) - once, however often it is pressed; Cancel
 * closes it, nothing sent. The document is never saved again.
 *
 *   offer      { documentId, documentNo, documentType, companyId, buyerGstin,
 *                company: { id, name } } - the saved document and the company matched
 *   onClose()
 */
export default function ShareInvoiceModal({ offer, onClose }) {
  const [sharing, setSharing] = useState(false)
  const busy = useRef(false)

  const share = async () => {
    if (busy.current) return
    busy.current = true
    setSharing(true)
    try {
      const reply = await shareInvoice({
        documentId: offer.documentId,
        documentNo: offer.documentNo,
        companyId: offer.companyId,
        buyerCompanyId: offer.company.id,
        buyerGstin: offer.buyerGstin,
        documentType: offer.documentType,
      })
      toast.success(reply?.msg || `${offer.documentNo} was shared with ${offer.company.name}.`)
      onClose()
    } catch (failure) {
      toast.error(failure.message || 'The document could not be shared.')
    } finally {
      busy.current = false
      setSharing(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next && !sharing) onClose()
      }}
      size="sm"
      title="Share Invoice"
      description={`${offer.documentType} ${offer.documentNo} is saved.`}
      closeOnBackdropClick={false}
      closeOnEsc={!sharing}
      showCloseButton={!sharing}
      footer={
        <>
          <Button type="button" variant="outline" disabled={sharing} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" icon={Share2} loading={sharing} onClick={share}>
            {sharing ? 'Sharing...' : 'OK'}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5 text-sm" data-testid="share-invoice">
        <p>
          <span className="font-semibold text-brand">{offer.company.name}</span> is on Intelligere.
        </p>
        <p>Do you want to share this invoice with this company?</p>
      </div>
    </Modal>
  )
}
