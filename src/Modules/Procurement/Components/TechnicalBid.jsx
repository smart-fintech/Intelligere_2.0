import { useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ExternalLink, FileText, MessageCircleQuestion, NotebookText, ShieldCheck } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import { fileName, readTechnicalDetails } from '@/Modules/Procurement/procurement'
import { richTextClass } from '@/Utils/richText'
import { orDash } from '@/Utils/display'

/**
 * A Pre Bid's technical bid, in blocks both sides share - the vendor's card
 * (VendorEventCard) lays them out beside its products, the company's details
 * (EventDetailsModal) as TechnicalBidView. What each shows is
 * readTechnicalDetails' (procurement.js):
 *
 *   TechnicalBlock       one titled box (icon, title, count, an action on the right)
 *   CertificationBlock   the required certifications - every one the API lists
 *                        is required, as the form saved them
 *   FaqBlock             the FAQs, each question opening its answer; Expand all
 *   NoteBlock            the buyer's note (sanitised rich text), a long one folded
 *   DocumentBlock        the event's files
 *
 * Each block lays itself out by its own width (a container query), not the
 * window's, so the same block fits a narrow column of the card and a wide
 * modal. Nothing is shown that the API did not send.
 */

export function TechnicalBlock({ icon: Icon, title, count, action, className, bodyClassName, children }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={cn('min-w-0 rounded-lg border border-border bg-card', className)}>
      <header className="flex min-h-10 items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 text-brand" /> : null}
        <h4 id={headingId} className="text-sm font-semibold text-brand">
          {title}
        </h4>
        {count !== undefined ? (
          <span className="rounded-full bg-brand-soft px-1.5 py-px text-[11px] font-semibold text-brand tabular-nums">{count}</span>
        ) : null}
        {action ? <div className="ml-auto">{action}</div> : null}
      </header>
      <div className={cn('@container p-3', bodyClassName)}>{children}</div>
    </section>
  )
}

