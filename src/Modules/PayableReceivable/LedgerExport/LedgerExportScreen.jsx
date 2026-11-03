import { useSelector } from 'react-redux'

import { ListSkeleton } from '@/Components/Common/DataList'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import ErpLedgerList from '@/Modules/PayableReceivable/LedgerExport/ErpLedgerList'
import TallyLedgerExport from '@/Modules/PayableReceivable/LedgerExport/TallyLedgerExport'
import { selectIsErpKnown, selectIsTallyErp, selectProfileStatus } from '@/Store/Slices/profileSlice'

/**
 * The Ledger Export view: a Tally user syncs and reads reports, a user on
 * another ERP has the ledgers the app keeps itself. Neither is drawn until the
 * profile has said which - drawn too early, a Tally user's page would ask for
 * the other ERP's ledgers.
 */
export default function LedgerExportScreen({ companyName, companyId }) {
  const isTally = useSelector(selectIsTallyErp)
  const erpKnown = useSelector(selectIsErpKnown)
  const profileStatus = useSelector(selectProfileStatus)
  const { activeCompany } = useActiveCompany()

  if (!erpKnown && (profileStatus === 'idle' || profileStatus === 'loading')) return <ListSkeleton rows={5} />

  const List = isTally ? TallyLedgerExport : ErpLedgerList
  return <List companyName={companyName} companyId={companyId} companyAddress={activeCompany?.comp_address} />
}
