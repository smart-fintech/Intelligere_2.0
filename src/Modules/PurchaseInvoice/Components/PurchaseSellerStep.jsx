import { useMemo } from 'react'
import { Globe, Mail, Phone } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { CheckboxField, Field, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { ADDRESS_MAX_LENGTH } from '@/Constants/salesInvoice'
import { InvoiceCard, InvoiceGrid, WIDE_FIELD } from '@/Modules/SalesInvoice/Components/InvoiceGrid'
import PartyAddressFields from '@/Modules/SalesInvoice/Components/PartyAddressFields'
import {
  INDIAN_STATE_OPTIONS,
  buyerFromLedger,
  effectiveDispatch,
  textOf,
  withCurrentOption,
} from '@/Modules/SalesInvoice/salesInvoiceForm'
import { DEFAULT_COUNTRY, getCountries, getStates } from '@/Services/locationService'

/**
 * Purchase Step 1 - Seller Details (the SUPPLIER), and Dispatched From under it.
 *
 * Nothing is filled in to start with. The supplier is one of the company's
 * ledgers (tally/create-ledger/, the same list a sale's buyer is chosen
 * from): choosing one fills in every field from what that ledger holds - a
 * value it does not hold stays empty - and replaces whatever the previous
 * choice left. Each field can still be edited; on Next, what changed is saved
 * back to that ledger (the workspace's saveStep).
 *
 * Seller Company, Address, State and GSTN are required (validatePurchase).
 *
 *   ledgers     { options, byId, status, error, retry }
 *   countries   { data, status } - tally/country_list/, as the Ledger Form reads it
 */
export default function PurchaseSellerStep({ invoice, ledgers, countries, disabled }) {
  const { form, errors, setField, setFields, setSameAs } = invoice
  const seller = form.seller

  const countryNames = useMemo(() => getCountries(countries.data), [countries.data])
  const stateNamesOf = (country) => getStates(countries.data, country)
  const countriesLoading = countries.status === 'idle' || countries.status === 'loading'

  // The chosen country's states - for India the GST list while the country list is not in.
  const stateOptions = useMemo(() => {
    const names = getStates(countries.data, seller.country)
    const options =
      names.length > 0
        ? names.map((name) => ({ value: name, label: name }))
        : textOf(seller.country).toLowerCase() === DEFAULT_COUNTRY.toLowerCase()
          ? INDIAN_STATE_OPTIONS
          : []
    return withCurrentOption(options, seller.state)
  }, [countries.data, seller.country, seller.state])

  // Radix can report '' on its own - never a choice, and acting on it would wipe the seller.
  const selectLedger = (ledgerId) => {
    if (!ledgerId || ledgerId === seller.ledgerId) return
    setFields('seller', buyerFromLedger(ledgers.byId.get(ledgerId), ledgerId, { countryNames, stateNamesOf }))
  }

  /** A new country's states are not the old one's - a state it does not have goes. */
  const changeCountry = (country) => {
    if (!country || country === seller.country) return
    const keep = stateNamesOf(country).some((name) => name.toLowerCase() === textOf(seller.state).toLowerCase())
    setFields('seller', { country, state: keep ? seller.state : '' })
  }

  const onText = (field, transform = (value) => value) => (event) => setField(`seller.${field}`, transform(event.target.value))

  const ledgerPlaceholder =
    ledgers.status === 'loading' || ledgers.status === 'idle'
      ? 'Loading ledgers...'
      : ledgers.options.length === 0
        ? 'No ledgers yet - add one in Ledger Details'
        : 'Select Seller Company'

  return (
    <div className="space-y-3">
      <InvoiceCard title="Seller Details">
        {ledgers.status === 'failed' ? (
          <InlineAlert action={<RetryButton onClick={ledgers.retry} />}>
            {ledgers.error || 'The ledgers could not be loaded.'}
          </InlineAlert>
        ) : null}

        <InvoiceGrid>
          <SelectField
            id="seller-ledger"
            label="Seller Company"
            required
            searchable
            searchPlaceholder="Search ledger"
            placeholder={ledgerPlaceholder}
            options={ledgers.options}
            value={seller.ledgerId}
            error={errors['seller.ledgerId']}
            disabled={disabled || ledgers.options.length === 0}
            onValueChange={selectLedger}
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
            id="seller-country"
            label="Seller Country"
            required
            searchable
            searchPlaceholder="Search country"
            placeholder={countriesLoading ? 'Loading...' : 'Select Country'}
            options={withCurrentOption(
              countryNames.map((name) => ({ value: name, label: name })),
              seller.country,
            )}
            value={seller.country}
            error={errors['seller.country']}
            disabled={disabled}
            onValueChange={changeCountry}
          />

          <SelectField
            id="seller-state"
            label="Seller State"
            required
            searchable
            searchPlaceholder="Search state"
            placeholder={!seller.country ? 'Select a country first' : 'Select State'}
            options={stateOptions}
            value={seller.state}
            error={errors['seller.state']}
            disabled={disabled || stateOptions.length === 0}
            onValueChange={(value) => setField('seller.state', value)}
          />

          <Field
            id="seller-pincode"
            label="Pincode"
            inputMode="numeric"
            maxLength={10}
            value={seller.pincode}
            error={errors['seller.pincode']}
            disabled={disabled}
            onChange={onText('pincode', (value) => value.replace(/\D/g, ''))}
          />

          <Field
            id="seller-gstin"
            label="Seller GSTN"
            required
            maxLength={15}
            inputClassName="uppercase"
            value={seller.gstin}
            error={errors['seller.gstin']}
            disabled={disabled}
            onChange={onText('gstin', (value) => value.toUpperCase())}
          />

          <TextareaField
            id="seller-address"
            label="Seller Address"
            required
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
          errors={errors}
          errorKeyOf={(field) => (form.dispatchSameAsSeller ? `seller.${field}` : `dispatch.${field}`)}
          disabled={disabled}
          onChange={(field, value) => setField(`dispatch.${field}`, value)}
        />
      </InvoiceCard>
    </div>
  )
}