function CertificationList({ names }) {
  return (
    // Badges side by side as far as they fit; a long name wraps inside its own badge.
    <ul className="flex flex-wrap gap-1.5">
      {names.map((name, index) => (
        <li
          key={`${index}-${name}`}
          className="flex max-w-full min-w-0 items-start gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1 text-sm dark:border-emerald-500/25 dark:bg-emerald-500/10"
        >
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="min-w-0 font-medium break-words text-foreground">{name}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The questions are listed, each opening its answer - the first is open to
 * begin with. With more than one, the block's action opens or closes them all
 * (FaqToggleAll, driven by the same state through useFaqs).
 */
function useFaqs(faqs) {
  const [opened, setOpened] = useState(() => new Set(faqs.length > 0 ? [0] : []))
  const allOpen = faqs.length > 0 && faqs.every((_, index) => opened.has(index))
  return {
    opened,
    allOpen,
    toggle: (index) =>
      setOpened((previous) => {
        const next = new Set(previous)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        return next
      }),
    toggleAll: () => setOpened(allOpen ? new Set() : new Set(faqs.map((_, index) => index))),
  }
}

function FaqToggleAll({ state, count }) {
  if (count < 2) return null
  return (
    <Button type="button" variant="link" size="sm" className="h-7 px-0" onClick={state.toggleAll}>
      {state.allOpen ? 'Collapse all' : 'Expand all'}
    </Button>
  )
}

function FaqList({ faqs, state }) {
  const baseId = useId()
  return (
    <ol className="space-y-1.5">
      {faqs.map((faq, index) => {
        const open = state.opened.has(index)
        const questionId = `${baseId}-q${index}`
        const answerId = `${baseId}-a${index}`
        return (
          <li key={index} className={cn('rounded-md border border-border', open && 'border-brand/30 bg-brand-soft/20')}>
            <h5>
              <button
                type="button"
                id={questionId}
                aria-expanded={open}
                aria-controls={answerId}
                onClick={() => state.toggle(index)}
                className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="mt-px shrink-0 rounded bg-brand-soft px-1.5 text-[11px] leading-5 font-semibold text-brand tabular-nums">
                  Q{index + 1}
                </span>
                <span className="min-w-0 flex-1 break-words">{orDash(faq.question)}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn('mt-0.5 size-4 shrink-0 text-brand-muted transition-transform', open && 'rotate-180 text-brand')}
                />
              </button>
            </h5>
            <div
              id={answerId}
              role="region"
              aria-labelledby={questionId}
              hidden={!open}
              className="border-t border-border/70 px-3 py-2 pl-11 text-sm leading-relaxed break-words whitespace-pre-line text-foreground/85"
            >
              {orDash(faq.answer)}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Taller than this, a note is folded with a "Show more" (in px - Tailwind's max-h-48). */
const NOTE_FOLD_PX = 192

function NoteView({ html }) {
  const contentId = useId()
  const ref = useRef(null)
  const [long, setLong] = useState(false)
  const [open, setOpen] = useState(false)

  // Folded only when that saves real space - a note a line over the limit is shown whole.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const measure = () => setLong(node.scrollHeight > NOTE_FOLD_PX + 32)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [html])

  const folded = long && !open
  return (
    <div>
      <div className="relative">
        {/* readTechnicalBid has sanitised it (Utils/richText) - only the editor's formatting tags remain. */}
        <div
          ref={ref}
          id={contentId}
          className={cn(richTextClass, 'leading-relaxed [&_li]:my-0.5 [&_p+p]:mt-2', folded && 'max-h-48 overflow-hidden')}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {folded ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />
        ) : null}
      </div>
      {long ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-1 h-7 px-0"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((previous) => !previous)}
        >
          {open ? 'Show less' : 'Show more'}
        </Button>
      ) : null}
    </div>
  )
}

/** A file's kind from its name ("PDF"), or nothing. */
const extensionOf = (name) => {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name)
  return match ? match[1].toUpperCase() : ''
}

function DocumentList({ urls }) {
  return (
    <ul className="grid gap-1.5 @md:grid-cols-2">
      {urls.map((url) => {
        const name = fileName(url)
        const kind = extensionOf(name)
        return (
          <li key={url} className="min-w-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={name}
              className="group flex min-w-0 items-center gap-2 rounded-md border border-input px-2.5 py-1.5 text-sm text-brand outline-none hover:border-brand/40 hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <FileText aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              {kind ? (
                <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">{kind}</span>
              ) : null}
              <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

/** The FAQ block with its Expand all action - one piece for both layouts. */
export function FaqBlock({ faqs, className }) {
  const state = useFaqs(faqs)
  return (
    <TechnicalBlock
      icon={MessageCircleQuestion}
      title="FAQs"
      count={faqs.length}
      action={<FaqToggleAll state={state} count={faqs.length} />}
      className={className}
    >
      <FaqList faqs={faqs} state={state} />
    </TechnicalBlock>
  )
}

export function CertificationBlock({ names, className }) {
  return (
    <TechnicalBlock
      icon={ShieldCheck}
      title="Required Certifications"
      count={names.length}
      className={className}
    >
      <CertificationList names={names} />
    </TechnicalBlock>
  )
}

export function NoteBlock({ html, className }) {
  return (
    <TechnicalBlock icon={NotebookText} title="Buyer's Note" className={className}>
      <NoteView html={html} />
    </TechnicalBlock>
  )
}

export function DocumentBlock({ urls, className }) {
  return (
    <TechnicalBlock icon={FileText} title="Documents" count={urls.length} className={className}>
      <DocumentList urls={urls} />
    </TechnicalBlock>
  )
}

/**
 * The whole technical bid in one column of blocks - the company's details
 * view. The certifications and the note sit side by side when the box is wide.
 */
export function TechnicalBidView({ event }) {
  const details = readTechnicalDetails(event)
  if (details.isEmpty) return <p className="text-sm text-muted-foreground">No technical bid details were added.</p>

  // Side by side only when both are there; alone, either takes the full width.
  const alone = details.certifications.length === 0 || !details.hasNote ? '@2xl:col-span-2' : undefined
  return (
    <div className="@container">
      <div className="grid gap-3 @2xl:grid-cols-2">
        {details.certifications.length > 0 ? <CertificationBlock names={details.certifications} className={alone} /> : null}
        {details.hasNote ? <NoteBlock html={details.note} className={alone} /> : null}
        {details.faqs.length > 0 ? <FaqBlock faqs={details.faqs} className="@2xl:col-span-2" /> : null}
      </div>
    </div>
  )
}
