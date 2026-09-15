// List of Indian states / union territories with their GST state codes.
// The GST number always starts with the 2-digit code, so keeping the code
// here lets us cross-check the GST field against the selected state later.
export const INDIAN_STATES = [
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '18', name: 'Assam' },
  { code: '10', name: 'Bihar' },
  { code: '04', name: 'Chandigarh' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '07', name: 'Delhi' },
  { code: '30', name: 'Goa' },
  { code: '24', name: 'Gujarat' },
  { code: '06', name: 'Haryana' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '20', name: 'Jharkhand' },
  { code: '29', name: 'Karnataka' },
  { code: '32', name: 'Kerala' },
  { code: '38', name: 'Ladakh' },
  { code: '31', name: 'Lakshadweep' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '27', name: 'Maharashtra' },
  { code: '14', name: 'Manipur' },
  { code: '17', name: 'Meghalaya' },
  { code: '15', name: 'Mizoram' },
  { code: '13', name: 'Nagaland' },
  { code: '21', name: 'Odisha' },
  { code: '34', name: 'Puducherry' },
  { code: '03', name: 'Punjab' },
  { code: '08', name: 'Rajasthan' },
  { code: '11', name: 'Sikkim' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '16', name: 'Tripura' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '19', name: 'West Bengal' }
];

/**
 * Finds a state by name, however it happens to be written.
 *
 * Names arrive from places that do not agree on capitalisation - the GST
 * lookup returns "Gujarat", other sources send "GUJARAT" - and a <Select>
 * only shows a value that matches one of its options exactly. So look the
 * name up here and use the entry's own `name`, never the raw text.
 *
 * Returns undefined when nothing matches.
 */
export const findStateByName = (name) => {
  const wanted = String(name ?? '').trim().toLowerCase()
  if (!wanted) return undefined

  return INDIAN_STATES.find((state) => state.name.toLowerCase() === wanted)
}

/**
 * The state a GST number belongs to - its first two digits ARE the state
 * code. Used to catch a GST number filed under the wrong state.
 *
 * Returns undefined for anything too short to have a code.
 */
export const findStateByGstNumber = (gstNumber) => {
  const code = String(gstNumber ?? '').trim().slice(0, 2)
  if (code.length < 2) return undefined

  return INDIAN_STATES.find((state) => state.code === code)
}
