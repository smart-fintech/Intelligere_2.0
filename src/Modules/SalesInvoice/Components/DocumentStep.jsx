import { Fragment } from 'react'
import { MapPin } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { CheckboxField, Field, FieldError, FieldLabel, FileField, SelectField } from '@/Components/Common/FormFields'
import { Input } from '@/Components/ui/input'
import {
  DELIVERY_MODES,
  INVOICE_NO_MAX_LENGTH,
  SUPPLY_OPTIONS,
  TRANSPORT_REASONS,
} from '@/Constants/salesInvoice'
import { FULL_FIELD, InvoiceCard, InvoiceGrid, WIDE_FIELD } from '@/Modules/SalesInvoice/Components/InvoiceGrid'
import { portalRequiredFields, supplyTypesOf, toDecimalInput } from '@/Modules/SalesInvoice/salesInvoiceForm'

/**
 * Step 3 - Document Details.
 *
 * Auto Increment sits in the card's heading row, beside its title. With it
 * on, the number is typed as three parts joined by "/"; off, it is one box.
 * The document type is chosen on Step 1 (DocumentTypeCard), not here.
 *
 *   banks           { options, status, error, retry } - bank_statement/
 *                   bankDetails/, read from the store (bankSlice)
 *   numbering       useDocumentNumbering(...) - { status, retry } of the
 *                   last document number for the type chosen on Step 1
 *   numberLocked    the document is already saved under this number (only
 *                   its PDF is still to go) - it can no longer change
 */

/** The invoice number as three parts with "/" between them. */
function InvoiceNumberParts({ parts, error, disabled, onChange, className }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <FieldLabel htmlFor="invoice-no-part-1" required>
        Invoice No.
      </FieldLabel>
      <div className="flex items-center gap-1.5">
        {parts.map((part, index) => (
          <Fragment key={index}>
            {index > 0 ? (
              <span aria-hidden="true" className="text-muted-foreground">
                /
              </span>
            ) : null}
            <Input
              id={`invoice-no-part-${index + 1}`}
              aria-label={`Invoice number part ${index + 1}`}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'invoice-no-parts-error' : undefined}
              value={part}
              disabled={disabled}
              onChange={(event) => onChange(parts.map((current, at) => (at === index ? event.target.value : current)))}
            />
          </Fragment>
        ))}
      </div>
      <FieldError id="invoice-no-parts-error">{error}</FieldError>
    </div>
  )
}

