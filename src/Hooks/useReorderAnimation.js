import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * REORDERED ITEMS SLIDE INTO PLACE - when a list's order changes, each item
 * that moved glides from where it was to where it is now, instead of jumping
 * (first, last, invert, play - with the browser's own animations, no library).
 *
 *   const { listRef, capture } = useReorderAnimation()
 *
 *   const move = (next) => { capture(); setRows(next) }
 *   <ol ref={listRef}>
 *     {rows.map((row) => <li key={row.key} data-reorder-key={row.key}>...</li>)}
 *   </ol>
 *
 *   listRef     on the list - its children with data-reorder-key are the items
 *   capture()   just before the order is changed - where each item is on the
 *               screen then (mid-slide included, so a second move before the
 *               first is over carries on from where the item is)
 *
 * Only what capture() was called before is animated - an edit that changes an
 * item's height moves the others as it always did. Nothing moves for those who
 * ask for reduced motion.
 */

const ITEMS = ':scope > [data-reorder-key]'

export default function useReorderAnimation({ duration = 220, easing = 'cubic-bezier(0.2, 0, 0, 1)' } = {}) {
  const listRef = useRef(null)
  const before = useRef(null)
  // key -> the item's slide in progress
  const running = useRef(new Map())

  // Every commit: after a capture(), each item that moved slides from where it was.
  useLayoutEffect(() => {
    const from = before.current
    before.current = null
    const list = listRef.current
    if (!from || !list) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    list.querySelectorAll(ITEMS).forEach((node) => {
      const key = node.dataset.reorderKey
      const start = from.get(key)
      if (!start || typeof node.animate !== 'function') return
      running.current.get(key)?.cancel()
      const end = node.getBoundingClientRect()
      const dx = start.left - end.left
      const dy = start.top - end.top
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
      const slide = node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration, easing })
      running.current.set(key, slide)
      slide.onfinish = () => running.current.get(key) === slide && running.current.delete(key)
    })
  })

  const capture = useCallback(() => {
    const list = listRef.current
    if (!list) return
    before.current = new Map([...list.querySelectorAll(ITEMS)].map((node) => [node.dataset.reorderKey, node.getBoundingClientRect()]))
  }, [])

  return { listRef, capture }
}
