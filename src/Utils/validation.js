/**
 * THE SHAPE CHECKS a form field is held to - written once, for any form.
 *
 *   import { isValidEmail, isValidPhone } from '@/Utils/validation'
 *
 * The rules are the ones the app's forms already apply (Ledger Form, Company
 * Form), so a phone number or PAN accepted on one screen is accepted on every
 * other. A GST number is checked by isValidGstNumber in Services/gstService,
 * which is where the GST rules live.
 *
 * Each takes the raw value and answers true / false. None of them decides
 * whether a field is required: an empty value is the form's business, so call
 * these only when there is something to check.
 */

const text = (value) => String(value ?? '').trim()

/** name@domain.tld */
export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value))

/** A 10-digit mobile number, digits only. */
export const isValidPhone = (value) => /^\d{10}$/.test(text(value))

/** An Indian pincode: six digits, not starting with 0. */
export const isValidPincode = (value) => /^[1-9][0-9]{5}$/.test(text(value))

/** A PAN: five letters, four digits, a letter. */
export const isValidPan = (value) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(text(value).toUpperCase())

/**
 * A website address, with or without http(s):// - "example.com",
 * "www.example.co.in/shop", "https://example.com".
 */
export const isValidWebsite = (value) =>
  /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(text(value))
