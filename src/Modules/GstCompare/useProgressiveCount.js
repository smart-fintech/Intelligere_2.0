/**
 * HOW MANY ROWS OF A LONG TABLE TO DRAW SO FAR.
 *
 *   const shown = useProgressiveCount(rows.length)
 *   rows.slice(0, shown).map(...)
 *
 * A comparison can have thousands of rows a side, and drawing them all in one
 * go froze the page for seconds (2,000 a side: one 1.3 s task). The first
 * batch is drawn at once; each next one after the browser has painted and
 * handled any input, as a transition React may interrupt. Every row is there
 * in the end - nothing is paged or hidden.
 *
 * Starts over when the component does: the tables are keyed on the comparison.
 */

import { startTransition, useEffect, useState } from 'react'

const BATCH = 150

export default function useProgressiveCount(total) {
  const [count, setCount] = useState(BATCH)

  useEffect(() => {
    if (count >= total) return undefined
    const timer = setTimeout(() => startTransition(() => setCount((current) => current + BATCH)), 0)
    return () => clearTimeout(timer)
  }, [count, total])

  return Math.min(count, total)
}
