/**
 * Everything the Payment tab needs, in one hook:
 *
 *   const plan = usePaymentPlan()
 *
 *   plan.status          'loading' | 'failed' | 'ready'
 *   plan.error           the message to show when failed; plan.retry() tries again
 *   plan.catalog         what can be bought (see pricing.buildCatalog)
 *   plan.subscription    the plan already held, or null for a new payment
 *   plan.procurementUsage  what the Procurement Automation plan has been
 *                        used for (payment/userPaymentData/
 *                        `procurement_used`); empty when there is none
 *   plan.selection       { mode, tierKey, quantity, selectedKeys, optionChoices,
 *                        sections } - `sections` is the MSME page's
 *                        { [section key]: true | '<plan key>' }
 *   plan.offer           the offer being applied (./offer), or null
 *   plan.offerStatus     'loading' while payment/checkOffer is on its way
 *   plan.quote           the live price of that selection (pricing.calculateQuote)
 *   plan.set...          the changes the page can make
 *   plan.checkout(ids)   creates the order - ids = companies to remove - and opens Cashfree
 *
 * The pricing itself lives in ./pricing - this hook only holds the user's
 * choices and loads what those functions need.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { ENV } from '@/Config/env'
import { getEmail } from '@/Library/secureStorage'
import { toast } from '@/Library/toast'
import { PRODUCT_TYPE, applyOffer, checkOffer, getPriceList, getSubscription } from '@/Services/paymentService'
import {
  fetchProfile,
  selectProfile,
  selectProfileDetails,
  selectProfileError,
  selectProfileStatus,
} from '@/Store/Slices/profileSlice'

import {
  MSME_INCLUDED_COMPANIES,
  PACKAGE_MODE,
  PLAN_STRUCTURE,
  buildCatalog,
  buildPackagePayload,
  buildPaymentPayload,
  calculatePackageQuote,
  calculateQuote,
  conflictingSections,
  defaultSectionChoices,
  getPlan,
  isTierPurchasable,
  locatePriceList,
  lockedModeFor,
  normalizeKey,
  parseHeldPackages,
  parseProcurementUsage,
  parseSubscription,
} from './pricing'
import { startCheckout } from './checkout'
import { parseOffer } from './offer'

/** A sanity ceiling for the company counter - not a business limit. */
export const MAX_COMPANY_QUANTITY = 10000

/** The option whose number matches the company count, when there is one. */
const matchingOption = (module, companies) =>
  module.options.find((option) => option.quantity === companies)?.key ?? null

