// Netlify function: notities en bijlagen van een aanvraag, zodat je het totale plaatje ziet.
//   GET ?dealId=123 -> { notes: [{id, addTime, text | items:[{nr,vraag,antwoord}]}], verborgen, files: [{id, name, type, size, addTime, remote}] }

const { checkAccess } = require('../lib/hub-auth')
const { fetchDeal, fetchNotesFull, fetchAllFiles } = require('../lib/pipedrive')
const { filterNotes } = require('../lib/aanvragen-notes')

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
    const [notes, files] = await Promise.all([fetchNotesFull(dealId), fetchAllFiles(dealId, pid)])
    const f = filterNotes(notes)
    return json(200, {
      notes: f.notes,
      verborgen: f.verborgen,
      files: files.map(f => ({
        id: f.id,
        name: f.name || f.file_name || ('bestand ' + f.id),
        type: f.file_type || '',
        size: f.file_size || 0,
        addTime: f.add_time || null,
        remote: !!f.remote_location,
      })),
    })
  } catch (err) {
    console.error('aanvragen-detail fout:', err.message)
    return json(err.code === 'NO_PIPEDRIVE_TOKEN' ? 500 : 502, { error: err.message, code: err.code || null })
  }
}
