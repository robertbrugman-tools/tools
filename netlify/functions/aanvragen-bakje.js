// Netlify function: handmatig verplaatsen van een aanvraag naar een ander bakje.
//   POST { dealId, bucket }          -> bewaart de keuze (wint van de automatische indeling)
//   POST { dealId, bucket: null }    -> terug naar automatisch
// Er wordt niets in Pipedrive aangepast. De keuze staat in tabel aanvragen_bakje.

const { json, requireAccess, sb, foutTekst } = require('../lib/hub-admin')
const { BUCKETS } = require('../lib/aanvragen-classify')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }
  const acc = await requireAccess(event, 'aanvragen')
  if (acc.denied) return acc.denied
  let b
  try { b = JSON.parse(event.body || '{}') } catch (_) { return json(400, { error: 'Ongeldige aanvraag.' }) }
  const dealId = Number(b.dealId)
  if (!Number.isInteger(dealId) || dealId <= 0) return json(400, { error: 'Ongeldige aanvraag.' })
  try {
    if (b.bucket === null || b.bucket === undefined) {
      const r = await sb(`/rest/v1/aanvragen_bakje?deal_id=eq.${dealId}`, { method: 'DELETE' })
      if (!r.ok) return json(502, { error: foutTekst(r) })
      return json(200, { ok: true, bucket: null })
    }
    if (!BUCKETS[b.bucket]) return json(400, { error: 'Onbekend bakje.' })
    const automatisch = BUCKETS[b.automatisch] ? b.automatisch : null
    const r = await sb('/rest/v1/aanvragen_bakje?on_conflict=deal_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { deal_id: dealId, bucket: b.bucket, automatisch, door: acc.user.email, bijgewerkt: new Date().toISOString() },
    })
    if (!r.ok) return json(502, { error: foutTekst(r) })
    return json(200, { ok: true, bucket: b.bucket })
  } catch (err) {
    console.error('aanvragen-bakje fout:', err.message)
    return json(500, { error: err.message })
  }
}
