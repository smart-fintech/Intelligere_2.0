/**
 * The footer's "Check Tally Connection" - its own WebSocket, and what its
 * replies mean.
 *
 * ------------------------------------------------------------------
 * WHY A SEPARATE CONNECTION
 * ------------------------------------------------------------------
 * The header's Refresh (fetch_tally_company) runs on the app's shared socket.
 * The Tally check is kept on a connection of its own so a long check and a
 * refresh never share a queue, a retry ladder or a busy flag. It is created
 * ONCE, here at module level - never in a component - so rendering the footer
 * can never open a second one. Its lifecycle (allow on sign-in, close on
 * sign-out) is SocketProvider's, exactly like the shared socket.
 *
 * ------------------------------------------------------------------
 * THE CONVERSATION
 * ------------------------------------------------------------------
 *   sent      { "payload": { "module_name": "tally_check_connection" } }
 *
 *   received  (one or MORE of these - one per Tally agent that answers)
 *   { "res": {
 *       "return_module_name": "tally_check_connection",
 *       "action_status": "stop_loader",
 *       "status": "success" | "error",
 *       "tally_connect": true | false,
 *       "company_name": "Bhavi Electronics789",   <- "" when none is open
 *       "tally_company": "Bhavi Electronics789",  <- or a list of names
 *       "msg": "...",
 *       "pc_name": "PC-NAME"
 *   } }
 */

import { createSocket } from '@/Services/socketService'

/** The only Tally-check connection in the app. */
export const tallySocket = createSocket({ name: 'Footer Tally WS' })

/** The name this check goes by, in both directions. */
export const TALLY_CONNECTION_MODULE = 'tally_check_connection'

/** What the footer's button sends. */
export const buildTallyConnectionMessage = () => ({
  payload: {
    module_name: TALLY_CONNECTION_MODULE,
  },
})

/**
 * The reply's body, or null when the message is not a Tally-check reply.
 * Filtering here as well as by the socket's `module` keeps a message that
 * reaches everybody (a bare stop_loader) from being read as an answer.
 */
export const readTallyConnectionReply = (data) => {
  const reply = data?.res
  if (!reply || typeof reply !== 'object') return null
  return reply.return_module_name === TALLY_CONNECTION_MODULE ? reply : null
}

/** True when the backend says this agent has finished. */
export const isFinalReply = (reply) => reply?.action_status === 'stop_loader'

/** Company names are compared loosely: case and outer spaces do not count. */
const sameName = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.trim() !== '' &&
  a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Every company name one reply reports. The backend names the open company
 * in `tally_company` and/or `company_name`, and either may hold one name or a
 * list of them (several companies open in one Tally), so all are gathered.
 */
const COMPANY_NAME_FIELDS = ['tally_company', 'company_name']

const toNames = (value) => {
  if (Array.isArray(value)) return value.flatMap(toNames)
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (value && typeof value === 'object') {
    return toNames(value.tally_company ?? value.company_name ?? value.comp_name)
  }
  return []
}

export const readReplyCompanyNames = (reply) => [
  ...new Set(COMPANY_NAME_FIELDS.flatMap((field) => toNames(reply?.[field]))),
]

/**
 * True when this reply says Tally is connected. `tally_connect` decides when
 * the backend sent it; a reply without it counts when it is not an error.
 */
const isConnectedReply = (reply) =>
  reply?.tally_connect === true || (reply?.tally_connect == null && reply?.status !== 'error')

/** True when this reply says the ACTIVE company is open and connected. */
export const isActiveCompanyConnected = (reply, activeCompanyName) =>
  isConnectedReply(reply) &&
  readReplyCompanyNames(reply).some((name) => sameName(name, activeCompanyName))

/**
 * Every reply of one check merged into { reply, name } pairs - one per
 * company any connected agent reported - so the active company is found
 * whichever reply (or which entry of a list) carried it.
 */
const mergeConnectedCompanies = (replies) =>
  replies
    .filter(isConnectedReply)
    .flatMap((reply) => readReplyCompanyNames(reply).map((name) => ({ reply, name })))

/** The "not connected" answer, preferring the backend's own explanation. */
const notConnected = (replies, message) => {
  const explained = replies.find((reply) => reply.msg)
  return {
    state: 'disconnected',
    label: 'Not Connected',
    message: message || explained?.msg || 'Tally is not connected. Please open Tally and try again.',
    reply: explained ?? replies[replies.length - 1] ?? null,
  }
}

const connectedTo = (match) => ({
  state: 'connected',
  label: 'Connected',
  message: match.msg || 'Tally connection successful',
  reply: match,
})

/**
 * Turns every reply gathered for one check into the footer's answer
 * (Silver, and everyone who is not Tally Gold).
 *
 * Returns { state, label, message, reply }:
 *   connected     Tally is connected, with the active company open
 *   mismatch      Tally is connected, but with a different (or no) company
 *   disconnected  no agent reported a connection
 *
 * With no active company chosen in the app yet, any connected agent counts.
 */
export const resolveTallyConnection = (replies, activeCompanyName) => {
  const connected = replies.filter(isConnectedReply)
  const companies = mergeConnectedCompanies(replies)
  const hasActive = typeof activeCompanyName === 'string' && activeCompanyName.trim() !== ''
  if (!hasActive) {
    return notConnected(replies, 'No active company selected. Please select a company and try again.')
  }
  const match = hasActive
    ? companies.find(({ name }) => sameName(name, activeCompanyName))?.reply
    : connected[0]

  if (match) return connectedTo(match)

  if (connected.length > 0) {
    const other = companies[0]
    return {
      state: 'mismatch',
      label: 'Company Mismatch',
      message: other
        ? `Tally is connected, but "${other.name}" is open instead of "${activeCompanyName}".`
        : `Tally is connected, but "${activeCompanyName}" is not open in Tally.`,
      reply: other?.reply ?? connected[0],
    }
  }

  return notConnected(replies)
}

/**
 * The footer's answer for Tally Gold. Connected ONLY when
 *
 *   1. tally/user-companies-list/ has at least one company,
 *   2. the stored company_id is one of them (the active Gold company), and
 *   3. some connected reply reports that company's comp_name.
 *
 * Anything else is disconnected - there is no "mismatch" for Gold.
 */
export const resolveGoldTallyConnection = (replies, { activeCompanyName, companyCount }) => {
  if (!companyCount) return notConnected(replies, 'No Tally company found for this account.')

  const hasActive = typeof activeCompanyName === 'string' && activeCompanyName.trim() !== ''
  if (!hasActive) {
    return notConnected(replies, 'No active company selected. Please select a company and try again.')
  }

  const companies = mergeConnectedCompanies(replies)
  const match = companies.find(({ name }) => sameName(name, activeCompanyName))
  if (match) return connectedTo(match.reply)

  return notConnected(
    replies,
    companies.length > 0
      ? `"${activeCompanyName}" is not open in Tally ("${companies.map(({ name }) => name).join('", "')}" found).`
      : undefined,
  )
}
