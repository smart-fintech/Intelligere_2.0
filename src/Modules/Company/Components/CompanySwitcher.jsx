/**
 * The company picker and the Add company button, as they appear in the
 * header.
 *
 * ------------------------------------------------------------------
 * FOR INTELLIGERE USERS, AND TALLY GOLD USERS
 * ------------------------------------------------------------------
 * This whole component renders NOTHING for anyone else. That check is here,
 * at the top, rather than in the header.
 *
 *   Intelligere   picker + Add company. A pick PUTs the switch to the
 *                 backend (its is_active flags are the active company).
 *   Tally Gold    picker only, listing EVERY company. A pick is stored in
 *                 secure storage (selectStoredCompany) - that stored id IS
 *                 the active company for Gold; is_active is not used.
 *
 * The ERP is read from the profile in the Redux store (the same value the
 * profile page shows), so it is only known once the profile has loaded.
 * AppLayout loads it as the shell mounts, which covers a page reload as
 * well as a fresh sign-in.
 *
 * ------------------------------------------------------------------
 * THE LIST IS NOT KEPT HERE
 * ------------------------------------------------------------------
 * The companies and the one being worked in live in the store
 * (Store/Slices/companySlice), which AppLayout fills as the shell mounts.
 * They are shared: the dashboard's Bank Details reads the selected company
 * from the same place this picker writes it to, so there is one company
 * selection in the app and this is the only screen that changes it.
 *
 * What it does:
 *
 *   on load     nothing - the store already has the companies, with the one
 *               the backend marked `is_active` already selected
 *   on pick     tells the store, then PUTs the switch so the backend moves
 *               with it; a failed switch puts the picker back
 *   on add      opens AddCompanyModal, which POSTs the new company; the
 *               list is then reloaded so the picker and every other module
 *               see the same thing
 *
 * Both calls go through Services/companyService - no URL is written here.
 */

import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Plus } from 'lucide-react'

import { Spinner } from '@/Components/Common/Loader'
import IconAction from '@/Components/Layout/IconAction'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/Components/ui/select'
import { toast } from '@/Library/toast'
import { selectIsGoldTally, selectIsIntelligereErp } from '@/Store/Slices/profileSlice'
import {
  fetchCompanies,
  markActiveCompany,
  selectCompanyStatus,
  selectStoredCompany,
} from '@/Store/Slices/companySlice'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { selectIntelligereCompany } from '@/Services/companyService'
import AddCompanyModal from './AddCompanyModal'

export default function CompanySwitcher() {
  const dispatch = useDispatch()

  const { allCompanies: companies, activeCompany: selected } = useActiveCompany()
  const status = useSelector(selectCompanyStatus)

  // True only while the switch request is in flight.
  const [switching, setSwitching] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  // Which ERP the user is on comes from the profile in the store - the same
  // place the profile page reads it from. It is false until the profile has
  // arrived, which is why a Tally user never sees this appear and vanish.
  const isIntelligere = useSelector(selectIsIntelligereErp)
  const isGoldTally = useSelector(selectIsGoldTally)
  if (!isIntelligere && !isGoldTally) return null

  /** Switches into the company the user just picked. */
  const handleSelect = async (value) => {
    const company = companies.find((entry) => String(entry.company_id) === value)
    if (!company || switching || company.company_id === selected?.company_id) return

    // Gold Tally: the pick itself is the active company - store it, done.
    if (isGoldTally) {
      dispatch(selectStoredCompany(company))
      toast.success(`Switched to ${company.comp_name}.`)
      return
    }

    // The picker shows the new company straight away, and every module
    // watching the store reloads with it. If the call fails the previous one
    // is put back, so what is on screen is never a company the user is not
    // actually in.
    const previousId = selected?.company_id ?? null
    dispatch(markActiveCompany(company.company_id))
    setSwitching(true)

    try {
      const response = await selectIntelligereCompany(company)
      toast.success(response?.msg || `Switched to ${company.comp_name}.`)
      // Confirm from the backend: its is_active flags are the truth.
      dispatch(fetchCompanies({ force: true }))
    } catch (error) {
      dispatch(markActiveCompany(previousId))
      toast.error(error.message)
    } finally {
      setSwitching(false)
    }
  }

  /**
   * A company was added. The POST replies with the Intelligere list, but the
   * store is filled from the fuller user-companies endpoint, so the list is
   * reloaded rather than patched - one source of truth, and the new company
   * arrives with the same fields as all the others.
   */
  const handleCreated = () => {
    dispatch(fetchCompanies({ force: true }))
  }

  const loading = status === 'loading'
  const busy = loading || switching

  return (
    <>
      {/* ---------- The picker ----------
          Narrow on a phone, roomier from `sm` up. A long company name is cut
          short by the trigger rather than pushing the other buttons off the
          end of the bar. */}
      <Select
        value={selected ? String(selected.company_id) : ''}
        onValueChange={handleSelect}
        disabled={busy}
      >
        <SelectTrigger
          size="sm"
          title="Active company"
          aria-label="Active company"
          className="w-32 border-brand/30 text-brand sm:w-48"
        >
          {busy ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Spinner size="xs" />
              {switching ? 'Switching...' : 'Loading...'}
            </span>
          ) : (
            <SelectValue
              placeholder={companies.length === 0 ? 'No companies' : 'Select company'}
            />
          )}
        </SelectTrigger>

        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company.company_id} value={String(company.company_id)}>
              {company.comp_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* ---------- Add company ----------
          Same IconAction the refresh and bell buttons use, so it matches
          them without a single style being repeated here. */}
      {isIntelligere && (
        <>
          <IconAction
            label="Add Company"
            icon={Plus}
            disabled={switching}
            onClick={() => setAddOpen(true)}
          />

          <AddCompanyModal open={addOpen} onOpenChange={setAddOpen} onCreated={handleCreated} />
        </>
      )}
    </>
  )
}
