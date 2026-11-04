/**
 * Report an Issue's plain logic - no React, no requests.
 *
 *   ticketsKey          the cache key of one user's tickets
 *   refreshTickets      marks them changed, and reads them again if on screen
 *   readTicketsReply    get_user_tickets/ -> the rows, each with sortable times
 *   moduleOptionsOf     the active company's modules, as grouped dropdown options
 *   attachmentProblem   why a picked file cannot be sent, or null
 *   statusToneOf        how a ticket's status is drawn
 */

import { ENV } from '@/Config/env'
import { QUERY } from '@/Constants/queryKeys'
import { TICKET_ATTACHMENT_TYPES, TICKET_STATUS_TONES } from '@/Constants/support'
import { invalidateQueries } from '@/Library/queryCache'

/** In lower case, as the backend looks emails up. */
export const ticketsKey = (email) => [QUERY.SUPPORT_TICKETS, String(email ?? '').toLowerCase()]

export const refreshTickets = (email) =>
  invalidateQueries(QUERY.SUPPORT_TICKETS, { whose: ticketsKey(email).slice(1), refetchActive: true })

/** "04-11-2026 14:05" -> a number that sorts in time order; 0 when unreadable. */
const readTicketTime = (value) => {
  const match = /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(String(value ?? '').trim())
  if (!match) return 0
  const [, day, month, year, hour = '00', minute = '00'] = match
  return Number(`${year}${month}${day}${hour}${minute}`)
}

/**
 * The attachment as a link the browser can open. The backend sends the S3
 * URL; a ticket whose upload to S3 failed keeps its media path
 * ("tickets/x.png"), which is read against the API's media folder.
 */
const attachmentUrlOf = (value) => {
  const text = String(value ?? '').trim()
  if (!text || text.toLowerCase() === 'null') return null
  if (/^https?:\/\//i.test(text)) return text
  return `${ENV.API_BASE_URL}media/${text.replace(/^\/+/, '').replace(/^media\//, '')}`
}

/** The file's own name, from the end of its URL - for the link's tooltip. */
const fileNameOf = (url) => {
  try {
    return decodeURIComponent(url.split('?')[0].split('/').pop() || '')
  } catch {
    return ''
  }
}

/** Anything other than a list (an unexpected reply) is no tickets. */
export const readTicketsReply = (reply) =>
  (Array.isArray(reply) ? reply : []).map((ticket) => {
    const attachmentUrl = attachmentUrlOf(ticket.attachment)
    return {
      ...ticket,
      attachmentUrl,
      attachmentName: attachmentUrl ? fileNameOf(attachmentUrl) : '',
      created_time: readTicketTime(ticket.created_at),
      updated_time: readTicketTime(ticket.updated_at),
    }
  })

/** A company's module list, always as an array of names. */
const toNames = (modules) =>
  Array.isArray(modules) ? modules.filter((name) => typeof name === 'string' && name.trim()) : []

/**
 * The modules a ticket can be about: the active company's `active_modules`
 * under "Standard Modules", then its `premium_modules` under "Premium
 * Modules", by the names the backend gives them. A name is offered once -
 * a dropdown's values must be unique - in the first group that has it.
 */
export const moduleOptionsOf = (company) => {
  const seen = new Set()
  const take = (names, group) =>
    names.flatMap((name) => {
      if (seen.has(name)) return []
      seen.add(name)
      return [{ value: name, label: name, group }]
    })

  return [
    ...take(toNames(company?.active_modules), 'Standard Modules'),
    ...take(toNames(company?.premium_modules), 'Premium Modules'),
  ]
}

/** The `accept` of the file picker, from the types the backend takes. */
export const ATTACHMENT_ACCEPT = TICKET_ATTACHMENT_TYPES.map((type) => `.${type}`).join(',')

/** Why `file` would be refused by create_ticket/, or null when it is fine. */
export const attachmentProblem = (file) => {
  if (!file) return null
  const name = String(file.name ?? '')
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  if (TICKET_ATTACHMENT_TYPES.includes(extension)) return null
  return `This file type is not allowed. Attach one of: ${TICKET_ATTACHMENT_TYPES.join(', ')}.`
}

/** 'pending' | 'active' | 'done' | 'closed', or 'unknown' for a status this app does not know. */
export const statusToneOf = (status) => TICKET_STATUS_TONES[String(status ?? '').trim()] ?? 'unknown'
