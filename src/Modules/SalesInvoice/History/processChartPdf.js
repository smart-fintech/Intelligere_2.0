import { createElement } from 'react'

/**
 * The process chart as PDF bytes (ProcessChartPdfDocument) - @react-pdf/renderer
 * loaded only when one is downloaded, as the invoice's PDFs are (invoicePdf).
 */
export async function createProcessChartPdf(chart) {
  const [{ pdf }, { default: ProcessChartPdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/Modules/SalesInvoice/History/ProcessChartPdfDocument'),
  ])
  const blob = await pdf(createElement(ProcessChartPdfDocument, { chart })).toBlob()
  return new Uint8Array(await blob.arrayBuffer())
}
