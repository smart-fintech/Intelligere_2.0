/**
 * A square icon-only button for the header bar.
 *
 * It used to live inside Header.jsx. It moved out here the moment a second
 * file needed one (the Add company button), because "looks the same as the
 * others" only stays true if there is one definition of what the others
 * look like.
 *
 * Props:
 *   label   the tooltip AND the screen-reader name - an icon on its own
 *           says nothing to either, so this is required
 *   icon    a lucide icon component, e.g. `Bell`
 *   badge   an optional number drawn in a little circle on the corner
 *           (used by the notification bell)
 *
 * Anything else - onClick, disabled, className - is passed straight to the
 * button underneath.
 */

import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'

export default function IconAction({ label, icon: Icon, badge, className, ...props }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      className={cn(
        'relative text-brand hover:bg-brand-soft hover:text-brand-dark',
        className,
      )}
      {...props}
    >
      <Icon className="size-5" />

      {/* Only drawn when there is actually something to count. */}
      {badge > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">
          {/* Anything past 9 would stretch the circle, so it caps at "9+". */}
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </Button>
  )
}
