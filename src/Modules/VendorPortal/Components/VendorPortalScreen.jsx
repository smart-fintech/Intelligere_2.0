import { useEffect, useState } from 'react'
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { EVENT_KIND, EVENT_KINDS, EVENT_STAGE, VENDOR_REFRESH_MS } from '@/Constants/procurementAutomation'
import PreBidChatModal from '@/Modules/Procurement/Components/PreBidChatModal'
import VendorEventCard from '@/Modules/VendorPortal/Components/VendorEventCard'
import { VENDOR_STAGES } from '@/Modules/VendorPortal/vendorPortal'

/**
 * The vendor's Bids or Pre Bids, Ongoing or Completed, each as a card.
 *
 * While a Bid runs the list is read again every VENDOR_REFRESH_MS (only while
 * the tab is in view) - another vendor's lower bid and a close moved by extra
 * time show up with no click; a bid placed here reads it again at once.
 *
 * `lists` is both kinds' useVendorEvents, read by the page - its header needs
 * them too, for the vendor's profile.
 */

const KIND_OPTIONS = [
  { value: EVENT_KIND.BID, label: 'Bids' },
  { value: EVENT_KIND.PRE_BID, label: 'Pre Bids' },
]

export default function VendorPortalScreen({ email, lists }) {
  const [kind, setKind] = useState(EVENT_KIND.BID)
  const [stage, setStage] = useState(EVENT_STAGE.ONGOING)
  const [chatWith, setChatWith] = useState(null)

  const list = lists[kind]
  const { label } = EVENT_KINDS[kind]
  const running = kind === EVENT_KIND.BID && (list.data?.[EVENT_STAGE.ONGOING]?.length ?? 0) > 0
  const reload = list.reload

  useEffect(() => {
    if (!running) return undefined
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') reload()
    }, VENDOR_REFRESH_MS)
    return () => clearInterval(timer)
  }, [running, reload])

  const events = list.data?.[stage] ?? []
  const chatEvent = chatWith
    ? (lists[EVENT_KIND.PRE_BID].data
        ? VENDOR_STAGES.flatMap((name) => lists[EVENT_KIND.PRE_BID].data[name])
        : []
      ).find((event) => event.id === chatWith)
    : null

  const renderList = () => {
    if (!list.data) {
      if (list.status === 'failed') {
        return (
          <StateMessage
            icon={AlertCircle}
            tone="error"
            title={`Could not load your ${label.toLowerCase()}s`}
            action={<RetryButton onClick={reload} />}
          >
            {list.error}
          </StateMessage>
        )
      }
      return <ListSkeleton rows={4} />
    }

    return (
      <>
        {list.status === 'failed' ? (
          <InlineAlert action={<RetryButton onClick={reload} />}>{list.error}</InlineAlert>
        ) : null}

        <ViewSwitch
          options={VENDOR_STAGES.map((name) => ({
            value: name,
            label: `${name} (${list.data[name].length})`,
          }))}
          value={stage}
          onValueChange={setStage}
          label={`${label} stage`}
          idPrefix="vendor-stage"
          className="mx-auto mb-3 w-fit max-w-full"
        />

        {events.length === 0 ? (
          <StateMessage icon={Inbox} title={`No ${stage.toLowerCase()} ${label.toLowerCase()}s`}>
            {stage === EVENT_STAGE.ONGOING
              ? `A ${label.toLowerCase()} you are invited to shows up here once it starts.`
              : `${label}s you took part in show up here once they close.`}
          </StateMessage>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id}>
                <VendorEventCard
                  event={event}
                  email={email}
                  onPlaced={reload}
                  onChat={(chosen) => setChatWith(chosen.id)}
                  onExpire={reload}
                />
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-brand sm:text-2xl">Your Bids</h1>
        <ViewSwitch
          options={KIND_OPTIONS}
          value={kind}
          onValueChange={(next) => {
            setKind(next)
            setChatWith(null)
          }}
          label="Bids or Pre Bids"
          idPrefix="vendor-kind"
        />
      </div>

      <Panel
        title={`${label}s`}
        meta={running ? 'Updates every 20 seconds while a bid runs' : undefined}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={RefreshCw}
            loading={list.status === 'loading'}
            onClick={reload}
          >
            Refresh
          </Button>
        }
      >
        {renderList()}
      </Panel>

      {chatEvent ? (
        <PreBidChatModal
          key={chatEvent.id}
          event={chatEvent}
          vendorEmail={email}
          canSend={chatEvent.stage === EVENT_STAGE.ONGOING && !chatEvent.cancelled}
          onClose={() => setChatWith(null)}
        />
      ) : null}
    </div>
  )
}
