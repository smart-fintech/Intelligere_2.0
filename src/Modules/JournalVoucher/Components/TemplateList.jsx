import { useState } from 'react'
import { AlertCircle, BookOpen, FilePlus, Landmark, LayoutTemplate, Plus } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton, RowActions, StateMessage } from '@/Components/Common/DataList'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { JV_WORKSPACE } from '@/Constants/journalVoucher'
import { QUERY } from '@/Constants/queryKeys'
import { invalidateQueries } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { deleteJvTemplates } from '@/Services/Accounting/journalVoucherService'

/**
 * The left of the Journal Entries view: the way to the bank entries and the
 * JV ledgers, and the saved templates - each with Voucher (make vouchers from
 * it), Edit and Delete. A deleted template's saved vouchers stay in History.
 *
 * `workspace` is what the right shows ({ kind, name }), so its row is marked.
 */
export default function TemplateList({ companyId, templates, workspace, bankCount, onOpen, onDeleted }) {
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const rows = templates.data ?? []

  const handleDelete = async (name) => {
    setDeleting(true)
    try {
      const reply = await deleteJvTemplates(companyId, [name])
      toast.success(reply?.msg || 'Template deleted successfully.')
      setConfirming(null)
      invalidateQueries(QUERY.JV_TEMPLATES, { refetchActive: true })
      onDeleted(name)
    } catch (failure) {
      toast.error(failure.message)
    } finally {
      setDeleting(false)
    }
  }

  const isOpen = (kind, name) => workspace.kind === kind && (name === undefined || workspace.name === name)

  const renderTemplates = () => {
    if (!templates.data) {
      if (templates.status === 'failed') {
        return (
          <StateMessage icon={AlertCircle} tone="error" title="Could not load the templates" action={<RetryButton onClick={templates.reload} />}>
            {templates.error}
          </StateMessage>
        )
      }
      return <ListSkeleton rows={3} />
    }

    if (rows.length === 0) {
      return (
        <StateMessage
          icon={LayoutTemplate}
          title="No templates yet"
          action={
            <Button type="button" size="sm" icon={Plus} onClick={() => onOpen({ kind: JV_WORKSPACE.TEMPLATE })}>
              Add Template
            </Button>
          }
        >
          A template says which ledgers a voucher debits and credits.
        </StateMessage>
      )
    }

    return (
      <ul className="-mx-1 max-h-[32rem] space-y-0.5 overflow-y-auto">
        {rows.map((template) => {
          const current = isOpen(JV_WORKSPACE.VOUCHER, template.name) || isOpen(JV_WORKSPACE.TEMPLATE, template.name)
          return (
            <li
              key={template.name}
              className={cn('flex items-center gap-1.5 rounded-md py-1.5 pr-1 pl-2.5', current ? 'bg-brand-soft dark:bg-brand/15' : 'hover:bg-muted/50')}
            >
              <span className={cn('min-w-0 flex-1 truncate text-sm', current && 'font-medium text-brand')} title={template.name}>
                {template.name}
              </span>
              <Button
                type="button"
                size="sm"
                icon={FilePlus}
                tooltip="Make vouchers from this template"
                aria-label={`Make vouchers from ${template.name}`}
                onClick={() => onOpen({ kind: JV_WORKSPACE.VOUCHER, name: template.name })}
              >
                Voucher
              </Button>
              <RowActions
                label={template.name}
                onEdit={() => onOpen({ kind: JV_WORKSPACE.TEMPLATE, name: template.name })}
                deleteConfirm={{
                  open: confirming === template.name,
                  onOpenChange: (next) => setConfirming(next ? template.name : null),
                  title: 'Delete template?',
                  description: `Delete "${template.name}"? Its saved vouchers stay in History.`,
                  confirmLabel: 'Delete',
                  busy: deleting,
                  onConfirm: () => handleDelete(template.name),
                }}
              />
            </li>
          )
        })}
      </ul>
    )
  }

  /** A row that opens one of the module's own screens. */
  const link = (kind, Icon, label, count) => (
    <button
      type="button"
      aria-current={isOpen(kind) || undefined}
      onClick={() => onOpen({ kind })}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        isOpen(kind) ? 'bg-brand font-medium text-brand-foreground' : 'text-brand hover:bg-brand-soft',
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? (
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums',
            isOpen(kind) ? 'bg-brand-foreground/20' : 'bg-brand-soft text-brand dark:bg-brand/15',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  )

  return (
    <Panel
      title="Saved Templates"
      meta={templates.data ? ` (${rows.length})` : undefined}
      actions={
        <Button type="button" size="sm" icon={Plus} onClick={() => onOpen({ kind: JV_WORKSPACE.TEMPLATE })}>
          Add
        </Button>
      }
    >
      <div className="mb-3 space-y-1 border-b border-border pb-3">
        {link(JV_WORKSPACE.BANK_ENTRIES, Landmark, 'Bank Entries', bankCount)}
        {link(JV_WORKSPACE.LEDGERS, BookOpen, 'JV Ledgers')}
      </div>

      {templates.data && templates.status === 'failed' ? (
        <InlineAlert action={<RetryButton onClick={templates.reload} />}>{templates.error}</InlineAlert>
      ) : null}
      {renderTemplates()}
    </Panel>
  )
}
