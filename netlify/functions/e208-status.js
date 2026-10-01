// Netlify serverless function: status van de Peugeot e208 via Smartcar.
//   GET  -> geeft de laatst opgeslagen stand + historie terug
//   POST -> haalt eerst verse data bij Smartcar op (met 60 seconden afkoeltijd), daarna idem
// Toegang: de admin, of een hub-gebruiker met het recht 'e208' (tabel hub_permissions).

const { refresh, getState, COOLDOWN_MS } = require('../lib/smartcar')

const HUB_URL = 'https://swrunlzeydmcskceqdju.supabase.co'
const HUB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cnVubHpleWRtY3NrY2VxZGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjE2MDgsImV4cCI6MjA5MjkzNzYwOH0.V7haNdFPFJuvJJTbjhiUzKrWG8trW4UeRIJveAhFOgs'
const ADMIN_EMAIL = 'robert@circe-advies.nl'

const APP_KEY = 'e208'

async function getUser(token) {
  const res = await fetch(`${HUB_URL}/auth/v1/user`, {
    headers: { apikey: HUB_KEY, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data && data.id ? { id: data.id, email: data.email || null } : null
}

// De RLS-policy "hub_perm_self" laat een gebruiker alleen de eigen rechten lezen,
// dus we vragen met het token van de gebruiker zelf.
async function hasPermission(token, userId) {
  const url = `${HUB_URL}/rest/v1/hub_permissions?select=app_key&user_id=eq.${encodeURIComponent(userId)}&app_key=eq.${APP_KEY}`
  const res = await fetch(url, { headers: { apikey: HUB_KEY, Authorization: `Bearer ${token}` } })
  if (!res.ok) return false
  const rows = await res.json()
  return Array.isArray(rows) && rows.length > 0
}

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }
}

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const auth = event.headers.authorization || event.headers.Authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { statusCode: 401, body: 'Niet ingelogd' }
  const user = await getUser(token)
  if (!user) return { statusCode: 401, body: 'Niet ingelogd' }
  const allowed = user.email === ADMIN_EMAIL || (await hasPermission(token, user.id))
  if (!allowed) return { statusCode: 403, body: 'Geen toegang' }

  try {
    if (event.httpMethod === 'POST') {
      const current = await getState()
      const age = current.latest ? Date.now() - new Date(current.latest.takenAt).getTime() : Infinity
      if (age < COOLDOWN_MS) {
        return json(200, { ...current, cooldown: true })
      }
      try {
        await refresh()
      } catch (err) {
        console.error('e208 refresh fout:', err.message)
        const state = await getState()
        return json(502, { error: err.message, code: err.code || null, ...state })
      }
    }
    return json(200, await getState())
  } catch (err) {
    console.error('e208-status fout:', err.message)
    return json(500, { error: 'Interne fout: ' + err.message })
  }
}
