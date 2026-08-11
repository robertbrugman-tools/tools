// Netlify serverless function: ontvangt nieuwe zelf-gestuurde mails vanaf het
// lokale sync-script op Robert's Mac (leest via Proton Bridge, zie bewaard-sync/).
// Authenticatie via een gedeeld secret (SYNC_SECRET), geen Mailgun nodig.

const { getStore } = require('@netlify/blobs')

const SITE_ID = '3811d4ae-1d5e-43ce-b299-bfa15db5a988'

function bewaardStore() {
  return getStore({
    name: 'bewaard',
    siteID: SITE_ID,
    token: process.env.BLOBS_AUTH_TOKEN,
  })
}

function extractLinks(text) {
  if (!text) return []
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/g) || []
  return [...new Set(matches)]
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const secret = event.headers['x-sync-secret'] || event.headers['X-Sync-Secret']
  if (!secret || secret !== process.env.SYNC_SECRET) {
    return { statusCode: 401, body: 'Ongeldig secret' }
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: 'Ongeldige payload' }
  }

  const { subject, body, messageId, from, receivedAt } = payload
  if (!messageId) {
    return { statusCode: 400, body: 'messageId ontbreekt' }
  }

  const store = bewaardStore()

  // Voorkom dubbele opslag als het lokale script iets nog eens stuurt
  const dedupeKey = `msgid:${messageId}`
  const already = await store.get(dedupeKey)
  if (already) {
    return { statusCode: 200, body: 'Al opgeslagen' }
  }

  const cleanBody = (body || '').trim()
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    subject: (subject || '(geen onderwerp)').trim(),
    body: cleanBody,
    links: extractLinks(cleanBody),
    from: from || '',
    receivedAt: receivedAt || new Date().toISOString(),
    archivedAt: null,
  }

  await store.set(dedupeKey, entry.id)
  await store.setJSON(entry.id, entry)

  return { statusCode: 200, body: 'OK' }
}
