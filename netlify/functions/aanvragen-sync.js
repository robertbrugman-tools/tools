// Netlify scheduled function: controleert op vaste momenten op nieuwe aanvragen en telt ze bij.
// Het schema staat in netlify.toml (elk uur). De functie doet alleen iets om 00:00, 08:00, 11:00, 14:00
// en 17:00 Nederlandse tijd, zodat zomer- en wintertijd vanzelf kloppen.
// Scheduled functions draaien alleen online (productie), niet in netlify dev. Lokaal gebruik je de knop "Nu bijwerken".

const { sync, meldFout, isControleMoment } = require('../lib/aanvragen-telling')

exports.handler = async () => {
  if (!isControleMoment()) return { statusCode: 200, body: 'Geen controlemoment.' }
  try {
    const r = await sync()
    console.log('aanvragen-sync:', JSON.stringify(r))
    return { statusCode: 200, body: JSON.stringify(r) }
  } catch (err) {
    console.error('aanvragen-sync fout:', err.message)
    await meldFout(err.message)
    return { statusCode: 500, body: err.message }
  }
}
