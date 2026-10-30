import { Fragment, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Download } from 'lucide-react'

import { InlineAlert } from '@/Components/Common/DataList'
import { SkuDetailsTooltip } from '@/Components/Common/SkuDetailsTooltip'
import { Stepper } from '@/Components/Common/Stepper'
import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { Label } from '@/Components/ui/label'
import { Switch } from '@/Components/ui/switch'
import { cn } from '@/Library/utils'
import {
  NO_VENDOR_MESSAGE,
  PROCUREMENT_STATE as STATE,
  heldByChildren,
  heldByVendors,
  isBuyable,
  purchaseQty,
  quantityText,
  requirementKey,
  unbuyableReason,
  vendorNote,
} from '@/Modules/SalesInvoice/procurement'
import { toDecimalInput } from '@/Modules/SalesInvoice/salesInvoiceForm'

/**
 * THE REQUEST FOR QUOTATION - the steps of procurement.js after the
 * requirements are calculated, shown inside Inventory Details (its body and
 * its footer), each drawn from the workflow's state:
 *
 *   Products            the Finished Products, each with Order from Vendors
 *                       (when it has vendors) - on, its own vendors to tick,
 *                       and the products under it hidden; off, its
 *                       Semi-Finished Products (each with its own switch) and
 *                       Raw Materials (ticked) under it can be chosen - and
 *                       while any is, its switch holds
 *   Vendors             each raw material ticked - one product needed in two
 *                       places once, for both quantities - with its own
 *                       vendors to tick (skipped when none ticked has any)
 *   Review & Download   the vendors asked - Seller Name, Email, Actions
 *                       (Download, and the arrow to its products: Product
 *                       Name, SKU Code, HSN Code, Quantity - each vendor's
 *                       prefilled with the required quantity, its own to
 *                       change, never added up). Download sends that vendor's
 *                       request (inventory/request_quotation/) and, accepted,
 *                       saves its Word file (useProcurement). Done closes.
 *
 * A product without vendors stays, with its Required quantity, and says where
 * to link one (NO_VENDOR_MESSAGE): a raw material can still be ticked, a
 * finished or semi-finished product has no switch. It is left out of every
 * request.
 *
 * Which buttons work is procurement.actions - never decided here.
 */

const STEPS = [
  { key: 'products', title: 'Products' },
  { key: 'vendors', title: 'Vendors' },
  { key: 'review', title: 'Review & Download' },
]
const STEP_OF = {
  [STATE.PURCHASE_METHOD_SELECTION]: 0,
  [STATE.VENDOR_SELECTION]: 1,
}
const cell = 'px-2 py-1.5'
const heading = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'
const text = (value) => (value === null || value === undefined ? '' : String(value).trim())
/** sku_details as [[name, value]] - only what has a value. */
const skuPairs = (details) => (details && typeof details === 'object' ? Object.entries(details).filter(([, value]) => text(value) !== '') : [])

/** A SKU code, its sku_details on hover or focus (the shared SKU tooltip). */
export function SkuCode({ code, details }) {
  if (!text(code)) return '--'
  return (
    <SkuDetailsTooltip details={skuPairs(details).map(([name, value]) => ({ name, value: text(value) }))} side="top" align="start">
      <span tabIndex={0} className="cursor-help break-all underline decoration-muted-foreground/50 decoration-dotted underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        {text(code)}
      </span>
    </SkuDetailsTooltip>
  )
}

/** One product needed in several places: their order_qty added up - null when none has one. */
const mergedOrderQty = (nodes) => {
  const known = nodes.map((entry) => entry.orderQty).filter((value) => value !== null && value !== undefined)
  return known.length === 0 ? null : known.reduce((total, value) => total + value, 0)
}

/** A product's name and SKU, and its Order Qty (order_qty - `orderQty` added up when merged); display only. */
function NodeHeading({ node, orderQty = node.orderQty }) {
  return (
    <div className="min-w-0 flex-1 space-y-0.5">
      <p className="text-sm font-semibold break-words text-brand">
        {node.name || 'Product'}
        {node.skuCode ? (
          <>
            {' '}
            <span className="text-xs font-normal text-foreground">
              <SkuCode code={node.skuCode} details={node.skuDetails} />
            </span>
          </>
        ) : null}
      </p>
      <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span>
          Order Qty <span className="font-semibold text-foreground tabular-nums" data-testid="rfq-order-qty">{quantityText(orderQty)}</span>
        </span>
      </p>
    </div>
  )
}

