/**
 * The GST reference lists, written down in ONE place.
 *
 * These are fixed by the tax rules, not by our backend - there is no API to
 * fetch them from - so they live here as constants rather than being typed
 * into a form. A form imports the list it needs and never spells the values
 * out itself.
 *
 * The states, which ARE tied to GST (the first two digits of a GST number are
 * the state code), are in Constants/indianStates.js.
 */

/**
 * How a party is registered under GST.
 *
 * `Regular` and `Composition` are the values the ledger API has been seen to
 * return; `Unregistered` covers a party with no GST number at all. If the
 * backend starts accepting more, add them here - this is the only list.
 *
 * The GSTIN lookup answers with the same words (see gstService's
 * `registrationType`), which is why a looked-up value can be dropped straight
 * into the dropdown.
 */
export const GST_REGISTRATION_TYPES = ['Regular', 'Composition', 'Unregistered',"SEZ"]

/**
 * The GST slabs a ledger can be taxed at, as percentages.
 *
 * Stored and sent as plain strings, because that is what the ledger API's
 * `gst_rate` field holds - no unit, no percent sign.
 */
export const GST_RATES = ['0', '0.25', '3', '5', '12', '18', '28']

/**
 * What a GST rate is made of - the tax rule itself, not anything of ours:
 *
 *   a sale WITHIN a state   half is CGST and half is SGST    5 -> 2.5 + 2.5
 *   a sale ACROSS states    all of it is IGST                 5 -> 5
 *
 *   gstBreakdown('5')   -> { cgst: '2.5', sgst: '2.5', igst: '5' }
 *   gstBreakdown('')    -> null     nothing chosen, nothing to show
 *
 * Both readings are returned, as text ready to show. WHICH ONE APPLIES is a
 * property of a sale - where the seller and the buyer are - and not of a
 * product or a rate, so nothing here chooses between them. A screen that
 * knows the two places (an invoice) picks one; a screen that does not (a
 * product) shows both.
 *
 * It only describes the rate. What is saved and sent is always the rate
 * itself, untouched.
 */
export const gstBreakdown = (rate) => {
  const total = Number(rate)
  if (rate === null || rate === undefined || String(rate).trim() === '' || !Number.isFinite(total)) return null

  // 0.25 halves to 0.125; anything longer than that is rounding noise.
  const tidy = (value) => String(Number(value.toFixed(4)))

  return { cgst: tidy(total / 2), sgst: tidy(total / 2), igst: tidy(total) }
}
