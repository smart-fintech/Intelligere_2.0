/**
 * The "Add Ledger" button in the Ledger page's heading, and the two modals
 * behind it.
 *
 *   Tally         Add Ledger Group  /  Add Ledger Creation  /  Add Stock Group Creation
 *   Intelligere   Add Ledger Creation
 *
 * Add Stock Group Creation (StockGroupModal) is Tally's too: it creates a
 * stock group in Tally over the WebSocket, for products to be filed under.
 * An Intelligere company without Inventory Management gets the same modal
 * as "Add Product Group Creation", which creates the group through the API
 * - the place the simple Product form's groups are added now.
 *
 * Ledger groups are a Tally idea - Intelligere's come as a fixed list from
 * the API - so that option is simply not offered to an Intelligere user. The
 * ERP is the store's answer (selectIsTallyErp), the same one the Ledger Form
 * and the list already act on; nothing new decides it here.
 *
 * ------------------------------------------------------------------
 * THE ADD LEDGER MODAL IS THE LEDGER FORM ITSELF
 * ------------------------------------------------------------------
 * Not a copy of it: <LedgerForm> is rendered inside the modal exactly as the
 * page renders it beside the list. So the fields, the validation, the
 * "Fill from GSTIN" switch and its lookup, the group and bank dropdowns, and
 * both ways of saving - the API for Intelligere, the WebSocket for Tally -
 * are the ones already written and already working. A change to the form is
 * a change in both places, because there is only one form.
 *
 * ------------------------------------------------------------------
 * IT LIVES IN THE APP'S HEADER, NOT ON THE LEDGER PAGE
 * ------------------------------------------------------------------
 * So a ledger can be added from wherever the user happens to be. The header
 * is mounted once, by AppLayout, which is also what keeps this to ONE copy of
 * each modal for the whole app - no page renders its own, and no global store
 * is needed to coordinate them.
 *
 * Being reachable from anywhere has one consequence worth naming: on the
 * Ledger page the list has already loaded the groups and the bank names that
 * the form's dropdowns read, but on the Dashboard or the Profile page nothing
 * has. So opening a modal asks for them - through the SAME thunks that page
 * uses, whose `condition` turns the request into a no-op when the data is
 * already there. Opening this from the Ledger page therefore costs nothing.
 *
 * ------------------------------------------------------------------
 * A SUB USER IS OFFERED WHAT THEY MAY CREATE
 * ------------------------------------------------------------------
 * Every option adds something, so each needs Create on its section in the
 * company being worked in (useSectionAccess): the ledger group and the
 * ledger, Ledger Details; the stock / product group, Product Details. With
 * none left, the button is not shown. Anybody else is offered all of them.
 */

import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { FolderPlus, Layers, Plus, UserPlus } from 'lucide-react'

import { ActionDropdown } from '@/Components/Common/ActionDropdown'
import { Modal } from '@/Components/Common/Modal'
import { toast } from '@/Library/toast'
import {
  selectActiveCompany,
  selectActiveCompanyId,
  selectActiveCompanyName,
} from '@/Store/Slices/companySlice'
import { fetchBankOptions, selectBankNames } from '@/Store/Slices/bankSlice'
import useInventoryAccess from '@/Hooks/useInventoryAccess'
import useSectionAccess from '@/Hooks/useSectionAccess'
import { ACCESS_SECTIONS } from '@/Services/accessService'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'
import { fetchLedgerGroups, fetchLedgers, selectLedgerGroups } from '@/Store/Slices/ledgerSlice'
import LedgerForm from './LedgerForm'
import LedgerGroupModal from './LedgerGroupModal'
import StockGroupModal from './StockGroupModal'

/** What the dropdown reports back - see onSelect below. */
const ADD_LEDGER = 'ledger_creation'
const ADD_LEDGER_GROUP = 'ledger_group'
const ADD_STOCK_GROUP = 'stock_group'

/**
 * How long a save waits before the ledgers are read back.
 *
 * Tally answers `stop_loader` as soon as IT has finished, and the backend's
 * own copy - which is what the list reads - can still be catching up, so the
 * wait is what makes the new ledger part of the answer.
 */
// const RELOAD_AFTER_SAVE_MS = 30 * 1000

