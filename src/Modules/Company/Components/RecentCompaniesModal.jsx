/**
 * "Delete Company" - asked before a Tally Gold user's Refresh when the
 * backend still has recent companies on record.
 *
 * Every recent company is listed with a checkbox, ALL TICKED when it opens:
 *
 *   ticked     KEEP it     - never sent to the Delete API
 *   unticked   DELETE it   - its Comp_id goes in the payload
 *
 * Both buttons end with the Refresh carrying on; only "Delete" (with at least
 * one company unticked) calls the Delete API first.
 *
 *   <RecentCompaniesModal
 *     open={Boolean(recent)}
 *     companies={recent ?? []}          [{ Comp_id, Comp_name }]
 *     busy={deleting}
 *     onDelete={(ids) => ...}           ids of the UNTICKED companies (may be [])
 *     onSkip={() => ...}                "Continue Without Delete"
 *     onCancel={() => ...}              the X / Escape / backdrop
 *   />
 *
 * The screen that opens it owns the requests, so this holds nothing but the
 * ticks - the same split as ConfirmDialog.
 */

import { useState } from 'react'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { Checkbox } from '@/Components/ui/checkbox'
import { Label } from '@/Components/ui/label'

export default function RecentCompaniesModal({
  open,
  companies = [],
  busy = false,
  onDelete,
  onSkip,
  onCancel,
}) {
  // The Comp_ids the user UNTICKED - the ones to delete. Empty means every
  // company is ticked (kept), which is how each opening starts: the modal is
  // unmounted while closed.
  const [unticked, setUnticked] = useState(() => new Set())

  const toggle = (companyId, checked) => {
    setUnticked((previous) => {
      const next = new Set(previous)
      if (checked) next.delete(companyId)
      else next.add(companyId)
      return next
    })
  }

  // In the list's own order, so the payload reads the same as the screen.
  const deleteIds = companies
    .map((company) => company.Comp_id)
    .filter((companyId) => unticked.has(companyId))

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel?.()
      }}
      title="Delete Company"
      description="Untick the recent companies to delete before fetching from Tally. Ticked companies are kept."
      size="sm"
      closeOnBackdropClick={!busy}
      closeOnEsc={!busy}
      showCloseButton={!busy}
      footer={
        <>
          <Button type="button" variant="ghost" disabled={busy} onClick={onSkip}>
            Continue Without Delete
          </Button>

          {companies.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              loading={busy}
              onClick={() => onDelete?.(deleteIds)}
            >
              {deleteIds.length > 0 ? `Delete (${deleteIds.length})` : 'Delete'}
            </Button>
          )}
        </>
      }
    >
      {/* No recent companies: nothing to tick - the modal only confirms. */}
      {companies.length === 0 && (
        <p className="text-sm text-muted-foreground">No recent companies found.</p>
      )}

      <ul className="space-y-2">
        {companies.map((company) => {
          const inputId = `recent-company-${company.Comp_id}`
          return (
            <li key={company.Comp_id} className="flex items-center gap-2">
              <Checkbox
                id={inputId}
                checked={!unticked.has(company.Comp_id)}
                disabled={busy}
                onCheckedChange={(checked) => toggle(company.Comp_id, checked === true)}
              />
              <Label htmlFor={inputId} className="font-normal">
                {company.Comp_name || `Company ${company.Comp_id}`}
              </Label>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
