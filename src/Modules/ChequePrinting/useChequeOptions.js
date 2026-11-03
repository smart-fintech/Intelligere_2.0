import { useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { fetchBanks, selectBankError, selectBankStatus, selectBanks, selectBanksCompanyId } from '@/Store/Slices/bankSlice'
import { fetchLedgers, selectLedgerError, selectLedgerStatus, selectLedgers, selectLedgersCompanyId } from '@/Store/Slices/ledgerSlice'

const NO_ROWS = []

/** Each name once, A to Z, as the { value, label } a dropdown takes. */
const toOptions = (rows, field) =>
  [...new Set(rows.map((row) => row[field]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ value: name, label: name }))

/**
 * What a cheque's dropdowns offer, from the lists the store already keeps for
 * the company, so opening a form asks for neither again:
 *
 *   const banks = useBankOptions(companyId)
 *   const ledgers = useLedgerOptions(companyId)
 *
 *   options, loading, error, retry
 */
export function useBankOptions(companyId) {
  const dispatch = useDispatch()
  const rows = useSelector(selectBanks)
  const loadedFor = useSelector(selectBanksCompanyId)
  const status = useSelector(selectBankStatus)
  const error = useSelector(selectBankError)
  const banks = loadedFor === companyId ? rows : NO_ROWS

  useEffect(() => {
    dispatch(fetchBanks({ companyId }))
  }, [dispatch, companyId])

  return {
    options: useMemo(() => toOptions(banks, 'bank_name'), [banks]),
    loading: status === 'idle' || status === 'loading',
    error: status === 'failed' ? error : null,
    retry: () => dispatch(fetchBanks({ companyId, force: true })),
  }
}

export function useLedgerOptions(companyId) {
  const dispatch = useDispatch()
  const rows = useSelector(selectLedgers)
  const loadedFor = useSelector(selectLedgersCompanyId)
  const status = useSelector(selectLedgerStatus)
  const error = useSelector(selectLedgerError)
  const ledgers = loadedFor === companyId ? rows : NO_ROWS

  useEffect(() => {
    dispatch(fetchLedgers({ companyId }))
  }, [dispatch, companyId])

  return {
    options: useMemo(() => toOptions(ledgers, 'ledeger_name'), [ledgers]),
    loading: status === 'idle' || status === 'loading',
    error: status === 'failed' ? error : null,
    retry: () => dispatch(fetchLedgers({ companyId, force: true })),
  }
}
