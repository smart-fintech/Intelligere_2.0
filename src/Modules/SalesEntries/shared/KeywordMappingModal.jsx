import { useState } from 'react'
import { ArrowRight, Plus, Trash2 } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton } from '@/Components/Common/DataList'
import { Field, SelectField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { mappingEntries } from '@/Modules/SalesEntries/shared/keywordMapping'

/**
 * KEYWORD MAPPING of one source - the view's "Mapping" dialog:
 *
 *   add      a keyword and the company ledger it stands for. Saving a keyword
 *            that is already there changes its ledger (PUT merges).
 *   list     every keyword -> ledger of THIS source, each with Remove
 *
 * The mapping applies at once to what the view shows and sends.
 *
 *   mapping    useKeywordMapping(companyId, source)
 *   ledgers    useCompanyLedgers - the ledgers a keyword can map to
 *   rule       one line on what a keyword matches in this view
 */
export default function KeywordMappingModal({ open, onOpenChange, mapping, ledgers, rule }) {
  const [keyword, setKeyword] = useState('')
  const [ledger, setLedger] = useState('')
  const [errors, setErrors] = useState({})
  const entries = mappingEntries(mapping.mapping)

  const add = async () => {
    const found = {}
    if (!keyword.trim()) found.keyword = 'Please enter a keyword'
    if (!ledger) found.ledger = 'Please select a ledger'
    setErrors(found)
    if (Object.keys(found).length > 0) return
    if (await mapping.add(keyword.trim(), ledger)) {
      setKeyword('')
      setLedger('')
    }
  }

  return (
    <Modal open={open} onOpenChange={(next) => !mapping.saving && onOpenChange(next)} title="Keyword Mapping" description={rule} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field
            id="keyword-mapping-keyword"
            label="Keyword"
            required
            placeholder="As it is written in the file"
            value={keyword}
            error={errors.keyword}
            disabled={mapping.saving}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <SelectField
            id="keyword-mapping-ledger"
            label="Ledger"
            required
            searchable
            searchPlaceholder="Search ledger"
            placeholder={ledgers.options.length === 0 ? 'Loading ledgers...' : 'Select ledger'}
            options={ledgers.options}
            value={ledger}
            error={errors.ledger}
            disabled={mapping.saving}
            onValueChange={setLedger}
          />
          <Button type="button" className="sm:mt-5" icon={Plus} loading={mapping.saving} onClick={add}>
            Save
          </Button>
        </div>

        {mapping.status === 'failed' ? <InlineAlert action={<RetryButton onClick={mapping.reload} />}>{mapping.error}</InlineAlert> : null}

        <div className="rounded-md border border-border">
          <div className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Saved keywords ({entries.length})
          </div>
          {mapping.status === 'loading' && entries.length === 0 ? (
            <div className="px-3">
              <ListSkeleton rows={3} />
            </div>
          ) : entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No keywords yet.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto">
              {entries.map(([word, target]) => (
                <li key={word} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate" title={word}>
                    {word}
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium text-brand" title={target}>
                    {target}
                  </span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    icon={Trash2}
                    aria-label={`Remove keyword ${word}`}
                    tooltip="Remove"
                    disabled={mapping.saving}
                    onClick={() => mapping.remove(word)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
