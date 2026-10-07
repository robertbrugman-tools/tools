// Ruwe gegevens uit Pipedrive, zoals de aanvrager ze heeft ingevuld, plus een hint over het e-mailadres.

const PRIVE_MAIL = /@(gmail|googlemail|hotmail|outlook|live|msn|icloud|me|yahoo|ymail|proton|protonmail|pm|gmx|web|ziggo|kpnmail|planet|hetnet|telenet|skynet|t-online|libero|virgilio|wp|o2|orange|free|laposte)\./i

function fmtAddr(a) {
  if (!a) return ''
  if (typeof a === 'string') return a
  const parts = [a.locality || a.city, a.admin_area_level_1, a.country || a.country_name].filter(Boolean)
  if (parts.length) return parts.join(', ')
  return a.value || a.formatted_address || ''
}

function plain(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) return v.value
  return v
}

// Volgorde en namen zoals in Pipedrive
function rawFields(deal, F) {
  const cf = deal.custom_fields || {}
  const rows = [
    ['Locatie', fmtAddr(cf[F.locatie])],
    ['Grootte', plain(cf[F.grootte])],
    ['Bouw type', plain(cf[F.bouwtype])],
    ['Project name', plain(cf[F.projectnaam])],
    ['Specifics', plain(cf[F.specifics])],
    ['Specific requirements', plain(cf[F.requirements])],
    ['Opmerkingen', plain(cf[F.opmerkingen])],
  ]
  return rows.map(([label, value]) => ({ label, value: value === null || value === undefined ? '' : String(value).trim() }))
}

function priveMail(email) {
  return !!email && PRIVE_MAIL.test(email)
}

module.exports = { rawFields, priveMail, fmtAddr }
