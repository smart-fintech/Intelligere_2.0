/**
 * The pre bid chat's plain logic - no React, no requests.
 *
 * A load (POST procurement/pre_bid_chat/ { pre_bid_id }) answers with every
 * conversation of the pre bid, by vendor email:
 *
 *   { "ddspl@gmail.com": [{ message, send_by: "user" | "vendor", send_to, date_time, ... }] }
 *
 * and the socket pushes each message as it is saved, with `seq` - its place in
 * that vendor's conversation, the same as its index in the load. `seq` is what
 * keeps a message the load already has from being shown twice.
 *
 *   threadKey(email)          one conversation, however the email is spelt
 *   readThreads(reply)        { key: { email, messages: [{ seq, text, fromVendor, sentAt }] } }
 *   readSocketMessage(data)   a chat_message push -> { thread, email, seq, raw }, or null
 *   mergeLive(threads, live)  the load with the pushes it does not have yet
 *   showSentAt(dateTime)      "23-10-2026 16:21"
 */

export const threadKey = (email) => String(email ?? '').trim().toLowerCase()

const readMessage = (raw, seq) => ({
  seq,
  text: String(raw?.message ?? ''),
  fromVendor: String(raw?.send_by ?? '').toLowerCase() === 'vendor',
  sentAt: raw?.date_time ?? '',
})

export const readThreads = (reply) => {
  const threads = {}
  if (!reply || typeof reply !== 'object' || Array.isArray(reply)) return threads
  Object.entries(reply).forEach(([email, list]) => {
    if (!Array.isArray(list)) return
    threads[threadKey(email)] = { email, messages: list.map(readMessage) }
  })
  return threads
}

export const readSocketMessage = (data) => {
  if (data?.type !== 'chat_message' || !data.message) return null
  const email = data.vendor_email ?? data.message.vendor_email ?? ''
  return { thread: threadKey(email), email, seq: Number.isInteger(data.seq) ? data.seq : null, raw: data.message }
}

/** A push with no `seq` is matched on its text and time instead. */
const alreadyShown = (messages, push) =>
  push.seq !== null
    ? messages.some((message) => message.seq === push.seq)
    : messages.some((message) => message.text === String(push.raw?.message ?? '') && message.sentAt === push.raw?.date_time)

export const mergeLive = (threads, live) => {
  if (live.length === 0) return threads
  const merged = { ...threads }
  live.forEach((push) => {
    const thread = merged[push.thread] ?? { email: push.email, messages: [] }
    if (alreadyShown(thread.messages, push)) return
    const seq = push.seq ?? thread.messages.length
    merged[push.thread] = {
      ...thread,
      messages: [...thread.messages, readMessage(push.raw, seq)].sort((a, b) => a.seq - b.seq),
    }
  })
  return merged
}

const pad = (number) => String(number).padStart(2, '0')

export const showSentAt = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return String(value ?? '')
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
