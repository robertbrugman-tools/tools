// Netlify serverless function: ontvangt de Mailgun inbound webhook,
// verifieert de handtekening en slaat het bericht op in Netlify Blobs.
// Mailgun API-sleutel staat als omgevingsvariabele MAILGUN_API_KEY in Netlify.

const crypto = require('crypto')
const Busboy = require('busboy')
const { getStore } = require('@netlify/blobs')

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const fields = {}
    const contentType = event.headers['content-type'] || event.headers['Content-Type']
    if (!contentType) { reject(new Error('Geen content-type header')); return }

    const bb = Busboy({ headers: { 'content-type': contentType } })
    bb.on('field', (name, val) => { fields[name] = val })
    bb.on('file', (name, stream) => { stream.resume() }) // bijlagen negeren
    bb.on('error', reject)
    bb.on('finish', () => resolve(fields))

    const buf = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8')
    bb.end(buf)
  })
}

function verifySignature(fields) {
  const key = process.env.MAILGUN_API_KEY
  if (!key) return false
  const { timestamp, token, signature } = fields
  if (!timestamp || !token || !signature) return false
  const expected = crypto
    .createHmac('sha256', key)
    .update(timestamp + token)
    .digest('hex')
  return expected === signature
}

function extractLinks(text) {
  if (!text) return []
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/g) || []
  return [...new Set(matches)]
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let fields
  try {
    fields = await parseMultipart(event)
  } catch (err) {
    return { statusCode: 400, body: 'Kon bericht niet lezen: ' + err.message }
  }

  if (!verifySignature(fields)) {
    return { statusCode: 401, body: 'Ongeldige handtekening' }
  }

  const body = (fields['stripped-text'] || fields['body-plain'] || '').trim()
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    subject: (fields.subject || '(geen onderwerp)').trim(),
    body,
    links: extractLinks(body),
    from: fields.from || fields.sender || '',
    receivedAt: new Date().toISOString(),
    archivedAt: null,
  }

  const store = getStore('bewaard')
  await store.setJSON(entry.id, entry)

  return { statusCode: 200, body: 'OK' }
}
