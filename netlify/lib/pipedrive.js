// Kleine Pipedrive-client (API v2). Token komt uit omgevingsvariabele PIPEDRIVE_API_TOKEN.

const BASE = 'https://api.pipedrive.com'

async function pd(path, params = {}) {
  const token = process.env.PIPEDRIVE_API_TOKEN
  if (!token) {
    const e = new Error('PIPEDRIVE_API_TOKEN is niet ingesteld in Netlify.')
    e.code = 'NO_PIPEDRIVE_TOKEN'
    throw e
  }
  const url = new URL(BASE + path)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  })
  const res = await fetch(url, { headers: { 'x-api-token': token, Accept: 'application/json' } })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch (_) { data = null }
  if (!res.ok || !data || data.success === false) {
    const e = new Error('Pipedrive gaf status ' + res.status + (data && data.error ? ': ' + data.error : ''))
    e.status = res.status
    throw e
  }
  return data
}

// Velden (sleutels uit getAccountContext)
const F = {
  locatie: 'fcc41de6f2f116a72e844fa3167db85f0b5a0a34',
  grootte: '8aca5fb70e5267ea96fc911c4ab5798c83c8c8ef',
  bouwtype: 'dd0d766d5a5ade8f3457a38c00fc375b6a0a9973',
  projectnaam: '9b81d52136c7c4110e18a2d7cf84c25aa9104751',
  specifics: '0d00acc16bf246a9d2dd550da487fddef269a1f0',
  requirements: '6d805135da62de308c026ee64bd0b3011e038eb5',
  opmerkingen: '31260dd066fa2b55e902d5481c7557cec3be7d0e',
  marktsegment: '36c03c0fddbde11ce0f3de00bef424a7f32d5c5d',
}

const PIPELINE_ID = 1 // Pipeline incoming
const STAGE_ID = 7 // Form ingevuld
const SINCE_ISO = '2026-09-30T22:00:00Z' // 1 oktober 2026, 00:00 Amsterdam

// Haalt open deals uit de kolom, nieuwste eerst, tot aan SINCE_ISO.
async function fetchNewDeals(sinceIso = SINCE_ISO, maxPages = 10) {
  const since = new Date(sinceIso).getTime()
  const out = []
  let cursor
  for (let page = 0; page < maxPages; page++) {
    const data = await pd('/api/v2/deals', {
      pipeline_id: PIPELINE_ID,
      stage_id: STAGE_ID,
      status: 'open',
      sort_by: 'add_time',
      sort_direction: 'desc',
      limit: 100,
      cursor,
    })
    const rows = data.data || []
    let reachedOld = false
    for (const d of rows) {
      if (new Date(d.add_time).getTime() >= since) out.push(d)
      else reachedOld = true
    }
    cursor = data.additional_data && data.additional_data.next_cursor
    if (reachedOld || !cursor || rows.length === 0) break
  }
  return out
}

async function fetchByIds(kind, ids) {
  const uniq = [...new Set(ids.filter(Boolean))]
  const map = {}
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100)
    try {
      const data = await pd('/api/v2/' + kind, { ids: chunk.join(','), limit: 100 })
      ;(data.data || []).forEach(r => { map[r.id] = r })
    } catch (err) {
      // Terugval: één voor één
      for (const id of chunk) {
        try { map[id] = (await pd(`/api/v2/${kind}/${id}`)).data } catch (_) { /* overslaan */ }
      }
    }
  }
  return map
}

async function fetchDeal(id) {
  return (await pd(`/api/v2/deals/${id}`)).data
}

async function fetchNotes(dealId) {
  try {
    const data = await pd('/v1/notes', { deal_id: dealId, limit: 20 })
    return (data.data || []).map(n => String(n.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
  } catch (_) {
    return []
  }
}

// Binair bestand uit Pipedrive (voor bijlagen)
async function pdBinary(path) {
  const token = process.env.PIPEDRIVE_API_TOKEN
  if (!token) {
    const e = new Error('PIPEDRIVE_API_TOKEN is niet ingesteld in Netlify.')
    e.code = 'NO_PIPEDRIVE_TOKEN'
    throw e
  }
  const res = await fetch(BASE + path, { headers: { 'x-api-token': token } })
  if (!res.ok) {
    const e = new Error('Pipedrive gaf status ' + res.status + ' bij het ophalen van het bestand.')
    e.status = res.status
    throw e
  }
  return { buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || 'application/octet-stream' }
}

async function fetchFilesFor(kind, id) {
  try {
    const data = await pd(`/v1/${kind}/${id}/files`, { limit: 100 })
    return data.data || []
  } catch (_) {
    return []
  }
}

// Bijlagen bij de deal en bij de contactpersoon, zonder dubbelen
async function fetchAllFiles(dealId, personId) {
  const lists = await Promise.all([fetchFilesFor('deals', dealId), personId ? fetchFilesFor('persons', personId) : []])
  const seen = new Set()
  const out = []
  lists.flat().forEach(f => { if (f && !seen.has(f.id)) { seen.add(f.id); out.push(f) } })
  return out
}

// Notities met datum (HTML verwijderd, regeleinden behouden)
async function fetchNotesFull(dealId) {
  try {
    const data = await pd('/v1/notes', { deal_id: dealId, limit: 30, sort: 'add_time DESC' })
    return (data.data || []).map(n => ({
      id: n.id,
      addTime: n.add_time,
      text: String(n.content || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim(),
    })).filter(n => n.text)
  } catch (_) {
    return []
  }
}

module.exports = { pdBinary, fetchFilesFor, fetchAllFiles, fetchNotesFull, pd, F, PIPELINE_ID, STAGE_ID, SINCE_ISO, fetchNewDeals, fetchByIds, fetchDeal, fetchNotes }