/**
 * Why a product cannot be chosen to buy - or that it needs nothing. `vendorless`:
 * also say that it has no vendor to ask (not where a vendor table says it).
 */
function NodeNote({ node, vendors, vendorless = true }) {
  const reason = unbuyableReason(node)
  if (reason)
    return (
      <p className="text-xs text-muted-foreground" data-testid="rfq-unbuyable">
        {reason}
      </p>
    )
  const note = vendorless && isBuyable(node) ? vendorNote(vendors) : ''
  if (note)
    return (
      <p className="text-xs text-muted-foreground" data-testid="rfq-no-vendor">
        {note}
      </p>
    )
  return purchaseQty(node) > 0 ? null : <p className="text-xs text-muted-foreground">Covered by stock - nothing to buy.</p>
}

/** The vendors of one product chosen to buy - only its own, each ticked to be asked; none linked, it says so instead. */
function VendorTable({ node, procurement }) {
  const vendors = procurement.vendorsOf(node)
  // Ticked for the product's requirement - the same product needed elsewhere shares them.
  const requirement = requirementKey(node)
  const ticked = new Set(procurement.choices.vendors[requirement] ?? [])
  const problem = procurement.problems.selection.nodes[requirement] || vendorNote(vendors)
  if (vendors.length === 0)
    return (
      <p className="rounded-md border border-dashed border-border bg-card px-3 py-2.5 text-xs text-muted-foreground" data-testid="rfq-no-vendor">
        {NO_VENDOR_MESSAGE}
      </p>
    )
  return (
    <div className="space-y-1">
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className={cn(cell, 'font-medium')}>Name</th>
              <th className={cn(cell, 'font-medium')}>Email</th>
              <th className={cn(cell, 'font-medium')}>Contact</th>
              <th className={cn(cell, 'font-medium')}>Address</th>
              <th className={cn(cell, 'w-16 text-center font-medium')}>Select</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((vendor) => (
              <tr key={vendor.key} className={cn('border-t border-border align-top', !vendor.usable && 'text-muted-foreground')} data-testid="rfq-vendor">
                <td className={cn(cell, 'break-words')}>{vendor.name}</td>
                <td className={cn(cell, 'break-all')}>{vendor.email || '--'}</td>
                <td className={cell}>{vendor.contact || '--'}</td>
                <td className={cn(cell, 'break-words')}>{vendor.address || '--'}</td>
                <td className={cn(cell, 'text-center')}>
                  <Checkbox
                    checked={vendor.usable && ticked.has(vendor.key)}
                    disabled={!vendor.usable}
                    onCheckedChange={() => procurement.toggleVendor(requirement, vendor.key)}
                    aria-label={`Ask ${vendor.name} for ${node.name}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {problem ? (
        <p className="text-xs text-muted-foreground" data-testid="rfq-vendor-problem">
          {problem}
        </p>
      ) : null}
    </div>
  )
}

/** A raw material - ticked to be bought; its vendors are chosen on the next step. */
function RawRow({ node, procurement }) {
  const vendors = procurement.vendorsOf(node)
  const picked = procurement.choices.picked[node.id] === true
  // Its vendors ticked (on the next step) - untick them there to change it.
  const held = heldByVendors(procurement.choices, node)
  const id = `rfq-raw-${node.id}`
  return (
    <div className="space-y-1 px-3 py-2" data-testid="rfq-node" data-level="raw">
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={id}
          className="mt-0.5"
          checked={picked}
          disabled={held || (!picked && !isBuyable(node))}
          title={held ? 'Untick its vendors to change this' : undefined}
          onCheckedChange={() => procurement.togglePick(node.id)}
          aria-label={`Buy ${node.name}`}
        />
        <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer font-normal">
          <NodeHeading node={node} />
        </Label>
      </div>
      <div className="pl-6.5">
        <NodeNote node={node} vendors={vendors} />
      </div>
    </div>
  )
}

/**
 * A finished or semi-finished product: Order from Vendors on - it is bought
 * as it is, from its own vendors only, and its semi-finished products and raw
 * materials are hidden; off - they are back, each to be chosen on its own.
 * The switch is there only when it has something to buy and vendors to order
 * from (none linked, it says where to link one). It holds while any of its
 * vendors is ticked (heldByVendors), so it never turns off over a vendor
 * selection, and while something under it is chosen (heldByChildren), so the
 * same thing is never bought at two levels.
 */
function NodeBlock({ node, procurement }) {
  const { tree, choices } = procurement
  const vendors = procurement.vendorsOf(node)
  const direct = choices.direct[node.id] === true
  // A vendor ticked for it holds the switch - untick them all to change it.
  const held = heldByVendors(choices, node)
  // Something chosen under it (off) - clear it to order this one from vendors.
  const childHeld = !direct && heldByChildren(tree, choices, node)
  const semis = node.semis.map((id) => tree.byId[id])
  const raws = node.raws.map((id) => tree.byId[id])
  const switchId = `rfq-direct-${node.id}`
  return (
    <section
      className={cn('space-y-2 rounded-md border border-border p-3', node.level !== 'finished' && 'bg-muted/20')}
      aria-label={node.name}
      data-testid="rfq-node"
      data-level={node.level}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <NodeHeading node={node} />
        {direct || (isBuyable(node) && vendors.length > 0) ? (
          <div className="flex items-center gap-2">
            <Label htmlFor={switchId} className="text-xs font-medium whitespace-nowrap">
              Order from Vendors
            </Label>
            <Switch
              id={switchId}
              checked={direct}
              disabled={held || childHeld}
              title={held ? 'Untick its vendors to change this' : childHeld ? 'Clear what is chosen under it to change this' : undefined}
              onCheckedChange={(on) => procurement.setDirect(node.id, on)}
            />
          </div>
        ) : null}
      </div>
      <NodeNote node={node} vendors={vendors} vendorless={!direct} />
      {childHeld && vendors.length > 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="rfq-children-note">
          Bought through what is chosen under it. Clear those to order it from vendors as it is.
        </p>
      ) : null}
      {direct ? <VendorTable node={node} procurement={procurement} /> : null}
      {direct && semis.length + raws.length > 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="rfq-locked-note">
          Ordered from vendors as it is. Turn the switch off to buy its semi-finished products or raw materials instead.
        </p>
      ) : null}
      {!direct && semis.length > 0 ? (
        <div className="space-y-2">
          <p className={heading}>Semi-Finished Products</p>
          {semis.map((semi) => (
            <NodeBlock key={semi.id} node={semi} procurement={procurement} />
          ))}
        </div>
      ) : null}
      {!direct && raws.length > 0 ? (
        <div className="space-y-1.5">
          <p className={heading}>Raw Materials</p>
          <div className="divide-y divide-border rounded-md border border-border bg-card">
            {raws.map((raw) => (
              <RawRow key={raw.id} node={raw} procurement={procurement} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

/* ---- Products ---- */
function SelectionStep({ procurement }) {
  const { tree } = procurement
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Turn on Order from Vendors to buy a product as it is, or leave it off and buy its semi-finished products or raw materials instead.
      </p>
      <p className={heading}>Finished Products</p>
      {tree.roots.map((id) => (
        <NodeBlock key={id} node={tree.byId[id]} procurement={procurement} />
      ))}
    </div>
  )
}

/* ---- Vendors (the raw materials ticked) ---- */
function VendorStep({ procurement }) {
  return (
    <div className="space-y-3">
      <p className={heading}>Select Vendors</p>
      {/* One product needed in two places is one line, for both quantities. */}
      {procurement.lines
        .filter(({ raw }) => raw)
        .map(({ key, node, nodes }) => (
          <section key={key} className="space-y-2 rounded-md border border-border p-3" aria-label={`Vendors for ${node.name}`} data-testid="rfq-vendor-product">
            <NodeHeading node={node} orderQty={mergedOrderQty(nodes)} />
            <VendorTable node={node} procurement={procurement} />
          </section>
        ))}
    </div>
  )
}

/* ---- Review & Download - the SellerTable ---- */
function ReviewStep({ procurement }) {
  const { machine, state, parts, lines, choices, problems, actions } = procurement
  const [expanded, setExpanded] = useState(() => (parts.length === 1 ? parts[0].vendor.key : null))
  const submitting = state === STATE.QUOTATION_SUBMITTING
  const nameOf = (vendorKey) => parts.find((part) => part.vendor.key === vendorKey)?.vendor.name ?? 'The vendor'
  // Chosen, but with no vendor to ask - in no request below.
  const vendorless = lines.filter((line) => line.vendorless)
  return (
    <div className="space-y-3">
      {state === STATE.QUOTATION_ERROR ? (
        <InlineAlert>
          {nameOf(machine.error?.vendorKey)}: {machine.error?.message}
          {machine.error?.ambiguous ? ' No answer came back, so it may have reached the server.' : ''} Nothing chosen is lost - press its Download to try again.
        </InlineAlert>
      ) : null}
      {state === STATE.QUOTATION_SUCCESS ? (
        <div className="flex items-start gap-2 rounded-md border border-brand/30 bg-brand-soft px-3 py-2 text-sm text-brand" role="status" data-testid="rfq-success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {nameOf(machine.reply?.vendorKey)}: {machine.reply?.message}
          </span>
        </div>
      ) : null}
      {vendorless.length > 0 ? (
        <div className="space-y-0.5 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground" data-testid="rfq-vendorless">
          <p>
            Not in any request - no vendor is linked:{' '}
            {vendorless.map(({ key, node, qty }, index) => (
              <Fragment key={key}>
                {index > 0 ? ', ' : null}
                <span className="font-medium text-foreground">{node.name}</span>
                {node.skuCode ? ` (${node.skuCode})` : ''} - Required <span className="tabular-nums">{quantityText(qty)}</span>
              </Fragment>
            ))}
            .
          </p>
          <p>Add one under Inventory &gt; Products to request a quotation.</p>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Each seller is asked for the product’s required quantity to start with. Change any seller’s quantity as needed - more than required too; 0 leaves the product out of that seller’s request.
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className={cn(cell, 'font-medium')}>Seller Name</th>
              <th className={cn(cell, 'font-medium')}>Email</th>
              <th className={cn(cell, 'w-48 text-right font-medium')}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {parts.map(({ vendor, items }) => {
              const isOpen = expanded === vendor.key
              const sending = submitting && machine.submission?.vendorKey === vendor.key
              const sent = machine.sent[vendor.key]
              const canDownload = actions.download && !submitting && procurement.hasRequestFor(vendor.key)
              return (
                <Fragment key={vendor.key}>
                  <tr className="border-t border-border align-middle" data-testid="rfq-review-vendor">
                    <td className={cn(cell, 'font-medium break-words')}>
                      {vendor.name}
                      {sent ? (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-brand" data-testid="rfq-sent">
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          Sent
                        </span>
                      ) : null}
                    </td>
                    <td className={cn(cell, 'break-all')}>{vendor.email || '--'}</td>
                    <td className={cell}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          icon={Download}
                          loading={sending}
                          disabled={!canDownload}
                          tooltip={canDownload || sending ? undefined : submitting ? 'Another request is being sent' : 'Once every quantity adds up'}
                          onClick={() => procurement.download(vendor.key)}
                        >
                          Download
                        </Button>
                        <Button
                          type="button"
                          variant="iconEdit"
                          size="icon-sm"
                          icon={ChevronRight}
                          className={cn('[&_svg]:transition-transform [&_svg]:duration-200', isOpen && '[&_svg]:rotate-90')}
                          tooltip={isOpen ? 'Hide products' : 'Show products'}
                          aria-label={`${isOpen ? 'Hide' : 'Show'} the products asked of ${vendor.name}`}
                          aria-expanded={isOpen}
                          onClick={() => setExpanded((current) => (current === vendor.key ? null : vendor.key))}
                        />
                      </div>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="bg-muted/30">
                      <td colSpan={3} className="p-2">
                        <table className="w-full text-sm" data-testid="rfq-review-products">
                          <thead className="text-left text-xs text-muted-foreground">
                            <tr>
                              <th className={cn(cell, 'font-medium')}>Product Name</th>
                              <th className={cn(cell, 'w-36 font-medium')}>SKU Code</th>
                              <th className={cn(cell, 'w-28 font-medium')}>HSN Code</th>
                              <th className={cn(cell, 'w-36 font-medium')}>Quantity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map(({ key, node, qty, cell: cellKey }) => {
                              const cellError = problems.allocations.cells[cellKey]
                              return (
                                <tr key={key} className="border-t border-border align-top" data-testid="rfq-review-row">
                                  <td className={cn(cell, 'break-words')}>
                                    {node.name}
                                    <span className="block text-[11px] text-muted-foreground">Required {quantityText(qty)}</span>
                                  </td>
                                  <td className={cn(cell, 'text-xs')}>
                                    <SkuCode code={node.skuCode} details={node.skuDetails} />
                                  </td>
                                  <td className={cell}>{node.hsn || '--'}</td>
                                  <td className={cell}>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      aria-label={`Quantity of ${node.name} for ${vendor.name}`}
                                      aria-invalid={Boolean(cellError)}
                                      className="h-8 w-full rounded-md border border-input bg-card px-2 text-right text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
                                      value={choices.allocations[key]?.[vendor.key] ?? ''}
                                      disabled={submitting}
                                      onChange={(event) => procurement.allocate(key, vendor.key, toDecimalInput(event.target.value))}
                                    />
                                    {cellError ? <p className="mt-0.5 text-[11px] text-destructive">{cellError}</p> : null}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** The request's steps - the body Inventory Details shows while a request is being made. */
export function QuotationSteps({ procurement }) {
  const { state, tree } = procurement
  return (
    <div className="space-y-3" data-testid="request-quotation" data-state={state}>
      <Stepper steps={STEPS} current={STEP_OF[state] ?? 2} />
      {state === STATE.PURCHASE_METHOD_SELECTION && tree ? <SelectionStep procurement={procurement} /> : null}
      {state === STATE.VENDOR_SELECTION ? <VendorStep procurement={procurement} /> : null}
      {state !== STATE.PURCHASE_METHOD_SELECTION && state !== STATE.VENDOR_SELECTION ? <ReviewStep procurement={procurement} /> : null}
    </div>
  )
}

/**
 * The request's buttons - Inventory Details' footer while a request is being made.
 *
 *   onStock        back to the stock tables (from the first step)
 *   onDone         Done - closes Inventory Details
 */
export function QuotationFooter({ procurement, onStock, onDone }) {
  const { state, actions, problems } = procurement
  const submitting = state === STATE.QUOTATION_SUBMITTING
  const selecting = state === STATE.PURCHASE_METHOD_SELECTION
  const choosingVendors = state === STATE.VENDOR_SELECTION

  // What still stands in the way - said beside the buttons.
  const blocker = selecting
    ? problems.selection.none
      ? 'Choose at least one product to order from vendors.'
      : problems.selection.unaskable
        ? 'No product chosen has a vendor linked, so no request can be made. Add one under Inventory > Products, or choose another product.'
        : actions.continue
          ? ''
          : 'Tick a vendor for every product ordered from vendors.'
    : choosingVendors
      ? actions.continue
        ? ''
        : 'Tick at least one vendor for every raw material that has vendors.'
      : actions.download || submitting
        ? ''
        : 'Enter a quantity (0 or more) for each seller’s products - open a seller to see which.'

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {blocker ? <p className="mr-auto text-xs text-muted-foreground">{blocker}</p> : null}
      <Button type="button" variant="outline" icon={ArrowLeft} disabled={submitting} onClick={selecting ? onStock : procurement.back}>
        Back
      </Button>
      {selecting || choosingVendors ? (
        <Button type="button" icon={ArrowRight} disabled={!actions.continue} onClick={procurement.continueOn}>
          Continue
        </Button>
      ) : (
        <Button type="button" disabled={submitting} onClick={onDone}>
          Done
        </Button>
      )}
    </div>
  )
}
