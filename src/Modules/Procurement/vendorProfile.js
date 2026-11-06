/**
 * A vendor's profile - its pre-qualification details - described once, so the
 * view (VendorProfileModal) and the vendor's edit form (VendorPortal's
 * VendorProfileForm) read and write the same fields. A new field is one more
 * entry in VENDOR_PROFILE_SECTIONS; the view, the form and the empty values all
 * pick it up.
 *
 * Where it comes from (payload_res: the bid / pre bid lists): every vendor of a
 * product carries `Profile`, built by the backend from its Vendor row -
 *
 *   { company_information: { vendor_company_name, constitution, years_in_business, manufacturing_location },
 *     manufacturing_capability: {...}, machinery: [...], technical_certifications: [...],
 *     quality_control: [...], quality_equipment: [...], company_documents: {...} }
 *
 * - each section null when the vendor has no row. GST No., PAN No. and the
 * address are kept on the Vendor row but are not part of `Profile`, so they are
 * read from it when present and from the vendor record otherwise.
 *
 * The field list follows the old portal's vendor profile form
 * (vendorProfileConfig.js). Anything stored that is not listed here is still
 * shown (`extraEntries`) and carried through the form untouched, so a newer
 * field is never dropped.
 */

const asText = (value) => (value === null || value === undefined ? '' : String(value).trim())

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Nothing worth showing: null, blank text, or a list / object of only those. */
export const isBlank = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.every(isBlank)) ||
  (isPlainObject(value) && Object.values(value).every(isBlank))

const CONSTITUTION_OPTIONS = [
  'Proprietorship',
  'Partnership',
  'LLP',
  'Private Limited',
  'Public Limited',
  'HUF',
  'Trust',
  'Society',
  'Government',
]

const YES_NO = ['Yes', 'No']

const SOURCING_OPTIONS = ['In-house', 'Outsourced', 'Both']

const CERTIFICATE_SCOPE_OPTIONS = ['Quality', 'Environmental', 'Occupational Safety', 'Industry-specific', 'Other']

export const QUALITY_CONTROL_OPTIONS = [
  'Incoming Material Inspection',
  'In-process Inspection',
  'Final Inspection',
  'Sampling System',
  'Inspection Plans',
  'First Article Inspection',
  'Batch Traceability',
  'Calibration System',
  'Non-conformance Management',
  'Corrective / Preventive Action',
  'Customer Complaint Handling',
]

/**
 * A field is { key, label, type, wide?, options?, itemLabel?, addLabel?, fields? }:
 *
 *   text | number | textarea | date | select    one value
 *   multiselect                                 several of `options`
 *   list                                        an open-ended set of plain values
 *   repeat                                      an open-ended set of records of `fields`
 *   file                                        one document - a stored URL, or a File just picked
 *
 * `wide` takes the whole row. A `flat` section is the one field it wraps: its
 * value is stored straight under the section key (`machinery: [...]`, never
 * `machinery: { machinery: [...] }`).
 */
