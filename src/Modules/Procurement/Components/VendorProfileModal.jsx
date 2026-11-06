import {
  Award,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  FileText,
  Layers,
  Mail,
  MapPin,
  MessageCircle,
  Microscope,
  Pencil,
  Phone,
  ShieldCheck,
  Wrench,
  XCircle,
} from 'lucide-react'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import { DocumentButton } from '@/Modules/Procurement/Components/DocumentPreview'
import {
  VENDOR_PROFILE_SECTIONS,
  certificateStatus,
  extraEntries,
  extraSections,
  filledSections,
  isBlank,
  readVendorProfile,
  requiredCertificationRows,
  sectionField,
  titleOf,
} from '@/Modules/Procurement/vendorProfile'
import { formatDate } from '@/Utils/date'

/**
 * A vendor's profile, read only: who it is, then one card per profile section
 * (Modules/Procurement/vendorProfile - the same fields the vendor edits).
 * Every field is listed, an empty one as "Not provided"; anything the reply
 * carries that is not described there is still shown, under its own key.
 * Documents and certificates open in a preview over the page.
 *
 *   vendor   a product's vendor record from a bid list ({ id, name, email, Profile, ... })
 *   event    the pre bid it was opened from - its technical bid's required
 *            certifications are then checked against the vendor's
 *   note     a line above the details (the vendor portal says whose view this is)
 *   onEdit   adds "Edit Profile" (the vendor portal only)
 */

const SECTION_ICONS = {
  company_information: Building2,
  manufacturing_capability: Factory,
  machinery: Wrench,
  technical_certifications: Award,
  quality_control: ClipboardCheck,
  quality_equipment: Microscope,
  company_documents: FileText,
}

const isLink = (value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim())

const NotProvided = ({ children = 'Not provided' }) => (
  <span className="text-sm text-muted-foreground italic">{children}</span>
)

function Chips({ items, icon: Icon }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs text-brand"
        >
          {Icon ? <Icon className="size-3" /> : null}
          {String(item)}
        </span>
      ))}
    </div>
  )
}

/** Anything not described in the config: text, chips, a table of records or labelled fields. */
function AnyValue({ value }) {
  if (isBlank(value)) return <NotProvided />
  if (isLink(value)) return <DocumentButton url={value.trim()} />
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) {
    const items = value.filter((item) => !isBlank(item))
    if (items.every((item) => typeof item !== 'object')) return <Chips items={items} />
    const columns = [...new Set(items.flatMap((item) => Object.keys(item ?? {})))]
    return (
      <RecordTable
        columns={columns.map((key) => ({ key, label: titleOf(key) }))}
        records={items}
        cell={(record, column) => <AnyValue value={record?.[column.key]} />}
      />
    )
  }
  if (typeof value === 'object') {
    return (
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(value)
          .filter(([, item]) => !isBlank(item))
          .map(([key, item]) => (
            <Item key={key} label={titleOf(key)}>
              <AnyValue value={item} />
            </Item>
          ))}
      </dl>
    )
  }
  return <span className="break-words whitespace-pre-line">{String(value)}</span>
}

function Item({ label, wide, children }) {
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2 lg:col-span-3')}>
      <dt className="text-xs font-medium text-brand-muted">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-foreground">{children}</dd>
    </div>
  )
}

/** One described field's value. */
function FieldValue({ field, value }) {
  if (field.type === 'file') return <DocumentButton url={value} title={field.label} />
  if (isBlank(value)) return <NotProvided />
  if (field.type === 'list' || field.type === 'multiselect')
    return <Chips items={value.filter((item) => !isBlank(item))} />
  if (field.type === 'date') return formatDate(value)
  return <span className="whitespace-pre-line">{String(value)}</span>
}

