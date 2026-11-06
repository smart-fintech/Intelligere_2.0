import { useState } from 'react'
import { AlertCircle, Plus, RefreshCw } from 'lucide-react'

import { ConfirmDialog } from '@/Components/Common/ConfirmDialog'
import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { EVENT_KIND, EVENT_KINDS, EVENT_STAGE, EVENT_STAGES } from '@/Constants/procurementAutomation'
import { useQuery } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import AuctionBidLive from '@/Modules/Procurement/Components/AuctionBidLive'
import CreateBlockedModal from '@/Modules/Procurement/Components/CreateBlockedModal'
import EventDetailsModal from '@/Modules/Procurement/Components/EventDetailsModal'
import EventFormModal from '@/Modules/Procurement/Components/EventFormModal'
import EventList from '@/Modules/Procurement/Components/EventList'
import PreBidChatModal from '@/Modules/Procurement/Components/PreBidChatModal'
import { creationBlocker, eventsKey, readEvents, refreshEvents } from '@/Modules/Procurement/procurement'
import useProductOptions, { useCompanyVendors } from '@/Modules/Procurement/useProductOptions'
import { cancelEvent, getEvents } from '@/Services/Procurement/procurementAutomationService'

/**
 * The module's screen: Bids or Pre Bids, by stage, and everything done to one
 * of them - view, create, edit, cancel, and a Pre Bid's chat.
 *
 * What is open (details, form, chat, cancel) is held by id, and the event is
 * looked up in the latest list each render - so a list read again while it is
 * open (a bid placed, an edit saved) shows the new data instead of a copy.
 *
 * On the Bid list each ongoing bid keeps a live socket (AuctionBidLive): a
 * vendor's bid updates its card as soon as it is saved.
 */

const KIND_OPTIONS = [
  { value: EVENT_KIND.BID, label: 'Bid' },
  { value: EVENT_KIND.PRE_BID, label: 'Pre Bid' },
]

