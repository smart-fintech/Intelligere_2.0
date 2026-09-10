/**
 * The sidebar menu, written down as data instead of as JSX.
 *
 * Sidebar.jsx just loops over this list and draws a row for each entry, so
 * adding a menu item is a one-line change here - you never touch the layout.
 *
 * Each item:
 *   key     - unique id, used as the React list key
 *   label   - the text shown in the sidebar
 *   icon    - a lucide icon component
 *   path    - the URL it navigates to (always from ROUTES, never a raw string)
 *   ready   - false while the page does not exist yet. Those rows are drawn
 *             greyed out and are not clickable, so nobody lands on a 404.
 *             Flip it to true on the day you add the route.
 */

import {
  Banknote,
  BookOpen,
  Building2,
  LayoutDashboard,
  Package,
  Percent,
  ShoppingCart,
  Truck,
  Workflow,
} from 'lucide-react'

import { ROUTES } from '@/Constants/routes'

export const NAV_ITEMS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: ROUTES.DASHBOARD,
    ready: true,
  },

  // ---- Everything below is planned but not built yet ----
  { key: 'company', label: 'Company', icon: Building2, path: '/company', ready: false },
  { key: 'accounting', label: 'Accounting', icon: BookOpen, path: '/accounting', ready: false },
  { key: 'sales', label: 'Sales', icon: ShoppingCart, path: '/sales', ready: false },
  { key: 'purchase', label: 'Purchase', icon: Truck, path: '/purchase', ready: false },
  { key: 'inventory', label: 'Inventory', icon: Package, path: '/inventory', ready: false },
  { key: 'taxation', label: 'Taxation', icon: Percent, path: '/taxation', ready: false },
  { key: 'banking', label: 'Banking', icon: Banknote, path: '/banking', ready: false },
  { key: 'automation', label: 'Automation', icon: Workflow, path: '/automation', ready: false },
]
