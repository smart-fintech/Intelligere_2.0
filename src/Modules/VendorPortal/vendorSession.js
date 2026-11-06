/**
 * Who is signed in to the vendor portal: the vendor's email, kept apart from
 * the app user's session. There is no vendor token - procurement/vendor_login/
 * only says the password is right, and every later call names the vendor by
 * this email (Services/Procurement/vendorPortalService).
 */

import { STORAGE_KEYS, getItem, removeItem, setItem } from '@/Library/secureStorage'

export const getVendorEmail = () => getItem(STORAGE_KEYS.VENDOR_EMAIL)

export const signInVendor = (email) => setItem(STORAGE_KEYS.VENDOR_EMAIL, String(email).trim().toLowerCase())

export const signOutVendor = () => removeItem(STORAGE_KEYS.VENDOR_EMAIL)
