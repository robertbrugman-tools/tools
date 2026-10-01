// Gedeelde helpers voor de Peugeot e208-tool (Smartcar v3 API).
// Geheimen komen uit omgevingsvariabelen: SMARTCAR_CLIENT_SECRET (verplicht),
// SMARTCAR_CLIENT_ID (optioneel, het Client ID is geen geheim).

const { getStore } = require('@netlify/blobs')

const SITE_ID = '3811d4ae-1d5e-43ce-b299-bfa15db5a988'
const TOKEN_URL = 'https://iam.smartcar.com/oauth2/token'
const API_URL = 'https://vehicle.api.smartcar.com/v3'
const DEFAULT_CLIENT_ID = 'client_01M3SHGR6YG2PSDM3D5N6XDV7E'

const COOLDOWN_MS = 60 * 1000 // minimaal 60 seconden tussen twee echte opvragen
const HISTORY_MAX = 1000

function store() {
  return getStore({
    name: 'e208',
    siteID: SITE_ID,
    token: process.env.BLOBS_AUTH_TOKEN,
  })
}

async function getAppToken() {
  const clientId = process.env.SMARTCAR_CLIENT_ID || DEFAULT_CLIENT_ID
  const clientSecret = process.env.SMARTCAR_CLIENT_SECRET
  if (!clientSecret) {
    const e = new Error('SMARTCAR_CLIENT_SECRET ontbreekt in de omgevingsvariabelen.')
    e.code = 'NO_SECRET'
    throw e
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) {
    const e = new Error(`Smartcar-token ophalen mislukt (status ${res.status}). Controleer Client ID en secret.`)
    e.code = 'TOKEN_FAILED'
    throw e
  }
  const json = await res.json()
  return json.access_token
}

async function smartcarGet(url, token, extraHeaders) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(extraHeaders || {}) },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const e = new Error(`Smartcar ${res.status} op ${new URL(url).pathname}: ${text.slice(0, 300)}`)
    e.status = res.status
    throw e
  }
  return res.json()
}

// Haalt alle signals op (de API pagineert), met een terugval als page[size] niet wordt geaccepteerd.
async function fetchAllSignals(vehicleId, userId, token) {
  const headers = { 'sc-user-id': userId }
  const base = `${API_URL}/vehicles/${vehicleId}/signals`
  const all = []
  let vehicleInfo = null
  let paged = true

  for (let page = 1; page <= 10; page++) {
    let json
    try {
      json = await smartcarGet(`${base}?page[number]=${page}&page[size]=50`, token, headers)
    } catch (e) {
      if (page === 1 && e.status === 400) {
        paged = false
        json = await smartcarGet(base, token, headers)
      } else {
        throw e
      }
    }
    if (!vehicleInfo && json.included && json.included.vehicle) vehicleInfo = json.included.vehicle.attributes || null
    const data = json.data || []
    all.push(...data)
    const total = json.meta && json.meta.totalCount
    if (!paged || !data.length || !total || all.length >= total) break
  }
  return { raw: all, vehicleInfo }
}

function normalizeSignal(s) {
  const a = s.attributes || {}
  const m = s.meta || {}
  return {
    code: a.code || s.id,
    name: a.name || s.id,
    group: a.group || '',
    status: a.status || null,
    body: a.body === undefined ? null : a.body,
    retrievedAt: m.retrievedAt || null,
    oemUpdatedAt: m.oemUpdatedAt || null,
    ingestedAt: m.ingestedAt || null,
  }
}

function bodyValue(sig) {
  if (!sig) return null
  const b = sig.body
  if (b && typeof b === 'object' && 'value' in b) return b.value
  return b
}

function findSignal(signals, re) {
  return (signals || []).find((s) => re.test(s.code))
}

async function refresh() {
  const token = await getAppToken()

  const conns = await smartcarGet(`${API_URL}/connections?filter[vehicle.mode]=live&page[size]=10`, token)
  const conn = (conns.data || [])[0]
  if (!conn) {
    const e = new Error('Geen verbonden auto gevonden. Verbind je e208 eerst via de Smartcar Connect-link.')
    e.code = 'NO_CONNECTION'
    throw e
  }

  const vehicleId = conn.relationships && conn.relationships.vehicle && conn.relationships.vehicle.data && conn.relationships.vehicle.data.id
  // De documentatie noemt het user-id op twee plekken; probeer beide.
  const candidates = [
    conn.attributes && conn.attributes.user && conn.attributes.user.id,
    conn.relationships && conn.relationships.user && conn.relationships.user.data && conn.relationships.user.data.id,
  ].filter((v, i, arr) => v && arr.indexOf(v) === i)

  if (!vehicleId || !candidates.length) {
    const e = new Error('Verbinding gevonden, maar zonder vehicle-id of user-id.')
    e.code = 'BAD_CONNECTION'
    throw e
  }

  let result = null
  let lastErr = null
  for (const userId of candidates) {
    try {
      result = await fetchAllSignals(vehicleId, userId, token)
      break
    } catch (e) {
      lastErr = e
      if (![400, 401, 403, 404].includes(e.status)) throw e
    }
  }
  if (!result) throw lastErr

  const signals = result.raw.map(normalizeSignal)
  const snapshot = {
    takenAt: new Date().toISOString(),
    vehicle: {
      id: vehicleId,
      ...(result.vehicleInfo || (conn.attributes && conn.attributes.vehicle) || {}),
    },
    signals,
  }

  const s = store()
  await s.setJSON('latest', snapshot)

  const socSig = findSignal(signals, /stateofcharge/i)
  const soc = bodyValue(socSig)
  const odo = bodyValue(findSignal(signals, /odometer/i))
  // Het tijdstip van de meting is het moment dat de auto het meldde, niet het moment van opvragen.
  // Zo krijg je geen dubbele punten als de auto sinds de vorige keer niets nieuws meldde.
  const t = (socSig && socSig.oemUpdatedAt) || snapshot.takenAt
  const history = (await s.get('history', { type: 'json' })) || []
  if (!history.some((h) => h.t === t)) {
    history.push({
      t,
      soc: typeof soc === 'number' ? soc : null,
      odo: typeof odo === 'number' ? odo : null,
    })
    history.sort((a, b) => new Date(a.t) - new Date(b.t))
    await s.setJSON('history', history.slice(-HISTORY_MAX))
  }

  return snapshot
}

async function getState() {
  const s = store()
  const [latest, history] = await Promise.all([
    s.get('latest', { type: 'json' }),
    s.get('history', { type: 'json' }),
  ])
  return { latest: latest || null, history: history || [] }
}

module.exports = { refresh, getState, COOLDOWN_MS }
