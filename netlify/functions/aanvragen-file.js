// Netlify function: een bijlage uit Pipedrive downloaden, alleen als hij echt bij deze aanvraag hoort.
//   GET ?dealId=123&fileId=456 -> het bestand (base64 verpakt door Netlify)
// Netlify-functies kunnen ongeveer 6 MB antwoorden, daarom een grens van 4,5 MB op het ruwe bestand.

const { checkAccess } = require('../lib/hub-auth')
const { fetchDeal, fetchAllFiles, pdBinary } = require('../lib/pipedrive')
const { isExternBestand } = require('../lib/aanvragen-raw')

const APP_KEY = 'aanvragen'
const MAX_BYTES = 4.5 * 1024 * 1024

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }
  const denied = await checkAccess(event, APP_KEY)
  if (denied) return denied

  const q = event.queryStringParameters || {}
  const dealId = Number(q.dealId)
  const fileId = Number(q.fileId)
  if (!dealId || !fileId) return json(400, { error: 'dealId of fileId ontbreekt.' })

  try {
    const deal = await fetchDeal(dealId)
    const pid = deal.person_id && (deal.person_id.value || deal.person_id)
    const files = await fetchAllFiles(dealId, pid)
    const meta = files.find(f => Number(f.id) === fileId)
    if (!meta) return json(404, { error: 'Dit bestand hoort niet bij deze aanvraag.' })
    if (isExternBestand(meta)) return json(422, { error: 'Dit is een gekoppeld extern bestand. Open het in Pipedrive.' })
    if (meta.file_size && meta.file_size > MAX_BYTES) return json(413, { error: 'Het bestand is te groot om hier te tonen (' + Math.round(meta.file_size / 1048576 * 10) / 10 + ' MB). Open het in Pipedrive.' })

    const { buf, type } = await pdBinary('/v1/files/' + fileId + '/download')
    if (buf.length > MAX_BYTES) return json(413, { error: 'Het bestand is te groot om hier te tonen. Open het in Pipedrive.' })
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'Content-Type': type,
        'Content-Disposition': 'attachment',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
      body: buf.toString('base64'),
    }
  } catch (err) {
    console.error('aanvragen-file fout:', err.message)
    return json(err.code === 'NO_PIPEDRIVE_TOKEN' ? 500 : 502, { error: err.message, code: err.code || null })
  }
}
