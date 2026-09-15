import * as React from "react"
import { cva } from "class-variance-authority"
import { Slot } from "radix-ui"

import Spinner from "@/Components/Common/Loader/Spinner"
import { Tooltip } from "@/Components/ui/tooltip"
import { cn } from "@/Library/utils"

/**
 * THE button. Every clickable action in the app is one of these, so a change
 * to how buttons look is made here and nowhere else.
 *
 * ------------------------------------------------------------------
 * WHICH VARIANT FOR WHICH ACTION
 * ------------------------------------------------------------------
 *   default      Submit, Save, Update, Add, Create, Login, Fetch - the action
 *                the screen is for. Blue outline, the ERP look set for this
 *                project. It is the default, so a plain <Button> is right for
 *                these and needs no variant at all.
 *
 *   destructive  Delete, and anything else that removes data. Red outline,
 *                so it can never be mistaken for the blue action beside it.
 *
 *   ghost        Cancel, Close, Clear, Reset - backing out. No border, so it
 *                sits quietly next to the action it declines.
 *
 *   outline      Refresh, Retry, Previous, Next, Export - utilities around a
 *                list. Neutral grey outline.
 *
 *   secondary    Soft brand fill, for navigation dressed as a button
 *                ("Register here", "Copy referral link").
 *
 *   link         Text only.
 *
 * Sizes: `default` in forms and dialogs, `sm` in toolbars above and below a
 * list, `icon-sm` for the icon buttons on a table row.
 *
 * ------------------------------------------------------------------
 * EXTRAS ON TOP OF THE STOCK BUTTON
 * ------------------------------------------------------------------
 *   loading   true while the action runs: the button is disabled and shows a
 *             spinner, so one click can only ever be one request.
 *   icon      a lucide icon component drawn before the text, e.g.
 *             `icon={Search}`. While `loading` the spinner takes its place.
 *             Icons passed as children still work too.
 *   tooltip   text shown on hover/focus - for icon-only buttons. Drawn by
 *             the shared <Tooltip> in ui/tooltip.jsx; `tooltipSide` and
 *             `tooltipAlign` are its `side` and `align`.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border border-brand/40 bg-card text-brand shadow-xs hover:border-brand hover:bg-brand-soft hover:text-brand-dark",
        destructive:
          "border border-destructive/40 bg-card text-destructive shadow-xs hover:border-destructive hover:bg-destructive/10 focus-visible:border-destructive focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-input bg-card shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-brand-soft text-brand hover:bg-brand hover:text-brand-foreground",
        ghost:
          "hover:bg-brand-soft hover:text-brand-dark",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  icon: Icon,
  disabled,
  children,
  tooltip,
  tooltipSide = "top",
  tooltipAlign = "center",
  ...props
}) {
  const Comp = asChild ? Slot.Root : "button"

  // `asChild` hands the styling to the single child it wraps (a <Link>, say),
  // so nothing may be added beside that child.
  const content = asChild ? (
    children
  ) : (
    <>
      {loading ? (
        <Spinner size="xs" className="text-current" />
      ) : Icon ? (
        <Icon />
      ) : null}
      {children}
    </>
  )

  // Without a `tooltip` the shared Tooltip renders the button on its own.
  return (
    <Tooltip text={tooltip} side={tooltipSide} align={tooltipAlign}>
      <Comp
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {content}
      </Comp>
    </Tooltip>
  )
}

export { Button, buttonVariants }
