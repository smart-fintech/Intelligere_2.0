/**
 * FETCH FROM TALLY - the company's sales vouchers of a period, as a CSV:
 *
 *   const fetch = useSalesTallyFetch({ companyName, onFetched })
 *   fetch.start({ year, startMonth, endMonth, voucherTypes })
 *   fetch.busy
 *
 * The agent reads the vouchers, the backend writes them to a CSV, and Tally's
 * one stop_loader brings its URL (file_path). That CSV is downloaded, as the
 * old screen did: it is in the upload's own format, to be looked over and
 * then uploaded like any other. useTallyExchange ends the exchange on the
 * first stop_loader, so a repeated reply is never handled twice.
 */

import { toast } from '@/Library/toast'
import useTallyExchange from '@/Modules/GstCompare/useTallyExchange'
import { TALLY_FETCH_SALES_MODULE, buildFetchSalesMessage } from '@/Services/Accounting/salesEntriesService'
import { downloadFileFromUrl } from '@/Utils/fileDownload'

export default function useSalesTallyFetch({ companyName, onFetched }) {
  const exchange = useTallyExchange({
    module: TALLY_FETCH_SALES_MODULE,
    onReply: (reply) => {
      if (reply.status !== 'success') {
        toast.error(reply.msg || 'Tally could not fetch the sales entries.')
        return
      }
      if (!reply.file_path) {
        toast.info(reply.msg || 'Tally found no sales entries for that period.')
        return
      }
      toast.success(reply.msg || 'Sales entries fetched from Tally.', {
        description: 'The CSV is downloading - check it, then upload it here.',
      })
      downloadFileFromUrl(reply.file_path, 'sales_entries.csv')
      onFetched?.(reply)
    },
  })

  const start = (range) => {
    const name = companyName?.trim()
    if (!name) {
      toast.error('Please select an active company before fetching from Tally.')
      return Promise.resolve(false)
    }
    return exchange.start(buildFetchSalesMessage(name, range))
  }

  return { busy: exchange.busy, start }
}
