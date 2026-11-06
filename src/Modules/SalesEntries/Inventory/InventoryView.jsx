import { useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { TableFilters, TablePager } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { SALES_ENTRIES_PAGE_SIZE } from '@/Constants/salesEntries'
import useProducts from '@/Hooks/useProducts'
import { useListView } from '@/Hooks/useListView'
import { readProducts } from '@/Modules/Dashboard/productList'
import CreateProductModal from '@/Modules/SalesEntries/Inventory/CreateProductModal'
import InvoiceProducts from '@/Modules/SalesEntries/Inventory/InvoiceProducts'
import { matchProduct } from '@/Modules/SalesEntries/Inventory/productMatch'
import {
  CHARGES,
  chargesOf,
  checkInventoryInvoice,
  inventoryVoucherLines,
  readInventoryInvoice,
  toInventoryTallyRow,
} from '@/Modules/SalesEntries/Inventory/salesInventory'
import useAutoPartyLedgers from '@/Modules/SalesEntries/Inventory/useAutoPartyLedgers'
import CreatePartyLedgerModal from '@/Modules/SalesEntries/shared/CreatePartyLedgerModal'
import DefaultLedgerSelect from '@/Modules/SalesEntries/shared/DefaultLedgerSelect'
import EntriesPanel from '@/Modules/SalesEntries/shared/EntriesPanel'
import EntriesTable from '@/Modules/SalesEntries/shared/EntriesTable'
import { Amount, LedgerPickCell, Lines, PartyCell, VoucherPreview } from '@/Modules/SalesEntries/shared/EntryCells'
import GetEntriesPanel from '@/Modules/SalesEntries/shared/GetEntriesPanel'
import KeywordMappingModal from '@/Modules/SalesEntries/shared/KeywordMappingModal'
import SendActions from '@/Modules/SalesEntries/shared/SendActions'
import { plural, text } from '@/Modules/SalesEntries/shared/ledgerLists'
import useEntryBatches from '@/Modules/SalesEntries/shared/useEntryBatches'
import useEntrySelection from '@/Modules/SalesEntries/shared/useEntrySelection'
import useGuardedSend from '@/Modules/SalesEntries/shared/useGuardedSend'
import useKeywordMapping from '@/Modules/SalesEntries/shared/useKeywordMapping'
import { useCompanyLedgers, useSalesLedgerChoice } from '@/Modules/SalesEntries/shared/useLedgerChoices'
import useTallySendAndMark from '@/Modules/SalesEntries/shared/useTallySendAndMark'
import { KEYWORD_SOURCE } from '@/Services/Accounting/keywordMappingService'
import {
  INVENTORY_CSV_FORMAT_CONTENT,
  INVENTORY_CSV_FORMAT_FILE,
  TALLY_SEND_INVENTORY_MODULE,
  buildSendInventoryMessage,
  getInventoryEntries,
  markInventoryEntriesSent,
  uploadInventoryEntries,
} from '@/Services/Accounting/salesInventoryService'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate } from '@/Utils/date'

/**
 * WITH INVENTORY. One invoice is a party, its product lines (stock items in
 * Tally), its charges and its GST:
 *
 *   Get entries     Download Format, Upload CSV (replaces the company's invoices)
 *   Party ledgers   a party "Not in tally" is created in Tally on its own when
 *                   the batch arrives (useAutoPartyLedgers), once; Create / Retry
 *                   are there for one that is still missing after that
 *   Products        each line goes as a company stock item (productMatch) -
 *                   shown, changeable, and created when there is none
 *   Sales ledger    the invoice's own, else its pick, else the default - every
 *                   product line is posted to it
 *   Charges         one ledger per charge for the batch; an invoice with that
 *                   charge cannot go without it
 *   Mapping         source with_inventory: a product's GST ledger that IS a
 *                   keyword becomes the mapped ledger
 *   Send to Tally   sales_with_inventory, marked sent only when Tally created them all
 */

