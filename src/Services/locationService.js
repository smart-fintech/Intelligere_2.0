/**
 * Countries, their states, and those states' cities.
 *
 *   GET tally/country_list/
 *
 * One endpoint answers all three, as a list of countries each carrying its
 * own states and their cities:
 *
 *   [
 *     {
 *       "country": "Afghanistan",
 *       "currency": "AFN", "currency_name": "Afghan afghani",
 *       "currency_symbol": "؋", "phonecode": "93",
 *       "state_city": {
 *         "Balkh":     ["Balkh", "Khulm", "Mazār-e Sharīf"],
 *         "Sar-e Pol": ["Chīras", "Sang-e Chārak"]
 *       }
 *     },
 *     ...
 *   ]
 *
 * So a state is a KEY of `state_city` and a city is an entry in its list -
 * there is no separate state or city endpoint, and nothing here is written
 * down in the frontend.
 *
 * ------------------------------------------------------------------
 * WHERE THE DATA LIVES, AND WHY THE READING IS DONE HERE
 * ------------------------------------------------------------------
 * The list is fetched once into the store (Store/Slices/locationSlice) and
 * shared, because it is the same for every screen and it is not small. The
 * three readers below are plain functions over whatever list they are given,
 * so the digging into `state_city` is written once and every screen - and
 * the slice's own selectors - asks the same question the same way.
 */

import { api } from '@/Services/authService'

const COUNTRY_LIST_URL = 'tally/country_list/'

/** The country a new ledger starts on, until the user says otherwise. */
export const DEFAULT_COUNTRY = 'India'

/**
 * Wrapped in `{ data: [...] }` or `{ results: [...] }` later is the sort of
 * change that arrives without warning, so all three shapes are accepted and
 * anything else becomes an empty list rather than a crash in a `.map()` -
 * the same guard the ledger endpoints use.
 */
const toList = (response) => {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(response?.results)) return response.results
  return []
}

/** The whole list, as the backend sends it. */
export const getCountryList = async () => toList(await api.get(COUNTRY_LIST_URL))

/**
 * Names are compared as a person would - case and outer spaces ignored - so
 * a value saved as "india" still finds India and its states. An exact match
 * is tried first, because that is almost always what is passed.
 */
const sameName = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.trim().toLowerCase() === b.trim().toLowerCase()

const findCountry = (countries, country) => {
  if (!Array.isArray(countries) || !country) return null
  return (
    countries.find((entry) => entry?.country === country) ||
    countries.find((entry) => sameName(entry?.country, country)) ||
    null
  )
}

/** Every country's name, in the order the backend listed them. */
export const getCountries = (countries) =>
  (Array.isArray(countries) ? countries : []).map((entry) => entry?.country).filter(Boolean)

/** The states of one country - the keys of its `state_city`. */
export const getStates = (countries, country) => {
  const found = findCountry(countries, country)
  if (!found?.state_city || typeof found.state_city !== 'object') return []
  return Object.keys(found.state_city)
}

/**
 * The cities of one state of one country.
 *
 * An empty list is a real answer, not a failure: the backend genuinely sends
 * `{ "Geta": [] }` for a state it has no cities for. The screen decides what
 * to say about that - see the City field in the Ledger Form.
 */
export const getCities = (countries, country, state) => {
  const found = findCountry(countries, country)
  const byState = found?.state_city
  if (!byState || typeof byState !== 'object' || !state) return []

  const exact = byState[state]
  if (Array.isArray(exact)) return exact

  // The saved state may be spelled differently from the key.
  const key = Object.keys(byState).find((name) => sameName(name, state))
  return Array.isArray(byState[key]) ? byState[key] : []
}
