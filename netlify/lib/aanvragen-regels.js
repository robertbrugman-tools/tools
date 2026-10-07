// Leerregels die Robert via feedback op concepten heeft opgebouwd. Ze staan in Supabase (tabel aanvragen_regels),
// zodat lokaal en online dezelfde regels gebruiken.

const { sb } = require('./hub-admin')

const MAX_REGELS = 60
let cache = { t: 0, rows: [] }

async function actieveRegels() {
  if (Date.now() - cache.t < 20000) return cache.rows
  try {
    const r = await sb(`/rest/v1/aanvragen_regels?select=id,regel,bucket,created_at&actief=eq.true&order=created_at.asc&limit=${MAX_REGELS}`)
    cache = { t: Date.now(), rows: r.ok && Array.isArray(r.data) ? r.data : [] }
  } catch (_) {
    cache = { t: Date.now(), rows: [] } // geen tabel of geen sleutel: concepten blijven gewoon werken
  }
  return cache.rows
}

function wisCache() { cache = { t: 0, rows: [] } }

function regelsVoorPrompt(rows, bucket) {
  const r = (rows || []).filter(x => !x.bucket || x.bucket === bucket)
  if (!r.length) return ''
  return [
    '# LEERREGELS VAN ROBERT',
    'Deze regels komen uit Roberts eigen feedback op eerdere concepten. Als ze de kennis hierboven tegenspreken, gaan deze regels voor. Pas een regel alleen toe als de voorwaarde in de regel op deze aanvraag van toepassing is. Verzin zelf geen aanvullende feiten bij een regel.',
    ...r.map(x => '- ' + x.regel),
  ].join('\n')
}

module.exports = { actieveRegels, regelsVoorPrompt, wisCache, MAX_REGELS }
