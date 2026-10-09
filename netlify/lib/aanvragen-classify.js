// Indeling van aanvragen in bakjes. Pure functies, geen netwerk, goed te testen.

const { priveMail } = require('./aanvragen-raw')

const GRENS_M2 = 150 // particulier: onder deze waarde altijd afwijzen

const BUCKETS = {
  p_klein: { nr: 1, naam: 'Particulier, klein', uitleg: 'Onder 150 m². Altijd afwijzen.' },
  p_nl: { nr: 2, naam: 'Particulier NL, vanaf 150 m²', uitleg: 'Wij kunnen aanbrengen.' },
  p_buiten: { nr: 3, naam: 'Particulier buiten NL, vanaf 150 m²', uitleg: 'Altijd zelf aanbrengen.' },
  b_benelux_de: { nr: 4, naam: 'Bedrijf NL / BE / DE', uitleg: 'Sorteren op m².' },
  b_europa: { nr: 5, naam: 'Bedrijf rest van Europa', uitleg: 'Zelf regelen, R&D. Onder 150 m² is een no-go.' },
  b_wereld: { nr: 6, naam: 'Bedrijf buiten Europa', uitleg: 'Altijd pilot.' },
  grens: { nr: 7, naam: 'Randlanden van Europa', uitleg: 'Maatwerk.' },
  betonproducent: { nr: 8, naam: 'Betonproducent', uitleg: 'Recept en SOP leveren.' },
  samenwerking: { nr: 9, naam: 'Samenwerking', uitleg: 'Groter dan een eenmalig project.' },
  handmatig: { nr: 10, naam: 'Handmatig', uitleg: 'Niet automatisch in te delen.' },
}

// Pipedrive-labels
const LABEL_PRIVAAT = 46
const LABEL_BETONPRODUCENT = 37
const ORG_LABEL_BETONPRODUCENT = 43

// Landen. Dit zijn bewust expliciete lijsten, zodat ze makkelijk aan te passen zijn.
const EUROPA = new Set('AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO SM RS SK SI ES SE CH UA GB VA FO GI JE GG IM AX'.split(' '))
// Landen op de rand van Europa: maatwerk. Te bevestigen door Robert.
const RANDLANDEN = new Set('TR RU KZ GE AM AZ CY'.split(' '))
const BENELUX_DE = new Set(['NL', 'BE', 'LU', 'DE'])

function strip(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Landnamen uit Intl (en, nl, de, fr, es, it, tr) plus handmatige aliassen.
let _countryMap
function countryMap() {
  if (_countryMap) return _countryMap
  const map = {}
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const locales = ['en', 'nl', 'de', 'fr', 'es', 'it', 'tr']
  for (const loc of locales) {
    let dn
    try { dn = new Intl.DisplayNames([loc], { type: 'region' }) } catch (_) { continue }
    for (const a of A) for (const b of A) {
      const code = a + b
      let name
      try { name = dn.of(code) } catch (_) { continue }
      if (name && name !== code) map[strip(name)] = code
    }
  }
  const alias = {
    NL: ['holland', 'the netherlands', 'netherlands', 'nederland', 'nl', 'nld'],
    BE: ['belgie', 'belgium', 'belgique', 'be', 'bel'],
    DE: ['deutschland', 'germany', 'duitsland', 'de', 'deu'],
    GB: ['uk', 'united kingdom', 'great britain', 'england', 'scotland', 'wales', 'northern ireland', 'engeland', 'verenigd koninkrijk', 'gb'],
    US: ['usa', 'united states', 'united states of america', 'verenigde staten', 'us', 'america'],
    AE: ['uae', 'united arab emirates', 'verenigde arabische emiraten'],
    TR: ['turkey', 'turkiye', 'turkije', 'tr'],
    CZ: ['czechia', 'czech republic', 'tsjechie'],
    MK: ['north macedonia', 'macedonia', 'noord-macedonie'],
    RU: ['russia', 'russian federation', 'rusland'],
    KR: ['south korea', 'korea'],
    CH: ['switzerland', 'zwitserland', 'schweiz', 'suisse', 'ch'],
    AT: ['austria', 'oostenrijk', 'osterreich', 'at'],
    FR: ['france', 'frankrijk', 'fr'],
    ES: ['spain', 'spanje', 'espana', 'es'],
    IT: ['italy', 'italie', 'italia', 'it'],
    PL: ['poland', 'polen', 'polska', 'pl'],
    DK: ['denmark', 'denemarken', 'danmark', 'dk'],
    SE: ['sweden', 'zweden', 'sverige', 'se'],
    NO: ['norway', 'noorwegen', 'norge', 'no'],
    FI: ['finland', 'fi'],
    IE: ['ireland', 'ierland', 'ie'],
    PT: ['portugal', 'pt'],
    GR: ['greece', 'griekenland', 'gr'],
    LU: ['luxembourg', 'luxemburg', 'lu'],
    MX: ['mexico', 'mx'],
    CY: ['cyprus', 'cy'],
  }
  for (const [code, names] of Object.entries(alias)) names.forEach(n => { map[strip(n)] = code })
  _countryMap = map
  return map
}

function countryCode(raw) {
  if (!raw) return null
  const s = strip(raw)
  const m = countryMap()
  if (m[s]) return m[s]
  // "Amsterdam, Netherlands" -> laatste deel
  const parts = s.split(/[,;\n]/).map(x => x.trim()).filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) if (m[parts[i]]) return m[parts[i]]
  return null
}

