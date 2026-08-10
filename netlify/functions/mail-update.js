// Netlify serverless function: archiveren, terugzetten of verwijderen van een bewaarde mail.
// Vereist een geldig Hub-inlogtoken.

const { getStore } = require('@netlify/blobs')

const HUB_URL = 'https://swrunlzeydmcskceqdju.supabase.co'
const HUB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cnVubHpleWRtY3NrY2VxZGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjE2MDgsImV4cCI6MjA5MjkzNzYwOH0.V7haNdFPFJuvJJTbjhiUzKrWG8trW4UeRIJveAhFOgs'
const ADMIN_EMAIL = 'robert@circe-advies.nl'

async function getEmailFromToken(token) {
  const res = await fetch(`${HUB_URL}/auth/v1/user`, {
    headers: { apikey: HUB_KEY, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.email || null
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const auth = event.headers.authorization || event.headers.Authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const email = token ? await getEmailFromToken(token) : null
  if (email !== ADMIN_EMAIL) {
    return { statusCode: 403, body: 'Geen toegang' }
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: 'Ongeldige payload' }
  }

  const { id, action } = payload
  if (!id || !['archive', 'unarchive', 'delete'].includes(action)) {
    return { statusCode: 400, body: 'Ongeldige actie' }
  }

  const store = getStore('bewaard')

  if (action === 'delete') {
    await store.delete(id)
    return { statusCode: 200, body: 'OK' }
  }

  const entry = await store.get(id, { type: 'json' })
  if (!entry) return { statusCode: 404, body: 'Niet gevonden' }

  entry.archivedAt = action === 'archive' ? new Date().toISOString() : null
  await store.setJSON(id, entry)

  return { statusCode: 200, body: 'OK' }
}
