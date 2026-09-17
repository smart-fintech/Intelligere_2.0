import { Link } from 'react-router-dom'

import { ROUTES } from '@/Constants/routes'

/**
 * The narrow "Help" tab pinned to the right edge of the window.
 *
 * It is the same tab this ERP has always had: a blue strip with the word
 * running downwards, rounded on the left where it meets the page. It stays
 * put while the page scrolls, so help is one click away from anywhere.
 *
 * It goes to the Report an Issue page, which is where the footer's own help
 * link goes - one destination, so there is nothing new to maintain.
 *
 * `writing-mode: vertical-rl` is what turns the text on its side; the letters
 * stay upright relative to the strip, which is why it reads top-to-bottom
 * rather than being a rotated word.
 */
export default function HelpTab() {
  return (
    <Link
  to={ROUTES.ISSUE}
  title="Help"
  aria-label="Help"
  className="fixed top-40 right-0 z-40 flex -translate-y-1/2 items-center rounded-l-md bg-brand px-2.5 py-1 text-xs font-semibold tracking-widest text-brand-foreground shadow-md transition-colors hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none [writing-mode:vertical-rl] [text-orientation:upright]"
>
  <p className="tracking-[6px]">Help</p>
</Link>
  )
}