function RecordTable({ columns, records, cell }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-max text-sm">
        <thead className="bg-muted/60 text-left text-xs text-brand-muted">
          <tr>
            <th className="w-10 px-3 py-2 font-semibold">#</th>
            {columns.map((column) => (
              <th key={column.key} className="px-3 py-2 font-semibold">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={index} className="border-t border-border/60 align-top">
              <td className="px-3 py-2 text-muted-foreground tabular-nums">{index + 1}</td>
              {columns.map((column) => (
                <td key={column.key} className="px-3 py-2">
                  {cell(record, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const STATUS_TONES = {
  expired: 'bg-destructive/10 text-destructive',
  expiring: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
}

function ExpiryDate({ value }) {
  if (isBlank(value)) return <span className="text-muted-foreground">--</span>
  const status = certificateStatus(value)
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {formatDate(value)}
      {status ? (
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_TONES[status])}>
          {status === 'expired' ? 'Expired' : 'Expiring soon'}
        </span>
      ) : null}
    </span>
  )
}

/** A cell of a record table, by its sub field. */
function RecordCell({ field, value }) {
  if (field.type === 'file') return <DocumentButton url={value} title={field.label} emptyText="--" />
  if (field.key === 'expiry_date') return <ExpiryDate value={value} />
  if (isBlank(value)) return <span className="text-muted-foreground">--</span>
  if (field.type === 'date') return formatDate(value)
  return String(value)
}

function SectionCard({ icon: Icon = Layers, title, meta, children }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-brand">
          <Icon className="size-4" />
          {title}
        </h3>
        {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function DocumentsSection({ section, profile }) {
  const company = profile.company_information ?? {}
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {section.fields.map((field) => {
        const number = field.numberKey ? company[field.numberKey] : null
        return (
          <div key={field.key} className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 size-4 shrink-0 text-brand" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{field.label}</p>
                {isBlank(number) ? null : <p className="text-xs break-all text-muted-foreground">{number}</p>}
              </div>
            </div>
            <div className="mt-auto">
              <DocumentButton url={profile.company_documents?.[field.key]} title={field.label} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** A described section's body. */
function SectionBody({ section, profile }) {
  const value = profile[section.key]

  if (section.key === 'company_documents') return <DocumentsSection section={section} profile={profile} />

  if (section.flat) {
    const field = sectionField(section)
    if (isBlank(value)) return <NotProvided>Nothing added yet.</NotProvided>
    if (field.type === 'multiselect')
      return <Chips items={value.filter((item) => !isBlank(item))} icon={CheckCircle2} />
    const records = value.filter((record) => !isBlank(record))
    const known = new Set(field.fields.map((subField) => subField.key))
    // Record keys this build does not know are shown as columns too.
    const extraColumns = [...new Set(records.flatMap((record) => Object.keys(record)))]
      .filter((key) => !known.has(key))
      .map((key) => ({ key, label: titleOf(key) }))
    return (
      <RecordTable
        columns={[...field.fields, ...extraColumns]}
        records={records}
        cell={(record, column) =>
          known.has(column.key) ? (
            <RecordCell field={column} value={record[column.key]} />
          ) : (
            <AnyValue value={record[column.key]} />
          )
        }
      />
    )
  }

  const extras = extraEntries(section, value)
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {section.fields.map((field) => (
        <Item key={field.key} label={field.label} wide={field.wide}>
          <FieldValue field={field} value={value?.[field.key]} />
        </Item>
      ))}
      {extras.map(([key, item]) => (
        <Item key={key} label={titleOf(key)}>
          <AnyValue value={item} />
        </Item>
      ))}
    </dl>
  )
}

const sectionMeta = (section, value) => {
  if (section.flat && Array.isArray(value)) {
    const count = value.filter((item) => !isBlank(item)).length
    return count ? `${count} ${count === 1 ? 'entry' : 'entries'}` : null
  }
  return null
}

function RequiredCertifications({ rows }) {
  const missing = rows.filter((row) => !row.certificate).length
  return (
    <SectionCard
      icon={ShieldCheck}
      title="Required Certifications"
      meta={missing ? `${missing} of ${rows.length} missing` : `All ${rows.length} held`}
    >
      <RecordTable
        columns={[
          { key: 'name', label: 'Certification' },
          { key: 'status', label: 'Status' },
          { key: 'certificate_number', label: 'Certificate Number' },
          { key: 'expiry_date', label: 'Expiry Date' },
          { key: 'certificate_image', label: 'Certificate' },
        ]}
        records={rows}
        cell={({ name, certificate }, column) => {
          if (column.key === 'name') return <span className="font-medium">{name}</span>
          if (column.key === 'status') {
            return certificate ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                Held
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                <XCircle className="size-3.5" />
                Not available
              </span>
            )
          }
          if (!certificate) return <span className="text-muted-foreground">--</span>
          if (column.key === 'expiry_date') return <ExpiryDate value={certificate.expiry_date} />
          if (column.key === 'certificate_image') {
            return <DocumentButton url={certificate.certificate_image} title={name} emptyText="--" />
          }
          return isBlank(certificate[column.key]) ? '--' : String(certificate[column.key])
        }}
      />
    </SectionCard>
  )
}

function ContactLine({ icon: Icon, children }) {
  if (isBlank(children)) return null
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-brand" />
      <span className="truncate">{children}</span>
    </span>
  )
}

const initialsOf = (name) =>
  String(name || 'V')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')

function Summary({ vendor, profile }) {
  const company = profile.company_information ?? {}
  const displayName = company.vendor_company_name || vendor?.name || 'Vendor'
  const years = String(company.years_in_business ?? '').trim()
  const facts = [
    company.constitution,
    years ? `${years} ${years === '1' ? 'year' : 'years'} in business` : null,
  ].filter((fact) => !isBlank(fact))
  const filled = filledSections(profile)
  const total = VENDOR_PROFILE_SECTIONS.length

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-brand-soft/40 p-4 sm:flex-row sm:items-center">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-base font-semibold text-brand-foreground">
        {initialsOf(displayName)}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-base font-semibold text-foreground">{displayName}</p>
        {facts.length ? <p className="text-xs text-muted-foreground">{facts.join(' · ')}</p> : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground">
          <ContactLine icon={Mail}>{vendor?.email}</ContactLine>
          <ContactLine icon={Phone}>{vendor?.contact}</ContactLine>
          <ContactLine icon={MessageCircle}>{vendor?.whatsapp}</ContactLine>
          <ContactLine icon={MapPin}>{company.manufacturing_location}</ContactLine>
        </div>
      </div>
      <div className="shrink-0 sm:w-36" title="Profile sections with details">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {filled} of {total}
          </span>{' '}
          sections filled
        </p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand" style={{ width: `${(filled / total) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

export default function VendorProfileModal({ vendor, event, note, onEdit, onClose }) {
  const profile = readVendorProfile(vendor)
  const required = requiredCertificationRows(event, profile)
  const extras = extraSections(profile)

  return (
    <Modal
      open
      onOpenChange={onClose}
      size="xl"
      title="Vendor Profile"
      description={vendor?.name || vendor?.email || undefined}
      autoFocus={false}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {onEdit ? (
            <Button type="button" icon={Pencil} onClick={onEdit}>
              Edit Profile
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4 pr-1">
        {note ? <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{note}</p> : null}

        <Summary vendor={vendor} profile={profile} />

        {required.length ? <RequiredCertifications rows={required} /> : null}

        {VENDOR_PROFILE_SECTIONS.map((section) => (
          <SectionCard
            key={section.key}
            icon={SECTION_ICONS[section.key]}
            title={section.title}
            meta={sectionMeta(section, profile[section.key])}
          >
            <SectionBody section={section} profile={profile} />
          </SectionCard>
        ))}

        {extras.map(([key, value]) => (
          <SectionCard key={key} title={titleOf(key)}>
            <AnyValue value={value} />
          </SectionCard>
        ))}
      </div>
    </Modal>
  )
}
