import { Field, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { ADDRESS_MAX_LENGTH } from '@/Constants/salesInvoice'
import { InvoiceGrid } from '@/Modules/SalesInvoice/Components/InvoiceGrid'
import {
  INDIAN_STATE_OPTIONS,
  stateCodeOf,
  withCurrentOption,
} from '@/Modules/SalesInvoice/salesInvoiceForm'

/**
 * The six fields of the Dispatched From and Shipping To cards - Company
 * Name, GSTN and State on one row; State Code, Pincode (both narrow) and the
 * Shipping Address (the rest of the row, last) on the next - in one layout,
 * so the two cards cannot drift apart.
 *
 *   prefix     'dispatch' | 'shipping' - the ids, and the error keys
 *              ('dispatch.gstin', ...)
 *   value      what the card holds (effectiveDispatch / effectiveShipping)
 *   locked     "Same as ..." is ticked: every field shows the source and
 *              cannot be edited
 *   required   the fields the company's e-invoice / e-way bill settings make
 *              required (portalRequiredFields) - marked with the asterisk
 *   errorKeyOf(field)   where a field's error lives - while locked, on the
 *              source card ('seller.state'), since that is where it is fixed
 *   errors, onChange(field, value), disabled
 *
 * State Code is not a field of the form: it is read from the state chosen,
 * so it can never disagree with it.
 */
export default function PartyAddressFields({ prefix, value, locked, required, errors, errorKeyOf, onChange, disabled }) {
  const needs = (field) => Boolean(required?.has(field))
  const off = disabled || locked
  const errorOf = (field) => errors[errorKeyOf(field)]
  const id = (field) => `${prefix}-${field}`

  return (
    <div className="space-y-2">
      <InvoiceGrid>
        <Field
          id={id('name')}
          required={needs('name')}
          label="Company Name"
          value={value.name}
          error={errorOf('name')}
          disabled={off}
          onChange={(event) => onChange('name', event.target.value)}
        />

        <Field
          id={id('gstin')}
          required={needs('gstin')}
          label="GSTN"
          maxLength={15}
          inputClassName="uppercase"
          value={value.gstin}
          error={errorOf('gstin')}
          disabled={off}
          onChange={(event) => onChange('gstin', event.target.value.toUpperCase())}
        />

        <SelectField
          id={id('state')}
          required={needs('state')}
          label="State"
          searchable
          searchPlaceholder="Search state"
          placeholder="Select State"
          options={withCurrentOption(INDIAN_STATE_OPTIONS, value.state)}
          value={value.state}
          error={errorOf('state')}
          disabled={off}
          onValueChange={(next) => onChange('state', next)}
        />
      </InvoiceGrid>

      {/* State Code and Pincode take only what their few digits need; the
          address has the rest of the row, last. Too narrow for all three,
          the address wraps onto a row of its own. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <Field
          id={id('state-code')}
          label="State Code"
          className="w-20 shrink-0"
          readOnly
          disabled
          value={stateCodeOf(value.state)}
          placeholder="--"
        />
        <Field
          id={id('pincode')}
          required={needs('pincode')}
          label="Pincode"
          className="w-28 shrink-0"
          inputMode="numeric"
          maxLength={6}
          value={value.pincode}
          error={errorOf('pincode')}
          disabled={off}
          onChange={(event) => onChange('pincode', event.target.value.replace(/\D/g, ''))}
        />
        <TextareaField
          id={id('address')}
          required={needs('address')}
          label="Shipping Address"
          rows={1}
          className="min-w-0 [flex:1_1_16rem]"
          maxLength={ADDRESS_MAX_LENGTH}
          showCount
          value={value.address}
          error={errorOf('address')}
          disabled={off}
          onChange={(event) => onChange('address', event.target.value)}
        />
      </div>
    </div>
  )
}
