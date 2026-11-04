import { useState } from 'react'

import { SUPPORT } from '@/Constants/support'
import { getEmail } from '@/Library/secureStorage'
import TicketForm from '@/Modules/Support/Components/TicketForm'
import TicketHistory from '@/Modules/Support/Components/TicketHistory'

/**
 * /issue - Report an Issue, reached from the footer and the Help tab.
 *
 *   Create New Ticket        the form (TicketForm)
 *   Latest Support History   every ticket the user has raised (TicketHistory)
 *
 * Both work from the signed-in user's email. A session with none saved types
 * it into the form, and the history then follows the email the last ticket
 * went under.
 *
 * There is no header/sidebar/footer here: this page is nested inside
 * AppLayout in AppRoutes, so it gets all three automatically.
 */
export default function ReportIssue() {
  const [storedEmail] = useState(getEmail)
  const [historyEmail, setHistoryEmail] = useState(storedEmail || '')

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-brand sm:text-2xl">Report an Issue</h1>
        <p className="text-sm text-muted-foreground">
          When something goes wrong, raise a ticket and our team will get back to you. Add a short description
          and the related file, if any. For anything urgent, call{' '}
          <a href={SUPPORT.phoneHref} className="font-medium text-brand hover:underline">
            {SUPPORT.phone}
          </a>
          .
        </p>
      </div>

      <TicketForm storedEmail={storedEmail} onRaised={(email) => setHistoryEmail(storedEmail || email)} />

      <TicketHistory email={historyEmail} />
    </div>
  )
}
