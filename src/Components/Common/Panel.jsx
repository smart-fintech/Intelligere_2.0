import { Card, CardContent } from '@/Components/ui/card'
import { cn } from '@/Library/utils'

/**
 * A white card with a titled header strip - the frame around every form and
 * list on the dashboard.
 *
 *   <Panel title="Bank List" meta={`(Total Count: ${banks.length})`}
 *          actions={<Button size="sm" variant="outline">Refresh</Button>}>
 *     ...the list...
 *   </Panel>
 *
 *   title     the heading, in brand blue
 *   meta      quieter text after the heading - a count, a hint
 *   actions   whatever sits at the right of the header: a button, a switch
 *
 * The Bank and Ledger pages each have a form card and a list card; before
 * this they wrote the same Card, padding and heading line four times.
 */
export function Panel({ title, meta, actions, className, children }) {
  return (
    <Card className={cn('gap-0 border-border/70 shadow-sm', className)}>
      <CardContent className="px-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
          <h2 className="text-sm font-semibold text-brand">
            {title}
            {meta ? <span className="font-normal text-muted-foreground"> {meta}</span> : null}
          </h2>

          {actions}
        </div>

        {children}
      </CardContent>
    </Card>
  )
}
