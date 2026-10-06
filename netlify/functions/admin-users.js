// Netlify function: gebruikersbeheer voor de Hub. Alleen de admin mag dit aanroepen.
//   POST { action: 'list' }
//   POST { action: 'invite', email, apps: [...] }   -> maakt het account en geeft een eenmalige link
//   POST { action: 'newlink', userId }              -> nieuwe link (uitnodiging of wachtwoord opnieuw instellen)
//   POST { action: 'setApps', userId, apps: [...] } -> vervangt de rechten van die gebruiker
//   POST { action: 'remove', userId }               -> verwijdert het account en alle rechten
// Er wordt geen mail verstuurd. De link geef je zelf door (WhatsApp, Signal, enzovoort).
// De link gaat naar /wachtwoord/ en wordt pas verbruikt als de gebruiker daar zelf op de knop klikt.

const { json, requireAdmin, sb, siteBase, foutTekst, APP_KEYS, ADMIN_EMAIL } = require('../lib/hub-admin')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function schoneApps(apps) {
  return [...new Set((Array.isArray(apps) ? apps : []).filter(a => APP_KEYS.includes(a)))]
}

function maakLink(event, data, type) {
  const th = data && (data.hashed_token || (data.properties && data.properties.hashed_token))
  if (!th) return null
  return `${siteBase(event)}/wachtwoord/?th=${encodeURIComponent(th)}&type=${type}`
}

async function zetRechten(userId, apps) {
  const del = await sb(`/rest/v1/hub_permissions?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' })
  if (!del.ok) return foutTekst(del)
  if (apps.length) {
    const ins = await sb('/rest/v1/hub_permissions', { method: 'POST', body: apps.map(app_key => ({ user_id: userId, app_key })), headers: { Prefer: 'return=minimal' } })
    if (!ins.ok) return foutTekst(ins)
  }
  return null
}

async function haalGebruiker(userId) {
  const r = await sb(`/auth/v1/admin/users/${encodeURIComponent(userId)}`)
  return r.ok ? r.data : null
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }
  const { denied } = await requireAdmin(event)
  if (denied) return denied

  let p
  try { p = JSON.parse(event.body || '{}') } catch (_) { return json(400, { error: 'Ongeldige aanvraag.' }) }

  try {
    if (p.action === 'list') {
      const [u, perms] = await Promise.all([
        sb('/auth/v1/admin/users?per_page=200'),
        sb('/rest/v1/hub_permissions?select=user_id,app_key'),
      ])
      if (!u.ok) return json(502, { error: foutTekst(u) })
      const byUser = {}
      ;((perms.ok && perms.data) || []).forEach(r => { (byUser[r.user_id] = byUser[r.user_id] || []).push(r.app_key) })
      const users = ((u.data && u.data.users) || []).map(x => ({
        id: x.id,
        email: x.email,
        isAdmin: (x.email || '').toLowerCase() === ADMIN_EMAIL,
        status: x.last_sign_in_at ? 'actief' : (x.email_confirmed_at || x.confirmed_at ? 'nog niet ingelogd' : 'uitgenodigd'),
        lastSignInAt: x.last_sign_in_at || null,
        apps: byUser[x.id] || [],
      })).sort((a, b) => (b.isAdmin - a.isAdmin) || String(a.email).localeCompare(String(b.email)))
      return json(200, { users, apps: APP_KEYS })
    }

    if (p.action === 'invite') {
      const email = String(p.email || '').trim().toLowerCase()
      if (!EMAIL_RE.test(email)) return json(400, { error: 'Dit is geen geldig e-mailadres.' })
      if (email === ADMIN_EMAIL) return json(400, { error: 'Dit is je eigen account.' })
      const apps = schoneApps(p.apps)
      const g = await sb('/auth/v1/admin/generate_link', { method: 'POST', body: { type: 'invite', email } })
      if (!g.ok) {
        if (g.status === 422 || /already|registered|exists/i.test(foutTekst(g))) {
          return json(409, { error: 'Dit adres heeft al een account. Gebruik "Nieuwe link" bij die gebruiker in de lijst.' })
        }
        return json(502, { error: foutTekst(g) })
      }
      const userId = g.data.id || (g.data.user && g.data.user.id)
      const link = maakLink(event, g.data, 'invite')
      if (!userId || !link) return json(502, { error: 'Supabase gaf geen bruikbare link terug.' })
      const permErr = await zetRechten(userId, apps)
      await sb('/rest/v1/hub_user_info?on_conflict=user_id', { method: 'POST', body: { user_id: userId, email }, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } })
      return json(200, { userId, email, link, apps, waarschuwing: permErr ? 'Account is aangemaakt, maar de rechten opslaan mislukte: ' + permErr : null })
    }

    if (p.action === 'newlink') {
      const user = await haalGebruiker(p.userId)
      if (!user) return json(404, { error: 'Gebruiker niet gevonden.' })
      if ((user.email || '').toLowerCase() === ADMIN_EMAIL) return json(400, { error: 'Gebruik voor je eigen account de gewone wachtwoord-reset in Supabase.' })
      let type = user.last_sign_in_at ? 'recovery' : 'invite'
      let g = await sb('/auth/v1/admin/generate_link', { method: 'POST', body: { type, email: user.email } })
      if (!g.ok && type === 'invite') {
        type = 'recovery'
        g = await sb('/auth/v1/admin/generate_link', { method: 'POST', body: { type, email: user.email } })
      }
      if (!g.ok) return json(502, { error: foutTekst(g) })
      const link = maakLink(event, g.data, type)
      if (!link) return json(502, { error: 'Supabase gaf geen bruikbare link terug.' })
      return json(200, { email: user.email, link })
    }

    if (p.action === 'setApps') {
      const user = await haalGebruiker(p.userId)
      if (!user) return json(404, { error: 'Gebruiker niet gevonden.' })
      if ((user.email || '').toLowerCase() === ADMIN_EMAIL) return json(400, { error: 'De beheerder heeft altijd alles.' })
      const apps = schoneApps(p.apps)
      const err = await zetRechten(user.id, apps)
      if (err) return json(502, { error: err })
      return json(200, { apps })
    }

    if (p.action === 'remove') {
      const user = await haalGebruiker(p.userId)
      if (!user) return json(404, { error: 'Gebruiker niet gevonden.' })
      if ((user.email || '').toLowerCase() === ADMIN_EMAIL) return json(400, { error: 'Je eigen account kun je hier niet verwijderen.' })
      await sb(`/rest/v1/hub_permissions?user_id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE' })
      await sb(`/rest/v1/hub_user_info?user_id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE' })
      const d = await sb(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' })
      if (!d.ok) return json(502, { error: foutTekst(d) })
      return json(200, { removed: user.email })
    }

    return json(400, { error: 'Onbekende actie.' })
  } catch (err) {
    console.error('admin-users fout:', err.message)
    return json(err.code === 'NO_SERVICE_KEY' ? 500 : 502, { error: err.message })
  }
}
