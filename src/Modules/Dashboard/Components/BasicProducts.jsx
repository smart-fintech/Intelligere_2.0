/**
 * The Product section for a user WITHOUT Inventory Management: the Product
 * CSV Upload card and the Product Form on the left, the Product List on the
 * right - the same arrangement as Ledger Details, built from the same pieces.
 *
 * WHICH PRODUCT IS IN THE FORM
 * The one whose Edit was clicked - that row is tinted in the table - and
 * otherwise none: an empty form, ready to add one.
 *
 * (With Inventory Management the Product section is the SKU-based form
 * instead - Products.jsx. InventoryDetails decides which, through
 * useInventoryAccess; this page never asks.)
 *
 * ------------------------------------------------------------------
 * WHAT REACHES THE NETWORK
 * ------------------------------------------------------------------
 *   opening the section / company change   the list   POST { company }
 *                                           the product groups   POST { company_name }
 *                                           the units, once a visit
 *                                           the vendors (Intelligere only)
 *   Refresh / Retry                         the list
 *   Save in the form                        see BasicProductForm - HTTP for
 *                                           Intelligere, the WebSocket for
 *                                           Tally - then the list again
 *   Sync Now (Tally only)                   the WebSocket, then the list and
 *                                           the groups again
 *
 * After every change the list is read again from the backend rather than
 * patched by hand, so the table always shows what is really saved.
 * Searching, filtering, sorting and paging work on the rows already loaded
 * (Hooks/useListView) and cost no request.
 *
 * ------------------------------------------------------------------
 * SYNC NOW (Tally users)
 * ------------------------------------------------------------------
 * Asks Tally, over the app's shared WebSocket, to send this company's
 * products again: { payload: { module_name: "tally_product_fetch",
 * company_name, source } }. The same job as Ledger Details' Sync Now and
 * done the same way: the loader stays on from the click until the
 * `tally_product_fetch` reply with action_status "stop_loader", and the list
 * is then read again.
 *
 * ------------------------------------------------------------------
 * WHICH ERP
 * ------------------------------------------------------------------
 * From the profile in the store, the app's one answer to it. It decides the
 * columns and the form's fields (BASIC_PRODUCT_FIELDS), how a product is
 * saved, and whether there is a Sync Now - nothing about who may be here.
 *
 * THERE IS NO DELETE: how a simple product is removed has not been
 * confirmed (see the note in productService), so a row has Edit only. And
 * the CSV card is drawn but not connected - see ProductCsvUpload.
 *
 * The rows are this page's alone, so they are kept here rather than in the
 * store.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { AlertCircle, CloudDownload, Package, Pencil, RefreshCw } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Loader } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import {
  DataTable,
  PlainHead,
  SortableHead,
  TableFilters,
  TablePager,
} from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { TableCell, TableRow } from '@/Components/ui/table'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { useListView } from '@/Hooks/useListView'
import useProductGroups from '@/Hooks/useProductGroups'
import useProductUnits from '@/Hooks/useProductUnits'
import useVendorOptions from '@/Hooks/useVendorOptions'
import { useWebSocket } from '@/Hooks/useWebSocket'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import {
  BASIC_PRODUCT_ERP,
  BASIC_PRODUCT_FIELDS,
  TALLY_PRODUCT_FETCH_MODULE,
  buildFetchProductsMessage,
  getBasicProducts,
  readBasicProduct,
} from '@/Services/productService'
import { selectCompanyStatus } from '@/Store/Slices/companySlice'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'
import { orDash } from '@/Utils/display'
import BasicProductForm from './BasicProductForm'
import ProductCsvUpload from './ProductCsvUpload'

/**
 * Safety net for Sync Now: the longest the loader waits for Tally's
 * stop_loader. A large company can take a while, so this is generous - it
 * only stops the page spinning for ever if the reply never comes.
 */
const SYNC_TIMEOUT_MS = 5 * 60 * 1000

/* Searched and filtered under the neutral names readBasicProduct gives a
   row, so they work whichever ERP's names the list arrived in. */
