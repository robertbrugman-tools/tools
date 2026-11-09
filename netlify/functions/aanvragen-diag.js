// TIJDELIJK DIAGNOSEBESTAND. Alleen voor lokaal gebruik (netlify dev). NIET mergen naar main.
// Meet per dienst hoe lang een kleine aanvraag duurt, zodat zichtbaar wordt welke stap traag is.
//   /.netlify/functions/aanvragen-diag?test=pipedrive | supabase | anthropic | anthropic-lang
// Geeft geen sleutels terug, alleen status en tijd.

const MODEL = process.env.RESPYRE_MODEL || 'claude-sonnet-5-5'
const TIJDLIMIET_MS = 25000

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj, null, 2) }
}

async function gemeten(naam, fn) {
  const t0 = Date.now()
  try {
    const info = await fn()
    return { test: naam, gelukt: true, ms: Date.now() - t0, ...info }
  } catch (err) {
    const timeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError')
    return { test: naam, gelukt: false, ms: Date.now() - t0, fout: timeout ? 'Geen antwoord binnen ' + TIJDLIMIET_MS / 1000 + ' seconden' : String(err && err.message) }
  }
}

async function anthropic(body) {
  const key = process.env.RESPYRE_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('Geen Anthropic-sleutel gevonden in de omgeving')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, ...body }),
    signal: AbortSignal.timeout(TIJDLIMIET_MS),
  })
  const data = await res.json().catch(() => ({}))
  return {
    status: res.status,
    model: MODEL,
    uitvoerTokens: data.usage && data.usage.output_tokens,
    stopReden: data.stop_reason,
    foutmelding: data.error && data.error.message,
  }
}

const TESTS = {
  pipedrive: async () => {
    const token = process.env.PIPEDRIVE_API_TOKEN
    if (!token) throw new Error('Geen PIPEDRIVE_API_TOKEN gevonden in de omgeving')
    const res = await fetch('https://api.pipedrive.com/api/v2/deals?limit=1', {
      headers: { 'x-api-token': token, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIJDLIMIET_MS),
    })
    return { status: res.status }
  },
  supabase: async () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!key) throw new Error('Geen SUPABASE_SERVICE_ROLE_KEY gevonden in de omgeving')
    const res = await fetch('https://swrunlzeydmcskceqdju.supabase.co/rest/v1/aanvragen_regels?select=id&limit=1', {
      headers: { apikey: key, Authorization: 'Bearer ' + key },
      signal: AbortSignal.timeout(TIJDLIMIET_MS),
    })
    return { status: res.status }
  },
  anthropic: () => anthropic({ max_tokens: 20, messages: [{ role: 'user', content: 'Zeg alleen: ok' }] }),
  'anthropic-lang': () => anthropic({
    max_tokens: 900,
    messages: [{ role: 'user', content: 'Schrijf een e-mail van ongeveer 300 woorden in het Nederlands over de voordelen van mosbeton voor een gevel, met drie kopjes.' }],
  }),
}

exports.handler = async (event) => {
  // Alleen lokaal: netlify dev zet NETLIFY_DEV en CONTEXT=dev
  if (process.env.NETLIFY_DEV !== 'true' && process.env.CONTEXT !== 'dev') {
    return json(404, { fout: 'Dit diagnosebestand werkt alleen lokaal.' })
  }
  const test = (event.queryStringParameters || {}).test
  if (!TESTS[test]) return json(200, { kies: Object.keys(TESTS).map(t => '?test=' + t) })
  return json(200, await gemeten(test, TESTS[test]))
}
