// Netlify function: geeft een verzoek van de Warmtedoorgang-tool door aan de Supabase Edge Function
// 'netatmo-backfill' (die ontbrekende Netatmo-metingen ophaalt en opslaat).
// Waarom via hier: de Edge Function stuurt geen CORS-headers, dus de browser mag hem niet rechtstreeks
// aanroepen. Vanaf de server speelt CORS geen rol. Er wordt alleen de publieke anon key gebruikt.

const SUPA_FN = 'https://swrunlzeydmcskceqdju.supabase.co/functions/v1/netatmo-backfill'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cnVubHpleWRtY3NrY2VxZGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjE2MDgsImV4cCI6MjA5MjkzNzYwOH0.V7haNdFPFJuvJJTbjhiUzKrWG8trW4UeRIJveAhFOgs'

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'alleen POST' }
  let body
  try { body = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'ongeldige JSON' }) } }
  const { date_begin, date_end, rooms } = body
  const okDate = s => typeof s === 'string' && !isNaN(Date.parse(s))
  if (!okDate(date_begin) || !okDate(date_end)) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'date_begin en date_end zijn verplicht' }) }
  const cleanRooms = Array.isArray(rooms) ? rooms.filter(r => typeof r === 'string' && r.length < 40).slice(0, 10) : undefined
  try {
    // Netatmo geeft af en toe een tijdelijke storing (code 27); dan tot 2 keer opnieuw proberen.
    let resp, text
    for (let poging = 0; poging < 3; poging++) {
      resp = await fetch(SUPA_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ date_begin, date_end, rooms: cleanRooms })
      })
      text = await resp.text()
      if (resp.ok || !/temporarily unavailable|"code":\s*27/i.test(text)) break
      await new Promise(r => setTimeout(r, 2500))
    }
    return { statusCode: resp.status, headers: { 'Content-Type': 'application/json' }, body: text }
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Supabase niet bereikbaar: ' + e.message }) }
  }
}
