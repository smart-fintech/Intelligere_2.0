/**
 * WHICH ENTRIES THE USER HAS TRIED TO PUT RIGHT - mapped a party or a GST
 * ledger, created a ledger, saved a note as matched - and how that stands now:
 *
 *   const resolving = useResolveTracking()
 *   resolving.touch(keys)                 after the user's action
 *   resolving.stateOf(entry, { pending, problem })
 *       null        not touched, or touched and now valid - shown as normal
 *       'pending'   touched, and what it waits on (the ledgers, the batch,
 *                   the mapping, the save) is still on its way - red
 *       'invalid'   touched, everything is in, and it still cannot go - tomato
 *   resolving.clear()                     a new upload starts afresh
 *
 * Nothing is stored as "invalid": the state is worked out from the entry as
 * it is NOW, so the moment its ledgers check out it is shown as normal again.
 * An entry that is only unmatched, with nothing tried, is never highlighted.
 */

import { useState } from 'react'

export const RESOLVE_STATE = Object.freeze({ PENDING: 'pending', INVALID: 'invalid' })

/** The row's background for a state - the tint over the whole entry. */
export const RESOLVE_ROW_CLASS = Object.freeze({
  [RESOLVE_STATE.PENDING]: 'bg-red-500/10 hover:bg-red-500/15',
  [RESOLVE_STATE.INVALID]: 'bg-[#FF6347]/15 hover:bg-[#FF6347]/20',
})

export default function useResolveTracking() {
  const [touched, setTouched] = useState(() => new Set())

  return {
    touch: (keys) =>
      setTouched((previous) => {
        const next = new Set(previous)
        keys.forEach((key) => next.add(key))
        return next.size === previous.size ? previous : next
      }),
    clear: () => setTouched(new Set()),
    stateOf: (entry, { pending, problem }) => {
      if (!touched.has(entry.key)) return null
      if (pending) return RESOLVE_STATE.PENDING
      return problem ? RESOLVE_STATE.INVALID : null
    },
  }
}
