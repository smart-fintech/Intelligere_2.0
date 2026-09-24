/**
 * The Ledger CSV Upload card, above the Ledger Form.
 *
 * Many ledgers at once, instead of one form at a time: download the blank
 * format, fill it in, drop it back here.
 *
 * ------------------------------------------------------------------
 * ONE UPLOAD, TWO ENDINGS - AND THE ERP DECIDES WHICH
 * ------------------------------------------------------------------
 * The file goes to the same endpoint either way (importLedgerCsv):
 *
 *   Intelligere   the backend creates the ledgers itself and replies
 *                 { msg: "5 ledger created successfully" }. That message is
 *                 shown as it came - the count is the backend's to state.
 *
 *   Tally         the backend only PARSES the file and replies with the rows.
 *                 Nothing exists yet: the rows are sent on to Tally over the
 *                 app's shared WebSocket as `bulk_ledger_create`, and the
 *                 import is finished only when Tally's stop_loader arrives.
 *
 * Either way the list is reloaded at the end through `onImported`, the same
 * refresh the form does after a save.
 *
 * NOTHING HERE IS NEW INFRASTRUCTURE. The company and the ERP come down as
 * props from LedgerDetails, which reads them from the store; the request is
 * the project's axios service; the socket is the one shared connection, used
 * exactly as LedgerForm's Tally save uses it; the picker is the shared
 * CsvUploadButton, which knows nothing about ledgers and only hands back the
 * chosen file; messages are the usual toasts; the wait is the shared Loader.
 *
 * ------------------------------------------------------------------
 * THE TALLY LEG: WHAT STOPS THE LOADER, AND WHAT PICKS THE MESSAGE
 * ------------------------------------------------------------------
 * Two different fields of the reply, and they are read separately - the same
 * rule the header's Refresh and the list's Sync Now follow:
 *
 *   action_status   ONLY "stop_loader" ends the wait. Tally sends progress
 *                   replies first and the loader stays up through them.
 *   status          decides the kind of toast - error, success - and the
 *                   words shown are always the reply's own `msg`.
 *
 * So a failure stops the loader exactly as a success does: the loader is
 * stopped before `status` is even looked at.
 *
 * Props:
 *   companyId    the selected company - what the ledgers are filed under
 *   companyName  the same company by name, which is how Tally knows it
 *   isTally      Tally ERP: the reply is rows to forward, not a result
 *   onImported() reloads the ledger list once the import has finished
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
  BULK_LEDGER_CREATE_MODULE,
  LEDGER_CSV_FORMAT_CONTENT,
  LEDGER_CSV_FORMAT_FILE,
  buildBulkLedgerMessage,
  importLedgerCsv,
} from '@/Services/ledgerService'
import { selectProfileStatus } from '@/Store/Slices/profileSlice'
import { downloadTextFile } from '@/Utils/fileDownload'

/**
 * Tally safety net: the longest the card waits for stop_loader after the
 * rows have gone out. The same idea as the Ledger Form's, and longer,
 * because this is a whole file's worth of ledgers rather than one.
 */
const TALLY_IMPORT_TIMEOUT_MS = 5 * 60 * 1000

