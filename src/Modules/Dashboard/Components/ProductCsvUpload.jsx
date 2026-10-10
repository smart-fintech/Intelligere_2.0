/**
 * The Product CSV Upload card, above the Product Form - the counterpart of
 * the Ledger CSV Upload card, drawn the same way with the same two buttons.
 *
 * IT IS NOT CONNECTED TO ANYTHING YET, and both buttons are off.
 *
 * A ledger import has three things behind it: an endpoint the file goes to,
 * a Tally message its rows are forwarded in, and a blank format to download.
 * None of the three has been supplied for products - and a product file sent
 * to the ledger endpoint would be read as ledgers - so there is nothing for
 * these buttons to do that would not be made up. The card is here so the
 * page has its final shape, and says plainly that the import is not
 * available rather than looking broken.
 *
 * TO CONNECT IT: this becomes LedgerCsvUpload with product names. Add the
 * import call, the Tally bulk message and the format file to
 * Services/productService, then take `disabled` off the two buttons and give
 * the upload its `onFileSelect` - see LedgerCsvUpload for every step, which
 * is the same for a product.
 */

import { Download } from 'lucide-react'

import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'

export default function ProductCsvUpload() {
  return (
    <Panel title="Product CSV Upload">
      {/* The two buttons, one row - as on the ledger card. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CsvUploadButton size="sm" disabled>
          Upload CSV
        </CsvUploadButton>

        <Button type="button" variant="default" size="sm" icon={Download} disabled>
          Download Format
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Importing products from a CSV is not available yet. Use the form below to add them one at a time.
      </p>
    </Panel>
  )
}
