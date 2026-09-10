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
 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'user', // short-lived token sent on every request
  REFRESH_TOKEN: 'refresh', // long-lived token used to get a new access token
  EMAIL: 'email',
  ROLE: 'role',
  IS_SALESMAN: 'is_sm',
  TM_USER_TYPE: 'tm_ut',
  FREE_TRIAL_DATE: 'ftd',
  ACTIVE_COMPANY_ID: 'aci',
  ACTIVE_COMPANY_NAME: 'acn',
  IS_ADMIN: 'is_a',
  TALLY_CATEGORY: 'tc',
  ERP: 'erp',
  MAC_ADDRESS: 'mac_ad',
  UUID: 'uuid',
  ACTIVE_STATUS: 'active_status',
  // Last result of the Tally connection check, so the footer can show it
  // again straight after a reload instead of a blank line.
  TALLY_STATUS: 'tally_status',
}

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
export const getActiveCompanyId = () => getItem(STORAGE_KEYS.ACTIVE_COMPANY_ID)
export const isAdmin = () => getItem(STORAGE_KEYS.IS_ADMIN) === 'true'

export const getRole = () => getItem(STORAGE_KEYS.ROLE)
export const isSalesman = () => getItem(STORAGE_KEYS.IS_SALESMAN) === 'true'
export const getUserType = () => getItem(STORAGE_KEYS.TM_USER_TYPE)
export const getFreeTrialDate = () => getItem(STORAGE_KEYS.FREE_TRIAL_DATE)
export const getUuid = () => getItem(STORAGE_KEYS.UUID)
