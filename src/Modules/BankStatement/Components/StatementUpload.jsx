import { useState } from 'react'
import { Building2, Landmark, Plus } from 'lucide-react'

import { Field, SelectField } from '@/Components/Common/FormFields'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import AddBankModal from '@/Modules/BankStatement/Components/AddBankModal'

const bankName = (bank) => bank.bank_ledger_name || bank.bank_name

/**
 * The account the statement is for: the company (fixed), its bank account,
 * and + to add one. Locked once the statement has been submitted. The file
 * itself is chosen above the preview (StatementFileBar).
 */
export default function StatementUpload({ statement, banks, company, companyId }) {
  const [addingBank, setAddingBank] = useState(false)
  const locked = statement.started || statement.uploading

  return (
    <Panel title="Account">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="bank-statement-company" label="Company" icon={Building2} value={company.comp_name ?? ''} readOnly disabled />

        <div className="flex items-end gap-2">
          <SelectField
            id="bank-statement-bank"
            label="Bank"
            required
            icon={Landmark}
            className="min-w-0 flex-1"
            placeholder="Select a Bank"
            value={statement.bankId}
            onValueChange={statement.setBankId}
            disabled={locked || banks.length < 2}
            options={banks.map((bank) => ({
              value: String(bank.id),
              label: bankName(bank),
              title: [bank.bank_name, bank.account_no].filter(Boolean).join(' - '),
            }))}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            icon={Plus}
            tooltip="Add New Bank"
            aria-label="Add new bank"
            disabled={locked}
            onClick={() => setAddingBank(true)}
          />
        </div>
      </div>

      <AddBankModal open={addingBank} onOpenChange={setAddingBank} companyId={companyId} companyName={company.comp_name} />
    </Panel>
  )
}