export default function ProcurementScreen({ companyId, companyName }) {
  const [kind, setKind] = useState(EVENT_KIND.BID)
  const [stage, setStage] = useState(EVENT_STAGE.ONGOING)
  // { mode: 'view' | 'edit' | 'chat' | 'cancel', id } or { mode: 'create' }
  const [open, setOpen] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  const { label } = EVENT_KINDS[kind]

  const listKey = eventsKey(companyId, kind)
  const loadList = () => getEvents(kind, companyId).then((reply) => readEvents(reply, kind))
  const list = useQuery({ key: listKey, fetch: loadList })
  const liveBids =
    kind === EVENT_KIND.BID ? (list.data?.[EVENT_STAGE.ONGOING] ?? []).filter((event) => !event.cancelled) : []

  // What a new one needs - asked afresh on each visit (staleTime 0), so a product
  // or vendor created meanwhile is seen. The form reuses the same product answer.
  const products = useProductOptions(companyName, { staleTime: 0 })
  const vendors = useCompanyVendors(companyId, { staleTime: 0 })
  const [blocked, setBlocked] = useState(null)
  // Not decided on an answer that is still being replaced: the button waits for both.
  const checking = products.status === 'loading' || vendors.status === 'loading'

  /** The form opens only when the company has products and vendors; otherwise the modal says what is missing. */
  const handleAdd = () => {
    if (checking) return
    if (products.status === 'failed' || vendors.status === 'failed') {
      toast.error(`Could not check your products and vendors: ${products.error || vendors.error}`)
      if (products.status === 'failed') products.reload()
      if (vendors.status === 'failed') vendors.reload()
      return
    }
    const blocker = creationBlocker({ products: products.data ?? [], vendorCount: (vendors.data ?? []).length, label })
    if (blocker) setBlocked(blocker)
    else setOpen({ mode: 'create' })
  }

  const all = list.data ? EVENT_STAGES.flatMap((name) => list.data[name]) : []
  const current = open?.id !== undefined ? (all.find((event) => event.id === open.id) ?? null) : null
  const close = () => setOpen(null)

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const reply = await cancelEvent(kind, { id: current.id, auctionNo: current.Auction_no, companyId })
      toast.success(reply?.msg || `${label} cancelled.`)
      close()
      refreshEvents(companyId, kind)
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setCancelling(false)
    }
  }

  const renderList = () => {
    if (!list.data) {
      if (list.status === 'failed') {
        return (
          <StateMessage
            icon={AlertCircle}
            tone="error"
            title={`Could not load the ${label.toLowerCase()}s`}
            action={<RetryButton onClick={list.reload} />}
          >
            {list.error}
          </StateMessage>
        )
      }
      return <ListSkeleton rows={5} />
    }

    return (
      <>
        {list.status === 'failed' ? (
          <InlineAlert action={<RetryButton onClick={list.reload} />}>{list.error}</InlineAlert>
        ) : null}

        <ViewSwitch
          options={EVENT_STAGES.map((name) => ({ value: name, label: `${name} (${list.data[name].length})` }))}
          value={stage}
          onValueChange={setStage}
          label={`${label} stage`}
          idPrefix="procurement-stage"
          className="mx-auto mb-3 w-fit max-w-full"
        />

        <EventList
          key={`${kind}-${stage}`}
          events={list.data[stage]}
          kind={kind}
          stage={stage}
          onView={(event) => setOpen({ mode: 'view', id: event.id })}
          onEdit={(event) => setOpen({ mode: 'edit', id: event.id })}
          onChat={(event) => setOpen({ mode: 'chat', id: event.id })}
          onCancel={(event) => setOpen({ mode: 'cancel', id: event.id })}
          onExpire={list.reload}
        />
      </>
    )
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-brand sm:text-2xl">Procurement Automation</h1>
        <ViewSwitch
          options={KIND_OPTIONS}
          value={kind}
          onValueChange={(next) => {
            setKind(next)
            setOpen(null)
          }}
          label="Bid or Pre Bid"
          idPrefix="procurement-kind"
        />
      </div>

      <Panel
        title={`${label}s`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={RefreshCw}
              loading={list.status === 'loading'}
              onClick={list.reload}
            >
              Refresh
            </Button>
            <Button type="button" size="sm" icon={Plus} loading={checking} onClick={handleAdd}>
              Add {label}
            </Button>
          </div>
        }
      >
        {renderList()}
      </Panel>

      {blocked ? <CreateBlockedModal label={label} blocker={blocked} onClose={() => setBlocked(null)} /> : null}

      {open?.mode === 'create' ? (
        <EventFormModal kind={kind} companyId={companyId} companyName={companyName} onClose={close} />
      ) : null}

      {open?.mode === 'edit' && current ? (
        <EventFormModal
          key={current.id}
          kind={kind}
          event={current}
          companyId={companyId}
          companyName={companyName}
          onClose={close}
        />
      ) : null}

      {open?.mode === 'view' && current ? <EventDetailsModal event={current} onClose={close} /> : null}

      {open?.mode === 'chat' && current ? (
        <PreBidChatModal
          key={current.id}
          event={current}
          companyId={companyId}
          canSend={current.stage === EVENT_STAGE.ONGOING && !current.cancelled}
          onClose={close}
        />
      ) : null}

      {liveBids.map((event) => (
        <AuctionBidLive key={event.id} auctionId={event.id} listKey={listKey} loadList={loadList} />
      ))}

      <ConfirmDialog
        open={open?.mode === 'cancel' && Boolean(current)}
        onOpenChange={(next) => {
          if (!next && !cancelling) close()
        }}
        title={`Cancel ${label.toLowerCase()}?`}
        description={`Cancel ${current?.Auction_no ?? ''}? Its vendors will be told it is cancelled. This cannot be undone.`}
        confirmLabel={`Cancel ${label}`}
        cancelLabel="Keep it"
        busy={cancelling}
        onConfirm={handleCancel}
      />
    </div>
  )
}
