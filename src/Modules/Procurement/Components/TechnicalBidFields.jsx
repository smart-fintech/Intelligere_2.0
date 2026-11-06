import { Plus, Trash2 } from 'lucide-react'

import { Field, TextareaField, fieldLabelClass } from '@/Components/Common/FormFields'
import { RichTextEditor } from '@/Components/Common/RichTextEditor'
import { Button } from '@/Components/ui/button'
import { technicalErrorKey } from '@/Modules/Procurement/procurement'

/**
 * A Pre Bid's technical bid, as the form edits it: the certifications vendors
 * must hold, the FAQs, and a note (rich text - HTML). Blank rows are dropped when it is saved
 * (buildTechnicalBid), so adding one and leaving it empty is harmless.
 *
 * `errors` is the form's flat error map; each box reads its own (technicalErrorKey).
 */

const NO_ERRORS = {}
export default function TechnicalBidFields({ value, errors = NO_ERRORS, onChange, disabled }) {
  const certifications = value.required_certifications
  const faqs = value.faqs

  const set = (field, next) => onChange({ ...value, [field]: next })

  return (
    <div className="space-y-3">
      {/* Certifications (short rows) in the narrower left column, FAQs beside them; stacked below lg. */}
      <div className="grid grid-cols-1 items-start gap-x-5 gap-y-3 lg:grid-cols-[2fr_3fr]">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={fieldLabelClass}>Required Certifications</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Plus}
              disabled={disabled}
              onClick={() => set('required_certifications', [...certifications, ''])}
            >
              Add Certification
            </Button>
          </div>
          {certifications.length === 0 ? (
            <p className="text-xs text-muted-foreground">No certification required.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {certifications.map((certification, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Field
                    aria-label={`Certification ${index + 1}`}
                    placeholder="e.g. ISO 9001"
                    value={certification}
                    error={errors[technicalErrorKey('certification', index)]}
                    disabled={disabled}
                    onChange={(event) =>
                      set(
                        'required_certifications',
                        certifications.map((item, at) => (at === index ? event.target.value : item)),
                      )
                    }
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="iconDelete"
                    size="icon-sm"
                    icon={Trash2}
                    tooltip="Remove"
                    aria-label={`Remove certification ${index + 1}`}
                    disabled={disabled}
                    onClick={() =>
                      set(
                        'required_certifications',
                        certifications.filter((_, at) => at !== index),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 space-y-2 border-border lg:border-l lg:pl-5">
          <div className="flex items-center justify-between gap-2">
            <p className={fieldLabelClass}>FAQ</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Plus}
              disabled={disabled}
              onClick={() => set('faqs', [...faqs, { question: '', answer: '' }])}
            >
              Add FAQ
            </Button>
          </div>
          {faqs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No FAQ added.</p>
          ) : (
            <ul className="space-y-2">
              {faqs.map((faq, index) => (
                <li key={index} className="rounded-md border border-border p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-brand">FAQ {index + 1}</span>
                    <Button
                      type="button"
                      variant="iconDelete"
                      size="icon-sm"
                      icon={Trash2}
                      tooltip="Remove"
                      aria-label={`Remove FAQ ${index + 1}`}
                      disabled={disabled}
                      onClick={() =>
                        set(
                          'faqs',
                          faqs.filter((_, at) => at !== index),
                        )
                      }
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <Field
                      id={`procurement-faq-${index}-question`}
                      label="Question"
                      value={faq.question}
                      error={errors[technicalErrorKey('faq', index, 'question')]}
                      disabled={disabled}
                      onChange={(event) =>
                        set(
                          'faqs',
                          faqs.map((item, at) => (at === index ? { ...item, question: event.target.value } : item)),
                        )
                      }
                    />
                    <TextareaField
                      id={`procurement-faq-${index}-answer`}
                      label="Answer"
                      rows={2}
                      value={faq.answer}
                      error={errors[technicalErrorKey('faq', index, 'answer')]}
                      disabled={disabled}
                      onChange={(event) =>
                        set(
                          'faqs',
                          faqs.map((item, at) => (at === index ? { ...item, answer: event.target.value } : item)),
                        )
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <RichTextEditor
        id="procurement-note"
        label="Note"
        placeholder="Anything else vendors should know about this bid"
        value={value.note}
        disabled={disabled}
        onChange={(html) => set('note', html)}
      />
    </div>
  )
}
