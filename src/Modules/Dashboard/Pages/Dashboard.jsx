import { Card, CardContent } from '@/Components/ui/card'

/**
 * PLACEHOLDER PAGE.
 *
 * Login sends the user here after a successful sign-in. Replace the contents
 * with the real dashboard (KPI cards, charts, AI insights) when it is ready.
 *
 * Notice how little is here: no header, no sidebar, no footer, and no
 * full-screen wrapper. This page is nested inside AppLayout in AppRoutes,
 * so the shell is already drawn around whatever it returns. Every new page
 * added inside that block works the same way - it only writes its own
 * content and starts with the page padding below.
 */
export default function Dashboard() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back. Your figures will appear here.
        </p>
      </div>

      {/* Three empty cards, only to show the content area laying out. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {['Revenue', 'Expenses', 'Cash Flow'].map((title) => (
          <Card key={title} className="border-border/70">
            <CardContent className="px-6">
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="mt-1 text-2xl font-semibold text-brand">--</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
