import { useRef, useState } from 'react'
import { Paperclip, Upload, X } from 'lucide-react'

import { InlineAlert } from '@/Components/Common/DataList'
import { TextareaField } from '@/Components/Common/FormFields'
import { formatBytes } from '@/Components/Common/Loader/helpers'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { refreshDocuVault } from '@/Modules/DocuVault/docuVault'
import { uploadDocument } from '@/Services/docuVaultService'

/**
 * Upload - one description, any number of files picked or dropped.
 *
 * Each file is its own request, one after the other. The first failure stops the
 * rest: when storage runs out, every later file would only get the same answer.
 * What did not go stays in the list with the backend's message, ready to retry.
 * The modal cannot be closed while files are going up.
 */
export default function DocumentUploadModal({ companyName, email, onClose }) {
  const inputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [description, setDescription] = useState('')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(0) // the file going up now, from 1; 0 when idle
  const [problem, setProblem] = useState(null)

  const addFiles = (picked) => {
    setFiles((previous) => [...previous, ...Array.from(picked ?? [])])
    setProblem(null)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    if (!uploading) addFiles(event.dataTransfer.files)
  }

  const handleUpload = async () => {
    const note = description.trim()
    let sent = 0
    setProblem(null)

    try {
      for (const file of files) {
        setUploading(sent + 1)
        await uploadDocument({
          companyName,
          email,
          file,
          description: note,
          count: sent + 1,
          documentCount: files.length,
        })
        sent += 1
      }
      toast.success(sent === 1 ? 'Document uploaded successfully.' : `${sent} documents uploaded successfully.`)
      onClose()
    } catch (failure) {
      setFiles(files.slice(sent))
      setProblem(failure.message)
      toast.error(failure.message)
    } finally {
      setUploading(0)
      // Also after a refusal: a "storage full" answer is news to the figures on screen.
      refreshDocuVault(companyName, email)
    }
  }

  return (
    <Modal
      open
      onOpenChange={() => {
        if (!uploading) onClose()
      }}
      title="Upload Document"
      closeOnBackdropClick={!uploading}
      closeOnEsc={!uploading}
      showCloseButton={!uploading}
      footer={
        <>
          <Button type="button" variant="outline" disabled={Boolean(uploading)} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" icon={Upload} loading={Boolean(uploading)} disabled={files.length === 0} onClick={handleUpload}>
            {uploading ? `Uploading ${uploading} of ${files.length}` : 'Upload'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {problem ? <InlineAlert>{problem}</InlineAlert> : null}

        <TextareaField
          id="docuvault-description"
          label="Document Description"
          value={description}
          disabled={Boolean(uploading)}
          onChange={(event) => setDescription(event.target.value)}
        />

        <button
          type="button"
          disabled={Boolean(uploading)}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex w-full cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed px-4 py-6 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-60 ${
            dragging ? 'border-brand bg-brand-soft' : 'border-input hover:border-brand/50'
          }`}
        >
          <Upload className="size-5 text-brand" />
          <span className="font-medium text-brand">Select or Drop Documents</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(event) => {
            addFiles(event.target.files)
            // Cleared, so choosing the same file again still fires `change`.
            event.target.value = ''
          }}
        />

        {files.length > 0 ? (
          <ul className="space-y-1.5">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex h-9 items-center gap-2 rounded-md border border-input pr-1 pl-3 text-sm">
                <Paperclip className="size-4 shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  disabled={Boolean(uploading)}
                  onClick={() => setFiles(files.filter((_, at) => at !== index))}
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-brand-soft hover:text-brand focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Modal>
  )
}
