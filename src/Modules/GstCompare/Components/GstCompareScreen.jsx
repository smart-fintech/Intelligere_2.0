import { useState } from 'react'
import { CircleAlert, CircleCheck, Download, RefreshCw } from 'lucide-react'
import { useSelector } from 'react-redux'

import purchaseRegisterFormatUrl from '@/Assets/format/PurchaseRegisterFormat.xlsx?url'

import { CsvUploadButton } from '@/Components/Common/CsvUploadButton'
import { CheckboxField, SelectField, SwitchField } from '@/Components/Common/FormFields'
import { Loader, ProgressLoader } from '@/Components/Common/Loader'
import { MultiSelectField } from '@/Components/Common/MultiSelectField'
import { Panel } from '@/Components/Common/Panel'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import GstPortalFetch from '@/Modules/GstCompare/Components/GstPortalFetch'
import LedgerCompareTable from '@/Modules/GstCompare/Components/LedgerCompareTable'
import PortalCompareTable from '@/Modules/GstCompare/Components/PortalCompareTable'
import {
  MONTH_OPTIONS,
  fetchYearOptions,
  financialYearOptions,
  periodMonths,
  purchaseVoucherTypes,
  uploadYearOptions,
} from '@/Modules/GstCompare/gstCompareModel'
import useGstCompare, { LEDGER_SOURCE, PORTAL_SOURCE } from '@/Modules/GstCompare/useGstCompare'
import useVoucherTypes from '@/Modules/SalesInvoice/Voucher/useVoucherTypes'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'

/** What the file buttons accept, on both sides. */
const FILE_TYPES = '.csv,.xlsx'

const NO_BEST_RESULT = "For best results, don't untick this."

const LEDGER_SOURCES = [
  { value: LEDGER_SOURCE.UPLOAD, label: 'Upload CSV' },
  { value: LEDGER_SOURCE.TALLY, label: 'Fetch Tally data' },
  { value: LEDGER_SOURCE.INTELLIGERE, label: 'Fetch Intelligere data' },
  { value: LEDGER_SOURCE.PAST, label: 'View Past Data' },
]

const PORTAL_SOURCES = [
  { value: PORTAL_SOURCE.UPLOAD, label: 'Upload B2B file' },
  { value: PORTAL_SOURCE.API, label: 'Fetch Data from GST Portal' },
]

/** One side's "this is done" or "this is still needed". */
function SideNotice({ done, children }) {
  const Icon = done ? CircleCheck : CircleAlert
  return (
    <p
      role="status"
      className={cn(
        'mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium',
        done ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300',
      )}
    >
      <Icon className="size-4 shrink-0" />
      {children}
    </p>
  )
}

/** Year, From and To - both ledger sources ask for them. */
// function PeriodFields({ compare, years }) {
//   return (
//     <>
//       <SelectField
//         id="gst-compare-year"
//         label="Year"
//         options={years}
//         value={compare.year}
//         onValueChange={compare.setYear}
//       />
//       <SelectField
//         id="gst-compare-from"
//         label="From"
//         required
//         placeholder="From"
//         options={MONTH_OPTIONS}
//         value={compare.startMonth}
//         onValueChange={compare.setStartMonth}
//       />
//       <SelectField
//         id="gst-compare-to"
//         label="To"
//         required
//         placeholder="To"
//         options={MONTH_OPTIONS}
//         value={compare.endMonth}
//         onValueChange={compare.setEndMonth}
//       />
//     </>
//   )
// }

function PeriodFields({ compare, years }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <SelectField
        id="gst-compare-year"
        label="Year"
        className="w-24"
        options={years}
        value={compare.year}
        onValueChange={compare.setYear}
      />

      <SelectField
        id="gst-compare-from"
        label="From"
        required
        placeholder="From"
        className="w-24"
        options={MONTH_OPTIONS}
        value={compare.startMonth}
        onValueChange={compare.setStartMonth}
      />

      <SelectField
        id="gst-compare-to"
        label="To"
        required
        placeholder="To"
        className="w-24"
        options={MONTH_OPTIONS}
        value={compare.endMonth}
        onValueChange={compare.setEndMonth}
      />
    </div>
  );
}

/** The two matching options - the backend matches more loosely without them. */
function MatchOptions({ compare }) {
  return (
    <div className="flex h-10 flex-col justify-center gap-1.5" title={NO_BEST_RESULT}>
      <CheckboxField
        id="gst-compare-date"
        label="Compare Invoice Date"
        checked={compare.compareDate}
        onCheckedChange={compare.setCompareDate}
      />
      <CheckboxField
        id="gst-compare-invoice"
        label="Compare Invoice Number"
        checked={compare.compareInvoice}
        onCheckedChange={compare.setCompareInvoice}
      />
    </div>
  )
}

