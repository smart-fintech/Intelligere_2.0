/**
 * The sidebar menu, written down as data instead of as JSX.
 *
 * Sidebar.jsx just loops over these sections and draws a row for each item,
 * so adding a menu item is a one-line change here - you never touch the
 * layout.
 *
 * Each section:
 *   key     - unique id, used as the React list key
 *   title   - optional heading above the rows ("Product Modules")
 *   nested  - optional. true = the rows are drawn indented under the title,
 *             as children of it
 *   items   - the rows, in order
 *
 * Each item:
 *   key        - unique id within its section
 *   label      - the text shown in the sidebar
 *   icon       - a lucide icon component
 *   path       - the URL it navigates to (always from ROUTES, never a raw string)
 *   ready      - false while the page does not exist yet. Those rows are drawn
 *                greyed out and are not clickable, so nobody lands on a 404.
 *                Flip it to true on the day you add the route.
 *   comingSoon - optional. true = the route exists but only shows the Coming
 *                Soon placeholder; the row is clickable and carries a badge.
 *
 * The product modules are NOT typed out here: that section is built from
 * PRODUCT_MODULES in Constants/dashboardModules, so a module is defined in
 * exactly one place. The Details pages (Company, Bank, Ledger, ...) are not in
 * the sidebar at all - they are reached from Dashboard, through the bar at the
 * top of that page.
 */

import {
  CreditCard,
  // LayoutDashboard,
  UserPlus,
  // Banknote,
  // BookOpen,
  // Building2,
  // Package,
  // Percent,
  // ShoppingCart,
  // Workflow,
  // Truck,
} from 'lucide-react'

import { MODULE_STATUS, PRODUCT_MODULES } from '@/Constants/dashboardModules'
import { ROUTES } from '@/Constants/routes'

/**
 * The account pages, named so AppRoutes can read the same label and icon for
 * their placeholder pages instead of typing them a second time.
 */
export const PAYMENT_LINK = {
  key: 'payment',
  label: 'Payment',
  icon: CreditCard,
  path: ROUTES.PAYMENT,
  ready: true,
  comingSoon: true,
}

export const CREATE_SUB_USER_LINK = {
  key: 'create-sub-user',
  label: 'Create Sub User',
  icon: UserPlus,
  path: ROUTES.CREATE_SUB_USER,
  ready: true,
  comingSoon: false,
}

export const NAV_SECTIONS = [
  // {
  //   key: 'main',
  //   items: [
  //     { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: ROUTES.DASHBOARD, ready: true },
  //   ],
  // },

  {
    key: 'product-modules',
    title: 'Modules',
    nested: true,
    items: PRODUCT_MODULES.map(({ key, name, icon, path, status }) => ({
      key,
      label: name,
      icon,
      path,
      ready: true,
      comingSoon: status === MODULE_STATUS.COMING_SOON,
    })),
  },

  {
    key: 'account',
    title: 'Account',
    items: [PAYMENT_LINK, CREATE_SUB_USER_LINK],
  },

  // {
  //   key: 'planned',
  //   items: [
  //     // ---- Planned but not built yet ----
  //     { key: 'company', label: 'Company', icon: Building2, path: '/company', ready: false },
  //     { key: 'accounting', label: 'Accounting', icon: BookOpen, path: '/accounting', ready: false },
  //     { key: 'sales', label: 'Sales', icon: ShoppingCart, path: '/sales', ready: false },
  //     { key: 'purchase', label: 'Purchase', icon: Truck, path: '/purchase', ready: false },
  //     { key: 'inventory', label: 'Inventory', icon: Package, path: '/inventory', ready: false },
  //     { key: 'taxation', label: 'Taxation', icon: Percent, path: '/taxation', ready: false },
  //     { key: 'banking', label: 'Banking', icon: Banknote, path: '/banking', ready: false },
  //     { key: 'automation', label: 'Automation', icon: Workflow, path: '/automation', ready: false },
  //   ],
  // },
]
