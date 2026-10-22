import { Globe, Mail, Phone } from 'lucide-react'

import { CheckboxField, Field, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { ADDRESS_MAX_LENGTH } from '@/Constants/salesInvoice'
import { InvoiceCard, InvoiceGrid, WIDE_FIELD } from '@/Modules/SalesInvoice/Components/InvoiceGrid'
import PartyAddressFields from '@/Modules/SalesInvoice/Components/PartyAddressFields'
import { INDIAN_STATE_OPTIONS, effectiveShipping, stateCodeOf, withCurrentOption } from '@/Modules/SalesInvoice/salesInvoiceForm'

/**
 * Purchase Step 2 - Buyer Details (the COMPANY buying), and Shipping To under it.
 *
 * The buyer starts filled in from the company the user is working in - its
 * record from tally/user-companies-list/, read as a sale reads its seller
 * (sellerFromCompany). The company's name is shown, never edited (as on
 * Company Details, a company keeps its name); every other field can be, and
 * on Next what changed is saved back to the company (the workspace's
 * saveStep). Buyer Code is the state's GST code - read from the state, so it
 * can never disagree with it. Shipping To is the buyer's own address while
 * "Same as Buyer Details" is ticked.
 */
export default function PurchaseBuyerStep({ invoice, disabled }) {
  const { form, errors, setField, setSameAs } = invoice
  const buyer = form.buyer
  const set = (field) => (value) => setField(`buyer.${field}`, value)
  const onText = (field, transform = (value) => value) => (event) => set(field)(transform(event.target.value))

  return (
    <div className="space-y-3">
      <InvoiceCard title="Buyer Details">
        <InvoiceGrid>
          <Field id="buyer-name" label="Buyer Name" required readOnly disabled value={buyer.name} error={errors['buyer.name']} />

          <Field
            id="buyer-phone"
            label="Buyer Phone"
            type="tel"
            icon={Phone}
            inputMode="numeric"
            maxLength={10}
            value={buyer.phone}
            error={errors['buyer.phone']}
            disabled={disabled}
            onChange={onText('phone', (value) => value.replace(/\D/g, ''))}
          />

          <Field
            id="buyer-email"
            label="Buyer Email"
            type="email"
            icon={Mail}
            value={buyer.email}
            error={errors['buyer.email']}
            disabled={disabled}
            onChange={onText('email')}
          />

          <Field
            id="buyer-website"
            label="Buyer Website"
            icon={Globe}
            placeholder="example.com"
            value={buyer.website}
            error={errors['buyer.website']}
            disabled={disabled}
            onChange={onText('website')}
          />

          <SelectField
            id="buyer-state"
            label="Buyer State"
            required
            searchable
            searchPlaceholder="Search state"
            placeholder="Select State"
            options={withCurrentOption(INDIAN_STATE_OPTIONS, buyer.state)}
            value={buyer.state}
            error={errors['buyer.state']}
            disabled={disabled}
            onValueChange={set('state')}
          />

          <Field id="buyer-state-code" label="Buyer Code" readOnly disabled value={stateCodeOf(buyer.state)} placeholder="--" />

          <Field
            id="buyer-pincode"
            label="Pincode"
            inputMode="numeric"
            maxLength={6}
            value={buyer.pincode}
            error={errors['buyer.pincode']}
            disabled={disabled}
            onChange={onText('pincode', (value) => value.replace(/\D/g, ''))}
          />

          <Field
            id="buyer-gstin"
            label="Buyer GSTN"
            maxLength={15}
            inputClassName="uppercase"
            value={buyer.gstin}
            error={errors['buyer.gstin']}
            disabled={disabled}
            onChange={onText('gstin', (value) => value.toUpperCase())}
          />

          <Field
            id="buyer-pan"
            label="Buyer PAN Number"
            maxLength={10}
            inputClassName="uppercase"
            value={buyer.pan}
            error={errors['buyer.pan']}
            disabled={disabled}
            onChange={onText('pan', (value) => value.toUpperCase())}
          />

          <TextareaField
            id="buyer-address"
            label="Buyer Address"
            rows={2}
            className={WIDE_FIELD}
            maxLength={ADDRESS_MAX_LENGTH}
            showCount
            value={buyer.address}
            error={errors['buyer.address']}
            disabled={disabled}
            onChange={onText('address')}
          />
        </InvoiceGrid>
      </InvoiceCard>

      <InvoiceCard
        title="Shipping To"
        actions={
          <CheckboxField
            id="shipping-same-as-buyer"
            label="Same as Buyer Details"
            checked={form.shippingSameAsBuyer}
            disabled={disabled}
            onCheckedChange={(checked) => setSameAs('shipping', checked)}
          />
        }
      >
        <PartyAddressFields
          prefix="shipping"
          value={effectiveShipping(form)}
          locked={form.shippingSameAsBuyer}
          errors={errors}
          errorKeyOf={(field) => (form.shippingSameAsBuyer ? `buyer.${field}` : `shipping.${field}`)}
          disabled={disabled}
          onChange={(field, value) => setField(`shipping.${field}`, value)}
        />
      </InvoiceCard>
    </div>
  )
}