export default function LedgerActions() {
  const dispatch = useDispatch()

  // The same reads the list and the form make - one company, one store.
  const company = useSelector(selectActiveCompany)
  const companyId = useSelector(selectActiveCompanyId)
  const activeCompanyName = useSelector(selectActiveCompanyName)
  const groups = useSelector(selectLedgerGroups)
  const bankNames = useSelector(selectBankNames)
  const isTally = useSelector(selectIsTallyErp)
  const inventory = useInventoryAccess()
  const canCreateLedger = useSectionAccess(ACCESS_SECTIONS.LEDGER).create
  const canCreateProduct = useSectionAccess(ACCESS_SECTIONS.PRODUCT).create

  // Tally always; Intelligere when its products are the simple ones.
  const offersGroupCreation = canCreateProduct && (isTally || (inventory.known && !inventory.full))

  // Which modal is open, or null. One at a time, by definition.
  const [openModal, setOpenModal] = useState(null)

  /* The pending read-back, and the company it is for. Both refs: the timer
     below fires long after the render that started it, and has to know
     whether that company is still the one on screen. */
  const reloadTimerRef = useRef(null)
  const companyIdRef = useRef(companyId)

  useEffect(() => {
    companyIdRef.current = companyId
  }, [companyId])

  // Half a minute is long enough to outlive the page: without this the timer
  // would fire after a sign-out, or into a company the user has since left.
  useEffect(
    () => () => {
      clearTimeout(reloadTimerRef.current)
      reloadTimerRef.current = null
    },
    [],
  )

  /* Tally can add a group; Intelligere's are fixed, so it is left out rather
     than shown greyed. "Add Ledger Creation" is offered to both. */
  const options = [
    ...(isTally && canCreateLedger
      ? [{ label: 'Add Ledger Group', value: ADD_LEDGER_GROUP, icon: FolderPlus }]
      : []),
    ...(canCreateLedger ? [{ label: 'Add Ledger Creation', value: ADD_LEDGER, icon: UserPlus }] : []),
    // See the note at the top for who gets it.
    ...(offersGroupCreation
      ? [
          {
            label: isTally ? 'Add Stock Group Creation' : 'Add Product Group Creation',
            value: ADD_STOCK_GROUP,
            icon: Layers,
          },
        ]
      : []),
  ]

  /** Reloads the ledger list - the same thunk the page's Refresh uses. */
  const reloadLedgers = () => dispatch(fetchLedgers({ companyId, force: true }))

  /**
   * Reloads the ledger groups, so a group just created in Tally is in the
   * Ledger Form's dropdown without a page reload. `force` is what gets past
   * the thunk's "we already have these" condition.
   */
  const reloadGroups = () => {
    dispatch(fetchLedgerGroups({ force: true })).then((result) => {
      if (fetchLedgerGroups.rejected.match(result) && !result.meta.condition) {
        toast.error(result.payload || 'Ledger groups could not be reloaded.')
      }
    })
  }

  const handleSelect = (value) => {
    // Every ledger is filed under a company, so there is nothing to add to
    // until one is chosen.
    if (!companyId) {
      toast.error('Select a company in the header first.')
      return
    }

    /* What the form's dropdowns are made of. Asked for here because this
       button is on every page, and only the Ledger page loads them by
       itself; both thunks refuse a duplicate request (see their
       `condition`), so from the Ledger page these are no-ops. */
    // (The stock group modal reads its own list - product groups - as it opens.)
    if (value !== ADD_STOCK_GROUP) dispatch(fetchLedgerGroups())
    // Only the ledger form needs the banks - the group modal has no such field.
    if (value === ADD_LEDGER) dispatch(fetchBankOptions())

    setOpenModal(value)
  }

  /**
   * A ledger was saved: close the modal and read the ledgers back.
   *
   * ONE reload, for both ERPs, and only on a save that succeeded - the form
   * calls this from its success path alone (a failed Tally save goes to
   * `onRefresh` instead). That is the same single call the Ledger page makes
   * after a save from the form beside the list, so a ledger added here and a
   * ledger added there leave the store in the same state.
   *
   * It is `tally/create-ledger/` - the endpoint that both creates a ledger
   * and, given just a company, lists them (see ledgerService). Asking for it
   * through `fetchLedgers` rather than calling the service directly is what
   * puts the answer in the store, which is what the Ledger Details list
   * reads.
   */
  const handleLedgerSaved = () => {
    setOpenModal(null)

    // The company this ledger was filed under - not necessarily the one the
    // header will be on half a minute from now.
    const savedFor = companyId

    clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null

      /* The user has moved to another company since saving. Reloading now
         would fetch THAT company's ledgers under this one's name and leave
         the store describing the wrong company, so the read-back is simply
         dropped - the page they are on has loaded its own. */
      if (companyIdRef.current !== savedFor) return

      dispatch(fetchLedgers({ companyId: savedFor, force: true }))
    }, 0)
    // }, RELOAD_AFTER_SAVE_MS)
  }

  return (
    <>
      {/* A sub user with nothing they may add is not shown the button. */}
      {options.length > 0 ? (
        <ActionDropdown
          label="Add"
          icon={Plus}
          size="sm"
          options={options}
          onSelect={handleSelect}
          // Nothing can be added until the header is on a company - the same
          // rule the list's Refresh and Sync Now follow. (No tooltip to explain
          // it: a disabled button takes no pointer events, so none would show.)
          disabled={!companyId}
        />
      ) : null}

      {/* ---------------- Add Ledger Creation ----------------
          The page's own Ledger Form, in a modal. `key` gives it a fresh set
          of empty fields each time it is opened, so yesterday's half-filled
          form never reappears - the same trick the page uses to load a row
          into it for editing. */}
      <Modal
        open={openModal === ADD_LEDGER}
        onOpenChange={(next) => setOpenModal(next ? ADD_LEDGER : null)}
        title="Add Ledger Creation"
        size="lg"
      >
        <LedgerForm
          key={openModal === ADD_LEDGER ? 'modal-open' : 'modal-closed'}
          ledger={null}
          companyId={companyId}
          companyName={company?.comp_name}
          groups={groups}
          bankNames={bankNames}
          onSaved={handleLedgerSaved}
          onCancel={() => setOpenModal(null)}
          isTally={isTally}
          onRefresh={reloadLedgers}
          // The dialog has its own heading and its own X, so the form leaves
          // its titled card off here - see `framed` in LedgerForm.
          framed={false}
        />
      </Modal>

      {/* ---------------- Add Ledger Group (Tally only) ---------------- */}
      <LedgerGroupModal
        open={openModal === ADD_LEDGER_GROUP}
        onOpenChange={(next) => setOpenModal(next ? ADD_LEDGER_GROUP : null)}
        companyId={companyId}
        companyName={activeCompanyName}
        groups={groups}
        onCreated={reloadGroups}
      />

      {/* ---------------- Add Stock / Product Group Creation ---------------- */}
      {offersGroupCreation ? (
        <StockGroupModal
          open={openModal === ADD_STOCK_GROUP}
          onOpenChange={(next) => setOpenModal(next ? ADD_STOCK_GROUP : null)}
          companyName={activeCompanyName}
          isTally={isTally}
        />
      ) : null}
    </>
  )
}