function regionName(code) {
  try { return new Intl.DisplayNames(['nl'], { type: 'region' }).of(code) } catch (_) { return code }
}

// Zoek een land in een Pipedrive-adresveld (object of tekst).
function countryFromAddress(addr) {
  if (!addr) return { raw: null, code: null }
  if (typeof addr === 'string') return { raw: addr, code: countryCode(addr) }
  const raw = addr.country || addr.country_name || null
  if (raw) return { raw, code: countryCode(raw) || countryCode(addr.country_code) }
  if (addr.country_code) return { raw: addr.country_code, code: countryCode(addr.country_code) }
  const val = addr.value || addr.formatted_address || ''
  return { raw: val || null, code: countryCode(val) }
}

// ---------- m² ----------
function parseAreaText(input) {
  if (input === null || input === undefined) return null
  let s = String(input).toLowerCase()
  if (!s.trim()) return null
  const ft = /sq\.?\s?ft|square f|ft2|ft²|feet/.test(s)
  s = s.replace(/m\s?[2²]|m\^2|ft\s?[2²]|sq\.?\s?m|sqm|sq\.?\s?ft/g, ' ')
  // duizendtallen: 1.200 / 1,200 / 1 200 / 10 000
  s = s.replace(/(\d)[.,\s](\d{3})(?!\d)/g, '$1$2')
  s = s.replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2')
  const nums = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(n => n > 0)
  if (!nums.length) return null
  const f = ft ? 0.0929 : 1
  return { min: Math.min(...nums) * f, max: Math.max(...nums) * f, ambiguous: nums.length > 1 }
}

function areaFromFreeText(text) {
  const m = String(text || '').toLowerCase().match(/(\d[\d.,\s]{0,9}\d|\d)\s?(m2|m²|m\^2|sqm|sq\.?\s?m|square met(?:er|re)s?|vierkante meter)/)
  return m ? parseAreaText(m[1]) : null
}

// ---------- taal ----------
function detectLang(text, countryIso) {
  const t = ' ' + String(text || '').toLowerCase().replace(/[^a-zà-ÿ\s]/g, ' ') + ' '
  const count = words => words.reduce((n, w) => n + (t.split(' ' + w + ' ').length - 1), 0)
  const nl = count(['de', 'het', 'een', 'en', 'wij', 'we', 'ik', 'voor', 'van', 'met', 'graag', 'muur', 'gevel', 'bedankt', 'mijn', 'onze', 'zijn', 'wat', 'kunnen', 'goedemiddag', 'beste'])
  const en = count(['the', 'and', 'we', 'our', 'for', 'with', 'would', 'wall', 'facade', 'please', 'thank', 'is', 'are', 'project', 'looking', 'hello', 'dear', 'to', 'of'])
  const de = count(['der', 'die', 'das', 'und', 'wir', 'ich', 'für', 'mit', 'fassade', 'wand', 'bitte', 'vielen', 'dank', 'sehr', 'geehrte', 'guten', 'tag', 'ein', 'eine', 'nicht'])
  const best = Math.max(nl, en, de)
  if (best >= 3) {
    if (nl === best) return 'nl'
    if (de === best && de > en + 1) return 'de'
    return 'en'
  }
  return countryIso === 'NL' ? 'nl' : 'en'
}

