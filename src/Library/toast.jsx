/**
 * The only way the app shows a toast.
 *
 * Use it anywhere:
 *   import { toast } from '@/Library/toast'
 *
 *   toast.success('Registration successful')
 *   toast.error('Email already registered')
 *   toast.info('Your report is being prepared')
 *   toast.warning('Your session ends in 5 minutes')
 *
 * A second line is optional:
 *   toast.success('Company saved', { description: 'All changes are live.' })
 *
 * A different length is optional too (milliseconds):
 *   toast.error('Upload failed', { duration: 8000 })
 *
 * THE SAME MESSAGE NEVER APPEARS TWICE.
 * Each toast is given an id built from its kind and its text. Sonner treats a
 * repeat of an existing id as "update the one already on screen" instead of
 * "add another one", so a double click, a retry loop, or React's development
 * double-render can never stack the same message up.
 */

import { toast as sonnerToast } from 'sonner'

import { Toast } from '@/Components/Common/Toast'

// How long a toast stays on screen, and how long the progress bar takes
// to empty. Change it here to change it everywhere.
const DEFAULT_DURATION = 5000

/**
 * Shows one toast.
 * An empty message shows nothing at all, rather than an empty box.
 */
const show = (type, message, options = {}) => {
  if (!message) return

  const { description, duration = DEFAULT_DURATION, ...rest } = options

  // Stamped once per call. If this same message is raised again while it is
  // still on screen, the new stamp tells the progress bar to start over,
  // matching the fresh countdown sonner begins.
  const restartKey = Date.now()

  sonnerToast.custom(
    (id) => (
      <Toast
        type={type}
        title={message}
        description={description}
        duration={duration}
        restartKey={restartKey}
        // The X button closes this toast straight away.
        onDismiss={() => sonnerToast.dismiss(id)}
      />
    ),
    {
      // The id is the whole trick: same text + same kind = same toast.
      id: `${type}:${message}`,
      duration,
      ...rest,
    },
  )
}

export const toast = {
  success: (message, options) => show('success', message, options),
  error: (message, options) => show('error', message, options),
  info: (message, options) => show('info', message, options),
  warning: (message, options) => show('warning', message, options),

  /** Closes one toast, or all of them when called with no argument. */
  dismiss: (id) => sonnerToast.dismiss(id),
}
