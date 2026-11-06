import { Package, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { ROUTES } from '@/Constants/routes'

/**
 * Why a new Bid / Pre Bid cannot be made yet (creationBlocker), with the way to
 * the page that fixes it. Both pages are Inventory Details', and these addresses
 * open them with or without Inventory Management (see InventoryDetails).
 */

const LINKS = {
  product: { to: `${ROUTES.INVENTORY_DETAILS}?section=product`, label: 'Go to Products', icon: Package },
  vendor: { to: `${ROUTES.INVENTORY_DETAILS}?section=inventory-master&tab=vendor`, label: 'Go to Vendors', icon: Truck },
}

export default function CreateBlockedModal({ label, blocker, onClose }) {
  return (
    <Modal
      open
      onOpenChange={onClose}
      size="sm"
      title={`Cannot create a ${label.toLowerCase()} yet`}
      description={blocker.message}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          {blocker.create.map((what) => {
            const { to, label: text, icon: Icon } = LINKS[what]
            return (
              <Button key={what} asChild variant={what === blocker.create[0] ? 'default' : 'outline'}>
                <Link to={to}>
                  <Icon className="size-4" />
                  {text}
                </Link>
              </Button>
            )
          })}
        </>
      }
    />
  )
}