// ---------- soort aanvrager ----------
// Wordt toegepast op tekst zonder accenten (strip), want \b werkt niet na een letter met accent zoals de é in "Privé".
const PRIVE_ORG_TERMEN = /\b(privat|private|privaat|prive|privato|particulier|individual|personal|self[\s-]?employed|freelancer|no company|geen bedrijf)\b/i
// Zwakke signalen voor een particulier: omschrijvingen van een klein of zelf uit te voeren project.
const KLEIN_TERMEN = /\b(klein(?:e)? (?:stukje|stuk|beetje|oppervlak|project|muurtje|wandje|gevel|tuinmuur)|een (?:klein )?beetje|paar (?:m2|vierkante meter)|zelf (?:aanbrengen|aanbrengt|doen|plaatsen)|kan ik zelf|small (?:area|piece|patch|wall|part|bit)|a (?:little|small) bit|do it myself|diy)\b/i
const PRODUCENT_TERMEN = /(betonproducent|beton ?fabriek|betoncentrale|prefab ?(producent|fabrikant|bedrijf)|concrete (producer|manufacturer|plant)|precast (producer|manufacturer|plant|company)|ready[\s-]?mix (producer|plant|company)|cement (producer|plant|company|manufacturer)|betonwarenfabriek|betonindustrie)/i
const SAMENWERKING_TERMEN = /(partnership|samenwerking|collaborat|distribut|reseller|wederverkoper|licen[sc]e|licentie|joint venture|agent for|vertegenwoordig|representative|franchise|white label|co-?develop|strategic partner|strategische partner)/i

function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim() }

