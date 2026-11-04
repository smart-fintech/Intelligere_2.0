/**
 * Contact details shown in the footer.
 *
 * PLACEHOLDER VALUES - swap in the real support number/email before going
 * live. They live here rather than inside Footer.jsx so there is exactly one
 * place to change them.
 */
export const SUPPORT = {
  // Shown in the footer and used as the tel: link.
  phone: '+91 73833 05404',

  // `tel:` links must have no spaces or punctuation.
  phoneHref: 'tel:+917383305404',

  email: 'support@intelligere.in',
}

/**
 * The Report an Issue form's limits, as the backend (notifications/) holds them.
 *
 *   TICKET_DESCRIPTION_MAX   the most a description may say
 *   TICKET_ATTACHMENT_TYPES  the file extensions create_ticket/ accepts -
 *                            any other is refused with a 400
 */
export const TICKET_DESCRIPTION_MAX = 250

export const TICKET_ATTACHMENT_TYPES = ['jpg', 'jpeg', 'png', 'pdf', 'docx', 'csv', 'xlsx', 'xls', 'txt', 'zip']

/**
 * The statuses the support team moves a ticket through, and how each is
 * drawn: green when it is done, blue while it is being worked on, amber
 * before anybody has started, red when it will not be done.
 */
export const TICKET_STATUS_TONES = {
  'Not Started': 'pending',
  Ongoing: 'active',
  'Ready for Testing': 'active',
  Solved: 'done',
  'Not Feasible': 'closed',
  Cancelled: 'closed',
}