const SEARCH_FIELDS = ['invoiceNo', 'partyLedger', 'gstin']
const FILTER_FIELDS = { state: 'State' }
const MAPPING_RULE = "A product's GST ledger that IS the keyword (\"IGST 18%\") becomes the mapped ledger."
const NO_CHARGES = Object.freeze(Object.fromEntries(CHARGES.map((charge) => [charge.key, ''])))

export default function InventoryView({ companyId, companyName, isTally, canCreateLedger }) {
  const batch = useEntryBatches(companyId, getInventoryEntries, { onLoaded: (rows) => auto.createFor(rows) })
  const auto = useAutoPartyLedgers({ companyName, enabled: isTally, onDone: batch.reload })
  const sales = useSalesLedgerChoice(companyId)
  const ledgers = useCompanyLedgers(companyId)
  const mapping = useKeywordMapping(companyId, KEYWORD_SOURCE.WITH_INVENTORY)
  const products = useProducts()
  const [chargeLedgers, setChargeLedgers] = useState(NO_CHARGES)
  const [stockPicks, setStockPicks] = useState({})
  const [mappingOpen, setMappingOpen] = useState(false)
  const [creatingParty, setCreatingParty] = useState(null)
  const [creatingProduct, setCreatingProduct] = useState(null)

  const invoices = useMemo(() => batch.rows.map((raw) => readInventoryInvoice(raw, { mapping: mapping.mapping })), [batch.rows, mapping.mapping])

  /* ---------------- Stock items ---------------- */
  // readProducts: the raw rows name them "Product Name" / "HSN Code".
  const stock = useMemo(
    () => readProducts(products.rows).map((product) => ({ name: text(product.name), hsn: text(product.hsn) })).filter((item) => item.name),
    [products.rows],
  )
  const stockOptions = useMemo(
    () => [...new Set(stock.map((item) => item.name))].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name })),
    [stock],
  )
  const matches = useMemo(() => {
    const found = new Map()
    invoices.forEach((invoice) => invoice.products.forEach((product) => found.set(product.key, matchProduct(product, stock))))
    return found
  }, [invoices, stock])
  const matchOf = (product) => matches.get(product.key) ?? { name: null, how: null, candidates: [] }
  const stockNameOf = (product) => stockPicks[product.key] || matchOf(product).name || ''
  const chooseStock = (product, name) =>
    setStockPicks((previous) => {
      const next = { ...previous }
      if (name) next[product.key] = name
      else delete next[product.key]
      return next
    })
  const productsReady = products.status === 'ready' || products.rows.length > 0

  /* ---------------- What each invoice may do ---------------- */
  const chargeLedgerOf = (charge) => chargeLedgers[charge.key] || charge.own
  const picksOf = (invoice) => ({ salesLedger: sales.ledgerOf(invoice.key, invoice.ownSalesLedger), stockNameOf, chargeLedgerOf })
  const problemOf = (invoice) =>
    productsReady ? checkInventoryInvoice(invoice, picksOf(invoice)) : "Waiting for the company's stock items."

  const tally = useTallySendAndMark({
    moduleName: TALLY_SEND_INVENTORY_MODULE,
    companyName,
    buildMessage: buildSendInventoryMessage,
    markSent: (numbers) => markInventoryEntriesSent(companyId, numbers),
    onSettled: batch.reload,
  })
  const busy = tally.busy || auto.busy

  const locked = useMemo(() => {
    const numbers = new Set([...tally.inFlight, ...tally.unmarked])
    return new Set(invoices.filter((invoice) => numbers.has(invoice.invoiceNo)).map((invoice) => invoice.key))
  }, [invoices, tally.inFlight, tally.unmarked])
  const pick = useEntrySelection(invoices, { locked, isReady: (invoice) => !problemOf(invoice) && !invoice.notInTally })
  const guard = useGuardedSend({
    chosen: pick.chosen,
    problemOf,
    toItem: (invoice) => ({ invoiceNo: invoice.invoiceNo, row: toInventoryTallyRow(invoice, picksOf(invoice)) }),
    tally,
  })

  const view = useListView(invoices, { searchFields: SEARCH_FIELDS, filterFields: FILTER_FIELDS, initialPageSize: SALES_ENTRIES_PAGE_SIZE })
  const offset = typeof view.pageSize === 'number' ? (view.page - 1) * view.pageSize : 0

  const chargesInBatch = CHARGES.filter((charge) => invoices.some((invoice) => chargesOf(invoice).some((item) => item.key === charge.key)))
  const missingParties = invoices.filter((invoice) => invoice.notInTally && !auto.creating.has(invoice.partyLedger.toLowerCase()))
  const unmatchedLines = productsReady ? invoices.flatMap((invoice) => invoice.products).filter((product) => !stockNameOf(product)).length : 0

  const columns = [
    {
      key: 'invoice',
      head: 'Invoice',
      width: 140,
      cell: (invoice) => (
        <>
          <div className="font-medium">{invoice.invoiceNo || '--'}</div>
          <div className="text-xs text-muted-foreground">{formatDate(invoice.invoiceDate)}</div>
        </>
      ),
    },
    {
      key: 'party',
      head: 'Party Ledger',
      width: 220,
      cell: (invoice) => (
        <PartyCell
          name={invoice.partyLedger}
          sub={[invoice.gstin, invoice.state].filter(Boolean).join(' · ')}
          notInTally={invoice.notInTally}
          creating={auto.creating.has(invoice.partyLedger.toLowerCase())}
          onCreate={canCreateLedger ? () => setCreatingParty(invoice) : undefined}
          locked={locked.has(invoice.key)}
          problem={problemOf(invoice)}
          disabled={busy}
        />
      ),
    },
    {
      key: 'products',
      head: 'Products',
      width: 210,
      cell: (invoice) => {
        const missing = productsReady ? invoice.products.filter((product) => !stockNameOf(product)).length : 0
        return (
          <>
            <Lines lines={invoice.products.map((product) => ({ name: stockNameOf(product) || product.name, amount: product.amount }))} empty="No products" />
            {missing > 0 ? <div className="mt-1 text-[11px] text-destructive">{plural(missing, 'line has', 'lines have')} no stock item</div> : null}
          </>
        )
      },
    },
    { key: 'gst', head: 'GST', width: 160, cell: (invoice) => <Lines lines={invoice.gstLines} empty="No GST" /> },
    {
      key: 'charges',
      head: 'Charges',
      width: 150,
      cell: (invoice) => <Lines lines={chargesOf(invoice).map((charge) => ({ name: charge.label, amount: charge.amount }))} empty="None" />,
    },
    { key: 'total', head: 'Total', width: 110, align: 'right', cell: (invoice) => <Amount value={invoice.total} className="font-medium" /> },
    {
      key: 'sales',
      head: 'Sales Ledger',
      width: 200,
      cell: (invoice) =>
        invoice.ownSalesLedger ? (
          <span className="text-xs">{invoice.ownSalesLedger}</span>
        ) : (
          <LedgerPickCell
            id={`inventory-sales-ledger-${invoice.key}`}
            label={`Sales ledger of invoice ${invoice.invoiceNo}`}
            value={sales.overrideOf(invoice.key)}
            defaultValue={sales.defaultLedger}
            options={sales.options}
            disabled={busy || locked.has(invoice.key) || !isTally}
            onChange={(name) => sales.setOverride(invoice.key, name)}
          />
        ),
    },
  ]

  const details = (invoice) => (
    <VoucherPreview
      lines={inventoryVoucherLines(invoice, picksOf(invoice))}
      details={[
        { label: 'Address', value: invoice.address },
        { label: 'Products / GST / Total', value: [invoice.taxable, invoice.gstLines.reduce((sum, line) => sum + line.amount, 0), invoice.total].map(formatIndianCurrency).join(' / ') },
      ]}
      note="Each product line goes to Tally as the stock item shown, posted to the sales ledger."
    >
      <InvoiceProducts
        invoice={invoice}
        matchOf={matchOf}
        stockNameOf={stockNameOf}
        stockOptions={stockOptions}
        overrideOf={(product) => stockPicks[product.key] ?? ''}
        onChoose={chooseStock}
        onCreate={setCreatingProduct}
        disabled={busy || locked.has(invoice.key)}
      />
    </VoucherPreview>
  )

  return (
    <div className="space-y-4">
      <GetEntriesPanel
        format={{ file: INVENTORY_CSV_FORMAT_FILE, content: INVENTORY_CSV_FORMAT_CONTENT }}
        upload={(file) => uploadInventoryEntries(companyId, file)}
        onUploaded={() => {
          pick.clear()
          sales.clearOverrides()
          setStockPicks({})
          batch.restart()
        }}
        total={batch.total}
        disabled={busy}
        replaces="every inventory invoice of the company"
        hint="One row per product line; the invoice's details repeat on each. Entries show for an hour after the upload."
      />

      <EntriesPanel
        batch={batch}
        tally={tally}
        isTally={isTally}
        busy={busy}
        entryCount={invoices.length}
        meta={batch.total > 0 ? ` (Total: ${batch.total}${unmatchedLines ? ` · ${plural(unmatchedLines, 'product line')} without a stock item` : ''})` : undefined}
        emptyHint="Upload a CSV in the format above. The invoices show here before anything goes to Tally. An upload is kept for an hour - upload it again after that."
      >
        {products.status === 'failed' ? (
          <InlineAlert action={<RetryButton onClick={products.reload} />}>The company&apos;s stock items could not be loaded: {products.error}</InlineAlert>
        ) : null}
        {isTally && missingParties.length > 0 && !auto.busy ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-300">
            <span className="flex-1">{plural(new Set(missingParties.map((invoice) => invoice.partyLedger.toLowerCase())).size, 'party ledger is', 'party ledgers are')} still not in Tally.</span>
            <Button type="button" variant="outline" size="sm" icon={UserPlus} disabled={busy} onClick={() => auto.retry(batch.rows)}>
              Create in Tally
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <DefaultLedgerSelect
            id="inventory-default-sales-ledger"
            label="Default Sales Ledger"
            required
            choices={sales}
            value={sales.defaultLedger}
            onChange={sales.setDefaultLedger}
            disabled={busy || !isTally}
          />
          {chargesInBatch.map((charge) => (
            <DefaultLedgerSelect
              key={charge.key}
              id={`inventory-${charge.key}-ledger`}
              label={`${charge.label} Ledger`}
              choices={ledgers}
              value={chargeLedgers[charge.key]}
              onChange={(name) => setChargeLedgers((previous) => ({ ...previous, [charge.key]: name }))}
              disabled={busy || !isTally}
              className="w-full sm:w-56"
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Every product line is posted to the sales ledger.{' '}
          {chargesInBatch.length > 0
            ? 'An invoice with a charge or discount needs that charge’s ledger - Tally would leave a discount out without one.'
            : 'No invoice of this batch has packaging, freight, insurance, other charges or a discount.'}
        </p>

        <TableFilters
          view={view}
          searchPlaceholder="Search invoice, party or GSTIN"
          actions={<SendActions isTally={isTally} count={pick.chosen.length} tally={tally} guard={guard} busy={busy} onMapping={() => setMappingOpen(true)} />}
        />
        <EntriesTable
          rows={view.rows}
          offset={offset}
          pick={pick}
          locked={locked}
          disabled={busy || !isTally}
          columns={columns}
          details={details}
          describe={(invoice) => `invoice ${invoice.invoiceNo}`}
        />
        <TablePager view={view} />
      </EntriesPanel>

      <KeywordMappingModal open={mappingOpen} onOpenChange={setMappingOpen} mapping={mapping} ledgers={ledgers} rule={MAPPING_RULE} />
      <CreatePartyLedgerModal
        entry={creatingParty}
        companyId={companyId}
        companyName={companyName}
        onClose={() => setCreatingParty(null)}
        onCreated={() => {
          setCreatingParty(null)
          batch.reload()
        }}
      />
      <CreateProductModal
        product={creatingProduct}
        companyName={companyName}
        onClose={() => setCreatingProduct(null)}
        onCreated={() => {
          setCreatingProduct(null)
          products.reload()
        }}
      />
    </div>
  )
}