/** Downloads the blank purchase register. A link, because it is a file in the build. */
function FormatDownload() {
  return (
    <Button asChild variant="outline" size="icon" className="size-10" tooltip="Download Format">
      <a href={purchaseRegisterFormatUrl} download="PurchaseRegisterFormat.xlsx" aria-label="Download format">
        <Download />
      </a>
    </Button>
  )
}

function LedgerSourceForm({ compare, voucherOptions, voucherLoading }) {
  if (compare.isPast) {
    return (
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          id="gst-compare-past-year"
          label="Financial Year"
          className="w-36"
          options={financialYearOptions()}
          value={compare.pastYear}
          onValueChange={compare.setPastYear}
        />
        <Button loading={compare.loadingPast} onClick={compare.viewPastData}>
          Submit
        </Button>
      </div>
    )
  }

  if (compare.ledgerSource === LEDGER_SOURCE.TALLY) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <PeriodFields compare={compare} years={fetchYearOptions()} />
          <MultiSelectField
            id="gst-compare-voucher-types"
            label="Voucher Types"
            required
            className="min-w-40 flex-1"
            options={voucherOptions}
            value={compare.voucherTypes}
            onChange={compare.setVoucherTypes}
            disabled={voucherLoading}
            placeholder={voucherLoading ? 'Loading voucher types...' : 'Select voucher types'}
          />
          <MatchOptions compare={compare} />
          <Button
            size="lg"
            loading={compare.fetchingTally}
            disabled={!compare.periodChosen || compare.voucherTypes.length === 0}
            onClick={compare.fetchFromTally}
          >
            Submit
          </Button>
        </div>
        {compare.noTallyData ? <p className="py-4 text-center text-sm font-medium text-brand">No data found</p> : null}
      </div>
    )
  }

  if (compare.ledgerSource === LEDGER_SOURCE.INTELLIGERE) {
    return (
      <div className="flex flex-wrap items-end gap-3">
        <PeriodFields compare={compare} years={uploadYearOptions()} />
        <MatchOptions compare={compare} />
        <Button size="lg" disabled={!compare.periodChosen} onClick={compare.fetchFromIntelligere}>
          Submit
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <PeriodFields compare={compare} years={uploadYearOptions()} />
      <MatchOptions compare={compare} />

      <div className="flex shrink-0 items-end gap-2 sm:ml-auto">
        <CsvUploadButton
          size="lg"
          multiple
          accept={FILE_TYPES}
          disabled={!compare.periodChosen}
          tooltip={compare.periodChosen ? undefined : 'Choose From and To first'}
          onFileSelect={compare.pickLedgerFiles}
        />
        <FormatDownload />
      </div>
    </div>
  )
}

/**
 * The GST Compare module on screen: the purchase ledger on one side, the GST
 * portal on the other - first how each is supplied, then the comparison with
 * its actions. All the state and requests are useGstCompare's.
 *
 *   company     the active company's record
 *   companyId   its id
 *   onRestart   clears everything back to the start
 */
