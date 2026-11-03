import { createPdf, safeFileName } from '@/Utils/pdf'

/** One party's invoices as PDF bytes (OutstandingPdfDocument) - its ticked ones, or all of them with their `heading`. */
export const createOutstandingPdf = ({ companyName, source, parties, heading }) =>
  createPdf(() => import('@/Modules/PayableReceivable/Components/OutstandingPdfDocument'), { companyName, source, parties, heading })

/** Named after the party, and marked when it is only the ticked rows. */
export const outstandingPdfName = (companyName, source, partyName, ticked) =>
  `${safeFileName(companyName)}-${source}-${safeFileName(partyName)}${ticked ? '-selected' : ''}.pdf`
