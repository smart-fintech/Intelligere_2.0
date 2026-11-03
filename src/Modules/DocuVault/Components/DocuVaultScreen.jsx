import { useState } from 'react'

import { DOCUVAULT_SOCKET_MODULE } from '@/Constants/docuVault'
import { MASTER_DATA_STALE_MS, QUERY } from '@/Constants/queryKeys'
import { useWebSocket } from '@/Hooks/useWebSocket'
import { useQuery } from '@/Library/queryCache'
import { getEmail } from '@/Library/secureStorage'
import DocuVaultDocuments from '@/Modules/DocuVault/Components/DocuVaultDocuments'
import DocuVaultUsers from '@/Modules/DocuVault/Components/DocuVaultUsers'
import StorageSummary from '@/Modules/DocuVault/Components/StorageSummary'
import { isUpdateMessage, refreshDocuVault } from '@/Modules/DocuVault/docuVault'
import { getDocuVaultUsers } from '@/Services/docuVaultService'

/**
 * The module's screen.
 *
 *   the Owner    the company's users, then the documents of the one opened
 *   a sub user   their own documents, with no way to name anybody else's: the
 *                email is always their own, whatever the users reply holds
 *
 * It listens on the app's one WebSocket for as long as it is open, so an upload
 * from the other side (or another tab) shows up here without a refresh.
 */
export default function DocuVaultScreen({ companyName, subUser }) {
  const [ownEmail] = useState(getEmail)
  const [opened, setOpened] = useState(null) // the user the Owner has open

  const users = useQuery({
    key: [QUERY.DOCUVAULT_USERS, companyName],
    fetch: () => getDocuVaultUsers(companyName),
    staleTime: MASTER_DATA_STALE_MS,
  })

  useWebSocket({
    module: DOCUVAULT_SOCKET_MODULE,
    connectOnMount: true,
    onMessage: (data) => {
      if (isUpdateMessage(data)) refreshDocuVault(data.company_name, data.email)
    },
  })

  const email = subUser ? ownEmail : opened?.email

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-brand sm:text-2xl">DocuVault</h1>

      {users.data ? <StorageSummary used={users.data.total_used_space_gb} status={users.data.storage_status} /> : null}

      {email ? (
        <DocuVaultDocuments
          key={email}
          companyName={companyName}
          email={email}
          title={subUser ? 'My Documents' : `Documents of ${opened.name || opened.email}`}
          storageStatus={users.data?.storage_status}
          onBack={subUser ? null : () => setOpened(null)}
        />
      ) : (
        <DocuVaultUsers companyName={companyName} list={users} onOpen={setOpened} />
      )}
    </div>
  )
}