export default function GstCompareScreen({ company, companyId, onRestart }) {
  const isTally = useSelector(selectIsTallyErp)
  const compare = useGstCompare({ companyName: company.comp_name, companyId  })
  const [showName, setShowName] = useState(false)
  const [showInvoiceValue, setShowInvoiceValue] = useState(false)

  const wantsVoucherTypes = compare.ledgerSource === LEDGER_SOURCE.TALLY && !compare.comparison
  const voucherTypes = useVoucherTypes(company.comp_name, wantsVoucherTypes)
  const voucherOptions = purchaseVoucherTypes(voucherTypes.types)

  const { comparison, isPast, comparing } = compare
  const ledgerBusy = compare.ledgerReady || compare.fetchingTally
  // Tally can only be asked by a company on Tally: for anyone else its connector is not there.
  const ledgerSources = LEDGER_SOURCES.filter((one) =>
    isTally
      ? one.value === LEDGER_SOURCE.TALLY || one.value === LEDGER_SOURCE.UPLOAD || one.value === LEDGER_SOURCE.PAST
      : one.value === LEDGER_SOURCE.INTELLIGERE || one.value === LEDGER_SOURCE.UPLOAD || one.value === LEDGER_SOURCE.PAST
  );

  const waiting = !isPast && !comparison && !comparing && compare.ledgerReady !== compare.portalReady
  // Where a running comparison is: the files going up (a real percentage), then the backend matching them.
  const processing = compare.progress?.stage === 'processing'
  const progressLabel = processing ? 'Processing data - matching your entries...' : 'Uploading files...'
  const progressNote = processing ? 'Large files can take a few minutes. You can keep this tab open.' : undefined

  // The months the comparison was run for. Past data is a whole year, listed by its own months.
  const period = isPast ? null : periodMonths(compare)

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-brand sm:text-2xl">GST Compare</h1>
        <div className="flex flex-wrap items-center gap-4">
          {comparison ? (
            <>
              <SwitchField id="gst-compare-show-name" label="Supplier Name" checked={showName} onCheckedChange={setShowName} />
              <SwitchField id="gst-compare-show-value" label="Invoice Value" checked={showInvoiceValue} onCheckedChange={setShowInvoiceValue} />
              <Button
                size="sm"
                variant="outline"
                icon={Download}
                loading={compare.acting === 'excel'}
                tooltip="Download the purchase ledger and GST portal entries in Excel"
                onClick={compare.downloadExcel}
              >
                Excel
              </Button>
            </>
          ) : null}
          <Button size="icon-sm" variant="outline" icon={RefreshCw} tooltip="Start over" aria-label="Start over" onClick={onRestart} />
        </div>
      </div>

      {/* Two equal columns, whenever both panels are on screen. */}
      <div className={cn('grid gap-4', (comparison || !isPast) && 'xl:grid-cols-2')}>
        <Panel title="Purchase Ledger Data" className="min-w-0"
          actions={period ? (
            <p className="text-xs text-brand">
              <span className="font-medium">From Month: </span>
              {period.from}
              <span className="px-2 text-muted-foreground">|</span>
              <span className="font-medium">To Month: </span>
              {period.to}
            </p>
          ) : null}>
          {waiting ? (
            <SideNotice done={compare.ledgerReady}>
              {compare.ledgerReady ? 'Purchase Ledger Data Uploaded' : 'Upload Purchase Ledger Data'}
            </SideNotice>
          ) : null}

          {!comparison && !comparing && !ledgerBusy ? (
            <div className="space-y-4">
              <ViewSwitch
                idPrefix="gst-compare-ledger-source"
                label="Purchase ledger source"
                className="w-fit max-w-full justify-start"
                options={ledgerSources}
                value={compare.ledgerSource}
                onValueChange={compare.chooseLedgerSource}
              />
              <LedgerSourceForm compare={compare} voucherOptions={voucherOptions} voucherLoading={voucherTypes.status === 'loading'} />
            </div>
          ) : null}

          {compare.fetchingTally ? <Loader label="Fetching your data from Tally..." /> : null}
          {comparing ? (
            <ProgressLoader shape="bar" value={compare.progress?.percent ?? null} label={progressLabel} description={progressNote} />
          ) : null}

          {comparison && !comparing ? (
            <div className="space-y-3">
              {isPast ? (
                <p className="text-xs text-brand">
                  <span className="font-medium">Past months: </span>
                  {compare.pastMonths?.length ? compare.pastMonths.join(', ') : 'No past months available'}
                </p>
              ) : null}
              <LedgerCompareTable
                key={compare.version}
                side={comparison.leftdata}
                showName={showName}
                showInvoiceValue={showInvoiceValue}
                readOnly={isPast}
                acting={compare.acting}
                busyWriting={compare.writingTally}
                onUpdate={compare.updateEntries}
                onRcm={compare.rcm}
                onMoveToMatch={compare.moveEntriesToMatch}
              />
            </div>
          ) : null}
        </Panel>

        {isPast && !comparison ? null : (
          <Panel title="GST Portal Data" className="min-w-0">
            {waiting ? (
              <SideNotice done={compare.portalReady}>
                {compare.portalReady ? 'Uploaded GST Portal Data' : 'Upload GST Portal Data'}
              </SideNotice>
            ) : null}

            {!comparison && !comparing && !compare.portalReady ? (
              <div className="space-y-4">
                <ViewSwitch
                  idPrefix="gst-compare-portal-source"
                  label="GST portal source"
                  className="w-fit max-w-full justify-start"
                  options={PORTAL_SOURCES}
                  value={compare.portalSource}
                  onValueChange={compare.setPortalSource}
                />
                {compare.portalSource === PORTAL_SOURCE.UPLOAD ? (
                  <CsvUploadButton multiple accept={FILE_TYPES} onFileSelect={compare.pickPortalFiles} />
                ) : (
                  <GstPortalFetch
                    companyId={companyId}
                    startMonth={compare.startMonth}
                    endMonth={compare.endMonth}
                    year={compare.year}
                    disabled={!compare.periodChosen}
                    onFetched={compare.markPortalFetched}
                  />
                )}
              </div>
            ) : null}

            {comparing ? (
              <ProgressLoader shape="bar" value={compare.progress?.percent ?? null} label={progressLabel} description={progressNote} />
            ) : null}

            {comparison && !comparing ? (
              <PortalCompareTable
                key={compare.version}
                side={comparison.rightdata}
                showName={showName}
                showInvoiceValue={showInvoiceValue}
                readOnly={isPast}
                acting={compare.acting}
                onGstr3b={compare.downloadGstr3b}
                onBlock={compare.blockEntries}
                onNotConsidered={compare.notToBeConsidered}
              />
            ) : null}
          </Panel>
        )}
      </div>
    </div>
  )
}
