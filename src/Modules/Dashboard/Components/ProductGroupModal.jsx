/**
 * The New Product Group dialog - opened from the "+" beside the Group
 * dropdown of the Product form, for a group the dropdown does not have yet.
 *
 * One box, one request: POST inventory/product_group_list/ with the active
 * company's name and the new group's (see createProductGroup). The form
 * gives this component a new `key` each time it is opened, so it always
 * starts empty.
 *
 * Props:
 *   open, onOpenChange   controlled by the form, the same as Modal
 *   companyName          the active company - never typed
 *   existing             the names already in the dropdown, so one of them
 *                        is not created a second time
 *   onCreated(name)      after the backend has accepted it; the form reloads
 *                        the groups and selects this one
 */

import { useState } from 'react'

import { Field } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { createProductGroup } from '@/Services/productService'

const FORM_ID = 'product-group-form'

export default function ProductGroupModal({ open, onOpenChange, companyName, existing, onCreated }) {
  const [name, setName] = useState('')
  const [error, setError] = useState(undefined)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    // This form sits inside the Product form: without this, its submit
    // would travel up and try to save the product as well.
    event.stopPropagation()
    if (submitting) return

    const groupName = name.trim()

    if (!groupName) {
      setError('Group name is required')
      return
    }

    if (existing.some((entry) => entry.toLowerCase() === groupName.toLowerCase())) {
      setError('This group already exists')
      return
    }

    if (!companyName) {
      toast.error('Select a company before adding a product group.')
      return
    }

    setSubmitting(true)

    try {
      const response = await createProductGroup(companyName, groupName)
      toast.success(response?.msg || 'Product group created')
      onCreated?.(groupName)
    } catch (failure) {
      // `failure.message` is the backend's own `msg` (see authService).
      toast.error(failure.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New Product Group"
      size="sm"
      closeOnBackdropClick={!submitting}
      closeOnEsc={!submitting}
      showCloseButton={!submitting}
      footer={
        <>
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={submitting}>
            {submitting ? 'Saving...' : 'Save Group'}
          </Button>
        </>
      }
    >
      {/* `p-1`: room for the focus ring, inside the dialog's scroll box. */}
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="p-1">
        <Field
          id="product-group-name"
          label="Group Name"
          required
          autoComplete="off"
          value={name}
          error={error}
          disabled={submitting}
          onChange={(event) => {
            setName(event.target.value)
            setError(undefined)
          }}
        />
      </form>
    </Modal>
  )
}
