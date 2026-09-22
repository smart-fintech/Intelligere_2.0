/**
 * Reading the reply of POST payment/checkOffer/ into an offer the price can
 * use - or null when there is none to apply.
 *
 *   { is_all_user, email, discount_percent, end_date, dis_apply, msg, id }
 *
 * An offer applies only when ALL of these hold:
 *
 *   discount_percent > 0          (0 is the "no offer" reply)
 *   dis_apply is not true         (true = do not apply the discount)
 *   is_all_user, or email is the signed-in user's
 *   end_date is today or later    (no end_date = no expiry)
 *
 * This only decides what the user is SHOWN. The backend checks the offer
 * again when the order is created and has the final word.
 */

import { compareToToday } from '@/Utils/date'

const isTrue = (value) => value === true || String(value).toLowerCase() === 'true'

const sameEmail = (a, b) =>
  Boolean(a && b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase()

/**
 * -> { id, percent, title, endDate, allUsers } or null.
 * `title` is the backend's `msg` ("Diwali offer"), or "10% off" without one.
 */
export const parseOffer = (raw, userEmail) => {
  if (!raw || typeof raw !== 'object') return null

  const percent = Number(raw.discount_percent)
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return null
  if (isTrue(raw.dis_apply)) return null

  const allUsers = isTrue(raw.is_all_user)
  if (!allUsers && !sameEmail(raw.email, userEmail)) return null

  if (raw.end_date) {
    const dayVsToday = compareToToday(raw.end_date)
    // An end date that cannot be read is not trusted to still be open.
    if (dayVsToday === null || dayVsToday < 0) return null
  }

  const message = typeof raw.msg === 'string' ? raw.msg.trim() : ''

  return {
    id: raw.id ?? null,
    percent,
    title: message || `${percent}% off`,
    endDate: raw.end_date || null,
    allUsers,
  }
}
