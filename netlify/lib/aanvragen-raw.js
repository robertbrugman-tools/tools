// Ruwe gegevens uit Pipedrive, zoals de aanvrager ze heeft ingevuld, plus een hint over het e-mailadres.

// Gratis of provider-adressen: geen bedrijfsdomein. Vergeleken met het eigenlijke domein (zonder subdomein en landextensie).
const GRATIS_MAIL = new Set(['gmail', 'googlemail', 'hotmail', 'outlook', 'live', 'msn', 'icloud', 'me', 'mac', 'yahoo', 'ymail', 'proton', 'protonmail', 'pm', 'gmx', 'web', 'ziggo', 'kpnmail', 'planet', 'hetnet', 'telenet', 'skynet', 'tele2', 'upcmail', 'casema', 'chello', 'home', 'online', 'zonnet', 'xs4all', 't-online', 'libero', 'virgilio', 'wp', 'o2', 'orange', 'free', 'laposte', 'aol', 'yandex', 'mail', 'bluewin', 'btinternet', 'sky', 'comcast', 'qq', 'naver', 'rediffmail'])
const TWEEDE_NIVEAU = new Set(['co', 'com', 'org', 'net', 'ac', 'gov'])

function mailDomein(email) {
  const m = String(email || '').trim().toLowerCase().match(/@([a-z0-9.-]+)$/)
  if (!m) return null
  const d = m[1].replace(/\.+$/, '')
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) ? d : null
}

// Het deel van het domein dat de naam van de partij is, bijvoorbeeld "bedrijf" in mail.bedrijf.co.uk
function domeinNaam(d) {
  const p = d.split('.')
  if (p.length === 2) return p[0]
  return TWEEDE_NIVEAU.has(p[p.length - 2]) && p.length >= 3 ? p[p.length - 3] : p[p.length - 2]
}

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
  const d = mailDomein(email)
  return !!d && GRATIS_MAIL.has(domeinNaam(d))
}

// Gok voor de website van de aanvrager: www.<domein van het e-mailadres>. Leeg bij gratis mailproviders.
// Het is een afgeleid adres en niet gecontroleerd.
function websiteVanMail(email) {
  const d = mailDomein(email)
  if (!d || GRATIS_MAIL.has(domeinNaam(d))) return null
  const kaal = d.replace(/^www\./, '')
  const delen = kaal.split('.')
  const metWww = delen.length === 2 || (delen.length === 3 && TWEEDE_NIVEAU.has(delen[1]))
  const host = metWww ? 'www.' + kaal : kaal
  return { url: 'https://' + host, label: host }
}

// Een bestand met remote_location is niet per se extern: Pipedrive vult dat veld ook bij gewone uploads.
// Alleen bekende koppelingen en bestanden zonder grootte gelden als extern.
const EXTERNE_LOCATIES = /google|drive|onedrive|sharepoint|dropbox|box|icloud|link/i
function isExternBestand(f) {
  if (!f || !f.remote_location) return false
  if (EXTERNE_LOCATIES.test(String(f.remote_location))) return true
  return !f.file_size
}

module.exports = { rawFields, priveMail, websiteVanMail, isExternBestand, fmtAddr }