export const VENDOR_PROFILE_SECTIONS = [
  {
    key: 'company_information',
    title: 'Company Information',
    fields: [
      { key: 'vendor_company_name', label: 'Vendor Company Name' },
      { key: 'constitution', label: 'Constitution', type: 'select', options: CONSTITUTION_OPTIONS },
      { key: 'years_in_business', label: 'Years in Business', type: 'number' },
      { key: 'pan_no', label: 'PAN No.', fromVendor: true },
      { key: 'gst_no', label: 'GST No.', fromVendor: true },
      { key: 'manufacturing_location', label: 'Manufacturing Location' },
      { key: 'address', label: 'Address', type: 'textarea', wide: true, fromVendor: true },
    ],
  },
  {
    key: 'manufacturing_capability',
    title: 'Manufacturing Capability',
    fields: [
      { key: 'product_categories', label: 'Product Categories', type: 'list', itemLabel: 'Category' },
      { key: 'product_types', label: 'Product Types', type: 'list', itemLabel: 'Type' },
      { key: 'materials_handled', label: 'Materials Handled', type: 'list', itemLabel: 'Material' },
      { key: 'manufacturing_process', label: 'Manufacturing Process', type: 'list', itemLabel: 'Process' },
      { key: 'industries_processes', label: 'Industries Processes', type: 'list', itemLabel: 'Industry' },
      {
        key: 'oem_odm_capability',
        label: 'OEM / ODM Capability',
        type: 'select',
        options: ['OEM', 'ODM', 'Both', 'None'],
      },
      {
        key: 'in_house_vs_outsourced_processes',
        label: 'In-house vs Outsourced Processes',
        type: 'select',
        options: SOURCING_OPTIONS,
      },
      { key: 'standard_size_ranges', label: 'Standard Size / Ranges', type: 'textarea', wide: true },
      {
        key: 'custom_manufacturing_capability',
        label: 'Custom Manufacturing Capability',
        type: 'textarea',
        wide: true,
      },
    ],
  },
  {
    key: 'machinery',
    title: 'Machinery',
    flat: true,
    fields: [
      {
        key: 'machinery',
        type: 'repeat',
        itemLabel: 'Machine',
        addLabel: 'Add Machine',
        fields: [
          { key: 'machine', label: 'Machine' },
          { key: 'make', label: 'Make' },
          { key: 'model', label: 'Model' },
          { key: 'qty', label: 'Qty', type: 'number' },
          { key: 'capacity', label: 'Capacity' },
          { key: 'year', label: 'Year', type: 'number' },
          { key: 'in_house', label: 'In-house', type: 'select', options: YES_NO },
        ],
      },
    ],
  },
  {
    key: 'technical_certifications',
    title: 'Technical Certifications',
    flat: true,
    fields: [
      {
        key: 'certifications',
        type: 'repeat',
        itemLabel: 'Certification',
        addLabel: 'Add Certification',
        fields: [
          { key: 'certificate_name', label: 'Certificate Name' },
          { key: 'certificate_number', label: 'Certificate Number' },
          { key: 'issuing_organization', label: 'Issuing Organization' },
          { key: 'scope', label: 'Scope', type: 'select', options: CERTIFICATE_SCOPE_OPTIONS },
          { key: 'issuing_date', label: 'Issuing Date', type: 'date' },
          { key: 'expiry_date', label: 'Expiry Date', type: 'date' },
          { key: 'certificate_image', label: 'Certificate', type: 'file' },
        ],
      },
    ],
  },
  {
    key: 'quality_control',
    title: 'Quality Control',
    flat: true,
    fields: [{ key: 'quality_control', type: 'multiselect', options: QUALITY_CONTROL_OPTIONS }],
  },
  {
    key: 'quality_equipment',
    title: 'Quality Equipment',
    flat: true,
    fields: [
      {
        key: 'quality_equipment',
        type: 'repeat',
        itemLabel: 'Equipment',
        addLabel: 'Add Equipment',
        fields: [
          { key: 'equipment_name', label: 'Equipment Name' },
          { key: 'availability', label: 'In-house / Outsourced / Both', type: 'select', options: SOURCING_OPTIONS },
        ],
      },
    ],
  },
  {
    key: 'company_documents',
    title: 'Company Documents',
    fields: [
      { key: 'gst_certificate', label: 'GST Certificate', type: 'file', numberKey: 'gst_no' },
      { key: 'pan_card', label: 'PAN Card', type: 'file', numberKey: 'pan_no' },
      { key: 'msme_certificate', label: 'MSME Certificate', type: 'file', numberKey: 'msme_no' },
    ],
  },
]

/** The one field a flat section wraps. */
export const sectionField = (section) => section.fields[0]

export const emptyFieldValue = (field) => {
  if (field.type === 'list' || field.type === 'repeat' || field.type === 'multiselect') return []
  if (field.type === 'file') return null
  return ''
}

export const emptyRecord = (fields) => Object.fromEntries(fields.map((field) => [field.key, emptyFieldValue(field)]))

/** A stored value in the shape its input holds, whatever the server kept. */
const normalizeFieldValue = (field, value) => {
  if (field.type === 'list' || field.type === 'multiselect') {
    return Array.isArray(value) ? value.map((item) => (item === null || item === undefined ? '' : item)) : []
  }
  if (field.type === 'repeat')
    return Array.isArray(value) ? value.map((record) => (isPlainObject(record) ? record : {})) : []
  if (field.type === 'file') return typeof value === 'string' && value.trim() ? value.trim() : null
  return value === null || value === undefined ? '' : value
}

