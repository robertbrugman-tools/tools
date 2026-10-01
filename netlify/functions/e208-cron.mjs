// Geplande Netlify-functie: haalt elke 4 uur de e208-gegevens op bij Smartcar en bewaart ze.
// Draait alleen op de gepubliceerde (productie)site, niet in `netlify dev`.
// Lokaal uitproberen kan met: npx netlify functions:invoke e208-cron

import smartcar from '../lib/smartcar.js'

export default async () => {
  try {
    const snap = await smartcar.refresh()
    console.log('e208-cron: ok,', (snap.signals || []).length, 'signals, opgehaald', snap.takenAt)
  } catch (err) {
    // Alleen loggen: een mislukte meting mag de planning niet stoppen.
    console.error('e208-cron fout:', err.code || '', err.message)
  }
}

export const config = { schedule: '0 */4 * * *' }
