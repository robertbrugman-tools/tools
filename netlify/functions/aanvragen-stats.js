// Netlify function: aantal binnengekomen aanvragen per dag, vanaf 1 oktober 2026.
// De telling komt uit Supabase en groeit alleen. Nieuwe aanvragen worden op vaste momenten bijgeteld
// (aanvragen-sync) of direct met de knop "Nu bijwerken".
//   GET  -> { since, today, dagen: [{ dag, aantal }], totaal, laatstBijgewerkt, volgendeControle, laatsteFout }
//   POST -> haalt eerst de nieuwe aanvragen op (alleen het verschil), geeft dan hetzelfde terug
// Toegang: de admin, of een hub-gebruiker met het recht 'aanvragen'.

const { checkAccess } = require('../lib/hub-auth')
const { sync, lees } = require('../lib/aanvragen-telling')

const APP_KEY = 'aanvragen'

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }
  const denied = await checkAccess(event, APP_KEY)
  if (denied) return denied
  try {
    let uit = await lees()
    // Eerste keer, of op verzoek: eerst bijwerken. Daarna alleen nog het verschil.
    if (event.httpMethod === 'POST' || !uit.laatstBijgewerkt) {
      const r = await sync()
      uit = { ...(await lees()), nieuw: r.nieuw }
    }
    return json(200, uit)
  } catch (err) {
    console.error('aanvragen-stats fout:', err.message)
    const code = err.code === 'NO_PIPEDRIVE_TOKEN' || err.code === 'NO_SERVICE_KEY' ? 500 : 502
    return json(code, { error: err.message, code: err.code || null })
  }
}
