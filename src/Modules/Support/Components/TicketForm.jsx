import { useRef, useState } from 'react'
import { LayoutGrid, Mail, Send } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { Field, FileField, FormActions, FormGrid, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { TICKET_DESCRIPTION_MAX } from '@/Constants/support'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { toast } from '@/Library/toast'
import { ATTACHMENT_ACCEPT, attachmentProblem, moduleOptionsOf, refreshTickets } from '@/Modules/Support/support'
import { createTicket } from '@/Services/supportService'
import { fetchCompanies, selectCompanyError, selectCompanyStatus } from '@/Store/Slices/companySlice'
import { isValidEmail } from '@/Utils/validation'

/**
 * CREATE NEW TICKET - the email, the module it is about, a file and a
 * description, sent to notifications/create_ticket/.
 *
 *   email         the signed-in user's, read-only; typed in only when the
 *                 session has none saved
 *   module        the ACTIVE company's modules, standard and premium in two
 *                 groups (moduleOptionsOf). Another company in the header
 *                 offers its own, and a choice it does not have is dropped
 *   file          optional, one of the types the backend takes
 *   description   required, at most TICKET_DESCRIPTION_MAX characters
 *
 * After a ticket is raised the form is emptied (the email stays) and the
 * history below is read again. `onRaised(email)` says which email it went
 * under, for a session that had none saved.
 */
export default function TicketForm({ storedEmail, onRaised }) {
  const dispatch = useDispatch()
  const { activeCompany } = useActiveCompany()
  const companyStatus = useSelector(selectCompanyStatus)
  const companyError = useSelector(selectCompanyError)

  const [email, setEmail] = useState(storedEmail || '')
  const [moduleName, setModuleName] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  // Read synchronously, so a second click in the same instant sends nothing.
  const savingRef = useRef(false)

  const moduleOptions = moduleOptionsOf(activeCompany)
  // A module the active company no longer offers is no choice at all.
  const chosenModule = moduleOptions.some((option) => option.value === moduleName) ? moduleName : ''
  const companiesLoading = (companyStatus === 'idle' || companyStatus === 'loading') && !activeCompany

  const modulePlaceholder = companiesLoading
    ? 'Loading modules...'
    : !activeCompany
      ? 'No company selected'
      : moduleOptions.length === 0
        ? 'No modules on this company'
        : 'Select Module'

  const clearError = (field) => setErrors((previous) => (previous[field] ? { ...previous, [field]: null } : previous))

  const validate = () => {
    const found = {}
    const address = email.trim()
    if (!address) found.email = 'Please enter your email.'
    else if (!isValidEmail(address)) found.email = 'Please enter a valid email.'
    if (!chosenModule) found.moduleName = 'Please choose a module.'
    if (!description.trim()) found.description = 'Please add a brief description.'
    else if (description.trim().length > TICKET_DESCRIPTION_MAX) {
      found.description = `Description cannot exceed ${TICKET_DESCRIPTION_MAX} characters.`
    }
    const fileProblem = attachmentProblem(attachment)
    if (fileProblem) found.attachment = fileProblem
    setErrors(found)
    return Object.keys(found).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (savingRef.current || !validate()) return

    const address = email.trim()
    savingRef.current = true
    setSaving(true)
    try {
      const reply = await createTicket({
        email: address,
        moduleName: chosenModule,
        description: description.trim(),
        attachment,
      })
      toast.success(reply?.msg || 'Your ticket has been submitted successfully.', {
        description: reply?.ticket_id ? `Ticket #${reply.ticket_id}` : undefined,
      })
      setModuleName('')
      setAttachment(null)
      setDescription('')
      setErrors({})
      onRaised?.(address)
      refreshTickets(address)
    } catch (failure) {
      toast.error(failure.message || 'Unable to raise the ticket right now.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Panel title="Create New Ticket">
      <form noValidate onSubmit={handleSubmit} className="space-y-3">
        {companyStatus === 'failed' && !activeCompany ? (
          <InlineAlert action={<RetryButton onClick={() => dispatch(fetchCompanies({ force: true }))} />}>
            {companyError || 'Could not load your companies, so there are no modules to choose from.'}
          </InlineAlert>
        ) : null}

        <FormGrid className="lg:grid-cols-3">
          <Field
            id="ticket-email"
            label="Email Address"
            type="email"
            icon={Mail}
            required
            placeholder="Enter your email"
            value={email}
            readOnly={Boolean(storedEmail)}
            inputClassName={storedEmail ? 'bg-muted text-muted-foreground' : undefined}
            error={errors.email}
            onChange={(event) => {
              setEmail(event.target.value)
              clearError('email')
            }}
          />

          <SelectField
            id="ticket-module"
            label="Module Name"
            icon={LayoutGrid}
            required
            placeholder={modulePlaceholder}
            options={moduleOptions}
            value={chosenModule}
            searchable={moduleOptions.length > 10}
            searchPlaceholder="Search modules"
            disabled={saving || moduleOptions.length === 0}
            error={errors.moduleName}
            onValueChange={(value) => {
              setModuleName(value)
              clearError('moduleName')
            }}
          />

          <FileField
            id="ticket-attachment"
            label="Upload File"
            accept={ATTACHMENT_ACCEPT}
            value={attachment}
            disabled={saving}
            error={errors.attachment}
            onChange={(file) => {
              setAttachment(file)
              setErrors((previous) => ({ ...previous, attachment: attachmentProblem(file) }))
            }}
          />

          <TextareaField
            id="ticket-description"
            label="Description"
            required
            rows={4}
            maxLength={TICKET_DESCRIPTION_MAX}
            showCount
            placeholder={`Describe the issue (max ${TICKET_DESCRIPTION_MAX} characters)...`}
            className="sm:col-span-2 lg:col-span-3"
            value={description}
            disabled={saving}
            error={errors.description}
            onChange={(event) => {
              setDescription(event.target.value.slice(0, TICKET_DESCRIPTION_MAX))
              clearError('description')
            }}
          />
        </FormGrid>

        <FormActions>
          <Button type="submit" icon={Send} loading={saving}>
            Create Ticket
          </Button>
        </FormActions>
      </form>
    </Panel>
  )
}
