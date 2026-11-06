/**
 * Everything the Premium Feature Recharge page needs:
 *
 *   const recharge = usePremiumRecharge()
 *
 *   recharge.status / error / retry   loading the price list
 *   recharge.catalog                  { recharge, groups, packages, addOns }
 *                                       (./premiumFeatures)
 *   recharge.companies, company, setCompanyId
 *                                     who it is bought for - the active
 *                                     company unless the user picks another
 *   recharge.counts, setCount         units per counted feature
 *   recharge.groupKeys, toggleGroupItem, toggleWholeGroup
 *                                     the members of a group (Biz Doxs)
 *                                     that are ticked
 *   recharge.packageChoices, choosePackage, clearPackage
 *                                     the package taken for a packaged
 *                                     module (Inventory Management)
 *   recharge.includedKeys             { [group key]: [members the chosen
 *                                     package already covers] } - shown
 *                                     ticked, never charged again
 *   recharge.addOnKeys, toggleAddOn, optionChoices, chooseOption
 *   recharge.eligibility              { eligible, reason, plan } - whether
 *                                     premium features may be bought for
 *                                     the company (Services/Payment/
 *                                     subscriptionService): not on a free
 *                                     trial, nor without a paid, current
 *                                     main plan. A reason is also the
 *                                     quote's first issue, so Pay stays off.
 *   recharge.quote                    the live price
 *   recharge.checkout()               product_type 'premium_feature' -> Cashfree
 *
 * After Cashfree, the status page confirms the order through
 * payment/PremiumPaymentConfirm/ - the product_type sent here is what picks
 * that endpoint (see checkout.js and Services/Payment/paymentService).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { toast } from '@/Library/toast'
import { PRODUCT_TYPE, getPriceList } from '@/Services/Payment/paymentService'
import { getPremiumEligibility } from '@/Services/Payment/subscriptionService'
import { fetchCompanies } from '@/Store/Slices/companySlice'

import { startCheckout } from './checkout'
import {
  buildRechargeCatalog,
  buildRechargePayload,
  calculateRechargeQuote,
  groupItemKeys,
  includedGroupKeys,
  isWholeGroup,
} from './premiumFeatures'
import { parsePremiumFeatures } from './pricing'

export function usePremiumRecharge() {
  const dispatch = useDispatch()
  const { allCompanies, activeCompanyId } = useActiveCompany()

  const [load, setLoad] = useState({ status: 'loading', response: null, error: null })
  const [attempt, setAttempt] = useState(0)
  const [companyChoice, setCompanyId] = useState(null)
  const [counts, setCounts] = useState({})
  const [groupKeys, setGroupKeys] = useState({})
  const [packageChoices, setPackageChoices] = useState({})
  const [addOnKeys, setAddOnKeys] = useState([])
  const [optionChoices, setOptionChoices] = useState({})
  const [paying, setPaying] = useState(false)

  // The shell loads the company list; this only makes sure it is there.
  useEffect(() => {
    dispatch(fetchCompanies())
  }, [dispatch])

  /*
   * ONE REQUEST PER PAGE VISIT - the ref holds the attempt already asked for,
   * so StrictMode's second mount in development does not ask again, while
   * Retry (a new attempt number) still does. See the longer note in
   * ./usePaymentPlan.
   */
  const priceRequest = useRef(null)

  useEffect(() => {
    if (priceRequest.current === attempt) return
    priceRequest.current = attempt

    getPriceList()
      .then((response) => {
        if (priceRequest.current === attempt) setLoad({ status: 'ready', response, error: null })
      })
      .catch((error) => {
        if (priceRequest.current === attempt) setLoad({ status: 'failed', response: null, error: error.message })
      })
  }, [attempt])

  const { catalog, gstPercent } = useMemo(() => {
    if (!load.response) return { catalog: null, gstPercent: null }
    const { items, gstPercent: gst } = parsePremiumFeatures(load.response)
    return { catalog: buildRechargeCatalog(items), gstPercent: gst }
  }, [load.response])

  // The company picked here, else the one the user is working in.
  const companyId = companyChoice ?? activeCompanyId
  const company = allCompanies.find((entry) => entry.company_id === companyId) ?? null
  // Read from the company record in the store - re-read whenever it changes.
  const eligibility = useMemo(() => getPremiumEligibility(company), [company])

  const quote = useMemo(() => {
    if (!catalog) return null
    const base = calculateRechargeQuote({
      catalog,
      counts,
      groupKeys,
      packageChoices,
      addOnKeys,
      optionChoices,
      gstPercent,
    })
    // No payload is ever built without a company - its name is the payload
    // key - nor for a company premium features cannot be bought for.
    if (!company?.comp_name) return { ...base, issues: ['Select the company to recharge.', ...base.issues] }
    return eligibility.eligible ? base : { ...base, issues: [eligibility.reason, ...base.issues] }
  }, [catalog, counts, groupKeys, packageChoices, addOnKeys, optionChoices, gstPercent, company, eligibility])

  // What the chosen package already covers (Basic: Challan; Standard: all
  // nine). The price uses the same function, so screen and price agree.
  const includedKeys = useMemo(
    () => (catalog ? includedGroupKeys(catalog, packageChoices) : {}),
    [catalog, packageChoices],
  )

  const setCount = useCallback((featureId, value) => {
    setCounts((current) => ({ ...current, [featureId]: value }))
  }, [])

  /** One member of a group in or out - "All" follows from them all being in. */
  const toggleGroupItem = useCallback((group, item) => {
    setGroupKeys((current) => {
      const keys = current[group.key] ?? []
      return {
        ...current,
        [group.key]: keys.includes(item.key) ? keys.filter((key) => key !== item.key) : [...keys, item.key],
      }
    })
  }, [])

  /** "All <group>": every member at once, or none of them. */
  const toggleWholeGroup = useCallback((group) => {
    setGroupKeys((current) => ({
      ...current,
      [group.key]: isWholeGroup(group, current[group.key] ?? []) ? [] : groupItemKeys(group),
    }))
  }, [])

  const choosePackage = useCallback((item, packageKey) => {
    setPackageChoices((current) => ({ ...current, [item.key]: packageKey }))
  }, [])

  const clearPackage = useCallback((item) => {
    setPackageChoices((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== item.key)),
    )
  }, [])

  const toggleAddOn = useCallback((item) => {
    setAddOnKeys((keys) => (keys.includes(item.key) ? keys.filter((key) => key !== item.key) : [...keys, item.key]))
  }, [])

  const chooseOption = useCallback((item, optionKey) => {
    setOptionChoices((choices) => ({ ...choices, [item.key]: optionKey }))
    setAddOnKeys((keys) => (keys.includes(item.key) ? keys : [...keys, item.key]))
  }, [])

  /** `paying` stays on after success: the page is on its way to Cashfree. */
  const checkout = useCallback(async () => {
    if (!quote || quote.issues.length || paying || !company?.comp_name || !eligibility.eligible) return
    setPaying(true)
    try {
      await startCheckout(
        buildRechargePayload({
          quote,
          companyName: company.comp_name,
          counts,
          catalog,
          groupKeys,
          packageChoices,
          addOnKeys,
          optionChoices,
          productType: PRODUCT_TYPE.PREMIUM_FEATURE,
        }),
      )
    } catch (error) {
      toast.error(error.message || 'The payment could not be started.')
      setPaying(false)
    }
  }, [quote, paying, company, eligibility, counts, catalog, groupKeys, packageChoices, addOnKeys, optionChoices])

  const retry = useCallback(() => {
    setLoad({ status: 'loading', response: null, error: null })
    setAttempt((count) => count + 1)
  }, [])

  return {
    status: load.status,
    error: load.error,
    retry,
    catalog,
    companies: allCompanies,
    company,
    setCompanyId,
    eligibility,
    counts,
    setCount,
    groupKeys,
    includedKeys,
    toggleGroupItem,
    toggleWholeGroup,
    packageChoices,
    choosePackage,
    clearPackage,
    addOnKeys,
    toggleAddOn,
    optionChoices,
    chooseOption,
    quote,
    paying,
    checkout,
  }
}
