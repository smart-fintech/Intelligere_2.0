import { cn } from "@/Library/utils"

/**
 * A grey block that pulses while real content is being fetched.
 *
 * Use it to draw the SHAPE of what is coming - a few table rows, a card -
 * so the page does not jump when the data lands:
 *
 *   <Skeleton className="h-4 w-32" />
 *
 * For a wait with no shape to suggest (a form saving, a page opening), the
 * spinner in Components/Common/Loader is the better answer.
 */
function Skeleton({ className, ...props }) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  )
}

export { Skeleton }