const SEARCH_FIELDS = ['name', 'group', 'hsn', 'category']
const FILTER_FIELDS = {
  group: 'Group',
  gstRate: 'GST Rate',
}

/** The name column is the one a user scans for; the rest are short values. */
const COLUMN_WIDTH = { name: 220, group: 160 }

/** What a company whose list has not arrived yet shows - one object, so the memos below hold. */
const NOT_LOADED = { status: 'loading', rows: [], error: null }

export default function BasicProducts() {
  const { activeCompanyName: companyName } = useActiveCompany()
  const companyStatus = useSelector(selectCompanyStatus)

  // Tally, or - for everyone else - Intelligere. See "Which ERP" at the top.
  const isTally = useSelector(selectIsTallyErp)
  const erp = isTally ? BASIC_PRODUCT_ERP.TALLY : BASIC_PRODUCT_ERP.INTELLIGERE
  const fields = BASIC_PRODUCT_FIELDS[erp]

  /* ---------------- The list ----------------
     Kept with the company it belongs to: a result for an older company (the
     header changed while it was on its way) is not shown. A reload keeps the
     rows on screen until the new ones arrive. */
  const [state, setState] = useState({ status: 'loading', rows: [], error: null, forKey: null })
  const [attempt, setAttempt] = useState(0)
  const request = useRef(null)

  useEffect(() => {
    if (!companyName) return

    const requestKey = `${companyName}#${attempt}`
    if (request.current === requestKey) return
    request.current = requestKey

    getBasicProducts(companyName)
      .then((rows) => {
        if (request.current === requestKey) setState({ status: 'ready', rows, error: null, forKey: companyName })
      })
      .catch((failure) => {
        if (request.current !== requestKey) return
        toast.error(failure.message)
        setState((previous) => ({
          status: 'failed',
          // The rows already on screen stay if they are this company's.
          rows: previous.forKey === companyName ? previous.rows : [],
          error: failure.message,
          forKey: companyName,
        }))
      })
  }, [companyName, attempt])

  /** One controlled reload - Refresh, Retry, and after every save or sync. */
  const reload = () => {
    setState((previous) => ({ ...previous, status: 'loading' }))
    setAttempt((count) => count + 1)
  }

  const current = state.forKey === companyName ? state : NOT_LOADED
  const loading = current.status === 'loading'

  /* What the table draws: each product under the neutral names
     readBasicProduct gives it (with `source`, the row as the backend sent
     it), and a key - its id, its Tally identifier, or its position for a
     row that arrived with neither. */
  const rows = useMemo(
    () =>
      current.rows.map((row, index) => {
        const product = readBasicProduct(row)
        return { ...product, key: product.id ?? product.guid ?? `row-${index}` }
      }),
    [current.rows],
  )

  const view = useListView(rows, { searchFields: SEARCH_FIELDS, filterFields: FILTER_FIELDS })

  /* ---------------- The form ----------------
     `editing` is the row open in the form, or null while adding. `saves`
     counts the saves: with the row's key it makes the form's `key`, so the
     form starts afresh when another row is chosen AND after every save -
     an add leaves an empty form behind it, ready for the next product. */
  const [editing, setEditing] = useState(null)
  const [saves, setSaves] = useState(0)

  // The row is kept with the company it was picked under: when the header
  // moves to another company, its form must not open on the last one's product.
  const editingProduct = editing?.company === companyName ? editing.product : null

  /** A save finished: back to an empty form, and the list read again. */
  const handleSaved = () => {
    setEditing(null)
    setSaves((count) => count + 1)
    reload()
  }

  /* What the form's dropdowns offer. The groups are this company's; the
     units are the same for everyone; the vendors are the same the Vendor
     tab lists, asked for only where the form has a Vendor field. */
  const groups = useProductGroups()
  const units = useProductUnits()
  const vendors = useVendorOptions(!isTally)

  /* ---------------- Sync Now (Tally) ---------------- */

  // True from the click until Tally says it has finished.
  const [syncing, setSyncing] = useState(false)
  // Where the sync is: 'idle' | 'sending' | 'waiting' (for stop_loader). A
  // ref, because the socket callback that reads it was registered on mount.
  const syncPhaseRef = useRef('idle')
  const syncTimerRef = useRef(null)

  /** Loader off, and ready for the next Sync Now. */
  const endSync = () => {
    syncPhaseRef.current = 'idle'
    clearTimeout(syncTimerRef.current)
    syncTimerRef.current = null
    setSyncing(false)
  }

  /** The sync failed before stop_loader: stop, say so, reload nothing. */
  const failSync = (message, error) => {
    console.error('[Product Sync] WebSocket error:', error ?? message)
    endSync()
    toast.error(message)
  }

  /**
   * The app's shared WebSocket - no new connection. `module` means only
   * tally_product_fetch replies reach this handler.
   */
  const { send, status: socketStatus } = useWebSocket({
    module: TALLY_PRODUCT_FETCH_MODULE,
    onMessage: (data) => {
      const reply = data?.res
      if (!reply || reply.return_module_name !== TALLY_PRODUCT_FETCH_MODULE) return

      // Not a sync this page started (or already finished): ignore it.
      const phase = syncPhaseRef.current
      if (phase !== 'waiting' && phase !== 'sending') return

      // Several replies can arrive; only stop_loader ends the Tally part.
      if (reply.action_status !== 'stop_loader') return

      if (reply.msg) {
        if (reply.status === 'error') toast.error(reply.msg)
        else if (reply.status === 'success') toast.success(reply.msg)
        else toast.info(reply.msg)
      }

      // The list is read again either way: a sync that failed part of the
      // way through still leaves what is on screen out of date. A sync that
      // worked can have brought Tally's stock groups over as well, so the
      // Group dropdown is refilled too.
      endSync()
      reload()
      if (reply.status !== 'error') groups.reload()
    },
  })

  // The connection dropped while Tally was working: its reply is lost, so
  // stop rather than spin until the safety timeout.
  useEffect(() => {
    if (socketStatus === 'closed' && syncPhaseRef.current === 'waiting') {
      failSync('The live server connection was lost during the product sync. Please try again.')
    }
    // failSync is a plain function recreated each render; only the status
    // should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketStatus])

  // Nothing of the sync may outlive the page.
  useEffect(
    () => () => {
      syncPhaseRef.current = 'idle'
      clearTimeout(syncTimerRef.current)
    },
    [],
  )

  /** Sync Now. A click while a sync is running is ignored. */
  const handleSync = async () => {
    if (!isTally || syncPhaseRef.current !== 'idle') return

    const name = companyName?.trim()
    if (!name) {
      toast.error('Please select an active company before syncing Product data.')
      return
    }

    syncPhaseRef.current = 'sending'
    setSyncing(true)

    const delivered = await send(buildFetchProductsMessage(name))

    // The reply may already have arrived, or the page gone away.
    if (syncPhaseRef.current !== 'sending') return

    if (!delivered) {
      failSync('Could not reach the live server. Please try again.')
      return
    }

    syncPhaseRef.current = 'waiting'
    syncTimerRef.current = setTimeout(() => {
      if (syncPhaseRef.current === 'waiting') {
        failSync('Tally did not finish the product sync in time. Please try again.')
      }
    }, SYNC_TIMEOUT_MS)
  }

  /* ---------------- What fills the list card ---------------- */
  const renderList = () => {
    // Sync Now first: the whole list area is the loader until Tally has
    // finished - never "No products found" in between.
    if (syncing) {
      return (
        <Loader
          variant="page"
          label={`Syncing products from Tally for ${companyName}...`}
          description="The product list will appear as soon as the sync finishes."
        />
      )
    }

    if (!companyName) {
      if (companyStatus === 'idle' || companyStatus === 'loading') return <ListSkeleton />

      return (
        <StateMessage icon={Package} title="No company selected">
          Choose a company in the header to see its products.
        </StateMessage>
      )
    }

    if (loading && rows.length === 0) return <ListSkeleton />

    // Nothing tries again on its own; Retry is the only way.
    if (current.status === 'failed' && rows.length === 0) {
      return (
        <StateMessage
          icon={AlertCircle}
          tone="error"
          title="Could not load products"
          action={<RetryButton onClick={reload} />}
        >
          {current.error}
        </StateMessage>
      )
    }

    // An empty list is an answer, not a failure.
    if (rows.length === 0) {
      return (
        <StateMessage icon={Package} title="No products found">
          {isTally
            ? 'Use the Product Form to add one, or Sync Now to bring this company’s products over from Tally.'
            : 'There are no products for this company. Use the Product Form to add one.'}
        </StateMessage>
      )
    }

    return (
      <>
        <TableFilters view={view} searchPlaceholder="Search name, group or HSN" />

        {view.total === 0 ? (
          <StateMessage icon={Package} title="No matching products">
            Nothing matches the current filters.
          </StateMessage>
        ) : (
          // The ERP's own fields, in its own order. Wide: it scrolls sideways
          // inside its own box, never the page, and the Actions column stays
          // pinned on the right while it does.
          <DataTable
            defaultColumnWidth={120}
            head={
              <>
                {fields.map(({ key, label, from }) => (
                  <SortableHead key={key} view={view} field={from} width={COLUMN_WIDTH[from]}>
                    {label}
                  </SortableHead>
                ))}
                <PlainHead width={72} className="text-right">
                  Actions
                </PlainHead>
              </>
            }
          >
            {view.rows.map((product) => (
              <TableRow
                key={product.key}
                className="text-brand"
                // Tinted while it is the one open in the form.
                data-state={product.key === editingProduct?.key ? 'selected' : undefined}
              >
                {fields.map(({ key, from }) => (
                  <TableCell
                    key={key}
                    className={cn(from === 'name' && 'font-medium')}
                    title={from === 'name' || from === 'group' ? (product[from] ?? undefined) : undefined}
                  >
                    {orDash(product[from])}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  {/* Edit alone, in the look RowActions gives it - see the
                      note at the top on why there is no Delete beside it. */}
                  <Button
                    type="button"
                    variant="iconEdit"
                    size="icon-sm"
                    icon={Pencil}
                    tooltip="Edit"
                    aria-label={`Edit ${product.name ?? 'product'}`}
                    disabled={syncing}
                    onClick={() => setEditing({ product, company: companyName })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        )}

        <TablePager view={view} />
      </>
    )
  }

  return (
    // The form keeps roughly a third; the table takes the rest. They stack
    // on anything narrower than `lg`, form first - as on Ledger Details.
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="w-full shrink-0 space-y-4 lg:w-[32%]">
        <ProductCsvUpload />

        {/* `key` is what fills the form in when a different row is chosen
            for editing, and empties it after a save: React remounts it, so
            its initialiser runs again. No effect, and no request. */}
        <BasicProductForm
          key={`${erp}#${companyName}#${editingProduct?.key ?? 'new'}#${saves}`}
          erp={erp}
          product={editingProduct}
          companyName={companyName}
          groups={groups}
          units={units}
          vendors={vendors}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      </div>

      {/* `min-w-0` lets the wide table scroll inside this column instead of
          stretching the whole page. */}
      <div className="min-w-0 flex-1">
        <Panel
          title="Product List"
          meta={companyName && rows.length > 0 ? `(Total Count: ${rows.length})` : undefined}
          actions={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={reload}
                disabled={!companyName || loading || syncing}
                aria-label="Refresh product list"
              >
                <RefreshCw className={cn(loading && companyName && 'animate-spin')} />
                Refresh
              </Button>

              {/* Fetches from Tally, so only Tally users get it. */}
              {isTally ? (
                <Button
                  type="button"
                  size="sm"
                  icon={CloudDownload}
                  loading={syncing}
                  disabled={!companyName}
                  onClick={handleSync}
                >
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </Button>
              ) : null}
            </div>
          }
        >
          {/* A failed refresh with rows still on screen: they stay, and this
              says why they have not changed. */}
          {!syncing && current.status === 'failed' && rows.length > 0 ? (
            <InlineAlert action={<RetryButton onClick={reload} />}>{current.error}</InlineAlert>
          ) : null}

          {renderList()}
        </Panel>
      </div>
    </div>
  )
}
