import { LifeBuoy } from 'lucide-react'

import { Card, CardContent } from '@/Components/ui/card'
import { SUPPORT } from '@/Constants/support'

/**
 * PLACEHOLDER PAGE for /issue.
 *
 * It exists so the "Report an Issue" link in the footer has somewhere to
 * land. The real form (subject, description, screenshot upload, ticket
 * number) is still to be designed.
 *
 * Note there is no header/sidebar/footer here: this page is nested inside
 * AppLayout in AppRoutes, so it gets all three automatically.
 */
export default function ReportIssue() {
  return (
    <div className="p-4 sm:p-6">
      <Card className="mx-auto max-w-2xl border-border/70">
        <CardContent className="space-y-3 px-6 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
            <LifeBuoy className="size-6" />
          </span>

          <h1 className="text-2xl font-semibold text-brand">Report an Issue</h1>

          <p className="text-sm text-muted-foreground">
            This form is not built yet. In the meantime, please reach us on{' '}
            <a
              href={SUPPORT.phoneHref}
              className="font-medium text-brand hover:underline"
            >
              {SUPPORT.phone}
            </a>{' '}
            or at{' '}
            <a
              href={`mailto:${SUPPORT.email}`}
              className="font-medium text-brand hover:underline"
            >
              {SUPPORT.email}
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
