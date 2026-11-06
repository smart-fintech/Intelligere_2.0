import { useMemo } from 'react'

import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useQuery } from '@/Library/queryCache'
import { nameLookup, readBankEntries, readJvLedgers, readTemplates, readVouchers } from '@/Modules/JournalVoucher/journalVoucher'
import { useLedgerOptions } from '@/Modules/ChequePrinting/useChequeOptions'
import { getJvBankEntries, getJvLedgers, getJvTemplates, getJvVouchers } from '@/Services/Accounting/journalVoucherService'

/**
 * The module's four lists, from the shared cache (Library/queryCache) under
 * [QUERY.JV_..., companyId], each already read into the shape the screens use
 * (Modules/JournalVoucher/journalVoucher). After a change, the screen calls
 * invalidateQueries(QUERY.JV_..., { refetchActive: true }).
 *
 * Bank entries are never taken as fresh: verifying a bank statement fills
 * them from another screen, and a delete numbers the rest again - an old
 * list would point a delete at the wrong row.
 */

export const useJvLedgers = (companyId) =>
  useQuery({
    key: [QUERY.JV_LEDGERS, companyId],
    fetch: () => getJvLedgers(companyId).then(readJvLedgers),
    staleTime: MASTER_DATA_STALE_MS,
  })

export const useJvTemplates = (companyId) =>
  useQuery({
    key: [QUERY.JV_TEMPLATES, companyId],
    fetch: () => getJvTemplates(companyId).then(readTemplates),
    staleTime: MASTER_DATA_STALE_MS,
  })

export const useJvVouchers = (companyId) =>
  useQuery({
    key: [QUERY.JV_VOUCHERS, companyId],
    fetch: () => getJvVouchers(companyId).then(readVouchers),
    staleTime: MASTER_DATA_STALE_MS,
  })

export const useJvBankEntries = (companyId) =>
  useQuery({
    key: [QUERY.JV_BANK_ENTRIES, companyId],
    fetch: () => getJvBankEntries(companyId).then(readBankEntries),
  })

/**
 * Every ledger of the company - the store's list, as Cheque Printing reads it -
 * with a lookup that finds one whatever its case. `lookup` is null until the
 * list is in, so a voucher is not called wrong for a ledger still on its way.
 *
 *   options, lookup, loading, error, retry
 */
export const useCompanyLedgers = (companyId) => {
  const ledgers = useLedgerOptions(companyId)
  const ready = !ledgers.loading && !ledgers.error
  const lookup = useMemo(() => (ready ? nameLookup(ledgers.options.map((option) => option.value)) : null), [ready, ledgers.options])
  return { ...ledgers, lookup }
}
