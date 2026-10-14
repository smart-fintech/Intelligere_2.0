import { Lock } from 'lucide-react'

import { ListSkeleton, StateMessage } from '@/Components/Common/DataList'
import { Card, CardContent } from '@/Components/ui/card'
import useSectionAccess from '@/Hooks/useSectionAccess'

/**
 * Shows a page only to a user who may do at least one thing with its
 * section (useSectionAccess): a placeholder until that is known, and a short
 * "no access" message when there is nothing they may do. What each button
 * on the page allows is the page's own business - it asks the same hook.
 *
 *   <SectionAccessGate section={ACCESS_SECTIONS.BANK} label="Bank Details">
 *     <BankDetails />
 *   </SectionAccessGate>
 */
export default function SectionAccessGate({ section, label, children }) {
  const access = useSectionAccess(section)

  if (access.known && access.any) return children

  return (
    <Card className="border-border/70">
      <CardContent className="px-4">
        {access.known ? (
          <StateMessage icon={Lock} title={`No access to ${label}`}>
            Your account has not been given {label} in this company. Ask the account owner if you need it.
          </StateMessage>
        ) : (
          <ListSkeleton />
        )}
      </CardContent>
    </Card>
  )
}
