/**
 * A single, safe wrapper around localStorage.
 *
 * This replaces the old `Centralised/cryptoUtils` file. Everything stored by
 * the app goes through here, so:
 *   - values are scrambled instead of sitting in plain sight,
 *   - a corrupt or missing value returns `null` instead of throwing,
 *   - every storage key is declared in one list (STORAGE_KEYS below).
 *
 * IMPORTANT, PLEASE READ:
 * The encryption key ships inside the JavaScript bundle, so anyone can find
 * it with browser dev tools. This hides values from a casual look at the
 * Application tab - it is NOT real security. Never store anything here that
 * would cause damage if it leaked.
 */

import AES from 'crypto-js/aes'
import Utf8 from 'crypto-js/enc-utf8'

import { ENV } from '@/Config/env'

/**
 * Names of everything the app keeps in localStorage.
 * Use these constants instead of typing the string in each file - a typo in a
 * raw string fails silently, a typo in a constant fails immediately.
 *
 * Every key here is READ somewhere; a value nothing reads is not stored. Keep
 * it that way: before adding a key, make sure the value cannot simply be
 * fetched or taken from the Redux store instead.
 *
 *   ACCESS_TOKEN / REFRESH_TOKEN  the session (authService, logout)
 *   EMAIL                         who to ask for companies; ledger created_by
 *   TALLY_CATEGORY / ERP          decide whether requests carry the
 *                                 activecompanyid header (authService)
 *   UUID                          profile, referrals, socket identity
 *   ACTIVE_COMPANY_ID             { company_id } of the company being worked
 *                                 in - see getActiveCompanyId below
 *   IS_ADMIN                      which login page logout returns to
 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'user', // short-lived token sent on every request
  REFRESH_TOKEN: 'refresh', // long-lived token used to get a new access token
  EMAIL: 'email',
  ACTIVE_COMPANY_ID: 'aci',
  IS_ADMIN: 'is_a',
  TALLY_CATEGORY: 'tc',
  ERP: 'erp',
  UUID: 'uuid',
}

/**
 * Keys earlier builds wrote and nothing reads any more. They are deleted once
 * as the app starts (removeObsoleteKeys, called from main.jsx), so a browser
 * signed in under an older build does not keep carrying them around until its
 * next logout.
 *
 *   acn            the company name - it is in the company list, by company_id
 *   role, is_sm,   saved at sign-in but never read by any screen
 *   tm_ut, ftd
 *   mac_ad,        declared but never written or read
 *   active_status,
 *   tally_status
 */
const OBSOLETE_KEYS = [
  'acn',
  'role',
  'is_sm',
  'tm_ut',
  'ftd',
  'mac_ad',
  'active_status',
  'tally_status',
]

// localStorage throws in private-browsing modes and inside some sandboxes,
// so every call below is wrapped and simply does nothing if it is unavailable.
const canUseStorage = () => {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

/** Scrambles a value before it is written. */
const encrypt = (value) => AES.encrypt(value, ENV.STORAGE_SECRET).toString()

/** Unscrambles a value that was read back. Returns null if it cannot be read. */
const decrypt = (value) => {
  try {
    const text = AES.decrypt(value, ENV.STORAGE_SECRET).toString(Utf8)
    return text || null
  } catch {
    return null
  }
}

/**
 * Saves a value. Objects and arrays are converted to JSON automatically.
 * Passing null or undefined removes the key instead.
 */
export const setItem = (key, value) => {
  if (!canUseStorage()) return

  if (value === null || value === undefined) {
    removeItem(key)
    return
  }

  try {
    const asText = typeof value === 'string' ? value : JSON.stringify(value)
    window.localStorage.setItem(key, encrypt(asText))
  } catch (error) {
    console.error(`[secureStorage] could not save "${key}"`, error)
  }
}

/** Reads a value back as text. Returns null when missing or unreadable. */
export const getItem = (key) => {
  if (!canUseStorage()) return null

  try {
    const stored = window.localStorage.getItem(key)
    return stored ? decrypt(stored) : null
  } catch (error) {
    console.error(`[secureStorage] could not read "${key}"`, error)
    return null
  }
}

/** Reads a value that was saved as an object or array. */
export const getJSON = (key) => {
  const text = getItem(key)
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Deletes one key. */
export const removeItem = (key) => {
  if (!canUseStorage()) return
  try {
    window.localStorage.removeItem(key)
  } catch (error) {
    console.error(`[secureStorage] could not remove "${key}"`, error)
  }
}

/** Wipes everything - used on logout. */
export const clearAll = () => {
  if (!canUseStorage()) return
  try {
    window.localStorage.clear()
  } catch (error) {
    console.error('[secureStorage] could not clear storage', error)
  }
}

/** Deletes the keys older builds left behind - see OBSOLETE_KEYS above. */
export const removeObsoleteKeys = () => OBSOLETE_KEYS.forEach(removeItem)

/* ------------------------------------------------------------------ */
/* Named helpers, so callers never repeat a key                       */
/* ------------------------------------------------------------------ */

export const getEmail = () => getItem(STORAGE_KEYS.EMAIL)
export const getTC = () => getItem(STORAGE_KEYS.TALLY_CATEGORY)
// Used by authService to decide whether a call carries an active company id.
// Anything in the UI that needs to know which ERP the user is on reads it
// from the profile in the store instead - see selectIsIntelligereErp in
// Store/Slices/profileSlice.
export const getERP = () => getItem(STORAGE_KEYS.ERP)
export const isAdmin = () => getItem(STORAGE_KEYS.IS_ADMIN) === 'true'
export const getUuid = () => getItem(STORAGE_KEYS.UUID)

/* ------------------------------------------------------------------ */
/* The company being worked in                                        */
/* ------------------------------------------------------------------ */

/*
 * Only the company's `company_id` is stored - never the company record. The
 * name, GST number and the rest are in the company list the app fetches on
 * every start (Store/Slices/companySlice), so storing them again would only
 * be a second copy that can go stale.
 *
 * The id itself IS kept, for two readers:
 *   - authService, which sends it as the `activecompanyid` header on every
 *     request, from plain JavaScript with no access to the store
 *   - companySlice, for Tally Gold users only: the company they picked is
 *     the active company, and this is where that pick survives a reload
 *
 * It is written as { company_id } rather than a bare number on purpose.
 * Earlier builds stored a bare value that was sometimes the company's row
 * `id` - a different number from its company_id - so a bare value cannot be
 * trusted to mean either. The object form is how a current value is told
 * apart from one of those.
 */

/** Saves the selected company's id. Pass null to forget it. */
export const setActiveCompanyId = (companyId) =>
  setItem(
    STORAGE_KEYS.ACTIVE_COMPANY_ID,
    companyId === null || companyId === undefined ? null : { company_id: companyId },
  )

/**
 * The selected company's `company_id`, or null.
 *
 * A value left by an older build (a bare id, see above) is deleted here and
 * treated as "nothing saved" rather than guessed at. Nothing is lost: the
 * company list is fetched on every start, the backend's `is_active` flag
 * picks the company again, and that choice is written back in the new form.
 */
export const getActiveCompanyId = () => {
  const saved = getJSON(STORAGE_KEYS.ACTIVE_COMPANY_ID)

  if (saved && typeof saved === 'object' && saved.company_id != null) {
    return saved.company_id
  }

  // Missing is fine. Present but not in the current shape is an old value.
  if (getItem(STORAGE_KEYS.ACTIVE_COMPANY_ID) !== null) {
    removeItem(STORAGE_KEYS.ACTIVE_COMPANY_ID)
  }
  return null
}
