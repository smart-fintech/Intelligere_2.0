/**
 * WHAT A GSTR-1 FETCH ANSWERED - gstr1-return-data/'s `msg`, read into one
 * outcome. Plain functions: no React, no requests.
 *
 *   readGstr1Reply(msg, { thrown, invoicesAsked }) -> { outcome, saved, failures, message }
 *
 * The status alone does not tell (Services/Gst/gstReturnService): a 200 is a
 * success or a sign-in step (useGstPortalAuth takes those), and a 500 may
 * still have saved invoices -
 *
 *   "GSTR1 : 12 records saved"                                   SAVED      (200)
 *   "B2BA : <portal message>, B2CL : ... | GSTR1 : 12 records saved"
 *                                                                PARTIAL    (500) saved, some sections failed
 *   "No B2B / B2C invoices found for this month"                 NO_INVOICES (500) entries unchanged, or -
 *                                                                SECTIONS_SAVED when no invoice section was
 *                                                                asked for: the others were kept, and that
 *                                                                is all the request wanted
 *   "B2BA : <portal message>, ..."                               FAILED with the sections
 *   "<portal message>", "company not found", ...                 FAILED
 *
 * A failed section is "<portal table> : <message>", the tables joined by ", ".
 * A portal message may hold a comma itself, so a part starts only where a
 * known table name does (GSTR_1_PORTAL_TABLES).
 */

import { GSTR_1_PORTAL_TABLES } from '@/Constants/salesEntries'
import { GSTR_1_NO_INVOICES } from '@/Services/Gst/gstReturnService'

export const GSTR_1_OUTCOME = Object.freeze({
  SAVED: 'saved',
  PARTIAL: 'partial',
  NO_INVOICES: 'no-invoices',
  SECTIONS_SAVED: 'sections-saved',
  FAILED: 'failed',
})

const SAVED = /GSTR1\s*:\s*(\d+)\s*records? saved/i
const TABLES = Object.keys(GSTR_1_PORTAL_TABLES)
  .sort((a, b) => b.length - a.length)
  .join('|')
const TABLE_START = new RegExp(`(?:^|,\\s*)(${TABLES})\\s*:\\s*`, 'g')

/** The failed sections of "B2BA : ..., B2CL : ..." - none unless the text starts with a table name. */
export const readSectionFailures = (value) => {
  const source = String(value ?? '').trim()
  const starts = [...source.matchAll(TABLE_START)]
  if (starts.length === 0 || starts[0].index !== 0) return []
  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].index : source.length
    return {
      table: start[1],
      label: GSTR_1_PORTAL_TABLES[start[1]],
      message: source.slice(start.index + start[0].length, end).trim() || 'Not fetched',
    }
  })
}

export const readGstr1Reply = (msg, { thrown, invoicesAsked }) => {
  const message = String(msg ?? '').trim()
  const cut = message.lastIndexOf(' | ')
  const errorsPart = cut >= 0 ? message.slice(0, cut) : message
  const savedPart = cut >= 0 ? message.slice(cut + 3) : message
  const savedMatch = savedPart.match(SAVED)
  const saved = savedMatch ? Number(savedMatch[1]) : null

  if (saved !== null && !thrown) return { outcome: GSTR_1_OUTCOME.SAVED, saved, failures: [], message }
  if (saved !== null) {
    return { outcome: GSTR_1_OUTCOME.PARTIAL, saved, failures: cut >= 0 ? readSectionFailures(errorsPart) : [], message: cut >= 0 ? errorsPart : message }
  }
  // A 200 that is no sign-in step and names no count: taken as it says.
  if (!thrown) return { outcome: GSTR_1_OUTCOME.SAVED, saved: null, failures: [], message }
  if (message === GSTR_1_NO_INVOICES) {
    return { outcome: invoicesAsked ? GSTR_1_OUTCOME.NO_INVOICES : GSTR_1_OUTCOME.SECTIONS_SAVED, saved: null, failures: [], message }
  }
  return { outcome: GSTR_1_OUTCOME.FAILED, saved: null, failures: readSectionFailures(message), message }
}
