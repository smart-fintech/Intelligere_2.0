import { Check } from 'lucide-react'

import { cn } from '@/Library/utils'

/**
 * WHERE THE USER IS IN A FORM THAT IS FILLED IN OVER SEVERAL STEPS.
 *
 *   <Stepper
 *     steps={[{ key: 'main', title: 'Main Details' }, { key: 'more', title: 'Additional Details' }]}
 *     current={stepIndex}
 *     onStepClick={setStepIndex}
 *   />
 *
 * A numbered disc and a title per step, joined by a line: the steps already
 * done are ticked and filled, the one open is outlined in brand blue, the
 * ones still to come are grey.
 *
 * It only SHOWS the position - which step is open, and whether the user may
 * leave it, is the form's business. So:
 *
 *   onStepClick   optional. With it, a step already DONE can be clicked to
 *                 go back to it; the steps ahead never can, because getting
 *                 to them is what the form's Next button and its checks are
 *                 for. Without it, nothing here is clickable.
 *   disabled      nothing is clickable for now (while the form is saving)
 *
 * On a narrow screen only the open step keeps its title - the others fall
 * back to their numbers - so five steps still fit on a phone without the row
 * wrapping or the page scrolling sideways.
 */
export function Stepper({ steps, current, onStepClick, disabled = false, className }) {
  return (
    <ol className={cn('flex items-center gap-2', className)}>
      {steps.map((step, index) => {
        const done = index < current
        const open = index === current
        const clickable = done && !disabled && typeof onStepClick === 'function'

        const content = (
          <>
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                done && 'border-brand bg-brand text-brand-foreground',
                open && 'border-brand bg-card text-brand',
                !done && !open && 'border-border bg-card text-muted-foreground',
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
            </span>
            <span
              className={cn(
                'truncate text-xs font-medium',
                open ? 'text-brand' : 'hidden text-muted-foreground sm:inline',
                done && 'sm:text-foreground',
              )}
            >
              {step.title}
            </span>
          </>
        )

        return (
          <li
            key={step.key}
            aria-current={open ? 'step' : undefined}
            // The open step may shrink (its title is cut with an ellipsis);
            // the line after each step takes whatever room is left.
            className={cn('flex min-w-0 items-center gap-2', index < steps.length - 1 && 'flex-1')}
          >
            {clickable ? (
              <button
                type="button"
                onClick={() => onStepClick(index)}
                aria-label={`Back to step ${index + 1}: ${step.title}`}
                className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {content}
              </button>
            ) : (
              <span className="flex min-w-0 items-center gap-2">{content}</span>
            )}

            {index < steps.length - 1 ? (
              <span aria-hidden="true" className={cn('h-px min-w-3 flex-1', done ? 'bg-brand' : 'bg-border')} />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
