/**
 * REPORT AN ISSUE - every URL of the support tickets.
 *
 *   POST   notifications/create_ticket/      multipart: user_email, module_name,
 *                                            description, attachment (optional)
 *          -> 201 { msg: "Ticket raised successfully", ticket_id }
 *          The attachment's extension must be one of TICKET_ATTACHMENT_TYPES
 *          (Constants/support), or it is a 400 { msg }.
 *
 *   POST   notifications/get_user_tickets/   { email }
 *          -> [{ id, user_email, module_name, status, description, attachment,
 *                created_at, updated_at }]   newest first
 *          `attachment` is the S3 URL, or "" when there is none; the dates are
 *          "dd-mm-yyyy hh:mm". An unknown email is a 404 { msg }.
 *
 * Tickets belong to the user, not to a company: the company only decides
 * which modules the form offers.
 *
 * Nothing here shows a message: a failure is an Error carrying the backend's
 * own text (Services/authService), for the screen to show.
 */

import { api } from '@/Services/authService'

const CREATE_TICKET_URL = 'notifications/create_ticket/'
const USER_TICKETS_URL = 'notifications/get_user_tickets/'

// Named so axios sends the FormData as it is - see Services/bankService.
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

/** One ticket. With no file the `attachment` field is left out, not sent empty. */
export const createTicket = ({ email, moduleName, description, attachment }) => {
  const body = new FormData()
  body.append('user_email', email)
  body.append('module_name', moduleName)
  body.append('description', description)
  if (attachment) body.append('attachment', attachment)
  return api.post(CREATE_TICKET_URL, body, MULTIPART)
}

export const getUserTickets = (email) => api.post(USER_TICKETS_URL, { email })
