/**
 * THE TICKS of a view's batch:
 *
 *   const pick = useEntrySelection(entries, { locked, isReady })
 *
 *   selected        Set of entry keys ticked
 *   chosen          the ticked entries that are on screen and not locked -
 *                   what Send sends
 *   allState        true | false | 'indeterminate', for the header's box
 *   toggle(key), toggleAll(), clear()
 *
 *   locked     Set of keys that cannot be picked now (being sent, or sent and not marked)
 *   isReady    entry => whether the header's box picks it: nothing in its way
 *   groupOf    optional, entry => a name for entries that go only together
 *              (Multi Ledger's B2C summaries, marked sent by one empty invoice
 *              number): ticking one ticks them all. null for an entry on its own.
 *
 * A tick on an entry that has left the batch is simply not counted.
 */

import { useState } from 'react'

export default function useEntrySelection(entries, { locked, isReady, groupOf }) {
  const [selected, setSelected] = useState(() => new Set())

  const ready = entries.filter((entry) => !locked.has(entry.key) && isReady(entry))
  const chosen = entries.filter((entry) => selected.has(entry.key) && !locked.has(entry.key))
  const allState =
    ready.length > 0 && ready.every((entry) => selected.has(entry.key)) ? true : chosen.length > 0 ? 'indeterminate' : false

  const togetherWith = (key) => {
    const group = groupOf?.(entries.find((entry) => entry.key === key) ?? {}) ?? null
    return group === null ? [key] : entries.filter((entry) => groupOf(entry) === group).map((entry) => entry.key)
  }

  const toggle = (key) =>
    setSelected((previous) => {
      const next = new Set(previous)
      const on = !next.has(key)
      togetherWith(key).forEach((one) => (on ? next.add(one) : next.delete(one)))
      return next
    })

  const toggleAll = () => setSelected(allState === true ? new Set() : new Set([...chosen, ...ready].map((entry) => entry.key)))

  return { selected, chosen, allState, toggle, toggleAll, clear: () => setSelected(new Set()) }
}
