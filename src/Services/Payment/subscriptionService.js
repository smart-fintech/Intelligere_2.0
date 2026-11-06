/**
 * What a company's subscription allows - for now, whether premium features
 * may be bought for it.
 *
 * Premium features (E-Invoice, E-Way Bill, GST filings, Biz Doxs, Inventory
 * Management ...) are add-ons to a paid main plan, so they are sold only to a
 * company whose main plan is paid and current. Not:
 *
 *   - during the free trial
 *   - when the main plan was never paid (or the trial has ended unpaid)
 *   - when the paid plan's renewal date has passed
 *
 * The plan is read from the company record already in the store
 * (tally/user-companies-list/ - is_paid, renew_date, free_trial_date) by
 * getCompanyPlan, the same reading the company status badge uses - so this
 * costs no request.
 *
 * This is the screen's check. It cannot stop a payment/paymentDetail/ call
 * made around the screen - only the backend can refuse that order.
 */

import { COMPANY_PLAN, getCompanyPlan } from '@/Services/Company/companyService'
import { formatLongDate } from '@/Utils/date'

/**
 * { eligible: true } or { eligible: false, reason, plan } for one company.
 * `reason` is the sentence to show; `plan` is its COMPANY_PLAN state, for a
 * screen that words or links it differently.
 */
export const getPremiumEligibility = (company) => {
  if (!company) return { eligible: false, plan: null, reason: 'Select the company to recharge.' }

  const name = company.comp_name || 'This company'
  const plan = getCompanyPlan(company)

  switch (plan) {
    case COMPANY_PLAN.PAID:
      return { eligible: true, plan, reason: '' }
    case COMPANY_PLAN.LAPSED:
      return {
        eligible: false,
        plan,
        reason: `The plan for ${name} expired on ${formatLongDate(company.renew_date)}. Renew the main plan before buying premium features.`,
      }
    case COMPANY_PLAN.TRIAL:
      return {
        eligible: false,
        plan,
        reason: `${name} is on a free trial. Premium features can be bought once the main plan is paid.`,
      }
    default:
      return {
        eligible: false,
        plan,
        reason: `${name} has no paid main plan. Buy the main plan first - premium features are add-ons to it.`,
      }
  }
}
