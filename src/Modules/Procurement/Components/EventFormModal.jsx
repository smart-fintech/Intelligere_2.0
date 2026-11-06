import { useRef, useState } from 'react'
import { AlertCircle, Info, Paperclip, Save, Upload, X } from 'lucide-react'

import { CheckboxField, Field, FieldLabel, fieldLabelClass } from '@/Components/Common/FormFields'
import { formatBytes } from '@/Components/Common/Loader/helpers'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { Tooltip } from '@/Components/ui/tooltip'
import { EVENT_KIND, EVENT_KINDS } from '@/Constants/procurementAutomation'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import ProductPicker from '@/Modules/Procurement/Components/ProductPicker'
import ProductRows from '@/Modules/Procurement/Components/ProductRows'
import TechnicalBidFields from '@/Modules/Procurement/Components/TechnicalBidFields'
import {
  buildCreateBody,
  buildTechnicalBid,
  buildUpdateBody,
  emptyMaster,
  emptyTechnicalBid,
  fileName,
  isRowErrorKey,
  isTechnicalErrorKey,
  masterFromEvent,
  newProductRow,
  nextSrNo,
  readTechnicalBid,
  recheckErrors,
  refreshEvents,
  rowErrors,
  rowsFromEvent,
  serverFieldErrors,
  technicalBidErrors,
  validateMaster,
} from '@/Modules/Procurement/procurement'
import useProductOptions, { useCompanyVendors } from '@/Modules/Procurement/useProductOptions'
import { createEvent, updateEvent } from '@/Services/Procurement/procurementAutomationService'

/**
 * Create a Bid or a Pre Bid, or edit one.
 *
 *   create   master details, the technical bid (Pre Bid), files, products
 *   edit     the same layout, filled in from the event. The API updates the
 *            product list (and a Pre Bid's technical bid) only, so the master
 *            details and files are shown read only and never sent. Saved
 *            products stay as they are; products and vendors can be added.
 *
 * Nothing is sent until every check here passes. Each error is shown on its own
 * field (one flat map, see rowErrorKey) and nothing moves the view: the footer
 * says how many fields need attention, and a refusal from the backend that names
 * no field is shown there too. The form stays open with everything typed.
 */

const NO_ROWS = []

