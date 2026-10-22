/**
 * The Inventory tab of Product (Inventory Management only): three views of
 * the company's stock, chosen with the radio buttons centred above them -
 * the app's one view switch (ViewSwitch), as Sales Invoice's.
 *
 *   ( ) Product   ( ) Custom Report   ( ) Expired Products
 *
 *   Product            the product list, Add Product and Edit - Products, as
 *                      it was before there were views
 *   Custom Report      every field of every product (CustomReport)
 *   Expired Products   the expired stock (ExpiredProducts)
 *
 * Product is open first. A view is built the first time it is chosen - so a
 * report nobody opens is never asked for - and is then kept, hidden, while
 * another is showing: switching back finds its search, filters and page as
 * they were left, with no new request. The company never changes here; each
 * view reads it from the store, and reads again when it does.
 */

import { useState } from 'react'

import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import useSectionAccess from '@/Hooks/useSectionAccess'
import { ACCESS_SECTIONS } from '@/Services/accessService'
import CustomReport from './CustomReport'
import ExpiredProducts from './ExpiredProducts'
import Products from './Products'

/* `view`: a report of the products themselves, so only for a user who may
   view Product Details (useSectionAccess). Product decides for itself what
   it shows - its list, its Add, its Edit. */
const VIEWS = [
  { key: 'product', label: 'Product', Page: Products },
  { key: 'custom-report', label: 'Custom Report', Page: CustomReport, view: true },
  { key: 'expired-products', label: 'Expired Products', Page: ExpiredProducts, view: true },
]

export default function InventoryOverview() {
  const canView = useSectionAccess(ACCESS_SECTIONS.PRODUCT).view
  const views = VIEWS.filter((entry) => canView || !entry.view)

  const [chosen, setCurrent] = useState(VIEWS[0].key)
  // A view this user may not have (any more - another company) falls back to the first.
  const current = views.some((entry) => entry.key === chosen) ? chosen : views[0].key
  // The views chosen so far - these stay mounted. Added to while rendering,
  // as the page's own tabs are (see InventoryDetails).
  const [opened, setOpened] = useState([current])
  if (!opened.includes(current)) setOpened([...opened, current])

  return (
    <div className="space-y-3">
      {/* One view is no choice at all. */}
      {views.length > 1 ? (
        <ViewSwitch
          options={views.map(({ key, label }) => ({ value: key, label }))}
          value={current}
          onValueChange={setCurrent}
          label="Inventory view"
          idPrefix="inventory-view"
          className="mx-auto w-fit max-w-full"
        />
      ) : null}

      {views.filter(({ key }) => opened.includes(key)).map(({ key, Page }) => (
        <div key={key} hidden={key !== current}>
          <Page />
        </div>
      ))}
    </div>
  )
}