export default function DocumentStep({ invoice, banks, numbering, numberLocked, disabled }) {
  const { form, errors, setField, setFields } = invoice
  const document = form.document
  // E-way bill makes Distance and Delivery Mode required (portalRequiredFields).
  const portalRequired = portalRequiredFields(form.settings, 'document')
  const set = (field) => (value) => setField(`document.${field}`, value)
  const onText = (field, transform = (value) => value) => (event) => set(field)(transform(event.target.value))

  /** Text and date boxes - one line each instead of a dozen near-identical blocks. */
  const textField = (field, label, { transform, ...props } = {}) => (
    <Field
      id={`document-${field}`}
      label={label}
      value={document[field]}
      error={errors[`document.${field}`]}
      disabled={disabled}
      onChange={onText(field, transform)}
      {...props}
    />
  )
  const dateField = (field, label, props = {}) => textField(field, label, { type: 'date', ...props })

  /** A new Supply offers other Supply Types - one it does not offer is cleared. */
  const changeSupply = (supply) => {
    if (!supply || supply === document.supply) return
    const keep = supplyTypesOf(supply).some((option) => option.value === document.supplyType)
    setFields('document', { supply, supplyType: keep ? document.supplyType : '' })
  }

  const bankPlaceholder =
    banks.status === 'loading' || banks.status === 'idle'
      ? 'Loading banks...'
      : banks.options.length === 0
        ? 'No banks yet - add one in Bank Details'
        : 'Select Bank'

  return (
    <InvoiceCard
      title="Document Details"
      actions={
        <CheckboxField
          id="document-auto-increment"
          label="Auto Increment"
          checked={document.autoIncrement}
          disabled={disabled || numberLocked}
          onCheckedChange={set('autoIncrement')}
        />
      }
    >
      {/* The number is only ever filled in, never forced: while it is on its
          way, or if it could not be had, it can still be typed. */}
      {!numberLocked && numbering.status === 'loading' ? (
        <p role="status" className="mb-2 text-xs text-muted-foreground">
          Reading the last document number...
        </p>
      ) : null}
      {!numberLocked && numbering.status === 'failed' ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          The last document number could not be read - type the number, or try again.
          <RetryButton onClick={numbering.retry} />
        </div>
      ) : null}

      <InvoiceGrid>
        {document.autoIncrement ? (
          <InvoiceNumberParts
            className={WIDE_FIELD}
            parts={document.invoiceNoParts}
            error={errors['document.invoiceNoParts']}
            disabled={disabled || numberLocked}
            onChange={set('invoiceNoParts')}
          />
        ) : (
          textField('invoiceNo', 'Invoice No.', {
            required: true,
            maxLength: INVOICE_NO_MAX_LENGTH,
            disabled: disabled || numberLocked,
          })
        )}
        {dateField('invoiceDate', 'Invoice Date', { required: true })}
        {textField('termsOfPayment', 'Mode/Terms of Payment')}

        {textField('referenceNo', 'Reference No.')}
        {dateField('referenceDate', 'Reference Date')}
        {textField('poNo', 'PO No.')}

        {dateField('poDate', 'PO Date')}
        {textField('deliveryNote', 'Delivery Note')}
        {dateField('deliveryNoteDate', 'Delivery Note Date')}

        <SelectField
          id="document-transportReason"
          label="Reason for Transportation"
          placeholder="Select Reason"
          options={TRANSPORT_REASONS}
          value={document.transportReason}
          disabled={disabled}
          onValueChange={set('transportReason')}
        />
        {textField('transporter', 'Delivery Transporter')}
        {textField('transporterId', 'Transporter ID', { inputClassName: 'uppercase', transform: (value) => value.toUpperCase() })}

        {textField('freightTerms', 'Freight Terms of Payment')}
        {textField('lrNo', 'Bill of Lading/LR-RR No.')}
        {dateField('lrDate', 'LR-RR Date')}

        {textField('vehicleNo', 'Vehicle Number', {
          inputClassName: 'uppercase',
          placeholder: 'GJ01AB1234',
          transform: (value) => value.toUpperCase(),
        })}
        {/* The pin is a marker for now - working the distance out from the two
            addresses is a later phase, so it asks for nothing. */}
        {textField('distance', 'Distance (km)', {
          required: portalRequired.has('distance'),
          icon: MapPin,
          inputMode: 'decimal',
          placeholder: '0',
          transform: toDecimalInput,
        })}
        <SelectField
          id="document-deliveryMode"
          label="Delivery Mode"
          required={portalRequired.has('deliveryMode')}
          placeholder="Select Delivery Mode"
          options={DELIVERY_MODES}
          value={document.deliveryMode}
          error={errors['document.deliveryMode']}
          disabled={disabled}
          onValueChange={set('deliveryMode')}
        />

        <SelectField
          id="document-supply"
          label="Supply"
          options={SUPPLY_OPTIONS}
          value={document.supply}
          disabled={disabled}
          onValueChange={changeSupply}
        />
        <SelectField
          id="document-supplyType"
          label="Supply Type"
          required
          placeholder="Select Supply Type"
          options={supplyTypesOf(document.supply)}
          value={document.supplyType}
          error={errors['document.supplyType']}
          disabled={disabled}
          onValueChange={set('supplyType')}
        />
        <SelectField
          id="document-bankId"
          label="Select Bank"
          placeholder={bankPlaceholder}
          options={banks.options}
          value={document.bankId}
          disabled={disabled || banks.options.length === 0}
          onValueChange={set('bankId')}
        />

        {banks.status === 'failed' ? (
          <div className={FULL_FIELD}>
            <InlineAlert action={<RetryButton onClick={banks.retry} />}>
              {banks.error || 'The bank accounts could not be loaded.'}
            </InlineAlert>
          </div>
        ) : null}

        <FileField
          id="document-paymentQr"
          label="Payment QR"
          accept="image/*"
          value={document.paymentQr}
          disabled={disabled}
          onChange={set('paymentQr')}
        />
      </InvoiceGrid>
    </InvoiceCard>
  )
}
