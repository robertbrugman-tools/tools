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

module.exports = { pd, F, PIPELINE_ID, STAGE_ID, SINCE_ISO, fetchNewDeals, fetchByIds, fetchDeal, fetchNotes }
