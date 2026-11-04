import { Building2, Users } from 'lucide-react'

import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { SALES_BUYER_KIND, SALES_BUYER_KIND_TEXT } from '@/Constants/salesEntries'
import { cn } from '@/Library/utils'

/**
 * B2B / B2C on the Multi Ledger screen (entry.buyer, multiLedger.js):
 *
 *   <BuyerKindFilter value counts onChange />   All / B2B / B2C with their counts,
 *                                               and a line on what the chosen one is
 *   <BuyerBadge entry />                        the tag on an entry's row
 */

const KINDS = [SALES_BUYER_KIND.ALL, SALES_BUYER_KIND.B2B, SALES_BUYER_KIND.B2C]

export function BuyerKindFilter({ value, counts, onChange }) {
  const options = KINDS.map((kind) => ({ value: kind, label: `${SALES_BUYER_KIND_TEXT[kind].label} (${counts[kind] ?? 0})` }))
  return (
    <div className="space-y-1.5">
      <ViewSwitch options={options} value={value} onValueChange={onChange} label="Buyer type" idPrefix="multi-buyer-kind" className="w-fit max-w-full justify-start" />
      <p className="text-xs text-muted-foreground">{SALES_BUYER_KIND_TEXT[value].hint}</p>
    </div>
  )
}

export function BuyerBadge({ entry }) {
  const b2b = entry.buyer === SALES_BUYER_KIND.B2B
  const Icon = b2b ? Building2 : Users
  return (
    <span
      title={b2b ? 'Registered buyer - has a GSTIN' : entry.isSummary ? 'B2C small sales: one line per state and GST rate' : 'Consumer / unregistered buyer'}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        b2b ? 'bg-brand-soft text-brand' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      )}
    >
      <Icon className="size-3" />
      {b2b ? 'B2B' : entry.isSummary ? 'B2C summary' : 'B2C'}
    </span>
  )
}
