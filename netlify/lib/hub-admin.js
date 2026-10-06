// Gedeelde hulpjes voor beheer van Hub-gebruikers (alleen de admin).
// De service-sleutel blijft op de server en komt nooit in de browser.

const HUB_URL = process.env.SUPABASE_URL || 'https://swrunlzeydmcskceqdju.supabase.co'
const HUB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cnVubHpleWRtY3NrY2VxZGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjE2MDgsImV4cCI6MjA5MjkzNzYwOH0.V7haNdFPFJuvJJTbjhiUzKrWG8trW4UeRIJveAhFOgs'
const ADMIN_EMAIL = 'robert@circe-advies.nl'

// Houd deze lijst gelijk aan APPS in index.html en aan beheer/index.html.
const APP_KEYS = ['daglicht', 'claude', 'uren', 'taken', 'docs', 'rijradius', 'bewaard', 'linkbeheer', 'e208', 'respyre', 'aanvragen']

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) }
}

// Geeft { user } terug als de aanvrager de ingelogde admin is, anders { denied: kant-en-klaar antwoord }.
async function requireAdmin(event) {
  const auth = event.headers.authorization || event.headers.Authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { denied: json(401, { error: 'Niet ingelogd.' }) }
  const res = await fetch(`${HUB_URL}/auth/v1/user`, { headers: { apikey: HUB_ANON, Authorization: `Bearer ${token}` } })
  if (!res.ok) return { denied: json(401, { error: 'Niet ingelogd.' }) }
  const user = await res.json()
  if (!user || !user.email || user.email.toLowerCase() !== ADMIN_EMAIL) return { denied: json(403, { error: 'Alleen de beheerder mag dit.' }) }
  return { user }
}

function serviceKey() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!k) {
    const e = new Error('SUPABASE_SERVICE_ROLE_KEY is niet ingesteld in Netlify.')
    e.code = 'NO_SERVICE_KEY'
    throw e
  }
  return k
}

// Aanroep met de service-sleutel (admin-API van Supabase en de REST-tabellen).
async function sb(path, { method = 'GET', body, headers = {} } = {}) {
  const key = serviceKey()
  const res = await fetch(HUB_URL + path, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch (_) { data = null }
  return { ok: res.ok, status: res.status, data, text }
}

// Waarheen de uitnodigingslink wijst. Alleen bekende adressen, nooit blind de Host-header overnemen.
function siteBase(event) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '')
  const origin = (event.headers.origin || event.headers.Origin || '').replace(/\/$/, '')
  if (/^https?:\/\/(localhost:\d+|127\.0\.0\.1:\d+|([a-z0-9-]+\.)*robertbrugman\.nl|[a-z0-9-]+\.netlify\.app)$/i.test(origin)) return origin
  return 'https://robertbrugman.nl'
}

function foutTekst(r) {
  const d = r.data || {}
  return d.msg || d.message || d.error_description || d.error || ('Fout ' + r.status)
}

module.exports = { json, requireAdmin, sb, siteBase, foutTekst, APP_KEYS, ADMIN_EMAIL }
