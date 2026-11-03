import { useRef, useState } from 'react'
import { useSelector } from 'react-redux'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { Field, FormGrid, SelectField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { QUERY } from '@/Constants/queryKeys'
import { useWebSocket } from '@/Hooks/useWebSocket'
import { invalidateQueries } from '@/Library/queryCache'
import { getEmail } from '@/Library/secureStorage'
import { toast } from '@/Library/toast'
import { buildChequeVoucher, findName } from '@/Modules/ChequePrinting/chequePrinting'
import { useBankOptions, useLedgerOptions } from '@/Modules/ChequePrinting/useChequeOptions'
import { TALLY_CHEQUE_VOUCHER_MODULE, updateCheque } from '@/Services/chequeService'
import { selectIsErpKnown, selectIsIntelligereErp } from '@/Store/Slices/profileSlice'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate } from '@/Utils/date'
import { orDash } from '@/Utils/display'

/**
 * Posting one cheque's voucher: Dr the payee's ledger, Cr the bank.
 *
 * The cheque's own names are used when the company's lists hold them, whatever
 * their case, and spelt as the lists spell them. Otherwise - a payee with no
 * ledger, a CSV cheque with no bank - one has to be chosen, and the name on the
 * cheque is shown beside the choice.
 *
 * WHAT POST DOES
 *   Tally          the voucher goes to the agent first, and then the PUT marks
 *                  the cheque verified. In that order: a voucher that could not
 *                  be sent stays on the list, instead of leaving it unposted.
 *   Intelligere    only the PUT: there is no agent to send it to.
 *
 * The agent sends no reply to this message, so delivered is as far as it can be
 * followed. A ref stops a double click posting twice.
 */
export default function VoucherModal({ cheque, companyName, companyId, alreadyPosted, onClose }) {
  const isIntelligere = useSelector(selectIsIntelligereErp)
  const isErpKnown = useSelector(selectIsErpKnown)
  const banks = useBankOptions(companyId)
  const ledgers = useLedgerOptions(companyId)
  const { send } = useWebSocket({ module: TALLY_CHEQUE_VOUCHER_MODULE })

  // What was chosen, or '' for what the cheque's own name finds in the list.
  const [chosen, setChosen] = useState({ ledger: '', bank: '' })
  const [narration, setNarration] = useState(cheque.narration ?? '')
  const [errors, setErrors] = useState({})
  const [posting, setPosting] = useState(false)
  const inFlight = useRef(false)

  const ledgerNames = ledgers.options.map((option) => option.value)
  const bankNames = banks.options.map((option) => option.value)
  const ledger = chosen.ledger || findName(ledgerNames, cheque.payee_name)
  const bank = chosen.bank || findName(bankNames, cheque.bank_name)

  const post = async () => {
    const found = {}
    if (!ledger) found.ledger = 'Please select the ledger.'
    if (!bank) found.bank = 'Please select the bank.'
    setErrors(found)
    if (Object.keys(found).length > 0 || inFlight.current) return

    inFlight.current = true
    setPosting(true)
    let delivered = false
    try {
      const voucher = buildChequeVoucher(cheque, {
        companyName,
        email: getEmail(),
        ledger,
        bank,
        narration: narration.trim(),
      })

      if (!isIntelligere) {
        delivered = await send(voucher)
        if (!delivered) {
          toast.error('Could not reach the live server, so the voucher was not sent. Please try again.')
          return
        }
      }

      await updateCheque(voucher)
      toast.success(isIntelligere ? 'Voucher posted.' : 'Voucher sent to Tally.')
      invalidateQueries(QUERY.CHEQUE_DETAILS, { refetchActive: true })
      onClose()
    } catch (failure) {
      toast.error(delivered ? `The voucher reached Tally but could not be marked as sent: ${failure.message} Check Tally before posting it again.` : failure.message)
    } finally {
      inFlight.current = false
      setPosting(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={() => {
        if (!posting) onClose()
      }}
      title="Post Voucher"
      description={`${formatDate(cheque.cheque_date)} - ${formatIndianCurrency(cheque.cheque_amount)}`}
      size="md"
      footer={
        <>
          <Button type="button" variant="outline" disabled={posting} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" loading={posting} disabled={!isErpKnown} onClick={post}>
            {isIntelligere || !isErpKnown ? 'Post Voucher' : 'Send to Tally'}
          </Button>
        </>
      }
    >
      {alreadyPosted ? <InlineAlert>This voucher has been posted before. Posting it again can enter it twice.</InlineAlert> : null}
      {ledgers.error ? <InlineAlert action={<RetryButton onClick={ledgers.retry} />}>{ledgers.error}</InlineAlert> : null}
      {banks.error ? <InlineAlert action={<RetryButton onClick={banks.retry} />}>{banks.error}</InlineAlert> : null}

      <FormGrid>
        <div className="space-y-1 sm:col-span-2">
          <SelectField
            id="voucher-ledger"
            label="Ledger (Dr.)"
            required
            searchable
            searchPlaceholder="Search ledger"
            placeholder={ledgers.loading ? 'Loading ledgers...' : 'Select ledger'}
            options={ledgers.options}
            value={ledger}
            error={errors.ledger}
            disabled={posting}
            onValueChange={(value) => setChosen((previous) => ({ ...previous, ledger: value }))}
          />
          {findName(ledgerNames, cheque.payee_name) ? null : (
            <p className="text-xs text-muted-foreground">Payee on the cheque: {orDash(cheque.payee_name)}</p>
          )}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <SelectField
            id="voucher-bank"
            label="Bank (Cr.)"
            required
            searchable
            searchPlaceholder="Search bank"
            placeholder={banks.loading ? 'Loading banks...' : 'Select bank'}
            options={banks.options}
            value={bank}
            error={errors.bank}
            disabled={posting}
            onValueChange={(value) => setChosen((previous) => ({ ...previous, bank: value }))}
          />
          {cheque.bank_name && !findName(bankNames, cheque.bank_name) ? (
            <p className="text-xs text-muted-foreground">Bank on the cheque: {cheque.bank_name}</p>
          ) : null}
        </div>
        <Field
          id="voucher-narration"
          label="Narration"
          className="sm:col-span-2"
          placeholder="Optional"
          maxLength={255}
          value={narration}
          disabled={posting}
          onChange={(event) => setNarration(event.target.value)}
        />
      </FormGrid>
    </Modal>
  )
}
