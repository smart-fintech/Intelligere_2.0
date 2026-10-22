/**
 * TWO DIFFERENT LISTS LIVE IN THIS FILE. They are easy to mix up, so:
 *
 *   MODULE_NAV        the five PAGES in the horizontal bar at the top of the
 *                     dashboard - Modules & Features, Company Details, Bank
 *                     Details, Ledger Details, Inventory Details. Each has a
 *                     route.
 *
 *   PRODUCT_MODULES   the twelve product MODULES - Bank Statement, GST
 *                     Compare, and so on. They are the cards on the Modules
 *                     & Features page and the "Product Modules" group in the
 *                     left sidebar, and each has its own route under
 *                     /modules. Most are only a placeholder page for now.
 *
 * Both are plain data rather than JSX, the same way Constants/navigation.js
 * describes the app's main sidebar, so the components that draw them never
 * have to be edited to add an entry.
 */

import {
  Activity,
  Archive,
  ArrowLeftRight,
  Banknote,
  BookOpen,
  Boxes,
  Building2,
  FileInput,
  FilePlus,
  FileText,
  LayoutGrid,
  Landmark,
  Scale,
  ShoppingCart,
  Split,
  Workflow,
} from 'lucide-react'

import { ROUTES } from '@/Constants/routes'
import { ACCESS_SECTIONS } from '@/Services/accessService'

/* ------------------------------------------------------------------ */
/* 1. The pages in the top navigation                                 */
/* ------------------------------------------------------------------ */

/**
 * Each page:
 *   key    unique id, used as the React list key and to look a page up
 *   label  the text in the navigation bar
 *   icon   a lucide icon component
 *   path   where it goes (always from ROUTES, never a raw string)
 *   ready  false while the page is only the Coming Soon placeholder. Flip it
 *          to true on the day the page is built - nothing else changes.
 *   hideWhenActive  optional. true = the link is left out of the navigation
 *          while that page is the one open.
 *   access optional. The section (ACCESS_SECTIONS) a sub user must be able
 *          to view for the link to open: without it the link is shown
 *          disabled (see useModuleNav), and the page itself says what is not
 *          allowed (SectionAccessGate).
 *
 * The order here IS the order in the bar (drawn through Hooks/useModuleNav),
 * and Modules & Features comes first because it is the page the other four
 * are reached from. These pages are deliberately NOT in the left sidebar,
 * which lists the product modules below; they are reached from Dashboard.
 */
export const MODULE_NAV = [
  {
    key: 'home',
    label: 'Modules & Features',
    icon: LayoutGrid,
    path: ROUTES.DASHBOARD,
    ready: true,
    // Not offered as a link while you are already on it - see useModuleNav.
    hideWhenActive: true,
  },
  {
    key: 'company',
    label: 'Company Details',
    icon: Building2,
    path: ROUTES.COMPANY_DETAILS,
    ready: true,
  },
  {
    key: 'bank',
    label: 'Bank Details',
    icon: Banknote,
    path: ROUTES.BANK_DETAILS,
    ready: true,
    access: ACCESS_SECTIONS.BANK,
  },
  {
    key: 'ledger',
    label: 'Ledger Details',
    icon: BookOpen,
    path: ROUTES.LEDGER_DETAILS,
    ready: true,
    access: ACCESS_SECTIONS.LEDGER,
  },
  {
    key: 'inventory',
    label: 'Inventory Details',
    icon: Boxes,
    path: ROUTES.INVENTORY_DETAILS,
    ready: true,
  },
]

/**
 * One navigation page by its key, for a page that knows which one it is:
 *
 *   <ModulePlaceholder moduleKey="ledger" />
 */
export const findModule = (key) => MODULE_NAV.find((page) => page.key === key)

/* ------------------------------------------------------------------ */
/* 2. The product modules                                             */
/* ------------------------------------------------------------------ */

