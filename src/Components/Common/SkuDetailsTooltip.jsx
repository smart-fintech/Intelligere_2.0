import { Tooltip } from '@/Components/ui/tooltip'

/**
 * A SKU's `sku_details` on hover - THE one look for it, wherever a SKU code
 * is shown: the SKU Selector's options, the SKU Code filter's options, a SKU
 * code in a product's opened row.
 *
 *   <SkuDetailsTooltip details={[{ name: 'Color', value: 'Red' }]}>
 *     <span tabIndex={0}>SKU-001</span>
 *   </SkuDetailsTooltip>
 *
 * `details` is [{ name, value }], both text, already read from the SKU's
 * `sku_details` and nothing else (skuAttributes in Utils/skuAttributes, or
 * skuDetailPairs in Modules/Dashboard/productList) - so no field is named
 * here. With none it says "No SKU details available".
 *
 * It is the app's own Tooltip (Components/ui/tooltip): on hover and on
 * keyboard focus, drawn on <body> so no table, list or dialog can clip it,
 * and kept inside the window. `children` is ONE element that can take a ref.
 */
export function SkuDetailsTooltip({ details = [], side = 'right', align = 'start', children }) {
  const shown = Array.isArray(details) ? details : []

  return (
    <Tooltip
      side={side}
      align={align}
      className="max-w-sm text-left"
      text={
        shown.length > 0 ? (
          <dl className="space-y-0.5">
            {shown.map(({ name, value }) => (
              <div key={name} className="flex gap-1.5">
                <dt className="font-semibold">{name}:</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          'No SKU details available'
        )
      }
    >
      {children}
    </Tooltip>
  )
}

export default SkuDetailsTooltip
