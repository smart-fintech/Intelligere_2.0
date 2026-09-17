import { useEffect, useState } from 'react'
import { Check, Copy, Download, Pencil, X } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'

import { Loader } from '@/Components/Common/Loader'
import { PlainHead } from '@/Components/Common/TableTools'
import { Button } from '@/Components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/Components/ui/card'
import { Input } from '@/Components/ui/input'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/Components/ui/table'
import { toast } from '@/Library/toast'
import {
  fetchProfile,
  // selectIsMsme,
  // selectOthersDetails,
  selectPaymentDetails,
  selectProfile,
  selectProfileDetails,
  selectProfileError,
  selectProfileStatus,
  selectSavingField,
  updateProfileField,
} from '@/Store/Slices/profileSlice'
import {
  buildReferralLink,
  // fetchReferrals,
  selectReferralError,
  selectReferrals,
  selectReferralStatus,
} from '@/Store/Slices/referralSlice'
import { formatDate } from '@/Utils/date'
import { api } from '@/Services/authService'
import { downloadFileFromUrl } from '@/Utils/fileDownload'

function ProfileFieldItem({
  item,
  isEditing,
  isSaving,
  draft,
  onDraftChange,
  onStartEdit,
  onSave,
  onCancel,
}) {
  if (!item) return null

  const hasValue =
    item.raw !== null &&
    item.raw !== undefined &&
    String(item.raw).trim() !== ''

  return (
    <div className="flex min-h-[44px] items-center justify-between border-b border-border/50 py-2.5">
      <span className="w-2/5 text-sm font-semibold text-brand">
        {item.label}
      </span>

      <div className="flex flex-1 items-center justify-between pl-2">
        {isEditing ? (
          <div className="flex w-full items-center gap-2">
            <Input
              value={draft}
              autoFocus
              disabled={isSaving}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave()
                if (e.key === 'Escape') onCancel()
              }}
              className="h-8 max-w-[200px]"
            />
            <div className="flex items-center gap-1">
              {/* Save is the row's action and Cancel backs out - the same two
                  looks as everywhere else, at icon size. The tick becomes a
                  spinner while the change is on its way to the server, so
                  the row itself says it is saving. */}
              <Button
                type="button"
                size="icon-sm"
                tooltip="Save"
                aria-label={`Save ${item.label}`}
                icon={Check}
                loading={isSaving}
                onClick={onSave}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                tooltip="Cancel"
                aria-label="Cancel"
                icon={X}
                disabled={isSaving}
                onClick={onCancel}
              />
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {hasValue ? item.display : ''}
            </span>

            {item.editable && (
              <Button
                type="button"
                variant='iconEdit'
                size="icon-sm"
                tooltip="Edit"
                aria-label={`Edit ${item.label}`}
                icon={Pencil}
                onClick={onStartEdit}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function YesNo({ value }) {
  return (
    <span
      className={
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ' +
        (value ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground')
      }
    >
      {value ? 'Yes' : 'No'}
    </span>
  )
}

export default function Profile() {
  const dispatch = useDispatch()

  const profile = useSelector(selectProfile)
  const status = useSelector(selectProfileStatus)
  const error = useSelector(selectProfileError)
  const savingField = useSelector(selectSavingField)

  const details = useSelector(selectProfileDetails) || {}
  const payment = useSelector(selectPaymentDetails) || {}
  // const permissions = useSelector(selectOthersDetails) || {}
  // const isMsme = useSelector(selectIsMsme)

  const referrals = useSelector(selectReferrals)
  const referralStatus = useSelector(selectReferralStatus)
  const referralError = useSelector(selectReferralError)

  const [editingField, setEditingField] = useState(null)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)

  // Both thunks decide for themselves whether a request is actually needed
  // - already loading, or already loaded, and they do not run (see their
  // `condition` in profileSlice). So these two effects only have to say
  // what this page needs, and the shell having loaded the profile already
  // costs nothing here.
  useEffect(() => {
    dispatch(fetchProfile())
  }, [dispatch])

  // Referrals are an MSME feature, and `isMsme` is only known once the
  // profile has arrived - which is why this waits for it rather than
  // asking on mount.
  // useEffect(() => {
  //   if (isMsme) dispatch(fetchReferrals())
  // }, [isMsme, dispatch])

  const startEdit = (row) => {
    setEditingField(row.field)
    setDraft(row.raw === null || row.raw === undefined ? '' : String(row.raw))
  }

  const cancelEdit = () => {
    setEditingField(null)
    setDraft('')
  }

  const saveEdit = async (row) => {
    const value = draft.trim()
    if (value === String(row.raw ?? '')) {
      cancelEdit()
      return
    }

    try {
      await dispatch(
        updateProfileField({ field: row.field, value, section: row.section || 'profile_details' }),
      ).unwrap()
      toast.success(`${row.label} updated.`)
      cancelEdit()
    } catch (msg) {
      toast.error(msg || 'Could not save the change.')
    }
  }

  const copyReferralLink = async () => {
    const link = buildReferralLink()
    if (!link) {
      toast.error('No referral code is available for this account.')
      return
    }

    try {
      await navigator.clipboard.writeText(link)
    } catch {
      const textField = document.createElement('textarea')
      textField.value = link
      document.body.appendChild(textField)
      textField.select()
      document.execCommand('copy')
      textField.remove()
    }

    setCopied(true)
    toast.success('Referral link copied.')
    setTimeout(() => setCopied(false), 2000)
  }

  if (status === 'loading') {
    return <Loader variant="page" label="Loading your profile..." />
  }

  if (status === 'failed') {
    return <p className="p-6 text-sm text-destructive">{error}</p>
  }

  if (!profile) {
    return <p className="p-6 text-sm text-muted-foreground">No profile to show.</p>
  }

  // Check whether payment has been completed
  const isPaymentDone = Boolean(payment?.payment_date || payment?.is_paid)

  // Master definition of fields
  const allFieldDefinitions = [
    { label: 'Name', field: 'name', raw: details.name, display: details.name },
    { label: 'Mobile', field: 'mobile', raw: details.mobile, display: details.mobile, editable: true },
    { label: 'Email', field: 'email', raw: details?.email, display: details?.email },
    { label: 'State', field: 'state', raw: details.state, display: details.state },
    { label: 'Tally category', field: 'tally_category', raw: details.tally_category, display: details.tally_category },
    { label: 'Company package', field: 'company_package', raw: details.company_package, display: details.company_package },
    { label: 'GST No.', field: 'gstnumber', raw: details.gstnumber, display: details.gstnumber, editable: true },
    { label: 'Bill To Name', field: 'bill_to_name', raw: details.bill_to_name, display: details.bill_to_name, editable: true },
    // Payment date & Renew date only exist and show if payment is done
    ...(isPaymentDone
      ? [
        {
          label: 'Payment date',
          field: 'payment_date',
          raw: payment.payment_date,
          display: formatDate(payment.payment_date),
        },
        {
          label: 'Renew date',
          field: 'renew_date',
          raw: payment.renew_date || payment.free_trial_date,
          display: formatDate(payment.renew_date || payment.free_trial_date),
        },
      ]
      : [
        {
          label: 'Free Trial Date',
          field: 'free_trial_date',
          raw: payment.free_trial_date,
          display: formatDate(payment.free_trial_date)
        }]),
    { label: 'Registration Date', field: 'created_at', raw: profile?.created_at, display: formatDate(profile?.created_at) },
    { label: 'User Type', field: 'user_type', raw: details.user_type, display: details.user_type },
    { label: 'ERP', field: 'erp', raw: details.erp, display: details.erp },
    { label: 'Address', field: 'address', raw: details.address, display: details.address, editable: true },
    // { label: 'User ID', field: 'id', raw: profile?.id, display: profile?.id },
    // { label: 'Role', field: 'role', raw: profile?.role, display: profile?.role },
    // { label: 'Platform', field: 'platform', raw: details.platform, display: details.platform },
    // { label: 'Verified', field: 'is_verified', raw: profile?.is_verified, display: <YesNo value={profile?.is_verified} /> },
    // { label: 'Can Edit', field: 'is_edit', raw: permissions.is_edit, display: <YesNo value={permissions.is_edit} /> },
    // { label: 'Can View', field: 'is_view', raw: permissions.is_view, display: <YesNo value={permissions.is_view} /> },
  ]

  // Filter: Show field if it has valid data OR if it is editable (so user can click the pencil to fill it)
  const visibleFields = allFieldDefinitions.filter((item) => {
    const hasData =
      item.raw !== null &&
      item.raw !== undefined &&
      String(item.raw).trim() !== ''
    return hasData || item.editable
  })

  // Split items evenly across two columns
  const half = Math.ceil(visibleFields.length / 2)
  const leftColumnRows = visibleFields.slice(0, half)
  const rightColumnRows = visibleFields.slice(half)
  const maxRows = Math.max(leftColumnRows.length, rightColumnRows.length)
  // Activity log download
  const downloadActivityLog = async (event, defaultFileName = 'activity_module.log') => {
    if (event?.preventDefault) {
      event.preventDefault()
    }

    try {
      const response = await api.get('mail/ModuleLogFileUrlsAPIView/', {})
      const dataObj = response?.data?.data
      let filePath = null

      if (dataObj && typeof dataObj === 'object') {
        const values = Object.values(dataObj)
        filePath = values.length > 0 ? values[0] : null
      }

      if (!filePath) {
        throw new Error(response?.data?.msg || 'Log file path not found.')
      }

      await downloadFileFromUrl(filePath, defaultFileName)

      const successMsg =
        response?.data?.msg || 'Activity log downloaded successfully.'
      toast.success(successMsg)

      return {
        success: true,
        message: successMsg,
        filePath,
      }
    } catch (error) {
      // Extract message from axios response payload or raw Error instance
      const errorMsg =
        error?.response?.data?.msg ||
        error?.data?.msg ||
        error?.message ||
        'Failed to download activity log.'

      toast.error(errorMsg)

      return {
        success: false,
        message: errorMsg,
        error,
      }
    }
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Card className="overflow-hidden gap-0 border-border/70 shadow-sm">
        <CardHeader className="gap-0  py-3 text-center  border-b mx-[40px]">
          <CardTitle className="text-lg font-bold text-primary">
            User Profile
          </CardTitle>
        </CardHeader>

        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-x-12 sm:grid-cols-2 w-full">
            {/* Left Column */}
            <div>
              {Array.from({ length: maxRows }).map((_, idx) => {
                const item = leftColumnRows[idx]
                if (!item) return null
                return (
                  <ProfileFieldItem
                    key={item.field || idx}
                    item={item}
                    isEditing={editingField === item.field}
                    isSaving={savingField === item.field}
                    draft={draft}
                    onDraftChange={setDraft}
                    onStartEdit={() => startEdit(item)}
                    onSave={() => saveEdit(item)}
                    onCancel={cancelEdit}
                  />
                )
              })}
            </div>

            {/* Right Column */}
            <div>
              {Array.from({ length: maxRows }).map((_, idx) => {
                const item = rightColumnRows[idx]
                if (!item) return null
                return (
                  <ProfileFieldItem
                    key={item.field || idx}
                    item={item}
                    isEditing={editingField === item.field}
                    isSaving={savingField === item.field}
                    draft={draft}
                    onDraftChange={setDraft}
                    onStartEdit={() => startEdit(item)}
                    onSave={() => saveEdit(item)}
                    onCancel={cancelEdit}
                  />
                )
              })}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              variant="default"
              size="sm"
              icon={Download}
              onClick={(e) => downloadActivityLog(e)}
            >
              Activity Log
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Referrals Section (MSME only) */}
      {/* {isMsme && ( */}
      <Card className="gap-0 border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="text-base font-semibold text-brand">
            Referrals
          </CardTitle>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={copied ? Check : Copy}
            onClick={copyReferralLink}
          >
            {copied ? 'Copied!' : 'Copy referral link'}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {referralStatus === 'loading' ? (
            <Loader variant="section" label="Loading referrals..." />
          ) : referralStatus === 'failed' ? (
            <p className="px-6 py-4 text-sm text-destructive">{referralError}</p>
          ) : referrals.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">
              Nobody has signed up with your link yet. Share it to get started.
            </p>
          ) : (
            // The same table pieces and header lettering as the dashboard
            // lists. Table scrolls sideways on its own on a narrow screen.
            <Table>
              <TableHeader className="bg-muted">
                <TableRow className="hover:bg-transparent">
                  <PlainHead className="pl-6">Referred to</PlainHead>
                  <PlainHead>Joined</PlainHead>
                  <PlainHead>Paid</PlainHead>
                  <PlainHead className="pr-6">Paid on</PlainHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((referral) => (
                  <TableRow key={referral.id} className="border-border/60">
                    <TableCell className="pl-6">{referral.Referred_to}</TableCell>
                    <TableCell>{formatDate(referral.created_at)}</TableCell>
                    <TableCell><YesNo value={referral.is_paid} /></TableCell>
                    <TableCell className="pr-6">{formatDate(referral.payment_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {/* )} */}
    </div>
  )
}