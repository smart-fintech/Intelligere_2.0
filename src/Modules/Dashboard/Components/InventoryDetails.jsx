/**
 * Inventory Details: the sections across the top, the open section's tabs
 * under them, and the open page underneath.
 *
 *   Product | Inventory Master                       <- sections
 *   Master Details  Warehouse  Vendor  Customised Fields   <- its tabs
 *   ...the page...
 *
 * Both rows are drawn from INVENTORY_SECTIONS in Constants/inventory, so a
 * new section or tab appears the moment it is added to that list. One whose
 * `ready` is false, or which has no page below, shows the shared Coming Soon
 * placeholder - so adding one never needs a change here until the day it is
 * built.
 *
 * ------------------------------------------------------------------
 * TWO USERS, TWO SETS OF PAGES
 * ------------------------------------------------------------------
 * Whether the user has Inventory Management (useInventoryAccess - who they
 * are, and their company's plan) decides what is here at all:
 *
 *   with it      everything above. Product is the full, SKU-based form.
 *   without      Product | Vendor. Product is the simple product list, and
 *                the tabs that are part of Inventory Management (Master
 *                Details, Warehouse, Customised Fields) are not offered -
 *                nor reachable by typing their address. Vendor, the one tab
 *                left, is shown as a section under its own name rather than
 *                as a lone tab under "Inventory Master".
 *
 * Until that is known NOTHING is drawn but a placeholder: nobody is shown
 * screens that are then taken away.
 *
 * ------------------------------------------------------------------
 * WHERE THE USER IS, IS IN THE ADDRESS
 * ------------------------------------------------------------------
 * ?section=product, ?tab=warehouse - the way the Payment page keeps its own
 * tab - so a reload or a shared link lands on the same page. The default of
 * each is left out of the address: a plain /dashboard/inventory-details is
 * Inventory Master on Master Details (the product list, without Inventory
 * Management), and ?tab=warehouse alone still opens the Warehouse tab, as it
 * did before there were sections.
 *
 * ------------------------------------------------------------------
 * A PAGE ONCE OPENED STAYS AS IT WAS LEFT
 * ------------------------------------------------------------------
 * Going from Warehouse to Master Details and back does not empty the
 * Warehouse search, filters or page, nor ask for its list again: a page that
 * has been opened is hidden rather than removed while another is showing.
 * Nothing is loaded before it is first opened, and nothing is kept anywhere
 * but in the pages themselves.
 */

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import ComingSoon from '@/Components/Common/ComingSoon'
import { ListSkeleton } from '@/Components/Common/DataList'
import { Card, CardContent } from '@/Components/ui/card'
import {
  INVENTORY_DEFAULT_SECTION,
  INVENTORY_DEFAULT_SECTION_WITHOUT_INVENTORY,
  INVENTORY_SECTIONS,
} from '@/Constants/inventory'
import useInventoryAccess from '@/Hooks/useInventoryAccess'
import { cn } from '@/Library/utils'
import BasicProducts from './BasicProducts'
import CustomFields from './CustomFields'
import MasterDetails from './MasterDetails'
import Products from './Products'
import Vendors from './Vendors'
import Warehouses from './Warehouses'

/**
 * The real page of each section or tab that has one. A tab is named by its
 * section and its own key, a section without tabs by its key alone.
 *
 * Two maps, because `product` is a different page for each kind of user -
 * and the pages a user has no access to are simply not in theirs.
 *
 * TO BUILD ONE: import its component above, add one line here, and set its
 * `ready` to true in Constants/inventory.
 */
const PAGES_WITH_INVENTORY = {
  product: Products,
  'inventory-master/master-details': MasterDetails,
  'inventory-master/warehouse': Warehouses,
  'inventory-master/vendor': Vendors,
  'inventory-master/customised-fields': CustomFields,
}

const PAGES_WITHOUT_INVENTORY = {
  product: BasicProducts,
  'inventory-master/vendor': Vendors,
}

/** The one a list opens on: its first ready entry, else simply its first. */
const firstReady = (entries) => entries.find((entry) => entry.ready) ?? entries[0]

/** The id of a page in the maps above - see the note there. */
const pageId = (section, tab) => (tab ? `${section.key}/${tab.key}` : section.key)

/**
 * The sections a user is offered. Without Inventory Management the tabs
 * that are part of it are taken out, and a section left with no tabs at all
 * goes with them.
 */
const sectionsFor = (full) =>
  INVENTORY_SECTIONS.map((section) =>
    section.tabs && !full ? { ...section, tabs: section.tabs.filter((tab) => !tab.requiresInventory) } : section,
  ).filter((section) => !section.tabs || section.tabs.length > 0)

export default function InventoryDetails() {
  const access = useInventoryAccess()

  // Not known yet: a placeholder, never one user's screens for a moment.
  if (!access.known) {
    return (
      <Card className="border-border/70">
        <CardContent className="px-4">
          <ListSkeleton />
        </CardContent>
      </Card>
    )
  }

  // `key`: a different kind of user (the header moved to a company on
  // another plan) starts again, so no page of the other set is left mounted.
  return <InventoryNavigation key={access.full ? 'with-inventory' : 'without-inventory'} full={access.full} />
}

