import { useState } from 'react'
import { Save } from 'lucide-react'

import { InlineAlert } from '@/Components/Common/DataList'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import {
  VENDOR_PROFILE_SECTIONS,
  buildVendorProfile,
  readVendorProfile,
  sectionField,
  vendorProfileErrors,
} from '@/Modules/Procurement/vendorProfile'
import ProfileField from '@/Modules/VendorPortal/Components/ProfileField'
import { saveVendorProfile } from '@/Services/Procurement/vendorPortalService'

/**
 * The vendor's own profile, to edit - the old portal's profile form, one card
 * per section of VENDOR_PROFILE_SECTIONS, filled with what the bid lists carry
 * for this vendor (`Profile`, read by readVendorProfile). Keys the form does
 * not know are kept in the values as they came, and sent back with them.
 *
 * Save Profile sends buildVendorProfile's values with saveVendorProfile
 * (inventory/vendor_create/, action profile_save, by the vendor's email and
 * `vendor.id` - the id of the same record the form was filled from). The
 * profile has no read call of its own, so `onSaved` reloads the bid lists -
 * they carry the saved profile - and the view shows it from there.
 *
 * A rule only speaks about a value that is filled in; its message shows once
 * Save has been pressed, and then follows the typing.
 */
export default function VendorProfileForm({ vendor, email, onClose, onSaved }) {
  const [form, setForm] = useState(() => readVendorProfile(vendor))
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const errors = tried ? vendorProfileErrors(form) : {}
  const errorCount = Object.keys(errors).length

  const setSection = (section, fieldKey, value) =>
    setForm((previous) => ({
      ...previous,
      [section.key]: section.flat ? value : { ...previous[section.key], [fieldKey]: value },
    }))

  const handleSave = async () => {
    setTried(true)
    if (Object.keys(vendorProfileErrors(form)).length > 0) return
    setSaving(true)
    try {
      const reply = await saveVendorProfile({ email, vendorId: vendor?.id, profile: buildVendorProfile(form) })
      toast.success(reply?.msg || 'Profile saved.')
      await onSaved()
    } catch (failure) {
      toast.error(failure.message || 'Profile could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={() => {
        if (!saving) onClose()
      }}
      size="xl"
      title="Edit Profile"
      description={email}
      autoFocus={false}
      closeOnBackdropClick={false}
      footer={
        <>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" icon={Save} loading={saving} onClick={handleSave}>
            Save Profile
          </Button>
        </>
      }
    >
      <form
        className="space-y-4 pr-1"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          handleSave()
        }}
      >
        {errorCount > 0 ? (
          <InlineAlert>
            {errorCount === 1 ? '1 field needs' : `${errorCount} fields need`} a fix before the profile can be saved.
          </InlineAlert>
        ) : null}

        {VENDOR_PROFILE_SECTIONS.map((section) => (
          <fieldset key={section.key} className="rounded-lg border border-border bg-card" disabled={saving}>
            <legend className="sr-only">{section.title}</legend>
            <h3 className="border-b border-border px-4 py-2.5 text-sm font-semibold text-brand" aria-hidden>
              {section.title}
            </h3>
            <div className="p-4">
              {section.flat ? (
                <ProfileField
                  id={`profile-${section.key}`}
                  field={sectionField(section)}
                  value={form[section.key]}
                  path={[section.key]}
                  errors={errors}
                  disabled={saving}
                  onChange={(value) => setSection(section, null, value)}
                />
              ) : (
                <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.fields.map((field) => (
                    <ProfileField
                      key={field.key}
                      id={`profile-${section.key}-${field.key}`}
                      field={field}
                      value={form[section.key]?.[field.key]}
                      path={[section.key, field.key]}
                      errors={errors}
                      disabled={saving}
                      onChange={(value) => setSection(section, field.key, value)}
                    />
                  ))}
                </div>
              )}
            </div>
          </fieldset>
        ))}
      </form>
    </Modal>
  )
}