export default function LedgerCsvUpload({ companyId, companyName, isTally = false, onImported }) {
  /* The chosen file is not kept: it is picked, sent, and done with. What the
     card shows is the phase, on the button itself.
     'idle' | 'uploading' (the API) | 'sending' | 'waiting' (Tally's reply) */
  const [phase, setPhase] = useState('idle')
  // The same thing where the socket callback can read it: that callback was
  // registered on mount and would otherwise see the first render's value.
  const phaseRef = useRef('idle')
  const timerRef = useRef(null)

  const busy = phase !== 'idle'

  /**
   * Which ERP the user is on is the ONE thing this card cannot get wrong:
   * `isTally` is false until the profile has arrived, so uploading before
   * then would send a Tally user's file up as `intelligere` and create the
   * ledgers in the wrong place. The box therefore stays shut until the
   * profile that `isTally` is worked out from (selectIsTallyErp, read by
   * LedgerDetails) has actually loaded. AppLayout loads it as the shell
   * mounts, so in practice it is open by the time the page is read.
   */
  const erpKnown = useSelector(selectProfileStatus) === 'succeeded'

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

  /** Finished for good: ready for the next file, and the list reloaded. */
  const finishAndReload = () => {
    finish()
    onImported?.()
  }

  /**
   * The app's shared WebSocket - no second connection. Only this card's own
   * bulk_ledger_create reply counts, and only its stop_loader ends the wait.
   */
  const { send } = useWebSocket({
    module: BULK_LEDGER_CREATE_MODULE,
    onMessage: (data) => {
      // { res: { return_module_name, action_status, status, msg, company_name } }
      const reply = data?.res
      if (!reply || reply.return_module_name !== BULK_LEDGER_CREATE_MODULE) return

      // Not an import this card started, or one already finished.
      const current = phaseRef.current
      if (current !== 'waiting' && current !== 'sending') return

      // Tally sends several messages as it works; anything before
      // stop_loader is progress, so the loader stays on.
      if (reply.action_status !== 'stop_loader') return

      // stop_loader means Tally has finished - success or failure. The loader
      // stops HERE, before anything is read, so no branch below can leave it
      // spinning.
      finish()

      // Then `status` decides only which kind of message is shown, and the
      // words are always Tally's own - as on the Sync Now reply next door.
      if (reply.status === 'error') {
        toast.error(reply.msg || 'Tally could not create the ledgers.')
      } else if (reply.status === 'success') {
        toast.success(reply.msg || 'Ledgers created successfully.')
      } else if (reply.msg) {
        // A reply that says neither: shown as it came, rather than guessed at.
        toast.info(reply.msg)
      }

      // Reloaded either way: a failure can still have created part of the
      // file, so the list must not be left showing the state from before.
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

  /* ---------------------------------------------------------------- */
  /* Download Format                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * The blank CSV that ships with the app (Assets/format/LedgerFormat.csv),
   * written out under its own name. Nothing is fetched - the contents are in
   * the bundle already, so this works with the backend unreachable.
   */
  const handleDownloadFormat = () =>
    downloadTextFile(LEDGER_CSV_FORMAT_FILE, LEDGER_CSV_FORMAT_CONTENT)

  /* ---------------------------------------------------------------- */
  /* Upload                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Tally: hands the parsed rows on to Tally and waits for its reply.
   * Returns nothing - the reply above is what ends the import.
   */
  const sendToTally = async (rows) => {
    setPhaseBoth('sending')

    const delivered = await send(buildBulkLedgerMessage(companyName, rows))

    // Answered already, or the card has gone away.
    if (phaseRef.current !== 'sending') return

    if (!delivered) {
      console.error('[Ledger CSV] WebSocket error:', `${BULK_LEDGER_CREATE_MODULE} could not be sent`)
      finish()
      toast.error('Could not reach the live server. Please try again.')
      return
    }

    setPhaseBoth('waiting')
    timerRef.current = setTimeout(() => {
      if (phaseRef.current !== 'waiting') return
      finish()
      toast.error('Tally did not finish creating the ledgers in time. Please try again.')
      // As with an error reply: part of the file may already be in.
      onImported?.()
    }, TALLY_IMPORT_TIMEOUT_MS)
  }

  /**
   * What the shared button hands back. The upload starts on the choice
   * itself - there is nothing else to decide - and `busy` disables the
   * button until this one has finished, so a second file cannot follow the
   * first into the same import.
   */
  const handleSelect = async (picked) => {
    if (busy) return

    if (!companyId) {
      toast.error('Select a company before importing ledgers.')
      return
    }

    // Tally needs the company by name as well - without it the rows would
    // have nowhere to go after a successful upload.
    if (isTally && !companyName?.trim()) {
      toast.error('Select a company before importing ledgers.')
      return
    }

    setPhaseBoth('uploading')

    try {
      const response = await importLedgerCsv({
        companyId,
        erpType: isTally ? 'tally' : 'intelligere',
        file: picked,
      })

      // ---- Intelligere: the ledgers already exist. The backend's own
      // message says how many, so it is shown exactly as it arrived. ----
      if (!isTally) {
        toast.success(response?.msg || 'Ledgers imported successfully.')
        finishAndReload()
        return
      }

      // ---- Tally: the reply is the rows, and the import is only half done. ----
      const rows = Array.isArray(response) ? response : []

      if (rows.length === 0) {
        finish()
        toast.info(response?.msg || 'No ledgers were found in that file.')
        return
      }

      await sendToTally(rows)
    } catch (failure) {
      // `failure.message` is the backend's own text (see authService).
      finish()
      toast.error(failure.message || 'The file could not be uploaded.')
    }
  }

  /* What the loader says: the upload first, then the wait on Tally, which
     begins the moment the rows have gone out over the socket. */
  const busyLabel =
    phase === 'uploading' ? 'Uploading the CSV...' : 'Creating the ledgers in Tally...'

  return (
    <Panel
      title="Ledger CSV Upload"
      /* The app's shared Loader, in its `inline` size - a row beside the
         heading rather than a box, so the card does not change shape while it
         runs. It goes up when the file does, stays up across the whole Tally
         leg, and comes down only on stop_loader (see onMessage above). */
      actions={busy ? <Loader variant="inline" size="xs" label={busyLabel} /> : null}
    >
      {/* The two buttons, one row, nothing else. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* The shared button - it only picks the file. Everything that
            happens to it afterwards is handleSelect above, because the
            endpoint and the ERP are this page's business, not the button's.
            Its own spinner is the loading state; the words are the loader's,
            so the card does not say the same thing twice. */}
        <CsvUploadButton
          size="sm"
          loading={busy}
          disabled={!companyId || !erpKnown}
          onFileSelect={handleSelect}
        >
          Upload CSV
        </CsvUploadButton>

        {/* Ledger-specific: the blank format that ships with the app. */}
        <Button
          type="button"
          variant="default"
          size="sm"
          icon={Download}
          onClick={handleDownloadFormat}
        >
          Download Format
        </Button>
      </div>
    </Panel>
  )
}
