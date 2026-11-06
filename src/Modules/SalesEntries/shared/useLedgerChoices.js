/**
 * THE LEDGERS A VIEW OFFERS, and the picks made from them:
 *
 *   const sales = useSalesLedgerChoice(companyId)
 *     options, status, error, reload       sales_ledger_list/ (shared cache)
 *     defaultLedger, setDefaultLedger      the default for every entry
 *     overrideOf(key), setOverride(key, name | null), clearOverrides()
 *     ledgerOf(key, own)                   the entry's pick, else `own` (what the
 *                                          row came with), else the default
 *
 *   const ledgers = useCompanyLedgers(companyId)
 *     options, names (a Set), status, error, reload   every ledger of the company -
 *     the same list (ledgerSlice) the Ledger page and Amount Distribution read
 */

import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useQuery } from '@/Library/queryCache'
import { getSalesLedgers } from '@/Services/Accounting/salesEntriesService'
import { fetchLedgers, selectLedgerError, selectLedgerStatus, selectLedgers, selectLedgersCompanyId } from '@/Store/Slices/ledgerSlice'

const NONE = Object.freeze([])

const toOptions = (names) =>
  [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name }))

export function useSalesLedgerChoice(companyId) {
  const query = useQuery({
    key: [QUERY.SALES_LEDGERS, companyId],
    fetch: () => getSalesLedgers(companyId),
    staleTime: MASTER_DATA_STALE_MS,
  })
  const list = Array.isArray(query.data) ? query.data : NONE
  const options = useMemo(() => toOptions(list.map((ledger) => ledger.name)), [list])
  const [defaultLedger, setDefaultLedger] = useState('')
  const [overrides, setOverrides] = useState({})

  const setOverride = (key, name) =>
    setOverrides((previous) => {
      const next = { ...previous }
      if (name) next[key] = name
      else delete next[key]
      return next
    })

  return {
    options,
    status: query.status,
    error: query.error,
    reload: query.reload,
    defaultLedger,
    setDefaultLedger,
    overrideOf: (key) => overrides[key] ?? '',
    setOverride,
    clearOverrides: () => setOverrides({}),
    ledgerOf: (key, own = '') => overrides[key] || own || defaultLedger,
  }
}

export function useCompanyLedgers(companyId) {
  const dispatch = useDispatch()
  const items = useSelector(selectLedgers)
  const forCompany = useSelector(selectLedgersCompanyId)
  const status = useSelector(selectLedgerStatus)
  const error = useSelector(selectLedgerError)
  const ledgers = forCompany === companyId ? items : NONE

  useEffect(() => {
    dispatch(fetchLedgers({ companyId }))
  }, [dispatch, companyId])

  const names = useMemo(() => ledgers.map((ledger) => String(ledger.ledeger_name ?? '').trim()).filter(Boolean), [ledgers])

  return {
    options: useMemo(() => toOptions(names), [names]),
    names: useMemo(() => new Set(names.map((name) => name.toLowerCase())), [names]),
    // The list held is another company's until this one's is in.
    status: forCompany === companyId ? status : 'loading',
    error,
    reload: () => dispatch(fetchLedgers({ companyId, force: true })),
  }
}
