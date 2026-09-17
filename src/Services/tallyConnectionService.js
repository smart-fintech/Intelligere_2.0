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

/** True when this reply says the ACTIVE company is open and connected. */
export const isActiveCompanyConnected = (reply, activeCompanyName) =>
  reply?.tally_connect === true && sameName(reply.company_name, activeCompanyName)

/**
 * Turns every reply gathered for one check into the footer's answer.
 *
 * Returns { state, label, message, reply }:
 *   connected     Tally is connected, with the active company open
 *   mismatch      Tally is connected, but with a different (or no) company
 *   disconnected  no agent reported a connection
 *
 * With no active company chosen in the app yet, any connected agent counts.
 */
export const resolveTallyConnection = (replies, activeCompanyName) => {
  const connected = replies.filter((reply) => reply.tally_connect === true)
  const hasActive = typeof activeCompanyName === 'string' && activeCompanyName.trim() !== ''

  const match = hasActive
    ? connected.find((reply) => sameName(reply.company_name, activeCompanyName))
    : connected[0]

  if (match) {
    return {
      state: 'connected',
      label: 'Tally Connected',
      message: match.msg || 'Tally connection successful',
      reply: match,
    }
  }

  if (connected.length > 0) {
    const other = connected.find((reply) => reply.company_name) ?? connected[0]
    return {
      state: 'mismatch',
      label: 'Company Mismatch',
      message: other.company_name
        ? `Tally is connected, but "${other.company_name}" is open instead of "${activeCompanyName}".`
        : `Tally is connected, but "${activeCompanyName}" is not open in Tally.`,
      reply: other,
    }
  }

  // Prefer the backend's own explanation when an agent gave one.
  const explained = replies.find((reply) => reply.msg)
  return {
    state: 'disconnected',
    label: 'Tally Not Connected',
    message: explained?.msg || 'Tally is not connected. Please open Tally and try again.',
    reply: explained ?? replies[replies.length - 1] ?? null,
  }
}
