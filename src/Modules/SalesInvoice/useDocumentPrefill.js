import { useRef, useState } from 'react'

import { prefillSourcesOf } from '@/Constants/salesInvoice'
import { toast } from '@/Library/toast'
import { getPrefillDocumentDetails, getPrefillDocuments } from '@/Services/documentPrefillService'

const IDLE_LIST = Object.freeze({ status: 'idle', rows: [], error: null })

/**
 * PREFILL FROM's two choices, for the document type being made
 * (Services/documentPrefillService):
 *
 *   const prefill = useDocumentPrefill({ companyId, documentType, enabled, onDocument, onClear })
 *
 *   prefill.sources        the types it may be prefilled from (prefillSourcesOf) - [] means
 *                          no Prefill From (Debit Note, the purchase types), or not now (`enabled`)
 *   prefill.sourceType     the source type chosen ('' for none) - only ever one of `sources`
 *   prefill.list           { status: 'idle' | 'loading' | 'ready' | 'failed', rows, error } -
 *                          that type's documents (invoice/document-details/)
 *   prefill.documentId     the document chosen ('' for none)
 *   prefill.loadingDocument   its details are on their way
 *   prefill.chooseSource(type)   another type: the document chosen and the list are cleared,
 *                          the new type's list asked for ('' clears it all)
 *   prefill.chooseDocument(id)   its details asked for (invoice/prefill-document-details/),
 *                          then onDocument(record, { documentType, documentId, documentNo })
 *   prefill.retryList()
 *   prefill.clear()        back to nothing chosen (a new document)
 *
 * Every request carries a ticket: an answer to a choice since replaced - a
 * list for a type no longer chosen, a document no longer chosen - is dropped,
 * never shown or put in the form. onClear() runs whenever the choice a form
 * may have been filled from goes away (another type, none).
 */
export default function useDocumentPrefill({ companyId, documentType, enabled, onDocument, onClear }) {
  const sources = enabled ? prefillSourcesOf(documentType) : []
  const [chosenType, setChosenType] = useState('')
  const [list, setList] = useState(IDLE_LIST)
  const [documentId, setDocumentId] = useState('')
  const [loadingDocument, setLoadingDocument] = useState(false)
  const listTicket = useRef(0)
  const documentTicket = useRef(0)

  // A source the current type does not allow is not chosen (the type changed under it).
  const sourceType = sources.includes(chosenType) ? chosenType : ''

  const loadList = (type) => {
    const ticket = ++listTicket.current
    documentTicket.current += 1
    setLoadingDocument(false)
    setDocumentId('')
    if (!type) {
      setList(IDLE_LIST)
      return
    }
    if (companyId === null || companyId === undefined || String(companyId).trim() === '') {
      setList({ status: 'failed', rows: [], error: 'No company is selected.' })
      toast.error('Select a company before prefilling a document.')
      return
    }
    setList({ status: 'loading', rows: [], error: null })
    getPrefillDocuments({ companyId, documentType: type })
      .then((rows) => {
        if (ticket === listTicket.current) setList({ status: 'ready', rows, error: null })
      })
      .catch((failure) => {
        if (ticket !== listTicket.current) return
        const message = failure.message || 'The documents could not be loaded.'
        setList({ status: 'failed', rows: [], error: message })
        toast.error(message)
      })
  }

  const chooseSource = (type) => {
    const next = sources.includes(type) ? type : ''
    if (next === sourceType && list.status !== 'failed') return
    setChosenType(next)
    onClear?.()
    loadList(next)
  }

  const chooseDocument = (id) => {
    const document = list.rows.find((row) => String(row.documentId) === String(id))
    if (!document || !sourceType) return
    const ticket = ++documentTicket.current
    const type = sourceType
    setDocumentId(String(document.documentId))
    setLoadingDocument(true)
    getPrefillDocumentDetails([document])
      .then((records) => {
        if (ticket !== documentTicket.current) return
        if (records.length === 0) {
          toast.info(`No details were found for ${document.documentNo} - nothing was filled in.`)
          return
        }
        onDocument(records[0], { documentType: type, documentId: document.documentId, documentNo: document.documentNo })
        toast.success(`Filled in from ${type} ${document.documentNo}.`)
      })
      .catch((failure) => {
        if (ticket === documentTicket.current) toast.error(failure.message || `${document.documentNo} could not be loaded.`)
      })
      .finally(() => {
        if (ticket === documentTicket.current) setLoadingDocument(false)
      })
  }

  const clear = () => {
    listTicket.current += 1
    documentTicket.current += 1
    setChosenType('')
    setList(IDLE_LIST)
    setDocumentId('')
    setLoadingDocument(false)
  }

  return {
    sources,
    sourceType,
    // The list and the document belong to the source chosen - none while it is not allowed.
    list: sourceType ? list : IDLE_LIST,
    documentId: sourceType ? documentId : '',
    loadingDocument: Boolean(sourceType) && loadingDocument,
    chooseSource,
    chooseDocument,
    retryList: () => loadList(sourceType),
    clear,
  }
}
