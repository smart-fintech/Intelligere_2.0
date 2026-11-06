/**
 * THE COMPANY'S LEDGERS for B2B / CNDN - Sales Entries' useCompanyLedgers
 * (the store's ledger list, as the Ledger page reads it), plus the ledger of
 * a GSTIN:
 *
 *   const ledgers = useLedgerDirectory(companyId)
 *   ledgers.options, names, status, error, reload   as useCompanyLedgers
 *   ledgers.ofGstin(gstin)                          its ledger's name, or ''
 *                                                   ('' too when several share it)
 */

import { useMemo } from 'react'
import { useSelector } from 'react-redux'

import { text } from '@/Modules/SalesEntries/shared/ledgerLists'
import { useCompanyLedgers } from '@/Modules/SalesEntries/shared/useLedgerChoices'
import { selectLedgers, selectLedgersCompanyId } from '@/Store/Slices/ledgerSlice'

export default function useLedgerDirectory(companyId) {
  const ledgers = useCompanyLedgers(companyId)
  const items = useSelector(selectLedgers)
  const forCompany = useSelector(selectLedgersCompanyId)

  const byGstin = useMemo(() => {
    const found = new Map()
    if (forCompany !== companyId) return found
    ;(Array.isArray(items) ? items : []).forEach((ledger) => {
      const gstin = text(ledger?.ledeger_gstin).toUpperCase()
      const name = text(ledger?.ledeger_name)
      if (!gstin || !name) return
      // A GSTIN on two ledgers names neither - the backend refuses it too.
      found.set(gstin, found.has(gstin) && found.get(gstin) !== name ? '' : name)
    })
    return found
  }, [items, forCompany, companyId])

  return {
    ...ledgers,
    ofGstin: (gstin) => byGstin.get(text(gstin).toUpperCase()) ?? '',
  }
}