// deal: Pipedrive v2 deal; person/org: Pipedrive v2 objecten of null; F: veldsleutels
function classify(deal, person, org, F, extraText) {
  const cf = deal.custom_fields || {}
  const get = k => {
    const v = cf[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v && !('country' in v)) return v.value
    return v
  }
  const labels = (deal.label_ids || []).map(Number)
  const orgLabels = ((org && org.label_ids) || []).map(Number)
  const orgName = norm(org && org.name)
  const personName = norm(person && person.name)

  const fields = {
    grootte: norm(get(F.grootte)),
    bouwtype: norm(get(F.bouwtype)),
    projectnaam: norm(get(F.projectnaam)),
    specifics: norm(get(F.specifics)),
    opmerkingen: norm(get(F.opmerkingen)),
  }
  const textBlob = [deal.title, fields.projectnaam, fields.bouwtype, fields.specifics, fields.opmerkingen, orgName, extraText].map(norm).filter(Boolean).join(' \n ')

  const reasons = []
  const flags = []

  // land
  let land = countryFromAddress(cf[F.locatie])
  let landBron = 'locatie van de deal'
  if (!land.code) {
    const alt = countryFromAddress(org && org.address)
    if (alt.code) { land = alt; landBron = 'adres van de organisatie' }
  }
  const iso = land.code || null

  // m²
  let area = parseAreaText(fields.grootte)
  let areaBron = 'veld Grootte'
  if (!area) { area = areaFromFreeText(textBlob); areaBron = 'tekst van de aanvraag' }
  let m2 = null
  let m2Onzeker = false
  if (area) {
    m2 = Math.round(area.min)
    // bereik dat de grens overschrijdt (bv. 100-200): niet te beoordelen
    if (area.ambiguous && area.min < GRENS_M2 && area.max >= GRENS_M2) m2Onzeker = true
  }

  // soort aanvrager
  const privaatLabel = labels.includes(LABEL_PRIVAAT)
  const priveInOrg = PRIVE_ORG_TERMEN.test(strip(orgName))
  const priveInTekst = /\b(private person|particulier|prive|privat(?:e)? (?:person|individual|home|house|use)|for my (?:own )?(?:house|home|garden)|voor mijn (?:eigen )?(?:huis|woning|tuin)|mijn (?:huis|woning|tuin))\b/i.test(strip([deal.title, fields.projectnaam, fields.specifics, fields.opmerkingen].join(' ')))
  const kleinTekst = KLEIN_TERMEN.test(strip([deal.title, fields.projectnaam, fields.grootte, fields.specifics, fields.opmerkingen].join(' ')))
  const email = person && Array.isArray(person.emails) && person.emails.length ? (person.emails.find(e => e.primary) || person.emails[0]).value : null
  const priveAdres = priveMail(email)
  const orgLeeg = !orgName || strip(orgName) === strip(personName) || /^(-|\.|n\/?a|none|geen|nvt|x+)$/i.test(orgName)
  let soort = 'onbekend'
  let zwak = false // alleen afgeleid uit tekst of e-mailadres, niet uit label of organisatienaam
  if (privaatLabel) { soort = 'particulier'; reasons.push('Label "Privaat" in Pipedrive') }
  else if (priveInOrg) { soort = 'particulier'; reasons.push('Organisatienaam wijst op privé: "' + orgName + '"') }
  else if (priveInTekst) { soort = 'particulier'; reasons.push('Tekst van de aanvraag wijst op privé') }
  else if (kleinTekst) { soort = 'particulier'; zwak = true; reasons.push('Tekst wijst op een klein of zelf uit te voeren project') }
  else if (priveAdres) { soort = 'particulier'; zwak = true; reasons.push('Privé e-mailadres' + (orgLeeg ? '' : ' bij organisatie "' + orgName + '", controleer of dit echt een particulier is')) }
  else if (!orgLeeg) { soort = 'bedrijf'; reasons.push('Organisatie: ' + orgName) }
  else reasons.push('Organisatie ontbreekt of lijkt een persoonsnaam')

  const lang = detectLang([deal.title, fields.projectnaam, fields.bouwtype, fields.specifics, fields.opmerkingen, extraText].join(' '), iso)

  const out = {
    bucket: 'handmatig', soort, m2, m2Onzeker, m2Bron: m2 !== null ? areaBron : null, grootteTekst: fields.grootte,
    land: { raw: land.raw, code: iso, naam: iso ? regionName(iso) : null, bron: iso ? landBron : null },
    lang, reasons, flags, noGo: false,
    fields, labels, orgName,
  }

  // 1. betonproducent
  if (labels.includes(LABEL_BETONPRODUCENT) || orgLabels.includes(ORG_LABEL_BETONPRODUCENT) || PRODUCENT_TERMEN.test(textBlob)) {
    out.bucket = 'betonproducent'
    out.reasons.push('Betonproducent (label of tekst)')
    return out
  }
  // 2. samenwerking (alleen als het geen particulier is)
  if ((soort !== 'particulier' || zwak) && SAMENWERKING_TERMEN.test(textBlob)) {
    out.bucket = 'samenwerking'
    out.reasons.push('Tekst wijst op samenwerking of distributie')
    return out
  }
  // 3. te weinig informatie
  if (soort === 'onbekend') { out.bucket = 'handmatig'; return out }
  if (!iso) {
    out.reasons.push(land.raw ? 'Land niet herkend: "' + land.raw + '"' : 'Land ontbreekt')
    out.bucket = 'handmatig'
    return out
  }

  if (soort === 'particulier') {
    if (zwak && !privaatLabel && !orgLeeg) out.flags.push('Bedrijfsnaam met privé-signaal: controleer of dit een particulier is')
    if (m2 === null && kleinTekst) { out.bucket = 'p_klein'; out.reasons.push('m² niet als getal te lezen, maar de tekst wijst op een klein project'); return out }
    if (m2 === null) { out.reasons.push('m² ontbreekt'); out.bucket = 'handmatig'; return out }
    if (m2Onzeker) { out.reasons.push('m² is een bereik rond de grens van ' + GRENS_M2 + ': "' + fields.grootte + '"'); out.bucket = 'handmatig'; return out }
    if (m2 < GRENS_M2) { out.bucket = 'p_klein'; out.reasons.push(m2 + ' m² is onder ' + GRENS_M2 + ' m²'); return out }
    out.bucket = iso === 'NL' ? 'p_nl' : 'p_buiten'
    out.reasons.push(m2 + ' m² in ' + out.land.naam)
    return out
  }

  // bedrijf
  if (RANDLANDEN.has(iso)) { out.bucket = 'grens'; out.reasons.push('Land op de rand van Europa: ' + out.land.naam) }
  else if (BENELUX_DE.has(iso)) {
    out.bucket = 'b_benelux_de'
    if (iso === 'DE') out.flags.push('Duitsland: controleer afstand tot de grens (binnen 100 km kunnen wij aanbrengen)')
  } else if (EUROPA.has(iso)) {
    out.bucket = 'b_europa'
    if (m2 !== null && m2 < GRENS_M2) { out.noGo = true; out.flags.push('Onder ' + GRENS_M2 + ' m² buiten NL/BE/DE is een no-go. Maak de extra kosten heel duidelijk.') }
  } else {
    out.bucket = 'b_wereld'
    if (m2 !== null && m2 < 100) out.flags.push('Pilot start vanaf 100 m²')
  }
  if (m2 === null) out.flags.push('m² ontbreekt: vraag ernaar in de reactie')
  else if (m2Onzeker) out.flags.push('m² is een bereik: "' + fields.grootte + '"')
  out.reasons.push(out.land.naam + (m2 !== null ? ', ' + m2 + ' m²' : ''))
  return out
}

module.exports = { classify, BUCKETS, GRENS_M2, parseAreaText, areaFromFreeText, detectLang, countryCode, countryFromAddress, EUROPA, RANDLANDEN }