const normalizeSection = (section, stored, vendor) => {
  if (section.flat) {
    const field = sectionField(section)
    // An older record may still hold the wrapper ({ machinery: [...] }) - unwrapped, not lost.
    const source = isPlainObject(stored) && field.key in stored ? stored[field.key] : stored
    return normalizeFieldValue(field, source)
  }
  const source = isPlainObject(stored) ? stored : {}
  const values = {}
  section.fields.forEach((field) => {
    const own = source[field.key]
    values[field.key] = normalizeFieldValue(field, isBlank(own) && field.fromVendor ? vendor?.[field.key] : own)
  })
  // What this build does not know yet is kept as it came.
  Object.keys(source).forEach((key) => {
    if (!(key in values)) values[key] = source[key]
  })
  return values
}

/**
 * A vendor record's `Profile`, every section present and in its input's shape.
 * `vendor` fills GST No. / PAN No. / address when the profile has none.
 */
export const readVendorProfile = (vendor) => {
  const stored = isPlainObject(vendor?.Profile) ? vendor.Profile : {}
  const profile = Object.fromEntries(
    VENDOR_PROFILE_SECTIONS.map((section) => [section.key, normalizeSection(section, stored[section.key], vendor)]),
  )
  Object.keys(stored).forEach((key) => {
    if (!(key in profile)) profile[key] = stored[key]
  })
  return profile
}

const KNOWN_SECTIONS = new Set(VENDOR_PROFILE_SECTIONS.map((section) => section.key))

/** Sections the reply sent that are not described above, as [key, value] - shown as they are. */
export const extraSections = (profile) =>
  Object.entries(profile ?? {}).filter(([key, value]) => !KNOWN_SECTIONS.has(key) && !isBlank(value))

/** A named section's stored keys that are not among its fields, as [key, value]. */
export const extraEntries = (section, values) => {
  if (section.flat || !isPlainObject(values)) return []
  const known = new Set(section.fields.map((field) => field.key))
  return Object.entries(values).filter(([key, value]) => !known.has(key) && !isBlank(value))
}

/** How many of the described sections hold something - the view's "4 of 7 sections filled". */
export const filledSections = (profile) =>
  VENDOR_PROFILE_SECTIONS.filter((section) => !isBlank(profile?.[section.key])).length

/** A key as a heading: "standard_size_ranges" -> "Standard Size Ranges". */
export const titleOf = (key) =>
  String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

/**
 * A certificate's standing by its expiry date: 'expired', 'expiring' (within
 * 30 days) or null (valid, or no date). `today` is for tests.
 */
export const EXPIRING_DAYS = 30

export const certificateStatus = (expiryDate, today = new Date()) => {
  const text = asText(expiryDate)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const expiry = new Date(`${text}T23:59:59`)
  if (Number.isNaN(expiry.getTime())) return null
  const days = (expiry.getTime() - today.getTime()) / 86400000
  if (days < 0) return 'expired'
  if (days <= EXPIRING_DAYS) return 'expiring'
  return null
}

/** Certificate names are typed by two people - compared without case or outer spaces. */
const sameName = (a, b) => asText(a).toLowerCase() === asText(b).toLowerCase()

/**
 * One row per certification a pre bid's technical bid asks for, with the
 * vendor's certificate of that name, or null when it has none.
 */
export const requiredCertificationRows = (event, profile) => {
  const required = Array.isArray(event?.technical_bid?.required_certifications)
    ? event.technical_bid.required_certifications
    : []
  const held = Array.isArray(profile?.technical_certifications) ? profile.technical_certifications : []
  return required
    .map(asText)
    .filter(Boolean)
    .map((name) => ({ name, certificate: held.find((entry) => sameName(entry?.certificate_name, name)) ?? null }))
}

/* ------------------------------------------------------------------ */
/* The edit form                                                      */
/* ------------------------------------------------------------------ */

const isFile = (value) => typeof File !== 'undefined' && value instanceof File

