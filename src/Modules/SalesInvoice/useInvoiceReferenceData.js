/**
 * Everything the Sales Invoice form chooses from, read from where the rest
 * of the app already keeps it - nothing here has an endpoint of its own:
 *
 *   const { ledgers, banks, countries, products } = useInvoiceReferenceData(companyId)
 *
 *   ledgers    tally/create-ledger/        ledgerSlice     the buyer, other
 *                                                          charges, discount,
 *                                                          round off and TCS
 *   banks      bank_statement/bankDetails/ bankSlice       Select Bank
 *   countries  tally/country_list/         locationSlice   buyer country/state
 *   products   inventory/product/          useProducts     the product lines
 *
 * Each slice's thunk refuses a request it already has the answer to, so
 * opening this page after Ledger or Bank Details costs nothing, and moving
 * between steps never asks again. Lists that belong to a company are only
 * handed out once they are THIS company's.
 *
 * Each comes back as { options, status, error, retry, ...lookups }, the
 * options already in the { value, label } shape SelectField takes.
 */

import { useCallback, useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import useProducts from '@/Hooks/useProducts'
import { readProducts } from '@/Modules/Dashboard/productList'
import { getLedgerId } from '@/Services/ledgerService'
import {
  fetchBanks,
  selectBankError,
  selectBankStatus,
  selectBanks,
  selectBanksCompanyId,
} from '@/Store/Slices/bankSlice'
import {
  fetchLedgers,
  selectLedgerError,
  selectLedgerStatus,
  selectLedgers,
  selectLedgersCompanyId,
} from '@/Store/Slices/ledgerSlice'
import { fetchCountries, selectCountryData, selectCountryStatus } from '@/Store/Slices/locationSlice'

const NONE = []

/**
 * The product lookups, worked out once per answer: keyed by the rows array
 * itself, which the shared cache hands out unchanged until the list changes.
 * Coming back to Sales Invoice reuses them instead of reading every product
 * again; a new answer is a new array, so nothing outdated is ever reused.
 */
const productLookups = new WeakMap()
const lookupsFor = (rows) => {
  let found = productLookups.get(rows)
  if (!found) {
    const list = readProducts(rows).filter((product) => product.name)
    found = {
      list,
      options: list.map((product) => ({ value: String(product.key), label: product.name })),
      byKey: new Map(list.map((product) => [String(product.key), product])),
    }
    productLookups.set(rows, found)
  }
  return found
}

/** The last four digits of an account number - enough to tell two accounts at one bank apart. */
const accountTail = (accountNo) => {
  const digits = String(accountNo ?? '').replace(/\s/g, '')
  return digits.length > 4 ? `xx${digits.slice(-4)}` : digits
}

/** 'loading' until a company's list is the one in the store. */
const statusFor = (status, loadedFor, companyId) =>
  status === 'loading' || loadedFor !== companyId ? (status === 'failed' ? 'failed' : 'loading') : status

export default function useInvoiceReferenceData(companyId) {
  const dispatch = useDispatch()

  useEffect(() => {
    if (!companyId) return
    dispatch(fetchLedgers({ companyId }))
    dispatch(fetchBanks({ companyId }))
  }, [dispatch, companyId])

  useEffect(() => {
    dispatch(fetchCountries())
  }, [dispatch])

  /* ---- ledgers ---- */
  const ledgerRows = useSelector(selectLedgers)
  const ledgersFor = useSelector(selectLedgersCompanyId)
  const ledgerStatus = useSelector(selectLedgerStatus)
  const ledgerError = useSelector(selectLedgerError)
  const ledgersMine = ledgersFor === companyId ? ledgerRows : NONE

  const retryLedgers = useCallback(() => dispatch(fetchLedgers({ companyId, force: true })), [dispatch, companyId])

  // Built from the rows alone: a status change (a reload starting) must not
  // hand out a new byId - the preview's model, and its measuring, hang on it.
  const ledgerLookups = useMemo(() => {
    const usable = ledgersMine.filter((ledger) => getLedgerId(ledger) !== null)
    return {
      options: usable.map((ledger) => ({ value: String(getLedgerId(ledger)), label: ledger.ledeger_name || '(no name)' })),
      byId: new Map(usable.map((ledger) => [String(getLedgerId(ledger)), ledger])),
      // What the GST ledgers are found among (Utils/gstLedgers) - the named ones.
      named: usable
        .filter((ledger) => String(ledger.ledeger_name ?? '').trim())
        .map((ledger) => ({ id: String(getLedgerId(ledger)), name: String(ledger.ledeger_name).trim() })),
    }
  }, [ledgersMine])

  const ledgers = useMemo(
    () => ({
      ...ledgerLookups,
      status: statusFor(ledgerStatus, ledgersFor, companyId),
      error: ledgerError,
      retry: retryLedgers,
    }),
    [ledgerLookups, ledgerStatus, ledgersFor, companyId, ledgerError, retryLedgers],
  )

  /* ---- banks ---- */
  const bankRows = useSelector(selectBanks)
  const banksFor = useSelector(selectBanksCompanyId)
  const bankStatus = useSelector(selectBankStatus)
  const bankError = useSelector(selectBankError)
  const banksMine = banksFor === companyId ? bankRows : NONE

  const retryBanks = useCallback(() => dispatch(fetchBanks({ companyId, force: true })), [dispatch, companyId])

  const banks = useMemo(
    () => ({
      list: banksMine,
      options: banksMine
        .filter((bank) => bank?.id !== null && bank?.id !== undefined)
        .map((bank) => ({
          value: String(bank.id),
          label: [bank.bank_name, accountTail(bank.account_no)].filter(Boolean).join(' - ') || `Bank ${bank.id}`,
        })),
      status: statusFor(bankStatus, banksFor, companyId),
      error: bankError,
      retry: retryBanks,
    }),
    [banksMine, bankStatus, banksFor, companyId, bankError, retryBanks],
  )

  /* ---- countries ---- */
  const countryData = useSelector(selectCountryData)
  const countryStatus = useSelector(selectCountryStatus)
  const countries = useMemo(() => ({ data: countryData, status: countryStatus }), [countryData, countryStatus])

  /* ---- products ---- */
  const productList = useProducts()
  const productRows = productList.rows

  // Read once per answer - and kept with it (lookupsFor), across visits.
  const productData = lookupsFor(productRows)

  const products = { ...productData, status: productList.status, error: productList.error, retry: productList.reload }

  return { ledgers, banks, countries, products }
}