/** Today as the date boxes write it, the earliest a new window may start. */
const todayInput = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** A titled block of the form; `aside` sits at the right of the title (a count, a hint, a button). */
function Section({ title, aside, children }) {
  return (
    <section className="space-y-2.5 rounded-lg border border-border/70 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-brand">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** One end of a window under one label: a date box and a time box, each only as wide as its value. */
function WhenField({ name, label, master, errors, min, disabled, onField }) {
  const dateId = `procurement-${name}-date`
  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={dateId} required>
        {label}
      </FieldLabel>
      <div className="flex items-start gap-2">
        <Field
          id={dateId}
          type="date"
          aria-label={`${label} date`}
          required
          min={min}
          value={master[`${name}_date`]}
          error={errors[`${name}_date`]}
          disabled={disabled}
          onChange={(event) => onField(`${name}_date`, event.target.value)}
          className="w-38"
        />
        <Field
          id={`procurement-${name}-time`}
          type="time"
          aria-label={`${label} time`}
          required
          value={master[`${name}_time`]}
          error={errors[`${name}_time`]}
          disabled={disabled}
          onChange={(event) => onField(`${name}_time`, event.target.value)}
          className="w-30"
        />
      </div>
    </div>
  )
}

/**
 * The bid gap as the old module had it: the amount, and an "In %" tick box
 * beside it - ticked, the gap is a percentage; unticked, a rupee amount. The
 * unit shows at the end of the box. Only the unit changes with the tick, never
 * the number, and the tick is `bid_gap_percentage` in the payload.
 */
function BidGapField({ master, error, disabled, onField }) {
  const percent = master.bid_gap_percentage

  return (
    <div className="space-y-1.5">
      {/* h-3: the label row of every other field, so the box lines up with theirs; the icon overhangs it. */}
      <div className="flex h-3 items-center gap-1">
        <FieldLabel htmlFor="procurement-gap" required>
          Bid Gap
        </FieldLabel>
        <Tooltip
          text={
            <span className="block space-y-1 text-left">
              <span className="block">The least each new bid must beat the current lowest bid by.</span>
              <span className="block">
                Tick &quot;In %&quot; for a share of the lowest bid; leave it unticked for a fixed ₹ amount.
              </span>
            </span>
          }
        >
          <span
            tabIndex={0}
            aria-label="About bid gap"
            className="inline-flex size-5 cursor-help items-center justify-center rounded-full text-brand outline-none hover:bg-brand-soft focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Info className="size-3.5" />
          </span>
        </Tooltip>
      </div>
      <div className="flex items-start gap-3">
        <Field
          id="procurement-gap"
          aria-label={`Bid gap in ${percent ? 'percent' : 'rupees'}`}
          required
          type="number"
          min="0"
          step="any"
          value={master.gap}
          error={error}
          disabled={disabled}
          onChange={(event) => onField('gap', event.target.value)}
          className="w-28"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-sm font-semibold text-brand"
          >
            {percent ? '%' : '₹'}
          </span>
        </Field>
        <CheckboxField
          id="procurement-gap-percent"
          label="In %"
          checked={percent}
          disabled={disabled}
          onCheckedChange={(on) => onField('bid_gap_percentage', on)}
          className="h-10"
        />
      </div>
    </div>
  )
}

/** A few related options laid out as a field: the heading as its label, the options in one input-high box. */
function OptionGroup({ id, title, children }) {
  return (
    <div role="group" aria-labelledby={id} className="space-y-1.5">
      <p id={id} className={cn('h-3', fieldLabelClass)}>
        {title}
      </p>
      <div className="flex h-10 items-center gap-x-4 rounded-md border border-input px-3">{children}</div>
    </div>
  )
}

/**
 * The master details in two rows, each field only as wide as its value:
 *
 *   1  Bid No · Starting Amount · Bid Gap · the visibility and extra time options
 *   2  the schedule, start beside close (a Pre Bid's technical window above its
 *      financial one) · Attachments (the rest of the row)
 *
 * A Pre Bid's four windows never fit one row, so they sit as a 2 x 2 grid and
 * the files fill the space beside it. Narrower screens wrap; a phone stacks.
 */
function MasterFields({ kind, master, errors, disabled, onField, attachments }) {
  const preBid = kind === EVENT_KIND.PRE_BID
  const min = todayInput()
  const shared = { master, errors, disabled, onField }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <Field
          id="procurement-auction-no"
          label="Bid No"
          required
          value={master.Auction_no}
          error={errors.Auction_no}
          disabled={disabled}
          onChange={(event) => onField('Auction_no', event.target.value)}
          className="w-full sm:w-36"
        />
        <Field
          id="procurement-starting-amount"
          label="Starting Amount (₹)"
          type="number"
          min="0"
          step="any"
          placeholder="Optional"
          value={master.starting_bid_amount}
          error={errors.starting_bid_amount}
          disabled={disabled}
          onChange={(event) => onField('starting_bid_amount', event.target.value)}
          className="w-full sm:w-36"
        />
        <BidGapField master={master} error={errors.gap} disabled={disabled} onField={onField} />
        <OptionGroup id="procurement-visibility" title="While the bid runs">
          <CheckboxField
            id="procurement-hide-vendor"
            label="Hide vendor details"
            checked={master.hide_vendor}
            disabled={disabled}
            onCheckedChange={(on) => onField('hide_vendor', on)}
          />
          <CheckboxField
            id="procurement-hide-amount"
            label="Hide bid amount"
            checked={master.hide_lowest_bid_amount}
            disabled={disabled}
            onCheckedChange={(on) => onField('hide_lowest_bid_amount', on)}
          />
        </OptionGroup>
        <div className="flex items-start gap-2">
          <OptionGroup id="procurement-extra-time-group" title="Extra Time">
            <CheckboxField
              id="procurement-extra-time-on"
              label="Add"
              checked={master.add_extra_time}
              disabled={disabled}
              onCheckedChange={(on) => onField('add_extra_time', on)}
            />
          </OptionGroup>
          {master.add_extra_time ? (
            // Under the same label height as the others, so its box sits level with theirs.
            <Field
              id="procurement-extra-time"
              label="Minutes"
              required
              type="number"
              min="1"
              step="1"
              placeholder="e.g. 5"
              value={master.extra_time}
              error={errors.extra_time}
              disabled={disabled}
              onChange={(event) => onField('extra_time', event.target.value)}
              className="w-24"
            />
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <div
          role="group"
          aria-label="Schedule"
          className="grid w-full grid-cols-1 gap-x-5 gap-y-3 sm:w-auto sm:grid-cols-[auto_auto]"
        >
          {preBid ? (
            <>
              <WhenField name="pre_starting" label="Technical Bid Start" min={min} {...shared} />
              <WhenField
                name="pre_closing"
                label="Technical Bid Close"
                min={master.pre_starting_date || min}
                {...shared}
              />
            </>
          ) : null}
          <WhenField
            name="starting"
            label={preBid ? 'Financial Bid Start' : 'Bid Start'}
            min={(preBid && master.pre_closing_date) || min}
            {...shared}
          />
          <WhenField
            name="closing"
            label={preBid ? 'Financial Bid Close' : 'Bid Close'}
            min={master.starting_date || min}
            {...shared}
          />
        </div>
        <div className="min-w-56 flex-1 space-y-1.5">
          <p className={fieldLabelClass}>Attachments</p>
          {attachments}
        </div>
      </div>
    </div>
  )
}

/** The files as removable chips after the picker button. */
function FilePicker({ files, onChange, disabled }) {
  const inputRef = useRef(null)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        icon={Upload}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Select Files
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          onChange([...files, ...Array.from(event.target.files ?? [])])
          // Cleared, so choosing the same file again still fires `change`.
          event.target.value = ''
        }}
      />
      {files.length > 0 ? (
        files.map((file, index) => (
          <span
            key={`${file.name}-${index}`}
            className="inline-flex h-8 max-w-64 items-center gap-1.5 rounded-md border border-input pr-0.5 pl-2 text-xs"
          >
            <Paperclip className="size-3.5 shrink-0 text-brand" />
            <span className="min-w-0 truncate" title={file.name}>
              {file.name}
            </span>
            <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              icon={X}
              aria-label={`Remove ${file.name}`}
              disabled={disabled}
              onClick={() => onChange(files.filter((_, at) => at !== index))}
            />
          </span>
        ))
      ) : (
        <span className="text-xs text-muted-foreground">Specifications, drawings or anything vendors should see.</span>
      )}
    </div>
  )
}