/**
 * What a module's `status` may be. Everything is 'coming-soon' today.
 *
 * TO RELEASE A MODULE: change its status to MODULE_STATUS.AVAILABLE below.
 * The card on the Modules & Features page and the row in the sidebar both
 * lose their Coming Soon badge on their own - neither names a module.
 */
export const MODULE_STATUS = {
  AVAILABLE: 'available',
  COMING_SOON: 'coming-soon',
}

/**
 * Each module:
 *   key     unique id. Also the last part of its URL: 'gst-compare' lives at
 *           /modules/gst-compare, so never rename a key once it is released.
 *   name    the text on its card, in the sidebar and as its page title
 *   icon    a lucide icon component
 *   status       one of MODULE_STATUS
 *   description  a few words on what the module does, shown in the tooltip
 *                of its card on the Modules & Features page. Demo wording
 *                for now - replace it as each module ships.
 *   path         added automatically below from the key - do not write it by
 *                hand
 *
 * TO ADD A MODULE: add one entry here. It gets its card (with its tooltip),
 * its sidebar row and its (placeholder) route with no other change. To give
 * it a real page, see PRODUCT_MODULE_PAGES in Routes/AppRoutes.jsx.
 *
 * The order here IS the order of the cards and of the sidebar rows.
 */
export const PRODUCT_MODULES = [
  {
    key: 'Bank Statement',
    name: 'Bank Statement',
    icon: Landmark,
    status: MODULE_STATUS.COMING_SOON,
    description: 'Import and manage bank statements',
  },
  {
    key: 'GST Compare',
    name: 'GST Compare',
    icon: Scale,
    status: MODULE_STATUS.COMING_SOON,
    description: 'Compare your books with GST portal data',
  },
  {
    key: 'Sales Entries',
    name: 'Sales Entries',
    icon: ShoppingCart,
    status: MODULE_STATUS.COMING_SOON,
    description: 'Record and manage sales transactions',
  },
  {
    key: 'B2B/CNDN',
    name: 'B2B/CNDN',
    icon: FileText,
    status: MODULE_STATUS.COMING_SOON,
    description: 'Manage B2B invoices, credit and debit notes',
  },
  {
    key: 'Amount Distribution',
    name: 'Amount Distribution',
    icon: Split,
    status: MODULE_STATUS.COMING_SOON,
    description: 'Split payments across invoices or ledgers',
  },
  {
    key: 'Purchase Invoice',
    name: 'Purchase Invoice',
    icon: FileInput,
    status: MODULE_STATUS.AVAILABLE,
    description: 'Create purchase invoices, inbound challans and purchase orders',
  },
  {
    key: 'Sales Invoice',
    name: 'Sales Invoice',
    icon: FilePlus,
    status: MODULE_STATUS.AVAILABLE,
    description: 'Create and manage invoices',
  },
  {
    key: 'DocuVault',
    name: 'DocuVault',
    icon: Archive,
    status: MODULE_STATUS.COMING_SOON,
    description: 'Store and organise business documents',
  },
  {
    key: 'Payable Receivable',
    name: 'Payable Receivable',
    icon: ArrowLeftRight,
    status: MODULE_STATUS.COMING_SOON,
    description: 'Track amounts payable and receivable',
  },
  {
    key: 'Business Health Indicators',
    name: 'Business Health Indicators',
    icon: Activity,
    status: MODULE_STATUS.COMING_SOON,
    description: 'View key business reports and insights',
  },
  {
    key: 'Procurement Automation',
    name: 'Procurement Automation',
    icon: Workflow,
    status: MODULE_STATUS.COMING_SOON,
    description: 'Automate purchase requests and orders',
  },
  {
    key: 'Journal Voucher',
    name: 'Journal Voucher',
    icon: BookOpen,
    status: MODULE_STATUS.COMING_SOON,
    description: 'Record and manage journal vouchers',
  },
].map((module) => ({ ...module, path: `${ROUTES.PRODUCT_MODULES}/${module.key}` }))
