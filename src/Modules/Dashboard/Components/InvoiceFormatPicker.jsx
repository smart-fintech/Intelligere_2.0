/**
 * The Invoice Format field of the Master Details form: every sample invoice
 * image the backend offers, as small cards to pick from. Each card's eye
 * opens that one image, large.
 *
 *   <InvoiceFormatPicker samples={useSampleInvoices()} value={form.pdf_format}
 *                        onChange={(value) => setField('pdf_format', value)} />
 *
 * The samples are handed in rather than fetched here, so the form and the
 * read-only view share one answer - see Hooks/useSampleInvoices.
 *
 * `value` is the format number as a string ("1"): the image's position in
 * the backend's `images` list plus one (see toInvoiceFormats).
 */

import { FieldError, FieldLabel } from '@/Components/Common/FormFields'
import { ImageThumbnail } from '@/Components/Common/ImagePreview'
import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { Skeleton } from '@/Components/ui/skeleton'
import { invoiceFormatLabel } from '@/Constants/inventory'

/**
 * One fixed card size, small enough for three to a row on a phone and four
 * or more in the form's column on a desktop. The row wraps, so it never
 * pushes the page sideways.
 */
const CARD_WIDTH = 'w-[5.5rem] sm:w-24'

export default function InvoiceFormatPicker({ samples, value, onChange, error, disabled }) {
  const { status, formats, retry } = samples
  const id = 'pdf_format'
  const savedWithoutPreview = status === 'ready' && value && !formats.some((format) => format.value === value)

  return (
    <div className="space-y-2">
      {/* Not tied to a control with `htmlFor`: it heads a group of cards,
          which names itself with aria-label below. */}
      <FieldLabel required>Invoice Format</FieldLabel>

      {status === 'loading' ? (
        <div className="flex flex-wrap gap-2.5" aria-busy="true" aria-label="Loading invoice formats">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className={`${CARD_WIDTH} aspect-[3/4] rounded-md`} />
          ))}
        </div>
      ) : null}

      {status === 'failed' ? (
        <InlineAlert action={<RetryButton onClick={retry} />}>
          Invoice formats could not be loaded. {samples.error}
        </InlineAlert>
      ) : null}

      {status === 'ready' && formats.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
          No invoice formats are available right now.
        </p>
      ) : null}

      {status === 'ready' && formats.length > 0 ? (
        <div
          id={id}
          role="radiogroup"
          aria-label="Invoice Format"
          aria-required="true"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="flex flex-wrap gap-2.5"
        >
          {formats.map((format) => (
            <ImageThumbnail
              key={format.value}
              src={format.src}
              title={invoiceFormatLabel(format.value)}
              selected={format.value === value}
              onSelect={() => onChange(format.value)}
              disabled={disabled}
              className={CARD_WIDTH}
            />
          ))}
        </div>
      ) : null}

      {/* A record saved with a format the backend no longer offers still
          shows what it holds, rather than looking unset. */}
      {savedWithoutPreview ? (
        <p className="text-xs text-muted-foreground">
          Currently saved: {invoiceFormatLabel(value)} (no preview available).
        </p>
      ) : null}

      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  )
}
