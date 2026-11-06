import { SearchX } from 'lucide-react'

import { StateMessage } from '@/Components/Common/DataList'
import { TableFilters, TablePager } from '@/Components/Common/TableTools'
import { EVENT_KIND, EVENT_STAGE } from '@/Constants/procurementAutomation'
import { useListView } from '@/Hooks/useListView'
import EventCard from '@/Modules/Procurement/Components/EventCard'

/**
 * One stage's Bids or Pre Bids, one EventCard each. Searching and paging are
 * done in the browser over the rows already read (useListView); they come in
 * the order they open - the latest first once Completed.
 */

const SEARCH_FIELDS = ['Auction_no']

export default function EventList({ events, kind, stage, onView, onEdit, onCancel, onChat, onExpire }) {
  const view = useListView(events, {
    searchFields: SEARCH_FIELDS,
    initialSort: { field: 'opens_at', direction: stage === EVENT_STAGE.COMPLETED ? 'desc' : 'asc' },
  })
  const preBid = kind === EVENT_KIND.PRE_BID

  if (events.length === 0) {
    return (
      <StateMessage icon={SearchX} title={`No ${stage.toLowerCase()} ${preBid ? 'pre bids' : 'bids'}`}>
        {stage === EVENT_STAGE.COMPLETED ? 'Closed and cancelled ones are listed here.' : 'Create one with the Add button above.'}
      </StateMessage>
    )
  }

  return (
    <>
      <TableFilters view={view} searchPlaceholder="Search bid no" />

      {view.rows.length === 0 ? (
        <StateMessage icon={SearchX} title="Nothing matches">
          Change or clear the search to see more.
        </StateMessage>
      ) : (
        <>
          <ul className="space-y-3">
            {view.rows.map((event) => (
              <li key={event.id ?? event.Auction_no}>
                <EventCard
                  event={event}
                  onView={onView}
                  onEdit={onEdit}
                  onCancel={onCancel}
                  onChat={onChat}
                  onExpire={onExpire}
                />
              </li>
            ))}
          </ul>
          <TablePager view={view} />
        </>
      )}
    </>
  )
}
