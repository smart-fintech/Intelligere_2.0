import * as React from "react"

import { cn } from "@/Library/utils"

/**
 * The text box every form uses - reached through Field in
 * Components/Common/FormFields, which adds the label and error message.
 *
 * The standard control is set here, once: 40px tall, white, a light grey
 * border, the brand focus ring, a red border when `aria-invalid`, and a grey
 * fill when it cannot be typed in (read-only or disabled). A toolbar that
 * wants the compact 32px box passes "h-8".
 */
function Input({
  className,
  type,
  ...props
}) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-muted md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