const cleanValue = (field, value) => {
  if (field.type === 'list' || field.type === 'multiselect') return (value ?? []).map(asText).filter(Boolean)
  if (field.type === 'repeat') {
    return (value ?? [])
      .map((record) => {
        const cleaned = { ...record }
        field.fields.forEach((subField) => {
          cleaned[subField.key] = cleanValue(subField, record?.[subField.key] ?? emptyFieldValue(subField))
        })
        return cleaned
      })
      .filter((record) =>
        field.fields.some((subField) => !isBlank(record[subField.key]) || isFile(record[subField.key])),
      )
  }
  if (field.type === 'file') return isFile(value) ? value : asText(value) || null
  return typeof value === 'string' ? value.trim() : value
}

/**
 * The form's values ready to send (profile_save's vendor_profile): text
 * trimmed, blank list items and empty records dropped, unknown keys kept. A
 * picked document stays a File - saveVendorProfile sends it as its own part.
 *
 * The lists group Company Information under `company_information`, but the
 * Vendor row keeps those fields (vendor_company_name, constitution,
 * years_in_business, manufacturing_location, gst_no, pan_no, address) as its
 * own columns, and profile_save reads them only there - nested, they were
 * ignored and the save still answered "saved". So they are sent at the top
 * level; every other section is a column of its own name and goes as it is.
 */
export const buildVendorProfile = (form) => {
  const { company_information: company, ...sections } = buildSections(form)
  return { ...sections, ...(isPlainObject(company) ? company : {}) }
}

const buildSections = (form) => {
  const profile = { ...form }
  VENDOR_PROFILE_SECTIONS.forEach((section) => {
    if (section.flat) {
      profile[section.key] = cleanValue(sectionField(section), form[section.key])
      return
    }
    const values = { ...form[section.key] }
    section.fields.forEach((field) => {
      values[field.key] = cleanValue(field, values[field.key])
    })
    profile[section.key] = values
  })
  return profile
}

/** The key a field's message is kept under: "machinery.2.year". */
export const profileErrorKey = (...parts) => parts.join('.')

const THIS_YEAR = new Date().getFullYear()

/** What is wrong with the form, by profileErrorKey; empty when it can be saved. */
export const vendorProfileErrors = (form) => {
  const errors = {}
  const company = form.company_information ?? {}
  const years = asText(company.years_in_business)
  if (years && !(/^\d+$/.test(years) && Number(years) <= 200)) {
    errors[profileErrorKey('company_information', 'years_in_business')] = 'Whole years, 0 to 200.'
  }
  const gst = asText(company.gst_no)
  if (gst && !/^[0-9A-Z]{15}$/i.test(gst))
    errors[profileErrorKey('company_information', 'gst_no')] = '15 letters and digits.'
  const pan = asText(company.pan_no)
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(pan)) {
    errors[profileErrorKey('company_information', 'pan_no')] = 'Like ABCDE1234F.'
  }

  ;(form.machinery ?? []).forEach((record, index) => {
    const qty = asText(record?.qty)
    if (qty && !(Number(qty) > 0)) errors[profileErrorKey('machinery', index, 'qty')] = 'More than 0.'
    const year = asText(record?.year)
    if (year && !(/^\d{4}$/.test(year) && Number(year) >= 1900 && Number(year) <= THIS_YEAR)) {
      errors[profileErrorKey('machinery', index, 'year')] = `1900 to ${THIS_YEAR}.`
    }
  })

  ;(form.technical_certifications ?? []).forEach((record, index) => {
    const filled = Object.values(record ?? {}).some((value) => !isBlank(value) || isFile(value))
    if (filled && !asText(record?.certificate_name)) {
      errors[profileErrorKey('technical_certifications', index, 'certificate_name')] = 'Name the certificate.'
    }
    const issued = asText(record?.issuing_date)
    const expires = asText(record?.expiry_date)
    if (issued && expires && expires < issued) {
      errors[profileErrorKey('technical_certifications', index, 'expiry_date')] = 'After the issuing date.'
    }
  })

  ;(form.quality_equipment ?? []).forEach((record, index) => {
    if (asText(record?.availability) && !asText(record?.equipment_name)) {
      errors[profileErrorKey('quality_equipment', index, 'equipment_name')] = 'Name the equipment.'
    }
  })
  return errors
}
