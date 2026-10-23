/**
 * The Product CSV Upload card, above the Product Form - the counterpart of
 * the Ledger CSV Upload card, and the same in every step. It is on the
 * simple Product page only (no Inventory Management), for Tally and
 * Intelligere alike.
 *
 * Many products at once, instead of one form at a time: download the blank
 * format, fill it in, drop it back here.
 *
 * ------------------------------------------------------------------
 * ONE UPLOAD, TWO ENDINGS - AND THE ERP DECIDES WHICH
 * ------------------------------------------------------------------
 * The file goes to the same endpoint either way (importProductCsv):
 *
 *   Intelligere   the backend creates the products itself and replies
 *                 { msg: "2 product created successfully" }. That message is
 *                 shown as it came.
 *
 *   Tally         the backend only PARSES the file and replies with the rows.
 *                 Nothing exists yet: the whole reply is sent on to Tally over
 *                 the app's shared WebSocket as `tally_product_create`
 *                 (buildTallyProductImportMessage), and the import is finished
 *                 only when Tally's stop_loader arrives.
 *
 * Either way the list is reloaded at the end through `onImported`.
 *
 * THE TALLY LEG reads the reply the way every Tally reply in the app is read:
 * only `action_status: "stop_loader"` ends the wait (anything before it is
 * progress), and `status` then picks the kind of toast, whose words are the
 * reply's own `msg`. A reply is this card's only while its own import is in
 * flight - the Product Form uses the same module for a single product, and
 * guards its replies the same way.
 *
 * Props:
 *   companyId    the selected company - what the products are filed under
 *   companyName  the same company by name, which is how Tally knows it
 *   isTally      Tally ERP: the reply is rows to forward, not a result
 *   onImported() reloads the product list once the import has finished
 */

import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Download } from 'lucide-react'

import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { Loader } from '@/Components/Common/Loader'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { useWebSocket } from '@/Hooks/useWebSocket'
import { toast } from '@/Library/toast'
import {
  PRODUCT_CSV_FORMAT_CONTENT,
  PRODUCT_CSV_FORMAT_FILE,
  TALLY_PRODUCT_CREATE_MODULE,
  buildTallyProductImportMessage,
  importProductCsv,
} from '@/Services/productService'
import { selectIsErpKnown } from '@/Store/Slices/profileSlice'
import { downloadTextFile } from '@/Utils/fileDownload'

/** Tally safety net: the longest the card waits for stop_loader - as for a ledger import. */
const TALLY_IMPORT_TIMEOUT_MS = 5 * 60 * 1000

export default function ProductCsvUpload({ companyId, companyName, isTally = false, onImported }) {
  /* 'idle' | 'uploading' (the API) | 'sending' | 'waiting' (Tally's reply) */
  const [phase, setPhase] = useState('idle')
  // The same thing where the socket callback can read it.
  const phaseRef = useRef('idle')
  const timerRef = useRef(null)

  const busy = phase !== 'idle'

  // Until the profile is in, `isTally` is not known - and a Tally user's
  // file sent up as `intelligere` would create the products in the wrong
  // place. So the upload waits for it, as the ledger card does.
  const erpKnown = useSelector(selectIsErpKnown)

  const setPhaseBoth = (next) => {
    phaseRef.current = next
    setPhase(next)
  }

  /** Back to ready, whatever happened, and with no timer left running. */
  const finish = () => {
    clearTimeout(timerRef.current)
    timerRef.current = null
    setPhaseBoth('idle')
  }

  const finishAndReload = () => {
    finish()
    onImported?.()
  }

  /* The app's shared WebSocket - no second connection. */
  const { send } = useWebSocket({
    module: TALLY_PRODUCT_CREATE_MODULE,
    onMessage: (data) => {
      const reply = data?.res
      if (!reply || reply.return_module_name !== TALLY_PRODUCT_CREATE_MODULE) return

      // Not an import this card started, or one already finished.
      const current = phaseRef.current
      if (current !== 'waiting' && current !== 'sending') return

      // Anything before stop_loader is progress: the loader stays on.
      if (reply.action_status !== 'stop_loader') return

      // Stopped first, so no branch below can leave it spinning.
      finish()

      if (reply.status === 'error') {
        toast.error(reply.msg || 'Tally could not create the products.')
      } else if (reply.status === 'success') {
        toast.success(reply.msg || 'Products created successfully.')
      } else if (reply.msg) {
        toast.info(reply.msg)
      }

      // Reloaded either way: a failure can still have created part of the file.
      onImported?.()
    },
  })

  // Nothing of an import may outlive the card.
  useEffect(
    () => () => {
      phaseRef.current = 'idle'
      clearTimeout(timerRef.current)
    },
    [],
  )

  /** The blank CSV that ships with the app (Assets/format/ProductFormat.csv) - nothing is fetched. */
  const handleDownloadFormat = () => downloadTextFile(PRODUCT_CSV_FORMAT_FILE, PRODUCT_CSV_FORMAT_CONTENT)

  /** Tally: the whole reply on to Tally, then the wait for its stop_loader. */
  const sendToTally = async (rows) => {
    setPhaseBoth('sending')

    const delivered = await send(buildTallyProductImportMessage(companyName, rows))

    // Answered already, or the card has gone away.
    if (phaseRef.current !== 'sending') return

    if (!delivered) {
      console.error('[Product CSV] WebSocket error:', `${TALLY_PRODUCT_CREATE_MODULE} could not be sent`)
      finish()
      toast.error('Could not reach the live server. Please try again.')
      return
    }

    setPhaseBoth('waiting')
    timerRef.current = setTimeout(() => {
      if (phaseRef.current !== 'waiting') return
      finish()
      toast.error('Tally did not finish creating the products in time. Please try again.')
      onImported?.()
    }, TALLY_IMPORT_TIMEOUT_MS)
  }

  /** The file the shared button hands back - the upload starts on the choice itself. */
  const handleSelect = async (picked) => {
    if (busy) return

    if (!companyId || (isTally && !companyName?.trim())) {
      toast.error('Select a company before importing products.')
      return
    }

    setPhaseBoth('uploading')

    try {
      const response = await importProductCsv({
        companyId,
        erpType: isTally ? 'tally' : 'intelligere',
        file: picked,
      })

      // ---- Intelligere: the products already exist. ----
      if (!isTally) {
        toast.success(response?.msg || 'Products imported successfully.')
        finishAndReload()
        return
      }

      // ---- Tally: the reply is the rows, and the import is only half done. ----
      const rows = Array.isArray(response) ? response : []

      if (rows.length === 0) {
        finish()
        toast.info(response?.msg || 'No products were found in that file.')
        return
      }

      await sendToTally(rows)
    } catch (failure) {
      // `failure.message` is the backend's own text (see authService).
      finish()
      toast.error(failure.message || 'The file could not be uploaded.')
    }
  }

  const busyLabel = phase === 'uploading' ? 'Uploading the CSV...' : 'Creating the products in Tally...'

  return (
    <Panel
      title="Product CSV Upload"
      actions={busy ? <Loader variant="inline" size="xs" label={busyLabel} /> : null}
    >
      {/* The two buttons, one row - as on the ledger card. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CsvUploadButton size="sm" loading={busy} disabled={!companyId || !erpKnown} onFileSelect={handleSelect}>
          Upload CSV
        </CsvUploadButton>

        <Button type="button" variant="default" size="sm" icon={Download} onClick={handleDownloadFormat}>
          Download Format
        </Button>
      </div>
    </Panel>
  )
}
