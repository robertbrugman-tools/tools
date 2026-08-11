// Netlify serverless function: geeft alle bewaarde mails terug.
// Vereist een geldig Hub-inlogtoken (zelfde Supabase-account als de rest van de tools).

const { getStore } = require('@netlify/blobs')

const HUB_URL = 'https://swrunlzeydmcskceqdju.supabase.co'
const HUB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cnVubHpleWRtY3NrY2VxZGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjE2MDgsImV4cCI6MjA5MjkzNzYwOH0.V7haNdFPFJuvJJTbjhiUzKrWG8trW4UeRIJveAhFOgs'
const ADMIN_EMAIL = 'robert@circe-advies.nl'
const SITE_ID = '3811d4ae-1d5e-43ce-b299-bfa15db5a988'

function bewaardStore() {
  return getStore({
    name: 'bewaard',
    siteID: SITE_ID,
    token: process.env.BLOBS_AUTH_TOKEN,
  })
}

async function getEmailFromToken(token) {
  const res = await fetch(`${HUB_URL}/auth/v1/user`, {
    headers: { apikey: HUB_KEY, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.email || null
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const auth = event.headers.authorization || event.headers.Authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { statusCode: 401, body: 'Niet ingelogd' }

  const email = await getEmailFromToken(token)
  if (email !== ADMIN_EMAIL) {
    return { statusCode: 403, body: 'Geen toegang' }
  }

  try {
    const store = bewaardStore()
    const { blobs } = await store.list()
    const entries = (await Promise.all(
      blobs.map((b) => store.get(b.key, { type: 'json' }))
    )).filter(Boolean)

    entries.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entries),
    }
  } catch (err) {
    console.error('mail-list fout:', err)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message, name: err.name }),
    }
  }
}
