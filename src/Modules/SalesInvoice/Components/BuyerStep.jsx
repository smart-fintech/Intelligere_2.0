import { useMemo } from 'react'
import { Globe, Mail, Phone } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { CheckboxField, Field, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { InvoiceCard, InvoiceGrid, WIDE_FIELD } from '@/Modules/SalesInvoice/Components/InvoiceGrid'
import { ADDRESS_MAX_LENGTH } from '@/Constants/salesInvoice'
import PartyAddressFields from '@/Modules/SalesInvoice/Components/PartyAddressFields'
import {
  INDIAN_STATE_OPTIONS,
  buyerFromLedger,
  effectiveShipping,
  portalRequiredFields,
  textOf,
  withCurrentOption,
} from '@/Modules/SalesInvoice/salesInvoiceForm'
import { DEFAULT_COUNTRY, getCountries, getStates } from '@/Services/locationService'

/**
 * Step 2 - Buyer Details, and Shipping To under it.
 *
 * The buyer is one of the company's ledgers (tally/create-ledger/, read from
 * the store - see ledgerSlice). Choosing one fills in every buyer field from
 * it and replaces whatever the previous buyer left; each field can still be
 * edited after; on Next, what changed is saved back to that ledger (see
 * saveStep in SalesInvoiceWorkspace).
 *
 * Country and State come from tally/country_list/ (locationSlice), the same
 * list the Ledger Form uses: the states offered are the chosen country's.
 *
 *   ledgers         { options, byId, status, error, retry }
 *   countries       { data, status } - the raw country list from the store
 */
export default function BuyerStep({ invoice, ledgers, countries, disabled }) {
  const { form, errors, setField, setFields, setSameAs } = invoice
  const buyer = form.buyer

  const countryNames = useMemo(() => getCountries(countries.data), [countries.data])
  const stateNamesOf = (country) => getStates(countries.data, country)
  const countriesLoading = countries.status === 'idle' || countries.status === 'loading'

  /* The states of the chosen country. If the list has none for India (still
     loading, or it failed) the GST list of states stands in, so the field
     that decides the tax is never left without options. */
  const stateOptions = useMemo(() => {
    const names = getStates(countries.data, buyer.country)
    const options =
      names.length > 0
        ? names.map((name) => ({ value: name, label: name }))
        : textOf(buyer.country).toLowerCase() === DEFAULT_COUNTRY.toLowerCase()
          ? INDIAN_STATE_OPTIONS
          : []
    return withCurrentOption(options, buyer.state)
  }, [countries.data, buyer.country, buyer.state])

  /* Radix can report '' on its own (see CodeSelector) - that is never a choice,
     and acting on it would wipe the buyer, so it is ignored. */
  const selectLedger = (ledgerId) => {
    if (!ledgerId || ledgerId === buyer.ledgerId) return
    setFields('buyer', buyerFromLedger(ledgers.byId.get(ledgerId), ledgerId, { countryNames, stateNamesOf }))
  }

  /** A new country's states are not the old one's - a state it does not have goes. */
  const changeCountry = (country) => {
    if (!country || country === buyer.country) return
    const names = stateNamesOf(country)
    const keep = names.some((name) => name.toLowerCase() === textOf(buyer.state).toLowerCase())
    setFields('buyer', { country, state: keep ? buyer.state : '' })
  }

  const onText = (field, transform = (value) => value) => (event) => setField(`buyer.${field}`, transform(event.target.value))

  const ledgerPlaceholder =
    ledgers.status === 'loading' || ledgers.status === 'idle'
      ? 'Loading ledgers...'
      : ledgers.options.length === 0
        ? 'No ledgers yet - add one in Ledger Details'
        : 'Select Buyer Company'

  return (
    <div className="space-y-3">
      <InvoiceCard title="Buyer Details">
        {ledgers.status === 'failed' ? (
          <InlineAlert action={<RetryButton onClick={ledgers.retry} />}>
            {ledgers.error || 'The ledgers could not be loaded.'}
          </InlineAlert>
        ) : null}

        <InvoiceGrid>
          <SelectField
            id="buyer-ledger"
            label="Buyer Company"
            required
            searchable
            searchPlaceholder="Search ledger"
            placeholder={ledgerPlaceholder}
            options={ledgers.options}
            value={buyer.ledgerId}
            error={errors['buyer.ledgerId']}
            disabled={disabled || ledgers.options.length === 0}
            onValueChange={selectLedger}
          />

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
            id="buyer-country"
            label="Buyer Country"
            required
            searchable
            searchPlaceholder="Search country"
            placeholder={countriesLoading ? 'Loading...' : 'Select Country'}
            options={withCurrentOption(
              countryNames.map((name) => ({ value: name, label: name })),
              buyer.country,
            )}
            value={buyer.country}
            error={errors['buyer.country']}
            disabled={disabled}
            onValueChange={changeCountry}
          />

          <SelectField
            id="buyer-state"
            label="Buyer State"
            searchable
            searchPlaceholder="Search state"
            placeholder={!buyer.country ? 'Select a country first' : 'Select State'}
            options={stateOptions}
            value={buyer.state}
            error={errors['buyer.state']}
            disabled={disabled || stateOptions.length === 0}
            onValueChange={(value) => setField('buyer.state', value)}
          />

          <Field
            id="buyer-pincode"
            label="Pincode"
            inputMode="numeric"
            maxLength={10}
            value={buyer.pincode}
            error={errors['buyer.pincode']}
            disabled={disabled}
            onChange={onText('pincode', (value) => value.replace(/\D/g, ''))}
          />

          <Field
            id="buyer-gstin"
            label="Buyer GSTIN"
            maxLength={15}
            inputClassName="uppercase"
            value={buyer.gstin}
            error={errors['buyer.gstin']}
            disabled={disabled}
            onChange={onText('gstin', (value) => value.toUpperCase())}
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
          required={portalRequiredFields(form.settings, 'shipping')}
          errors={errors}
          errorKeyOf={(field) => (form.shippingSameAsBuyer ? `buyer.${field}` : `shipping.${field}`)}
          disabled={disabled}
          onChange={(field, value) => setField(`shipping.${field}`, value)}
        />
      </InvoiceCard>
    </div>
  )
}
