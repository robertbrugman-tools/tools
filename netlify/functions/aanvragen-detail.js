// Netlify function: bijlagen van een aanvraag, zodat je het totale plaatje ziet.
//   GET ?dealId=123 -> { files: [{id, name, type, size, addTime, remote, remoteLocation}] }

const { checkAccess } = require('../lib/hub-auth')
const { fetchDeal, fetchAllFiles } = require('../lib/pipedrive')
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
    return json(200, {
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
