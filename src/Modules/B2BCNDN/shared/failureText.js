/**
 * What to show for a failed B2B / CNDN request. Some of its failures carry no
 * text (CNDN's empty 404s) or a whole server error page, neither of which is
 * a message - `fallback` is shown then.
 */
export const failureText = (failure, fallback) => {
  const message = String(failure?.message ?? '').trim()
  return !message || message.startsWith('<') ? fallback : message
}
