import { createPdf } from '@/Utils/pdf'

/** The process chart as PDF bytes (ProcessChartPdfDocument). */
export const createProcessChartPdf = (chart) =>
  createPdf(() => import('@/Modules/SalesInvoice/History/ProcessChartPdfDocument'), { chart })
