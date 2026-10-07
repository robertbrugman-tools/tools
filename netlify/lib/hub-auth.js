// Gedeelde inlogcontrole voor Hub-tools (zelfde patroon als e208-status.js).
// Toegang: de admin, of een hub-gebruiker met het recht APP_KEY in tabel hub_permissions.

const HUB_URL = 'https://swrunlzeydmcskceqdju.supabase.co'
const HUB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cnVubHpleWRtY3NrY2VxZGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjE2MDgsImV4cCI6MjA5MjkzNzYwOH0.V7haNdFPFJuvJJTbjhiUzKrWG8trW4UeRIJveAhFOgs'
const ADMIN_EMAIL = 'robert@circe-advies.nl'

async function getUser(token) {
  const res = await fetch(`${HUB_URL}/auth/v1/user`, {
    headers: { apikey: HUB_KEY, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data && data.id ? { id: data.id, email: data.email || null } : null
}

async function hasPermission(token, userId, appKey) {
  const url = `${HUB_URL}/rest/v1/hub_permissions?select=app_key&user_id=eq.${encodeURIComponent(userId)}&app_key=eq.${appKey}`
  const res = await fetch(url, { headers: { apikey: HUB_KEY, Authorization: `Bearer ${token}` } })
  if (!res.ok) return false
  const rows = await res.json()
  return Array.isArray(rows) && rows.length > 0
}

// Geeft null terug als alles in orde is, anders een kant-en-klaar Netlify-antwoord.
async function checkAccess(event, appKey) {
  const auth = event.headers.authorization || event.headers.Authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { statusCode: 401, body: 'Niet ingelogd' }
  const user = await getUser(token)
  if (!user) return { statusCode: 401, body: 'Niet ingelogd' }
  const allowed = user.email === ADMIN_EMAIL || (await hasPermission(token, user.id, appKey))
  if (!allowed) return { statusCode: 403, body: 'Geen toegang' }
  return null
}

module.exports = { checkAccess }
