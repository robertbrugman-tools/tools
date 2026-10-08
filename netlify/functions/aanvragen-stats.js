// Netlify function: aantal binnengekomen aanvragen per dag (Pipeline incoming, alle kolommen en statussen),
// vanaf 1 oktober 2026. Telt dus ook aanvragen die al zijn afgehandeld of verplaatst.
//   GET -> { since, today, dagen: [{ dag: 'yyyy-mm-dd', aantal }], totaal }
// Toegang: de admin, of een hub-gebruiker met het recht 'aanvragen'.

const { checkAccess } = require('../lib/hub-auth')
const { pd, PIPELINE_ID, SINCE_ISO } = require('../lib/pipedrive')

const APP_KEY = 'aanvragen'
const TZ = 'Europe/Amsterdam'
const dagFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const dagVan = (d) => dagFmt.format(d) // yyyy-mm-dd in Amsterdamse tijd

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) }
}

// Alle deals uit de pipeline sinds SINCE_ISO, nieuwste eerst. Geen filter op kolom of status.
async function dealsSinds(sinceIso, maxPages = 20) {
  const since = new Date(sinceIso).getTime()
  const out = []
  let cursor
  for (let page = 0; page < maxPages; page++) {
    const data = await pd('/api/v2/deals', {
      pipeline_id: PIPELINE_ID,
      sort_by: 'add_time',
      sort_direction: 'desc',
      limit: 500,
      cursor,
    })
    const rows = data.data || []
    let oud = false
    for (const d of rows) {
      if (new Date(d.add_time).getTime() >= since) out.push(d)
      else oud = true
    }
    cursor = data.additional_data && data.additional_data.next_cursor
    if (oud || !cursor || rows.length === 0) break
  }
  return out
}

// Dagen van de eerste dag t/m vandaag, ook dagen zonder aanvragen.
function telPerDag(deals, sinceIso, nu = new Date()) {
  const perDag = {}
  deals.forEach(d => { const k = dagVan(new Date(d.add_time)); perDag[k] = (perDag[k] || 0) + 1 })
  const van = dagVan(new Date(sinceIso)) // 2026-10-01 (de grens ligt op 00:00 Amsterdams)
  const tot = dagVan(nu)
  const dagen = []
  // kalenderdagen optellen in UTC zodat zomer/wintertijd niets verschuift
  const [y, m, dd] = van.split('-').map(Number)
  for (let t = Date.UTC(y, m - 1, dd); ; t += 864e5) {
    const k = new Date(t).toISOString().slice(0, 10)
    if (k > tot) break
    dagen.push({ dag: k, aantal: perDag[k] || 0 })
  }
  return dagen
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }
  const denied = await checkAccess(event, APP_KEY)
  if (denied) return denied
  try {
    const deals = await dealsSinds(SINCE_ISO)
    const dagen = telPerDag(deals, SINCE_ISO)
    return json(200, { since: SINCE_ISO, today: dagVan(new Date()), dagen, totaal: deals.length })
  } catch (err) {
    console.error('aanvragen-stats fout:', err.message)
    return json(err.code === 'NO_PIPEDRIVE_TOKEN' ? 500 : 502, { error: err.message, code: err.code || null })
  }
}

exports.telPerDag = telPerDag
