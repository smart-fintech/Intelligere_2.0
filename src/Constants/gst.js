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
