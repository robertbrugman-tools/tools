// Telling van binnengekomen aanvragen per dag. De telling staat in Supabase (tabel aanvragen_telling,
// een rij per deal) en groeit alleen: een deal die eenmaal geteld is, blijft geteld, ook als hij later
// in Pipedrive naar een andere kolom of pipeline gaat of verwijderd wordt.
// Bij elke controle halen we alleen de nieuwe deals op (het verschil met wat al is opgeslagen).

const { sb, foutTekst } = require('./hub-admin')
const { pd, PIPELINE_ID, SINCE_ISO } = require('./pipedrive')

const TZ = 'Europe/Amsterdam'
const CONTROLE_UREN = [0, 8, 11, 14, 17] // lokale tijd: 00:00, 08:00, 11:00, 14:00, 17:00
const dagFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const uurFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' })
const dagVan = (d) => dagFmt.format(d)
const uurVan = (d) => Number(uurFmt.format(d))

// Is het nu (of net) een van de vaste controlemomenten? De scheduler draait elk uur; een paar minuten
// speling vangt kleine vertragingen op.
function isControleMoment(nu = new Date()) {
  return CONTROLE_UREN.includes(uurVan(new Date(nu.getTime() + 3 * 60000)))
}

// Eerstvolgende vaste controle na nu, als ISO-tijd.
function volgendeControle(nu = new Date()) {
  const start = Math.floor(nu.getTime() / 3600000) * 3600000
  for (let k = 1; k <= 48; k++) {
    const t = new Date(start + k * 3600000)
    if (CONTROLE_UREN.includes(uurVan(t)) && t.getTime() > nu.getTime()) return t.toISOString()
  }
  return null
}

function tabelFout(r) {
  const e = new Error(foutTekst(r) + '. Zijn de tabellen voor de telling aangemaakt (zie aanvragen/telling.sql)?')
  e.code = 'NO_TABLE'
  return e
}

// Alle deals in de pipeline met add_time vanaf sinceMs, nieuwste eerst. Geen filter op kolom of status.
async function dealsSinds(sinceMs, maxPages = 20) {
  const out = []
  let cursor
  for (let page = 0; page < maxPages; page++) {
    const data = await pd('/api/v2/deals', {
      pipeline_id: PIPELINE_ID,
      sort_by: 'add_time',
      sort_direction: 'desc',
      limit: 500,
      cursor,
    })
    const rows = data.data || []
    let oud = false
    for (const d of rows) {
      if (new Date(d.add_time).getTime() >= sinceMs) out.push(d)
      else oud = true
    }
    cursor = data.additional_data && data.additional_data.next_cursor
    if (oud || !cursor || rows.length === 0) break
  }
  return out
}

// Haalt alleen op wat nieuw is en slaat het op. Veilig om vaker of tegelijk te draaien.
async function sync(nu = new Date()) {
  const wm = await sb('/rest/v1/aanvragen_telling?select=add_time&order=add_time.desc&limit=1')
  if (!wm.ok) throw tabelFout(wm)
  const bekend = wm.data && wm.data[0] ? new Date(wm.data[0].add_time).getTime() : 0
  // Twee dagen terug als marge, zodat niets tussen wal en schip valt. Dubbelen worden genegeerd.
  const sinds = Math.max(new Date(SINCE_ISO).getTime(), bekend - 2 * 864e5)
  const deals = await dealsSinds(sinds)
  const rijen = deals.map(d => ({ deal_id: d.id, add_time: new Date(d.add_time).toISOString(), dag: dagVan(new Date(d.add_time)) }))

  let nieuw = 0
  for (let i = 0; i < rijen.length; i += 200) {
    const r = await sb('/rest/v1/aanvragen_telling?on_conflict=deal_id', {
      method: 'POST',
      body: rijen.slice(i, i + 200),
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    })
    if (!r.ok) throw tabelFout(r)
    nieuw += Array.isArray(r.data) ? r.data.length : 0
  }
  await zetStatus({ laatst_bijgewerkt: nu.toISOString(), laatste_fout: null })
  return { nieuw, bekeken: deals.length }
}

async function zetStatus(velden) {
  try {
    await sb('/rest/v1/aanvragen_telling_status?on_conflict=id', {
      method: 'POST',
      body: { id: 1, ...velden },
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    })
  } catch (_) { /* status is bijzaak */ }
}

async function meldFout(tekst) { await zetStatus({ laatste_fout: String(tekst).slice(0, 300) }) }

// Opgeslagen telling per dag, van 1 oktober t/m vandaag, ook dagen zonder aanvragen.
async function lees(nu = new Date()) {
  const [pd_, st] = await Promise.all([
    sb('/rest/v1/aanvragen_telling_per_dag?select=dag,aantal&order=dag.asc&limit=2000'),
    sb('/rest/v1/aanvragen_telling_status?select=laatst_bijgewerkt,laatste_fout&id=eq.1'),
  ])
  if (!pd_.ok) throw tabelFout(pd_)
  const perDag = {}
  ;(pd_.data || []).forEach(r => { perDag[r.dag] = r.aantal })
  const dagen = []
  const [y, m, dd] = dagVan(new Date(SINCE_ISO)).split('-').map(Number)
  const tot = dagVan(nu)
  for (let t = Date.UTC(y, m - 1, dd); ; t += 864e5) {
    const k = new Date(t).toISOString().slice(0, 10)
    if (k > tot) break
    dagen.push({ dag: k, aantal: perDag[k] || 0 })
  }
  const s = st.ok && Array.isArray(st.data) && st.data[0] ? st.data[0] : {}
  return {
    since: SINCE_ISO,
    today: tot,
    dagen,
    totaal: dagen.reduce((a, d) => a + d.aantal, 0),
    laatstBijgewerkt: s.laatst_bijgewerkt || null,
    laatsteFout: s.laatste_fout || null,
    volgendeControle: volgendeControle(nu),
  }
}

module.exports = { sync, lees, meldFout, isControleMoment, volgendeControle, dagVan, uurVan, CONTROLE_UREN }
