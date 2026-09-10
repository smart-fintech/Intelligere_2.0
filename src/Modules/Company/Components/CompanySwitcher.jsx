/**
 * The company picker and the Add company button, as they appear in the
 * header.
 *
 * ------------------------------------------------------------------
 * FOR INTELLIGERE USERS ONLY
 * ------------------------------------------------------------------
 * This whole component renders NOTHING unless the signed-in user's ERP is
 * Intelligere. That single check is here, at the top, rather than in the
 * header - so Header.jsx just drops <CompanySwitcher /> in and never has to
 * know the rule. A Tally user sees the header exactly as it was before.
 *
 * The ERP is read from the profile in the Redux store (the same value the
 * profile page shows), so it is only known once the profile has loaded.
 * AppLayout loads it as the shell mounts, which covers a page reload as
 * well as a fresh sign-in.
 *
 * What it does:
 *
 *   on load     GET  the user's companies and fill the dropdown, with the
 *               company they were last working in already selected
 *   on pick     PUT  { id, comp_name, gst_no } to switch into it
 *   on add      opens AddCompanyModal, which POSTs the new company; the
 *               reply is the new list, so the dropdown updates itself
 *
 * All three go through Services/companyService - no URL is written here.
 */

import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
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
import { getActiveCompanyId } from '@/Library/secureStorage'
import { toast } from '@/Library/toast'
import { selectIsIntelligereErp } from '@/Store/Slices/profileSlice'
import {
  listIntelligereCompanies,
  readStoredCompanyName,
  selectIntelligereCompany,
} from '@/Services/companyService'
import AddCompanyModal from './AddCompanyModal'

/**
 * Which company should already be showing when the header first draws.
 *
 * The id saved at the last switch is the reliable answer; the saved NAME is
 * the fallback, for a session that picked a company before this component
 * existed. Failing both, nothing is preselected - better an empty picker
 * than a wrong one, because the choice decides which company's data every
 * other screen is about.
 */
const findCurrent = (companies) => {
  const savedId = getActiveCompanyId()
  if (savedId) {
    // The saved id is text out of storage, the company's is a number.
    const match = companies.find((company) => String(company.company_id) === String(savedId))
    if (match) return match
  }

  const savedName = readStoredCompanyName()
  if (savedName) {
    const match = companies.find((company) => company.comp_name === savedName)
    if (match) return match
  }

  return null
}

export default function CompanySwitcher() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  // The row id of the chosen company, as a string - which is the only kind
  // of value a <Select> deals in.
  const [selectedId, setSelectedId] = useState('')
  const [switching, setSwitching] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  // Which ERP the user is on comes from the profile in the store - the same
  // place the profile page reads it from. It is false until the profile has
  // arrived, and turns true on its own the moment it does, which is what
  // sets the effect below going. A Tally user never makes the request.
  const enabled = useSelector(selectIsIntelligereErp)

  useEffect(() => {
    if (!enabled) return

    // Set to false when the header unmounts mid-request, so a slow reply
    // cannot call setState on a component that is no longer on screen.
    let live = true

    listIntelligereCompanies()
      .then((list) => {
        if (!live) return
        setCompanies(list)
        setSelectedId(String(findCurrent(list)?.id ?? ''))
      })
      .catch((error) => {
        if (!live) return
        // Said once, quietly: a failed company list must not stop the user
        // from using the rest of the page.
        toast.error(error.message)
      })
      .finally(() => {
        if (live) setLoading(false)
      })

    return () => {
      live = false
    }
  }, [enabled])

  if (!enabled) return null

  /** Switches into the company the user just picked. */
  const handleSelect = async (value) => {
    const company = companies.find((entry) => String(entry.id) === value)
    if (!company || switching) return

    // The picker shows the new name straight away; if the call fails it is
    // put back, so what is on screen is never a company the user is not
    // actually in.
    const previous = selectedId
    setSelectedId(value)
    setSwitching(true)

    try {
      const response = await selectIntelligereCompany(company)
      toast.success(response?.msg || `Switched to ${company.comp_name}.`)
    } catch (error) {
      setSelectedId(previous)
      toast.error(error.message)
    } finally {
      setSwitching(false)
    }
  }

  /**
   * The reply to the POST is the whole list, so the new company is already
   * in it - there is nothing to fetch again.
   */
  const handleCreated = (list) => {
    if (list.length > 0) setCompanies(list)
  }

  const busy = loading || switching

  return (
    <>
      {/* ---------- The picker ----------
          Narrow on a phone, roomier from `sm` up. A long company name is cut
          short by the trigger rather than pushing the other buttons off the
          end of the bar. */}
      <Select value={selectedId} onValueChange={handleSelect} disabled={busy}>
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
            <SelectItem key={company.id} value={String(company.id)}>
              {company.comp_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* ---------- Add company ----------
          Same IconAction the refresh and bell buttons use, so it matches
          them without a single style being repeated here. */}
      <IconAction
        label="Add company"
        icon={Plus}
        disabled={switching}
        onClick={() => setAddOpen(true)}
      />

      <AddCompanyModal open={addOpen} onOpenChange={setAddOpen} onCreated={handleCreated} />
    </>
  )
}
