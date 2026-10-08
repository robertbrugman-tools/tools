const assert = require('assert')
process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'
process.env.PIPEDRIVE_API_TOKEN = 'x'

// Nagebootste Pipedrive en Supabase
let pdDeals = []
const tel = new Map(); let status = null
global.fetch = async (url, opts = {}) => {
  const u = new URL(url); const res = (o, s = 200) => ({ ok: s < 300, status: s, text: async () => JSON.stringify(o), json: async () => o })
  if (u.host === 'api.pipedrive.com') {
    const rows = pdDeals.slice().sort((a, b) => new Date(b.add_time) - new Date(a.add_time))
    return res({ success: true, data: rows, additional_data: {} })
  }
  const p = u.pathname
  if (p === '/rest/v1/aanvragen_telling' && (opts.method || 'GET') === 'GET') {
    const rows = [...tel.values()].sort((a, b) => b.add_time.localeCompare(a.add_time)).slice(0, 1).map(r => ({ add_time: r.add_time }))
    return res(rows)
  }
  if (p === '/rest/v1/aanvragen_telling' && opts.method === 'POST') {
    const body = JSON.parse(opts.body); const ins = []
    body.forEach(r => { if (!tel.has(r.deal_id)) { tel.set(r.deal_id, r); ins.push(r) } })
    return res(ins, 201)
  }
  if (p === '/rest/v1/aanvragen_telling_per_dag') {
    const c = {}; [...tel.values()].forEach(r => { c[r.dag] = (c[r.dag] || 0) + 1 })
    return res(Object.entries(c).map(([dag, aantal]) => ({ dag, aantal })))
  }
  if (p === '/rest/v1/aanvragen_telling_status' && opts.method === 'POST') { status = { ...(status || {}), ...JSON.parse(opts.body) }; return res(null, 201) }
  if (p === '/rest/v1/aanvragen_telling_status') return res(status ? [status] : [])
  throw new Error('onverwacht ' + url)
}
const T = require('./aanvragen-telling')

;(async () => {
  pdDeals = [
    { id: 1, add_time: '2026-09-29T10:00:00Z' }, // voor 1 oktober: telt niet
    { id: 2, add_time: '2026-10-01T09:00:00Z' },
    { id: 3, add_time: '2026-10-01T15:00:00Z' },
    { id: 4, add_time: '2026-10-03T22:30:00Z' }, // 4 okt 00:30 Amsterdam
  ]
  const nu = new Date('2026-10-05T09:00:00Z')
  let r = await T.sync(nu); assert.strictEqual(r.nieuw, 3)
  let l = await T.lees(nu)
  assert.deepStrictEqual(l.dagen.map(d => d.aantal), [2, 0, 0, 1, 0]); assert.strictEqual(l.totaal, 3)
  assert.ok(l.laatstBijgewerkt)

  // zelfde data nog eens: niets nieuw, niets dubbel
  r = await T.sync(nu); assert.strictEqual(r.nieuw, 0); assert.strictEqual((await T.lees(nu)).totaal, 3)

  // deal 3 verdwijnt uit Pipedrive (verplaatst of verwijderd): blijft geteld
  pdDeals = pdDeals.filter(d => d.id !== 3)
  r = await T.sync(nu); assert.strictEqual(r.nieuw, 0)
  l = await T.lees(nu); assert.strictEqual(l.totaal, 3); assert.strictEqual(l.dagen[0].aantal, 2)

  // nieuwe deal komt erbij: +1, rest ongewijzigd
  pdDeals.push({ id: 5, add_time: '2026-10-05T07:30:00Z' })
  r = await T.sync(new Date('2026-10-05T09:00:00Z')); assert.strictEqual(r.nieuw, 1)
  l = await T.lees(new Date('2026-10-05T09:00:00Z')); assert.deepStrictEqual(l.dagen.map(d => d.aantal), [2, 0, 0, 1, 1])

  // controlemomenten, zomertijd (UTC+2) en wintertijd (UTC+1)
  const m = (iso) => T.isControleMoment(new Date(iso))
  assert.ok(m('2026-10-08T06:00:00Z'))   // 08:00 zomertijd
  assert.ok(m('2026-10-08T09:00:00Z'))   // 11:00
  assert.ok(m('2026-10-08T12:00:00Z'))   // 14:00
  assert.ok(m('2026-10-08T15:00:00Z'))   // 17:00
  assert.ok(m('2026-10-07T22:00:00Z'))   // 00:00
  assert.ok(!m('2026-10-08T07:00:00Z'))  // 09:00
  assert.ok(!m('2026-10-08T10:00:00Z'))  // 12:00
  assert.ok(m('2026-12-08T07:00:00Z'))   // 08:00 wintertijd
  assert.ok(!m('2026-12-08T06:00:00Z'))  // 07:00 wintertijd
  assert.ok(m('2026-12-08T23:00:00Z'))   // 00:00 wintertijd
  assert.ok(m('2026-10-08T05:58:00Z'))   // twee minuten te vroeg door vertraging: telt nog mee

  assert.strictEqual(T.volgendeControle(new Date('2026-10-08T07:30:00Z')), '2026-10-08T09:00:00.000Z') // na 09:30 -> 11:00
  assert.strictEqual(T.volgendeControle(new Date('2026-10-08T15:30:00Z')), '2026-10-08T22:00:00.000Z') // na 17:30 -> 00:00
  console.log('OK')
})().catch(e => { console.error(e); process.exit(1) })
