import { Copy, Globe, Mail, Phone } from 'lucide-react'

import {
  CheckboxField,
  Field,
  FileField,
  SelectField,
  TextareaField,
  fieldLabelClass,
} from '@/Components/Common/FormFields'
import { ADDRESS_MAX_LENGTH } from '@/Constants/salesInvoice'
import { toast } from '@/Library/toast'
import { InvoiceCard, InvoiceGrid, WIDE_FIELD } from '@/Modules/SalesInvoice/Components/InvoiceGrid'
import PartyAddressFields from '@/Modules/SalesInvoice/Components/PartyAddressFields'
import {
  INDIAN_STATE_OPTIONS,
  effectiveDispatch,
  portalRequiredFields,
  stateCodeOf,
  withCurrentOption,
} from '@/Modules/SalesInvoice/salesInvoiceForm'

/**
 * Step 1 - Seller Details, and Dispatched From under it.
 *
 * The seller starts filled in from the company the user is working in (see
 * createInvoiceForm). The five settings at the foot of the card start where
 * the company is: e-invoice and e-way bill decide what has to be filled in
 * before saving (see checkPortalRequirements).
 */

/** The seller's invoice settings, in the order they are listed. */
const SELLER_SETTINGS = [
  { key: 'eWayBill', label: 'E-Way Bill' },
  { key: 'eInvoice', label: 'E-Invoice' },
  { key: 'reverseCharge', label: 'Reverse Charge Applicable' },
  { key: 'voucherQr', label: 'Show Voucher QR Code' },
  { key: 'roundOff', label: 'Show Round Off' },
]

/** Copies a value and says so - the Pincode's copy button. */
const copyText = async (value, what) => {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${what} copied`)
  } catch {
    toast.error(`Could not copy the ${what.toLowerCase()}`)
  }
}

export default function SellerStep({ invoice, disabled }) {
  const { form, errors, setField, setSameAs } = invoice
  const seller = form.seller
  const set = (field) => (value) => setField(`seller.${field}`, value)
  const onText = (field, transform = (value) => value) => (event) => set(field)(transform(event.target.value))

  return (
    <div className="space-y-3">
      <InvoiceCard title="Seller Details">
        <InvoiceGrid>
          {/* The company's own name, from the company record - shown, never
              edited (as on Company Details, a company keeps its name). */}
          <Field
            id="seller-name"
            label="Seller Name"
            required
            readOnly
            disabled
            value={seller.name}
            error={errors['seller.name']}
          />

          <Field
            id="seller-phone"
            label="Seller Phone"
            type="tel"
            icon={Phone}
            inputMode="numeric"
            maxLength={10}
            value={seller.phone}
            error={errors['seller.phone']}
            disabled={disabled}
            onChange={onText('phone', (value) => value.replace(/\D/g, ''))}
          />

          <Field
            id="seller-email"
            label="Seller Email"
            type="email"
            icon={Mail}
            value={seller.email}
            error={errors['seller.email']}
            disabled={disabled}
            onChange={onText('email')}
          />

          <Field
            id="seller-website"
            label="Seller Website"
            icon={Globe}
            placeholder="example.com"
            value={seller.website}
            error={errors['seller.website']}
            disabled={disabled}
            onChange={onText('website')}
          />

          <SelectField
            id="seller-state"
            label="Seller State"
            required
            searchable
            searchPlaceholder="Search state"
            placeholder="Select State"
            options={withCurrentOption(INDIAN_STATE_OPTIONS, seller.state)}
            value={seller.state}
            error={errors['seller.state']}
            disabled={disabled}
            onValueChange={set('state')}
          />

          <Field id="seller-state-code" label="State Code" readOnly disabled value={stateCodeOf(seller.state)} placeholder="--" />

          <Field
            id="seller-pincode"
            label="Pincode"
            inputMode="numeric"
            maxLength={6}
            value={seller.pincode}
            error={errors['seller.pincode']}
            disabled={disabled}
            onChange={onText('pincode', (value) => value.replace(/\D/g, ''))}
          >
            <button
              type="button"
              aria-label="Copy pincode"
              title="Copy pincode"
              disabled={!seller.pincode}
              onClick={() => copyText(seller.pincode, 'Pincode')}
              className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-md text-brand-light outline-none hover:text-brand focus-visible:text-brand disabled:cursor-default disabled:opacity-40"
            >
              <Copy className="size-4" />
            </button>
          </Field>

          <Field
            id="seller-gstin"
            label="Seller GSTIN"
            maxLength={15}
            inputClassName="uppercase"
            value={seller.gstin}
            error={errors['seller.gstin']}
            disabled={disabled}
            onChange={onText('gstin', (value) => value.toUpperCase())}
          />

          <Field
            id="seller-pan"
            label="Seller PAN Number"
            maxLength={10}
            inputClassName="uppercase"
            value={seller.pan}
            error={errors['seller.pan']}
            disabled={disabled}
            onChange={onText('pan', (value) => value.toUpperCase())}
          />

          <Field
            id="seller-udyam"
            label="Seller Udyam"
            inputClassName="uppercase"
            placeholder="UDYAM-XX-00-0000000"
            value={seller.udyam}
            disabled={disabled}
            onChange={onText('udyam', (value) => value.toUpperCase())}
          />

          <Field id="seller-category" label="Seller Category" value={seller.category} disabled={disabled} onChange={onText('category')} />

          <FileField id="seller-logo" label="Seller Logo" accept="image/*" value={seller.logo} disabled={disabled} onChange={set('logo')} />

          <FileField
            id="seller-signature"
            label="Seller Signature"
            accept="image/*"
            value={seller.signature}
            disabled={disabled}
            onChange={set('signature')}
          />

          <TextareaField
            id="seller-address"
            label="Seller Address"
            rows={2}
            className={WIDE_FIELD}
            maxLength={ADDRESS_MAX_LENGTH}
            showCount
            value={seller.address}
            error={errors['seller.address']}
            disabled={disabled}
            onChange={onText('address')}
          />
        </InvoiceGrid>

        {/* The seller's invoice settings - one wrapping row of tick boxes. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-2.5" role="group" aria-labelledby="seller-settings-label">
          <span id="seller-settings-label" className={fieldLabelClass}>
            Settings
          </span>
          {SELLER_SETTINGS.map((setting) => (
            <CheckboxField
              key={setting.key}
              id={`setting-${setting.key}`}
              label={setting.label}
              checked={form.settings[setting.key]}
              disabled={disabled}
              onCheckedChange={(checked) => setField(`settings.${setting.key}`, checked)}
            />
          ))}
        </div>
      </InvoiceCard>

      <InvoiceCard
        title="Dispatched From"
        actions={
          <CheckboxField
            id="dispatch-same-as-seller"
            label="Same as Seller Details"
            checked={form.dispatchSameAsSeller}
            disabled={disabled}
            onCheckedChange={(checked) => setSameAs('dispatch', checked)}
          />
        }
      >
        <PartyAddressFields
          prefix="dispatch"
          value={effectiveDispatch(form)}
          locked={form.dispatchSameAsSeller}
          required={portalRequiredFields(form.settings, 'dispatch')}
          errors={errors}
          errorKeyOf={(field) => (form.dispatchSameAsSeller ? `seller.${field}` : `dispatch.${field}`)}
          disabled={disabled}
          onChange={(field, value) => setField(`dispatch.${field}`, value)}
        />
      </InvoiceCard>
    </div>
  )
}
