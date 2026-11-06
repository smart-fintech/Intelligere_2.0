import { AlertCircle, AlertTriangle, BookOpen, Boxes, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/Components/ui/button'
import { ROUTES } from '@/Constants/routes'
import { cn } from '@/Library/utils'

/**
 * Says, above the form, which of the company's ledgers and products are
 * missing (masterDataReadiness), with the way to each: Ledger Details and
 * Inventory Details - where they are created, or synced from Tally (Sync
 * Now) - and a Refresh that reads the missing lists again once they exist.
 *
 *   readiness   masterDataReadiness's answer; nothing is drawn when nothing is missing
 *   onRefresh   reads the missing lists again
 *
 * Red when the document cannot be made without them, amber when it only
 * limits the lines (no products on a type that also takes services).
 */
export default function MasterDataNotice({ readiness, onRefresh }) {
  if (!readiness?.missing.length) return null

  const Icon = readiness.blocking ? AlertCircle : AlertTriangle
  const needs = (item) => readiness.missing.includes(item)

  return (
    <div
      role="alert"
      data-testid="master-data-notice"
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs',
        readiness.blocking
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300',
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{readiness.message}</span>
      <div className="flex flex-wrap gap-2">
        {needs('ledgers') ? (
          <Button asChild variant="outline" size="sm">
            <Link to={ROUTES.LEDGER_DETAILS}>
              <BookOpen /> Ledger Details
            </Link>
          </Button>
        ) : null}
        {needs('products') ? (
          <Button asChild variant="outline" size="sm">
            <Link to={ROUTES.INVENTORY_DETAILS}>
              <Boxes /> Inventory Details
            </Link>
          </Button>
        ) : null}
        {onRefresh ? (
          <Button type="button" variant="outline" size="sm" icon={RefreshCw} onClick={onRefresh}>
            Refresh
          </Button>
        ) : null}
      </div>
    </div>
  )
}
