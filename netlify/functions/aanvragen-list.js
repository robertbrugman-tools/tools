// Netlify function: nieuwe aanvragen uit Pipedrive (Pipeline incoming, kolom "Form ingevuld"),
// vanaf 1 oktober 2026, ingedeeld in bakjes.
//   GET  -> lijst met aanvragen + indeling
//   GET ?debug=1 -> alleen voor de admin-test: ruwe eerste deal, om veldnamen te controleren
// Toegang: de admin, of een hub-gebruiker met het recht 'aanvragen'.

const { checkAccess } = require('../lib/hub-auth')
const { classify, BUCKETS } = require('../lib/aanvragen-classify')
const { F, SINCE_ISO, fetchNewDeals, fetchByIds } = require('../lib/pipedrive')
const { rawFields, priveMail } = require('../lib/aanvragen-raw')

const APP_KEY = 'aanvragen'

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }
  const denied = await checkAccess(event, APP_KEY)
  if (denied) return denied

  try {
    const deals = await fetchNewDeals()
    const persons = await fetchByIds('persons', deals.map(d => d.person_id && (d.person_id.value || d.person_id)))
    const orgs = await fetchByIds('organizations', deals.map(d => d.org_id && (d.org_id.value || d.org_id)))

    if (event.queryStringParameters && event.queryStringParameters.debug) {
      return json(200, { aantal: deals.length, eersteDeal: deals[0] || null, eerstePersoon: deals[0] ? persons[deals[0].person_id] || null : null })
    }

    const items = deals.map(d => {
      const pid = d.person_id && (d.person_id.value || d.person_id)
      const oid = d.org_id && (d.org_id.value || d.org_id)
      const person = persons[pid] || null
      const org = orgs[oid] || null
      const c = classify(d, person, org, F, '')
      const email = person && Array.isArray(person.emails) && person.emails.length
        ? (person.emails.find(e => e.primary) || person.emails[0]).value
        : null
      return {
        id: d.id,
        addTime: d.add_time,
        title: d.title,
        person: { name: person ? person.name : null, email },
        org: org ? org.name : null,
        labels: c.labels,
        raw: rawFields(d, F),
        priveMail: priveMail(email),
        ...c,
      }
    })

    const counts = {}
    Object.keys(BUCKETS).forEach(k => { counts[k] = 0 })
    items.forEach(i => { counts[i.bucket] = (counts[i.bucket] || 0) + 1 })

    return json(200, { fetchedAt: new Date().toISOString(), since: SINCE_ISO, total: items.length, counts, buckets: BUCKETS, items })
  } catch (err) {
    console.error('aanvragen-list fout:', err.message)
    return json(err.code === 'NO_PIPEDRIVE_TOKEN' ? 500 : 502, { error: err.message, code: err.code || null })
  }
}