/** An edit's files, as links in the same chips - the update cannot add or remove any. */
function SavedFiles({ urls }) {
  if (urls.length === 0) return <p className="text-xs text-muted-foreground">No file attached.</p>
  return (
    <ul className="flex flex-wrap gap-2">
      {urls.map((url) => (
        <li key={url}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={fileName(url)}
            className="inline-flex h-8 max-w-64 items-center gap-1.5 rounded-md border border-input px-2 text-xs text-brand hover:bg-brand-soft"
          >
            <Paperclip className="size-3.5 shrink-0" />
            <span className="truncate">{fileName(url)}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

export default function EventFormModal({ kind, event = null, companyId, companyName, onClose }) {
  const editing = Boolean(event)
  const preBid = kind === EVENT_KIND.PRE_BID
  const { label } = EVENT_KINDS[kind]

  const [master, setMaster] = useState(() => (editing ? masterFromEvent(event) : emptyMaster()))
  const [errors, setErrors] = useState({})
  const [rows, setRows] = useState(() => (editing ? rowsFromEvent(event) : NO_ROWS))
  const [technical, setTechnical] = useState(() => (editing ? readTechnicalBid(event) : emptyTechnicalBid()))
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  // A refusal from the backend that names no field - shown in the footer.
  const [problem, setProblem] = useState(null)

  const products = useProductOptions(companyName)
  const companyVendors = useCompanyVendors(companyId)

  const setField = (field, value) => {
    setMaster((previous) => ({ ...previous, [field]: value }))
    // The unit is part of what the gap means, so switching it clears the gap's message too.
    const cleared = field === 'bid_gap_percentage' ? 'gap' : field
    setErrors((previous) => {
      if (!previous[cleared]) return previous
      const next = { ...previous }
      delete next[cleared]
      return next
    })
  }

  // After a failed Save, each change re-checks only what was flagged in its part of the form.
  const handleRows = (next) => {
    setRows(next)
    setErrors((previous) => recheckErrors(previous, rowErrors(next), isRowErrorKey))
  }
  const handleTechnical = (next) => {
    setTechnical(next)
    setErrors((previous) => recheckErrors(previous, technicalBidErrors(next), isTechnicalErrorKey))
  }

  const errorCount = Object.keys(errors).length

  const handleSave = async () => {
    setProblem(null)

    // Every check at once, each message on its field; the view stays where it is.
    const found = {
      ...(editing ? {} : validateMaster(master, kind)),
      ...rowErrors(rows),
      ...(preBid ? technicalBidErrors(technical) : {}),
    }
    setErrors(found)
    const count = Object.keys(found).length
    if (count > 0) {
      toast.error(count === 1 ? 'One field needs attention.' : `${count} fields need attention.`)
      return
    }

    let technicalBid = null
    if (preBid) {
      const built = buildTechnicalBid(technical)
      if (built.error) {
        setProblem(built.error)
        return
      }
      technicalBid = built.value
    }

    setSaving(true)
    try {
      const reply = editing
        ? await updateEvent(kind, buildUpdateBody({ kind, companyId, event, rows, technicalBid }))
        : await createEvent(
            kind,
            buildCreateBody({
              kind,
              companyId,
              master,
              rows,
              technicalBid,
              files,
            }),
          )
      toast.success(reply?.msg || `${label} saved.`)
      refreshEvents(companyId, kind)
      onClose()
    } catch (failure) {
      const onFields = serverFieldErrors(failure.message, rows)
      if (onFields) setErrors(onFields)
      else setProblem(failure.message)
      toast.error(failure.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={() => {
        if (!saving) onClose()
      }}
      size="xxl"
      title={editing ? `Edit ${label} ${event.Auction_no}` : `Add ${label}`}
      closeOnBackdropClick={false}
      closeOnEsc={!saving}
      showCloseButton={!saving}
      autoFocus={!editing}
      footer={
        <>
          {problem || errorCount > 0 ? (
            <p role="alert" className="flex items-center gap-1.5 self-center text-xs text-destructive sm:mr-auto">
              <AlertCircle className="size-3.5 shrink-0" />
              {problem || (errorCount === 1 ? 'One field needs attention.' : `${errorCount} fields need attention.`)}
            </p>
          ) : null}
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" icon={Save} loading={saving} onClick={handleSave}>
            {editing ? 'Update' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pr-1">
        <Section
          title="Bid Details"
          aside={
            editing ? (
              <span className="text-xs text-muted-foreground">
                Read only - cannot be changed once the {label.toLowerCase()} is created
              </span>
            ) : null
          }
        >
          <MasterFields
            kind={kind}
            master={master}
            errors={errors}
            disabled={editing || saving}
            onField={setField}
            attachments={
              editing ? (
                <SavedFiles urls={event.file} />
              ) : (
                <FilePicker files={files} onChange={setFiles} disabled={saving} />
              )
            }
          />
        </Section>

        {preBid ? (
          <Section title="Technical Bid">
            <TechnicalBidFields value={technical} errors={errors} onChange={handleTechnical} disabled={saving} />
          </Section>
        ) : null}

        <Section
          title="Products & Vendors"
          aside={
            <span className="text-xs text-muted-foreground">
              {rows.length === 1 ? '1 product' : `${rows.length} products`}
            </span>
          }
        >
          <ProductPicker
            products={products}
            companyVendors={companyVendors.data ?? NO_ROWS}
            rows={rows}
            nextSrNo={nextSrNo(rows)}
            disabled={saving}
            onAdd={(added) => handleRows([...rows, newProductRow(added)])}
          />
          <ProductRows
            rows={rows}
            productOptions={products.data ?? NO_ROWS}
            companyVendors={companyVendors.data ?? NO_ROWS}
            errors={errors}
            disabled={saving}
            onChange={handleRows}
          />
        </Section>
      </div>
    </Modal>
  )
}