export function usePaymentPlan() {
  const dispatch = useDispatch()
  const profile = useSelector(selectProfile)
  const details = useSelector(selectProfileDetails)
  const profileStatus = useSelector(selectProfileStatus)
  const profileError = useSelector(selectProfileError)

  const [priceList, setPriceList] = useState(null)
  const [subscription, setSubscription] = useState(null)
  // Shown in the Procurement Automation dialog; it never changes a price.
  const [procurementUsage, setProcurementUsage] = useState([])
  // The MSME packages already held, package by package (msme_packages): what
  // credits towards a dearer plan of the same package.
  const [heldPackages, setHeldPackages] = useState([])
  const [loadState, setLoadState] = useState({ status: 'loading', error: null })
  const [attempt, setAttempt] = useState(0)
  const [offerState, setOfferState] = useState({ status: 'loading', raw: null, forEmail: null })

  // What the user has changed. Null means "not touched yet" - the default,
  // worked out from the catalog below, is used until they do.
  const [modeChoice, setModeChoice] = useState(null)
  const [tierChoice, setTierChoice] = useState(null)
  const [quantityChoice, setQuantityChoice] = useState(null)
  const [selectedChoice, setSelectedChoice] = useState(null)
  const [optionChoices, setOptionChoices] = useState({})
  /*
   * The MSME page's plans: { [section key]: true | '<package or plan key>' }.
   *
   * Until the user touches one, the page opens on the packages they already
   * hold (pricing.defaultSectionChoices) - their current entitlement, which
   * the quote charges nothing for. `touched` keeps that default from coming
   * back once they have made a choice of their own, including letting a
   * package go.
   */
  const [sectionChoices, setSectionChoices] = useState({})
  const [sectionsTouched, setSectionsTouched] = useState(false)
  const [paying, setPaying] = useState(false)

  // The profile is shared app-wide; this is a no-op when it is already loaded.
  useEffect(() => {
    dispatch(fetchProfile())
  }, [dispatch])

  /*
   * ONE REQUEST PER PAGE VISIT
   *
   * These refs remember what has already been ASKED FOR, so the request goes
   * out once however often the effect runs. React's StrictMode deliberately
   * mounts, unmounts and re-mounts every component in development, which runs
   * each effect twice; a `cancelled` flag only throws the second ANSWER away -
   * the second request has already gone. A ref survives that remount, so the
   * second run returns before calling anything.
   *
   * Each ref holds the key its request was made for - the attempt number, or
   * the email - so a real change (Retry, a different user) still asks again.
   */
  const priceRequest = useRef(null)
  const offerRequest = useRef(null)

  // The price list and the current subscription, together - once per attempt.
  useEffect(() => {
    if (priceRequest.current === attempt) return
    priceRequest.current = attempt

    Promise.all([getPriceList(), getSubscription()])
      .then(([prices, current]) => {
        // A newer attempt (Retry) has taken over: this answer is stale.
        if (priceRequest.current !== attempt) return
        setPriceList(prices)
        setSubscription(parseSubscription(current))
        setHeldPackages(parseHeldPackages(current))
        setProcurementUsage(parseProcurementUsage(current))
        setLoadState({ status: 'ready', error: null })
      })
      .catch((error) => {
        if (priceRequest.current === attempt) setLoadState({ status: 'failed', error: error.message })
      })
  }, [attempt])

  const userType = details.user_type
  const erp = details.erp

  // The signed-in user's email: the profile's when it carries one, else the
  // one saved at sign-in. It is what the offer is checked for.
  const email = details.email ?? profile?.email ?? getEmail()

  // payment/checkOffer/ - separate from the price list, so a slow or failed
  // offer check never holds the prices back. Until it answers, Add Payment
  // waits (see `offerStatus`), so nobody pays without an offer they had.
  useEffect(() => {
    // Wait until the profile has settled: its email is the one to check.
    if (profileStatus !== 'succeeded' && profileStatus !== 'failed') return
    // Already asked for this email - including when the profile arrives and
    // hands back the same address that was saved at sign-in.
    if (offerRequest.current === String(email)) return
    offerRequest.current = String(email)

    checkOffer(email).then((raw) => {
      if (offerRequest.current === String(email)) setOfferState({ status: 'ready', raw, forEmail: email })
    })
  }, [email, profileStatus])

  const offerStatus = offerState.status === 'ready' && offerState.forEmail === email ? 'ready' : 'loading'
  const offer = useMemo(
    () => (offerStatus === 'ready' ? parseOffer(offerState.raw, email) : null),
    [offerStatus, offerState.raw, email],
  )

  // The price list read for this user. A price list that cannot be sold from
  // is a failure of its own, with its own message.
  const { catalog, catalogError } = useMemo(() => {
    // Wait for the profile: a missing user_type on a LOADED profile is an
    // error buildCatalog reports, not a reason to keep spinning.
    if (!priceList || profileStatus !== 'succeeded') return { catalog: null, catalogError: null }

    // What the lookup worked from - VITE_DEBUG_LOGS=true to see it.
    if (ENV.DEBUG_LOGS) {
      const located = locatePriceList(priceList, normalizeKey(userType))
      console.log('[Payment] price list lookup', {
        userType,
        normalizedUserType: normalizeKey(userType),
        erp,
        normalizedErp: normalizeKey(erp),
        responseKeys: priceList && typeof priceList === 'object' ? Object.keys(priceList) : typeof priceList,
        priceListKeys: located ? Object.keys(located) : null,
      })
    }

    try {
      return { catalog: buildCatalog(priceList, { userType, erp }), catalogError: null }
    } catch (error) {
      if (ENV.DEBUG_LOGS) console.log('[Payment] no catalog:', error.message, priceList)
      return { catalog: null, catalogError: error.message }
    }
  }, [priceList, profileStatus, userType, erp])

  const lockedMode = lockedModeFor(subscription)

  /*
   * THE SMALLEST COMPANY COUNT
   *
   * On either MSME price list the price covers MSME_INCLUDED_COMPANIES (3)
   * companies, so 3 is both the default and the floor: the counter starts
   * there and its minus button stops there - below it nothing would change
   * but the number, since 1, 2 and 3 companies all cost the same. A user who
   * already pays for more cannot go below what they hold, as before.
   */
  const msmeCounts =
    catalog?.structure === PLAN_STRUCTURE.QUANTITY || catalog?.structure === PLAN_STRUCTURE.PACKAGES
  const quantityFloor = msmeCounts ? MSME_INCLUDED_COMPANIES : 1
  const minQuantity = Math.max(quantityFloor, subscription?.pastQuantity ?? 0)

  /* ---- The selection: the user's choice, or the default ----
   *
   * THE PACKAGE TYPE HAS A DEFAULT; THE COMPANY PACKAGE HAS NOT
   *
   * The page opens on Premium, because most users want the whole package and
   * it is the cheaper way to buy it - but on NO company package. Buying 50
   * companies is a decision, not a default the user has to notice and undo,
   * so the quote says what is still missing and Payment stays disabled until
   * a company package is chosen.
   *
   * On a renewal the package type already held is still the only one
   * offered (lockedMode), as before.
   */
  const tiered = catalog?.structure === PLAN_STRUCTURE.TIERS
  const offersPremium = tiered ? catalog.tiers.some((tier) => tier.bundle) : Boolean(catalog?.plan?.bundle)
  const defaultMode = offersPremium ? PACKAGE_MODE.PREMIUM : PACKAGE_MODE.CUSTOM

  const mode = catalog ? lockedMode ?? modeChoice ?? defaultMode : null
  // The user's pick only while it can still be bought - a purchased package
  // can never end up selected, so it can never reach the payment payload.
  const tierKey =
    tiered && catalog.tiers.some((tier) => tier.key === tierChoice && isTierPurchasable(tier, subscription))
      ? tierChoice
      : null
  const quantity = Math.max(minQuantity, quantityChoice ?? minQuantity)
  const selectedKeys = useMemo(
    () =>
      selectedChoice ??
      (lockedMode === PACKAGE_MODE.CUSTOM ? [...(subscription?.pastModuleKeys ?? [])] : []),
    [selectedChoice, lockedMode, subscription],
  )
  const plan = getPlan(catalog, tierKey)
  const packaged = catalog?.structure === PLAN_STRUCTURE.PACKAGES

  // What the MSME page is working from: the user's own choices once they have
  // made any, else the packages they already hold.
  const sectionSelection = useMemo(
    () =>
      !packaged || sectionsTouched ? sectionChoices : defaultSectionChoices(catalog, heldPackages),
    [packaged, sectionsTouched, sectionChoices, catalog, heldPackages],
  )

  /*
   * TWO SHAPES OF PRICE LIST, TWO QUOTES
   *
   * A price list of whole plans (MSME: Accounts Automation, Inventory
   * Management, Procurement) is priced by what the user took, with no
   * company count and no modules to tick. Everything else - the Accounting
   * Professional tiers, and the older MSME module list - is priced as before.
   */
  const quote = useMemo(() => {
    if (!catalog) return null
    if (packaged) {
      // `held` is what each package already held credits towards a dearer
      // plan of the same package - worked out one package at a time.
      return calculatePackageQuote({
        catalog,
        selection: sectionSelection,
        companies: quantity,
        held: heldPackages,
        offer,
      })
    }
    // Priced even before a package type is chosen: the quote is then empty
    // and says what is missing, which is what disables Payment.
    return calculateQuote({ catalog, mode, tierKey, quantity, selectedKeys, optionChoices, subscription, offer })
  }, [
    catalog,
    packaged,
    sectionSelection,
    heldPackages,
    mode,
    tierKey,
    quantity,
    selectedKeys,
    optionChoices,
    subscription,
    offer,
  ])

  /* ---- Changes the page can make ---- */

  const setMode = useCallback(
    (next) => {
      if (!lockedMode || next === lockedMode) setModeChoice(next)
    },
    [lockedMode],
  )

  const setQuantity = useCallback(
    (next) => {
      const number = Math.floor(Number(next))
      if (!Number.isFinite(number)) return
      setQuantityChoice(Math.min(MAX_COMPANY_QUANTITY, Math.max(minQuantity, number)))
    },
    [minQuantity],
  )

  /** A module the user already owns stays ticked on a renewal. */
  const isLockedModule = useCallback(
    (module) => lockedMode === PACKAGE_MODE.CUSTOM && (subscription?.pastModuleKeys?.has(module.key) ?? false),
    [lockedMode, subscription],
  )

  const toggleModule = useCallback(
    (module) => {
      if (isLockedModule(module)) return
      const ticking = !selectedKeys.includes(module.key)
      setSelectedChoice(ticking ? [...selectedKeys, module.key] : selectedKeys.filter((key) => key !== module.key))

      // Ticking a module priced by option pre-picks the option that matches
      // the company count, when the backend has one.
      if (ticking && module.kind === 'options' && !optionChoices[module.key]) {
        const preset = matchingOption(module, quote?.companies)
        if (preset) setOptionChoices((choices) => ({ ...choices, [module.key]: preset }))
      }
    },
    [isLockedModule, selectedKeys, optionChoices, quote?.companies],
  )

  const chooseOption = useCallback(
    (module, optionKey) => {
      setOptionChoices((choices) => ({ ...choices, [module.key]: optionKey }))
      if (!selectedKeys.includes(module.key)) setSelectedChoice([...selectedKeys, module.key])
    },
    [selectedKeys],
  )

  const selectAllModules = useCallback(
    (on) => {
      if (!plan) return
      setSelectedChoice(
        on
          ? plan.modules.map((module) => module.key)
          : plan.modules.filter(isLockedModule).map((module) => module.key),
      )
    },
    [plan, isLockedModule],
  )

  /*
   * TAKING A SECTION LETS GO OF THE ONES IT EXCLUDES
   *
   * Accounts Automation and Inventory Management cannot be bought together
   * (pricing.conflictingSections). Taking one drops the other by itself,
   * rather than refusing the click and telling the user off, and everything
   * else already taken - Procurement in particular - is left as it was.
   */
  const takeSection = useCallback(
    (section, value) => {
      // From here on the page follows the user, not what they already hold.
      setSectionsTouched(true)
      setSectionChoices((current) => {
        const next = { ...(sectionsTouched ? current : sectionSelection), [section.key]: value }
        if (value) {
          conflictingSections(catalog?.sections, section).forEach((other) => {
            next[other.key] = null
          })
        }
        return next
      })
    },
    [catalog, sectionsTouched, sectionSelection],
  )

  /** A whole plan with one price (Accounts Automation): taken, or not. */
  const toggleSection = useCallback(
    (section) => {
      takeSection(section, sectionSelection[section.key] ? null : true)
    },
    [takeSection, sectionSelection],
  )

  /**
   * One plan of a section. Only one can be held at a time, so choosing
   * another simply replaces it; choosing the one already held lets it go.
   */
  const choosePlan = useCallback(
    (section, planKey) => {
      takeSection(section, sectionSelection[section.key] === planKey ? null : planKey)
    },
    [takeSection, sectionSelection],
  )

  /**
   * Creates the order for the companies chosen and hands over to Cashfree.
   * `paying` stays on after success: the page is on its way to Cashfree, and
   * a second click must not make a second order.
   */
  const checkout = useCallback(
    // `removeCompanies`: the company ids the user ticked in the Remove
    // Companies dialog - sent as remove_company. [] when none.
    async (removeCompanies = []) => {
      if (!catalog || !quote || quote.issues.length || paying || offerStatus !== 'ready') return false
      setPaying(true)

      try {
        const payload = packaged
          ? buildPackagePayload({
            catalog,
            quote,
            selection: sectionSelection,
            companies: quantity,
            productType: PRODUCT_TYPE.MAIN,
          })
          : buildPaymentPayload({
            catalog,
            quote,
            mode,
            tierKey,
            selectedKeys,
            optionChoices,
            subscription,
            removeCompanies,
            productType: PRODUCT_TYPE.MAIN,
          })
        // The offer whose discount is IN this order (quote.offer is null when
        // none applied). Once the order exists - so it was created with the
        // discount still open - it is marked used with PUT payment/checkOffer/,
        // then Cashfree opens. No offer applied: no PUT.
        const appliedOfferId = quote.offer?.id ?? null
        await startCheckout(payload, {
          beforeRedirect: appliedOfferId !== null ? () => applyOffer(appliedOfferId) : undefined,
        })
        return true
      } catch (error) {
        toast.error(error.message || 'The payment could not be started.')
        setPaying(false)
        return false
      }
    },
    [
      catalog,
      quote,
      packaged,
      sectionSelection,
      quantity,
      mode,
      tierKey,
      selectedKeys,
      optionChoices,
      subscription,
      paying,
      offerStatus,
    ],
  )

  /** Ask again after a failure - a new attempt number, so the guard lets it. */
  const retry = useCallback(() => {
    if (profileStatus === 'failed') dispatch(fetchProfile({ force: true }))
    setLoadState({ status: 'loading', error: null })
    setAttempt((count) => count + 1)
  }, [dispatch, profileStatus])

  /* ---- One status for the whole tab ---- */

  let status = 'ready'
  let error = null
  // What the spinner says while status is 'loading'.
  const loadingLabel =
    profileStatus === 'succeeded' ? 'Loading packages...' : 'Loading payment details...'
  if (profileStatus === 'failed') {
    status = 'failed'
    error = profileError || 'Could not load your profile.'
  } else if (loadState.status === 'failed') {
    status = 'failed'
    error = loadState.error
  } else if (catalogError) {
    status = 'failed'
    error = catalogError
    // A tiered price list opens with no package type chosen, which is a
    // ready page waiting for the user - not one still loading.
  } else if (loadState.status === 'loading' || !catalog || (!mode && !packaged && !tiered)) {
    status = 'loading'
  }

  return {
    status,
    loadingLabel,
    error,
    retry,
    offer,
    offerStatus,
    catalog,
    subscription,
    procurementUsage,
    heldPackages,
    lockedMode,
    plan,
    quote,
    paying,
    minQuantity,
    selection: { mode, tierKey, quantity, selectedKeys, optionChoices, sections: sectionSelection },
    toggleSection,
    choosePlan,
    setMode,
    setTierKey: setTierChoice,
    setQuantity,
    toggleModule,
    chooseOption,
    selectAllModules,
    isLockedModule,
    checkout,
  }
}
