import { useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { AlertCircle, BadgeCheck, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Eye, FileText, Pencil, RefreshCw, Save, Send, Trash2, TriangleAlert, X } from 'lucide-react'

import { ActionDropdown } from '@/Components/Common/ActionDropdown'
import { ConfirmDialog } from '@/Components/Common/ConfirmDialog'
import { InlineAlert, ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import { toast } from '@/Library/toast'
import useInvoiceReferenceData from '@/Modules/SalesInvoice/useInvoiceReferenceData'
import VoucherCard from '@/Modules/SalesInvoice/Voucher/VoucherCard'
import useTallyVouchers from '@/Modules/SalesInvoice/Voucher/useTallyVouchers'
import useVoucherTallySend from '@/Modules/SalesInvoice/Voucher/useVoucherTallySend'
import useVoucherTypes from '@/Modules/SalesInvoice/Voucher/useVoucherTypes'
import {
  EMPTY_CHOICES,
  buildTallyVoucherPayload,
  buildVoucherEditPayload,
  canEditVoucher,
  readVoucher,
  resolveVoucher,
} from '@/Modules/SalesInvoice/Voucher/voucherModel'
import {
  DEFAULT_VOUCHER_TYPE_OF,
  VOUCHER_GROUP_OF,
  buildVoucherUpdateBody,
  defaultVoucherTypeFor,
  deleteTallyVoucher,
  editVoucherDocument,
  voucherTypesOfGroup,
  vouchersOfType,
} from '@/Services/salesInvoiceService'
import { selectIsTallyErp, selectProfileStatus } from '@/Store/Slices/profileSlice'

/**
 * VOUCHER - the company's Tally vouchers (invoice/tally-vouchers/), read
 * through the one shared answer per company (useTallyVouchers), one document
 * type at a time and ONE VOUCHER A PAGE (Previous / Next):
 *
 *   Sales Invoice      Sales Invoice | Credit Note | Debit Note (Sales Invoice first)
 *   Purchase Invoice   Purchase Invoice only - no choice shown
 *
 * Each voucher is a VoucherCard. Its ledgers, products and SKUs are checked
 * against the company's own lists - the ones Create Document already reads
 * (useInvoiceReferenceData: tally/create-ledger/, inventory/product/), so
 * nothing is asked again; its Voucher Type is one of the company's types
 * (useVoucherTypes: tally/voucher-list/, once per company) - only those of
 * the document type's voucher_group, with the document type's default
 * (DEFAULT_VOUCHER_TYPE_OF: Sales, Purchase, Credit Note, Debit Note)
 * selected until the user picks another. Until the ledgers and products are in, no card is
 * drawn: a mapping is never reported missing just because its list has not
 * arrived.
 *
 * What the user chooses for a voucher - ledgers, products, narration,
 * voucher type - is kept here, by company and document_id, so it survives
 * paging and switching type. The page goes back to the first voucher when
 * the type changes (a company change mounts this afresh). Paging asks the
 * server nothing.
 *
 * TWO SIDES: on the left the voucher card - its details, its actions at the
 * bottom of the card, and the pages (Previous / Next) under it; on the right,
 * always there, the preview panel (half the width) - a placeholder until
 * Preview is pressed, then the voucher's doc_pdf.
 *
 * EDIT (a PDF-uploaded voucher only - upload_type "pdf"): Edit opens every
 * field of that voucher; what it held then is kept (`editing.before`), so Save
 * Changes sends invoice/edit_invoice/ only what changed since
 * (buildVoucherEditPayload) - once at a time; on success edit mode ends with
 * the new values on screen (the list is not read again), on failure the
 * edits stay to correct and retry. Cancel puts the voucher back as it was;
 * leaving it (another page or document type) with changes not saved asks
 * first. Send / Verified / Delete wait while it is being edited.
 *
 * The actions: Preview (Preview / Mapping); Edit / Save Changes; Send to Tally (a Tally
 * company) or Verified (any other), which checks every mapping first, then
 * runs useVoucherTallySend - for Tally the WebSocket and, only once Tally
 * confirms, the voucher update; otherwise the update alone; Delete, which
 * asks first, then POSTs the voucher to invoice/tally-vouchers/ and - only
 * once that succeeds - reads the vouchers again.
 *
 *   company   the active company's record
 *   types     the document types offered, in order
 *   parties   the flow's { company, ledger } sides - which side the ledger is
 *   labels    { account, party } - "Sales" / "Buyer", "Purchase" / "Seller"
 */

const SALES_VOUCHER_TYPES = Object.freeze(['Sales Invoice', 'Credit Note', 'Debit Note'])

const SALES_LABELS = Object.freeze({ account: 'Sales', party: 'Buyer' })

const NO_ROWS = Object.freeze([])

/** Each voucher once, by its document_id (one without an id is kept as it is). */
const uniqueVouchers = (vouchers) => {
  const seen = new Set()
  return vouchers.filter((voucher) => {
    if (voucher.id === null || voucher.id === undefined) return true
    const key = String(voucher.id)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** A change from a card, applied to that voucher's choices. */
const applyChoice = (current, change) => {
  if ('account' in change) return { ...current, account: change.account }
  if ('party' in change) return { ...current, party: change.party }
  if ('narration' in change) return { ...current, narration: change.narration }
  if ('voucherType' in change) return { ...current, voucherType: change.voucherType }
  if ('mode' in change) return { ...current, mode: change.mode }
  if (change.edit) {
    // ['lines', index, field, text] | ['charges' | 'gst', key, text] - kept as typed.
    const [section, entryKey, ...rest] = change.edit
    const edits = current.edits ?? EMPTY_CHOICES.edits
    const value = section === 'lines' ? { ...edits.lines?.[entryKey], [rest[0]]: rest[1] } : rest[0]
    return { ...current, edits: { ...edits, [section]: { ...edits[section], [entryKey]: value } } }
  }
  if (change.line) return { ...current, lines: { ...current.lines, [change.line[0]]: change.line[1] } }
  if (change.charge) return { ...current, charges: { ...current.charges, [change.charge[0]]: change.charge[1] } }
  return current
}

export default function TallyVouchers({ company, types = SALES_VOUCHER_TYPES, parties, labels = SALES_LABELS }) {
  const companyId = company.company_id
  const vouchers = useTallyVouchers(companyId)
  const { ledgers, products } = useInvoiceReferenceData(companyId)
  const voucherTypeList = useVoucherTypes(company.comp_name)
  const tally = useVoucherTallySend(companyId)
  // The ERP decides Send to Tally or Verified - not pressable until it is known.
  const isTally = useSelector(selectIsTallyErp)
  const erp = { known: useSelector(selectProfileStatus) === 'succeeded', isTally }

  const [type, setType] = useState(types[0])
  const rows = useMemo(() => uniqueVouchers(vouchersOfType(vouchers.groups, type).map(readVoucher)), [vouchers.groups, type])
  // How many each type has - worked out once per answer, not on every render.
  const typeCounts = useMemo(
    () => Object.fromEntries(types.map((option) => [option, uniqueVouchers(vouchersOfType(vouchers.groups, option).map(readVoucher)).length])),
    [types, vouchers.groups],
  )

  // One voucher a page; kept in range when the list shrinks (a delete, a send).
  const [page, setPage] = useState(1)
  const current = Math.min(page, Math.max(rows.length, 1))
  const voucher = rows[current - 1] ?? null

  const [choices, setChoices] = useState({})
  const choiceKey = (entry) => `${companyId}:${entry.id ?? entry.documentNo}`
  const choose = (entry, change) => setChoices((all) => ({ ...all, [choiceKey(entry)]: applyChoice(all[choiceKey(entry)] ?? EMPTY_CHOICES, change) }))

  // The voucher types of this document type's voucher_group (the only ones offered),
  // and the one this document type starts with - all from the one list.
  const ready = voucherTypeList.status === 'ready'
  const groupTypeNames = useMemo(() => voucherTypesOfGroup(voucherTypeList.types, type).map((entry) => entry.name), [voucherTypeList.types, type])
  const defaultTypeName = useMemo(() => defaultVoucherTypeFor(voucherTypeList.types, type), [voucherTypeList.types, type])
  const voucherTypes = {
    status: voucherTypeList.status,
    names: ready ? groupTypeNames : NO_ROWS,
    group: VOUCHER_GROUP_OF[type] ?? '',
    // The name this document type starts with, and whether it is one of the options.
    defaultName: DEFAULT_VOUCHER_TYPE_OF[type] ?? '',
    defaultFound: groupTypeNames.includes(defaultTypeName),
    error: voucherTypeList.error,
    reload: voucherTypeList.reload,
  }
  const refs = {
    ledgers,
    products: products.list ?? NO_ROWS,
    accountLabel: labels.account,
    voucherTypes: ready ? groupTypeNames : null,
    defaultVoucherType: ready ? defaultTypeName : '',
  }
  const mappingOf = (entry) => resolveVoucher(entry, choices[choiceKey(entry)], refs)

  const [previewing, setPreviewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [problemsFor, setProblemsFor] = useState(null)

  /* ---- Edit (PDF-uploaded vouchers) ----
     editing    { key, choices, before } - the voucher being edited, its choices
                and its resolved state when Edit was pressed
     leaving    what to do once unsaved changes are discarded (another page / type) */
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [leaving, setLeaving] = useState(null)

  const loading = vouchers.status === 'loading' || vouchers.status === 'idle'
  const listsLoading = ledgers.status === 'loading' || products.status === 'loading'
  const previewVoucher = previewing && voucher && previewing.id === voucher.id ? voucher : null

  const mapping = voucher ? mappingOf(voucher) : null
  const result = voucher ? tally.resultOf(voucher.id) : null
  const sending = Boolean(voucher) && tally.sendingId !== null && String(tally.sendingId) === String(voucher.id)

  // Edit mode applies to the voucher it was started on - and to no other.
  const editingThis = Boolean(voucher && editing && editing.key === choiceKey(voucher))
  const editChanges = editingThis ? buildVoucherEditPayload({ voucher, before: editing.before, after: mapping }) : null
  const unsaved = Boolean(editChanges && (editChanges.payload || editChanges.missingIds.length > 0))

  const startEdit = () => {
    if (!voucher || !canEditVoucher(voucher)) return
    const key = choiceKey(voucher)
    setEditing({ key, choices: choices[key] ?? EMPTY_CHOICES, before: mapping })
  }

  /** Cancel: the voucher's choices back to what they were when Edit was pressed. */
  const discardEdit = () => {
    if (!editing) return
    setChoices((all) => ({ ...all, [editing.key]: editing.choices }))
    setEditing(null)
  }

  /** Another page or document type: asks first when the voucher being edited has unsaved changes. */
  const leave = (action) => {
    if (editing && unsaved) {
      setLeaving(() => action)
      return
    }
    setEditing(null)
    action()
  }

  const saveEdit = async () => {
    if (!editingThis || savingRef.current) return
    const { payload, missingIds } = editChanges
    if (missingIds.length > 0) {
      toast.error(`Product line ${missingIds.join(', ')} has no product_id, so its changes cannot be saved.`)
      return
    }
    if (!payload) {
      toast.info('Nothing has been changed.')
      setEditing(null)
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      const reply = await editVoucherDocument(payload)
      if (reply && typeof reply === 'object' && reply.success === false) throw new Error(reply.message || reply.msg || 'The changes could not be saved.')
      toast.success(reply?.msg || reply?.message || `${voucher.documentNo || 'The voucher'} was updated.`)
      // The new values are already on screen (the voucher's choices) - only edit mode ends.
      setEditing(null)
    } catch (failure) {
      // The edits stay, to correct and save again.
      toast.error(failure.message || 'The changes could not be saved.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const changeType = (next) => {
    if (!next) return
    leave(() => {
      setType(next)
      setPage(1)
      setPreviewing(null)
    })
  }

  const goTo = (next) => {
    leave(() => {
      setPage(next)
      setPreviewing(null)
    })
  }

  /** Send to Tally (Tally) or Verified (any other ERP) - every mapping checked first. */
  const complete = async (entry, action) => {
    if (tally.sendingId !== null) return
    const mapping = mappingOf(entry)
    if (mapping.problems.length > 0) {
      setProblemsFor(entry)
      return
    }
    const updateBody = buildVoucherUpdateBody({
      companyId,
      documentNo: entry.documentNo,
      documentType: entry.documentType || type,
      voucherType: mapping.voucherType,
      narration: mapping.narration,
      accountLedger: mapping.account.ledgerName,
    })
    const result =
      action === 'send'
        ? await tally.send(entry.id, buildTallyVoucherPayload({ voucher: entry, mapping, company, ledgers, parties }), updateBody)
        : await tally.verify(entry.id, updateBody)
    if (result.outcome === 'sent' || result.outcome === 'verified') toast.success(result.message)
    else if (result.outcome === 'busy') toast.info(result.message)
    else toast.error(result.message)
  }

  const act = (entry, action) => {
    if (action === 'preview') setPreviewing(entry.pdfUrl ? entry : null)
    else if (action === 'delete') setDeleting(entry)
    else if (action === 'send' || action === 'verify') complete(entry, action)
  }

  const remove = async () => {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true)
    try {
      const reply = await deleteTallyVoucher({ companyId, documentNo: deleting.documentNo, documentType: deleting.documentType || type })
      toast.success(reply?.msg || `${deleting.documentNo || 'The voucher'} was deleted.`)
      if (previewing?.id === deleting.id) setPreviewing(null)
      setDeleting(null)
      vouchers.reload()
    } catch (failure) {
      toast.error(failure.message || 'The voucher could not be deleted.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const problems = problemsFor ? mappingOf(problemsFor).problems : NO_ROWS

  return (
    <Card className="border-border/70 py-3 shadow-sm">
      <CardContent className="space-y-3 px-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-brand">
            Tally Vouchers{vouchers.status === 'ready' ? ` (${rows.length})` : ''}
          </p>
          {types.length > 1 ? (
            <RadioGroup
              value={type}
              onValueChange={changeType}
              aria-label="Voucher type"
              className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-xs"
            >
              {types.map((option) => {
                const id = `voucher-type-${option.toLowerCase().replace(/\s+/g, '-')}`
                const count = vouchers.status === 'ready' ? typeCounts[option] : null
                return (
                  <Label
                    key={option}
                    htmlFor={id}
                    className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${type === option ? 'bg-brand-soft font-semibold text-brand' : 'text-muted-foreground hover:text-brand'}`}
                  >
                    <RadioGroupItem id={id} value={option} />
                    {option}
                    {count !== null ? <span className="text-xs font-normal">({count})</span> : null}
                  </Label>
                )
              })}
            </RadioGroup>
          ) : null}
          <Button type="button" variant="outline" size="sm" icon={RefreshCw} loading={loading && Object.keys(vouchers.groups).length > 0} disabled={loading} onClick={vouchers.reload}>
            Refresh
          </Button>
        </div>

        {vouchers.status === 'failed' && Object.keys(vouchers.groups).length === 0 ? (
          <StateMessage icon={AlertCircle} tone="error" title="Could not load the vouchers" action={<RetryButton onClick={vouchers.reload} />}>
            {vouchers.error}
          </StateMessage>
        ) : loading && Object.keys(vouchers.groups).length === 0 ? (
          <ListSkeleton rows={5} />
        ) : !voucher ? (
          <StateMessage icon={FileText} title={`No ${type} vouchers`}>
            There are no {type} vouchers for {company.comp_name || 'this company'}.
          </StateMessage>
        ) : listsLoading ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Loading the ledgers and products the vouchers are checked against...</p>
            <ListSkeleton rows={4} />
          </div>
        ) : (
          <div className="space-y-3">
            {vouchers.status === 'failed' ? <InlineAlert action={<RetryButton onClick={vouchers.reload} />}>{vouchers.error}</InlineAlert> : null}
            {ledgers.status === 'failed' ? (
              <InlineAlert action={<RetryButton onClick={ledgers.retry} />}>The ledger list could not be loaded, so no ledger can be matched: {ledgers.error}</InlineAlert>
            ) : null}
            {products.status === 'failed' ? (
              <InlineAlert action={<RetryButton onClick={products.retry} />}>The product list could not be loaded, so no product can be matched: {products.error}</InlineAlert>
            ) : null}

            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
              {/* ---- left: the voucher card (its actions at the bottom), then the pages ---- */}
              <div className="min-w-0 space-y-2">
                <VoucherCard
                  key={choiceKey(voucher)}
                  voucher={voucher}
                  mapping={mapping}
                  edits={(choices[choiceKey(voucher)] ?? EMPTY_CHOICES).edits ?? EMPTY_CHOICES.edits}
                  ledgers={ledgers}
                  products={products}
                  labels={labels}
                  voucherTypes={voucherTypes}
                  editing={editingThis}
                  onChoose={(change) => choose(voucher, change)}
                  footer={
                    <div className="flex flex-wrap items-center justify-between gap-2" aria-label="Voucher actions and status">
                      <div className="min-w-0 text-xs" aria-live="polite">
                        {editingThis ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-brand">
                            <Pencil className="size-3.5" aria-hidden="true" />
                            Editing{unsaved ? ' - unsaved changes' : ''}
                          </span>
                        ) : result?.outcome === 'sent' || result?.outcome === 'verified' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="size-3.5" aria-hidden="true" />
                            {result.outcome === 'sent' ? 'Sent to Tally' : 'Verified'}
                          </span>
                        ) : result ? (
                          <span className="inline-flex items-start gap-1 text-destructive" role="alert">
                            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                            {result.message}
                          </span>
                        ) : mapping.problems.length > 0 ? (
                          <span className="text-destructive">
                            {mapping.problems.length} item{mapping.problems.length === 1 ? '' : 's'} to resolve
                          </span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">All mappings resolved</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Voucher actions">
                        <ActionDropdown
                          label="Preview"
                          icon={Eye}
                          variant={previewVoucher ? 'default' : 'outline'}
                          size="sm"
                          options={[
                            { label: 'Preview', value: 'preview', disabled: !voucher.pdfUrl, description: voucher.pdfUrl ? undefined : 'This voucher has no PDF' },
                            { label: 'Mapping', value: 'mapping', disabled: true, description: 'Coming in the next phase' },
                          ]}
                          onSelect={(value) => value === 'preview' && act(voucher, 'preview')}
                        />
                        {/* Edit - a PDF-uploaded voucher only (upload_type "pdf"); Save Changes / Cancel while editing. */}
                        {editingThis ? (
                          <>
                            <Button type="button" variant="outline" size="sm" icon={X} disabled={saving} onClick={discardEdit}>
                              Cancel
                            </Button>
                            <Button type="button" size="sm" icon={Save} loading={saving} onClick={saveEdit}>
                              Save Changes
                            </Button>
                          </>
                        ) : canEditVoucher(voucher) ? (
                          <Button type="button" variant="outline" size="sm" icon={Pencil} disabled={sending} onClick={startEdit}>
                            Edit
                          </Button>
                        ) : null}
                        {erp.isTally ? (
                          <Button type="button" size="sm" icon={Send} loading={sending} disabled={!erp.known || tally.sendingId !== null || editingThis} title={editingThis ? 'Save or cancel the changes first' : undefined} onClick={() => act(voucher, 'send')}>
                            Send to Tally
                          </Button>
                        ) : (
                          <Button type="button" size="sm" icon={BadgeCheck} loading={sending} disabled={!erp.known || tally.sendingId !== null || editingThis} title={editingThis ? 'Save or cancel the changes first' : undefined} onClick={() => act(voucher, 'verify')}>
                            Verified
                          </Button>
                        )}
                        <Button type="button" variant="destructive" size="sm" icon={Trash2} disabled={sending || deleteBusy || editingThis} title={editingThis ? 'Save or cancel the changes first' : undefined} onClick={() => act(voucher, 'delete')}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  }
                />

                {rows.length > 1 ? (
                  <nav className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-xs" aria-label="Voucher pages">
                    <Button type="button" variant="outline" size="sm" icon={ChevronLeft} disabled={current <= 1 || saving} onClick={() => goTo(current - 1)}>
                      Previous
                    </Button>
                    <span className="tabular-nums" aria-live="polite">
                      Voucher {current} of {rows.length}
                    </span>
                    <Button type="button" variant="outline" size="sm" disabled={current >= rows.length || saving} onClick={() => goTo(current + 1)}>
                      Next
                      <ChevronRight />
                    </Button>
                  </nav>
                ) : null}
              </div>

              {/* ---- right: the preview - always there ---- */}
              <aside className="min-w-0 lg:sticky lg:top-3" aria-label="Voucher preview">
                <div className="rounded-lg border border-border bg-card shadow-xs" aria-label="PDF preview">
                  {previewVoucher ? (
                    <>
                      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                        <p className="truncate text-sm font-semibold text-brand">{previewVoucher.documentNo || 'Voucher'} - PDF</p>
                        <div className="flex items-center gap-1">
                          <Button type="button" variant="ghost" size="sm" icon={ExternalLink} onClick={() => window.open(previewVoucher.pdfUrl, '_blank', 'noopener,noreferrer')}>
                            Open
                          </Button>
                          <Button type="button" variant="ghost" size="sm" icon={X} aria-label="Close preview" onClick={() => setPreviewing(null)} />
                        </div>
                      </div>
                      <iframe title={`${previewVoucher.documentNo || 'Voucher'} PDF`} src={previewVoucher.pdfUrl} className="h-[75vh] w-full rounded-b-lg bg-muted/30" />
                    </>
                  ) : (
                    <div className="flex h-[75vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground" data-testid="preview-placeholder">
                      <FileText className="size-8 text-brand/40" aria-hidden="true" />
                      <p>{voucher.pdfUrl ? 'Select a voucher and click Preview to view the document.' : 'This voucher has no PDF to preview.'}</p>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        )}
      </CardContent>

      {/* Leaving a voucher being edited, with changes not saved. */}
      <ConfirmDialog
        open={Boolean(leaving)}
        onOpenChange={(open) => (!open ? setLeaving(null) : null)}
        title="Discard unsaved changes?"
        description={`Your changes to ${voucher?.documentNo || 'this voucher'} have not been saved.`}
        confirmLabel="Discard"
        onConfirm={() => {
          const action = leaving
          setLeaving(null)
          discardEdit()
          action?.()
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={() => (deleteBusy ? null : setDeleting(null))}
        title="Delete voucher"
        description={`Delete ${deleting?.documentType || type} ${deleting?.documentNo || ''}? This cannot be undone.`}
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={remove}
      />

      <Modal
        open={Boolean(problemsFor)}
        onOpenChange={(open) => (!open ? setProblemsFor(null) : null)}
        size="md"
        title={`${isTally ? 'Send to Tally' : 'Verify'} - ${problemsFor?.documentNo || ''}`}
        description="Resolve these first:"
        footer={
          <Button type="button" variant="outline" onClick={() => setProblemsFor(null)}>
            Close
          </Button>
        }
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </Modal>
    </Card>
  )
}
