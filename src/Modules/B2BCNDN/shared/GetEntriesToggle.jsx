import { FileSpreadsheet } from 'lucide-react'

import { Button } from '@/Components/ui/button'

/**
 * The way back to Get Entries and the B2B / CNDN switch while entries are on
 * screen and they are hidden (B2BCndnScreen) - and the way to hide them again.
 *
 *   toggle   { open, onToggle }, or null while there are no entries (they show anyway)
 */
export default function GetEntriesToggle({ toggle, disabled }) {
  if (!toggle) return null
  return (
    <Button type="button" variant="outline" size="sm" icon={FileSpreadsheet} disabled={disabled} onClick={toggle.onToggle}>
      {toggle.open ? 'Hide Get Entries' : 'Get New Entries'}
    </Button>
  )
}
