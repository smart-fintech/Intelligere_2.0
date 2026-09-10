import { cn } from '@/Library/utils'

/**
 * The Intelligere logo: the mark (image) plus the wordmark (text).
 *
 * Both the header and the footer show the logo, just at different sizes -
 * so it lives here once. If the artwork is ever replaced, this is the only
 * file that changes.
 *
 * Props:
 *   size      - 'sm' for the footer mini logo, 'md' for the header
 *   showText  - set to false to render the mark on its own (used by the
 *               collapsed sidebar rail)
 *
 * The image is loaded from /logo/favicon.svg. Anything inside the `public`
 * folder is served from the site root, so the path starts with "/" and needs
 * no import.
 */

// Tailwind classes per size, kept in one small lookup so the JSX stays clean.
const SIZES = {
  sm: { mark: 'size-6', text: 'text-sm' },
  md: { mark: 'size-8', text: 'text-lg' },
  lg: { mark: 'size-10', text: 'text-xl' },
}

export default function Logo({ size = 'md', showText = true, className }) {
  const styles = SIZES[size] ?? SIZES.md

  return (
    <span className={cn('flex items-center gap-2', className)}>
      <img
        src="/logo/favicon.png"
        alt="Intelligere"
        className={cn('shrink-0 rounded-sm object-contain', styles.mark)}
      />

      {showText ? (
        <span className={cn('font-semibold tracking-tight', styles.text)}>
          Intelligere
        </span>
      ) : null}
    </span>
  )
}