function InventoryNavigation({ full }) {
  const [params, setParams] = useSearchParams()

  const sections = useMemo(() => sectionsFor(full), [full])
  const pages = full ? PAGES_WITH_INVENTORY : PAGES_WITHOUT_INVENTORY

  // The landing section is named, not worked out - see INVENTORY_DEFAULT_SECTION.
  const defaultKey = full ? INVENTORY_DEFAULT_SECTION : INVENTORY_DEFAULT_SECTION_WITHOUT_INVENTORY
  const defaultSection = sections.find((entry) => entry.key === defaultKey) ?? firstReady(sections)

  // An unknown or missing value falls back to the default, so a stale or
  // mistyped link - or one to a tab this user is not offered - still opens
  // a real page.
  const section = sections.find((entry) => entry.key === params.get('section')) ?? defaultSection
  const tabs = section.tabs ?? []
  const defaultTab = tabs.length > 0 ? firstReady(tabs) : null
  const tab = tabs.find((entry) => entry.key === params.get('tab')) ?? defaultTab

  // What is open: the tab when the section has tabs, else the section itself.
  const open = tab ?? section
  const openId = pageId(section, tab)
  const openIsBuilt = Boolean(open.ready && pages[openId])

  /* The pages opened so far - these stay mounted (see the note at the top).
     Added to while rendering rather than in the click handlers, so a page
     reached by a link or the Back button is remembered just the same. */
  const [opened, setOpened] = useState([openId])
  if (!opened.includes(openId)) setOpened([...opened, openId])

  /** A section was clicked: it opens on its own default tab. */
  const chooseSection = (key) => {
    const next = new URLSearchParams(params)
    if (key === defaultSection.key) next.delete('section')
    else next.set('section', key)
    next.delete('tab')
    setParams(next, { replace: true })
  }

  /** A tab of the open section was clicked. */
  const chooseTab = (key) => {
    const next = new URLSearchParams(params)
    if (key === defaultTab?.key) next.delete('tab')
    else next.set('tab', key)
    setParams(next, { replace: true })
  }

  // A row of one tab is no choice at all, so it is not drawn: its section's
  // button carries the tab's own name instead (see below).
  const showTabs = tabs.length > 1

  // The control that names the open page, for its panel's aria-labelledby.
  const labelledBy = tab && showTabs ? `inventory-tab-${tab.key}` : `inventory-section-${section.key}`

  return (
    <div className="space-y-3">
      {/* ---------------- Sections ----------------
          Wraps rather than scrolls. A scrolling strip makes the browser treat
          overflow-y as auto as well, and each button's -mb-px (the overlap
          that joins its underline to this border) then shows up as a vertical
          scrollbar at the strip's right end. */}
      <div role="tablist" aria-label="Inventory sections" className="flex flex-wrap  gap-1 border-b border-border">
        {sections.map((entry) => {
          const selected = entry.key === section.key
          // A section with a single tab IS that tab: "Vendor", not
          // "Inventory Master" with one lonely tab beneath it.
          const { label, icon: Icon } = entry.tabs?.length === 1 ? entry.tabs[0] : entry

          return (
            <button
              key={entry.key}
              id={`inventory-section-${entry.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => chooseSection(entry.key)}
              className={cn(
                '-mb-px flex cursor-pointer items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none',
                'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus:rounded-md',
                selected ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-brand',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          )
        })}
      </div>

      {/* ---------------- The open section's tabs ----------------
          Smaller, and filled rather than underlined, so the two rows read as
          two levels and not as one long list. They wrap onto a second line
          on a narrow screen - nothing here can push the page sideways. */}
      {showTabs ? (
        <div role="tablist" aria-label={section.label} className="flex flex-wrap justify-center gap-1">
          {tabs.map(({ key, label, icon: Icon }) => {
            const selected = key === tab?.key
            return (
              <button
                key={key}
                id={`inventory-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => chooseTab(key)}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors outline-none',
                  'focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  selected
                    ? 'bg-brand-soft text-brand dark:bg-brand/15'
                    : 'text-muted-foreground hover:bg-brand-soft hover:text-brand dark:hover:bg-brand/15',
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            )
          })}
        </div>
      ) : null}

      {/* ---------------- The built pages ----------------
          Each one that has been opened, with all but the open one hidden. */}
      {Object.entries(pages).map(([id, Page]) => {
        const showing = openIsBuilt && id === openId
        if (!showing && !opened.includes(id)) return null

        return (
          <div key={id} role="tabpanel" hidden={!showing} aria-labelledby={showing ? labelledBy : undefined}>
            <Page />
          </div>
        )
      })}

      {/* ---------------- Not built yet ---------------- */}
      {openIsBuilt ? null : (
        <div role="tabpanel" aria-labelledby={labelledBy}>
          <Card className="border-border/70">
            <ComingSoon icon={open.icon} title={open.label} />
          </Card>
        </div>
      )}
    </div>
  )
}
