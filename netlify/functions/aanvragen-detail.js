// Netlify function: bijlagen en formulierantwoorden van een aanvraag, zodat je het totale plaatje ziet.
//   GET ?dealId=123 -> { formulier: [{vraag, antwoord}], files: [{id, name, type, size, addTime, remote, remoteLocation}] }
// formulier: de vrije antwoorden uit de formuliernotitie (vanaf vraag 11 en "hoe heeft u ons gevonden"), alleen als ingevuld.

const { checkAccess } = require('../lib/hub-auth')
const { fetchDeal, fetchAllFiles, fetchNotesFull } = require('../lib/pipedrive')
const { filterNotes } = require('../lib/aanvragen-notes')
const { isExternBestand } = require('../lib/aanvragen-raw')

const APP_KEY = 'aanvragen'

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }
  const denied = await checkAccess(event, APP_KEY)
  if (denied) return denied

  const dealId = Number((event.queryStringParameters || {}).dealId)
  if (!dealId) return json(400, { error: 'Geen dealId meegegeven.' })

  try {
    const deal = await fetchDeal(dealId)
    const pid = deal.person_id && (deal.person_id.value || deal.person_id)
    const files = await fetchAllFiles(dealId, pid)
    let formulier = []
    try {
      formulier = filterNotes(await fetchNotesFull(dealId)).notes.filter(n => n.items).flatMap(n => n.items.map(i => ({ vraag: i.vraag, antwoord: i.antwoord })))
    } catch (_) { /* notities zijn aanvullend: bijlagen tonen we ook zonder */ }
    return json(200, {
      formulier,
      files: files.map(f => ({
        id: f.id,
        name: f.name || f.file_name || ('bestand ' + f.id),
        type: f.file_type || '',
        size: f.file_size || 0,
        addTime: f.add_time || null,
        remote: isExternBestand(f),
        remoteLocation: f.remote_location || null,
      })),
    })
  } catch (err) {
    console.error('aanvragen-detail fout:', err.message)
    return json(err.code === 'NO_PIPEDRIVE_TOKEN' ? 500 : 502, { error: err.message, code: err.code || null })
  }
}
