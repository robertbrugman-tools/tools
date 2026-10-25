// Notities uit Pipedrive opschonen.
// De formuliernotitie ("1. Vraag | Question" gevolgd door het antwoord) herhaalt bijna alles wat al in de
// velden van de deal staat. Daarvan houden we alleen een vaste lijst: specifieke kenmerken (11), esthetische
// voorkeuren (12) en "hoe heeft u ons gevonden", en alleen als er echt iets is ingevuld. Bij "hoe gevonden" alleen als
// er een duidelijke opmerking staat en niet slechts een kanaal als "facebook". Al het andere (taalvoorkeur,
// reCAPTCHA-score, enzovoort) blijft weg. Notities die jij of een collega zelf typt blijven ongewijzigd.

const BEHOUD_NR = [11, 12]
const BEHOUD_TEKST = /specifieke kenmerken|esthetische|ontwerp\s*voorkeuren/i
const GEVONDEN = /gevonden|found us/i
// Regels die bij een antwoord kunnen lijken te horen maar uit het formulier zelf komen (reCAPTCHA-score).
const SCORE_REGEL = /recaptcha|bot\s*score|likely\s+(bot|human)|^\d(\.\d+)?\s*\(/i

// "Hoe heeft u ons gevonden?" is meestal een kanaal ("facebook", "Google", "via een collega"). Dat willen we niet.
// Alleen als de aanvrager er duidelijk een eigen opmerking schrijft houden we het: een lange tekst of een of meer zinnen.
function isOpmerking(antwoord) {
  const t = String(antwoord || '').trim()
  const woorden = t.split(/\s+/).filter(Boolean).length
  if (woorden >= 8) return true
  if (woorden >= 4 && /[.!?]/.test(t)) return true
  return woorden >= 4 && /^(i|we|ik|wij|ons|our|my)\b/i.test(t)
}
const LEEG = /^[\s(]*(blank|leeg|n\/a|none|-|–)[\s).]*$/i

function isLeeg(a) {
  const t = String(a || '').trim()
  return !t || LEEG.test(t)
}

// Geeft een lijst vragen met antwoord terug, of null als dit geen formuliernotitie is.
function parseFormulier(text) {
  const t = String(text || '')
    .replace(/\r/g, '')
    // Als de HTML geen regeleinde had tussen een antwoord en de volgende vraag, zet er alsnog een neer.
    .replace(/([^\n\d])(?=\d{1,2}\.\s+[^\n|]{3,300}\s\|\s)/g, '$1\n')
  const items = []
  let cur = null
  for (const raw of t.split('\n')) {
    const line = raw.trim()
    // Een vraag heeft een nummer. Zonder nummer tellen we alleen regels als "Vraag? | Question?".
    const m = line.match(/^(?:(\d{1,2})\.\s+)?(.{3,300}?)\s\|\s(.+)$/)
    // Een regel "Label | Label" zonder nummer en zonder vraagteken is een eigen veld (bijvoorbeeld een score), geen antwoord.
    if (m && (m[1] || /\?\s*$/.test(m[2]) || /score|captcha/i.test(m[2]))) {
      cur = { nr: m[1] ? Number(m[1]) : null, vraag: m[2].trim(), antwoord: [] }
      items.push(cur)
    } else if (cur && line && !SCORE_REGEL.test(line)) {
      cur.antwoord.push(line)
    }
  }
  if (items.length < 4) return null
  items.forEach(i => { i.antwoord = i.antwoord.join('\n').trim() })
  return items
}

// notes: [{id, addTime, text}] -> { notes: [{id, addTime, items?|text?}], verborgen: aantal weggelaten formuliernotities }
function filterNotes(notes) {
  const out = []
  let verborgen = 0
  for (const n of notes || []) {
    const items = parseFormulier(n.text)
    if (!items) { out.push({ id: n.id, addTime: n.addTime, text: n.text }); continue }
    const keep = items
      .filter(i => !isLeeg(i.antwoord) && (((i.nr !== null && BEHOUD_NR.includes(i.nr)) || BEHOUD_TEKST.test(i.vraag)) || (GEVONDEN.test(i.vraag) && isOpmerking(i.antwoord))))
      .map(i => ({ nr: i.nr, vraag: i.vraag, antwoord: i.antwoord }))
    verborgen++
    if (keep.length) out.push({ id: n.id, addTime: n.addTime, items: keep })
  }
  return { notes: out, verborgen }
}

// Platte tekst voor in de prompt van het concept.
function notesVoorPrompt(filtered) {
  return filtered.notes
    .map(n => n.items ? n.items.map(i => `${i.vraag}: ${i.antwoord}`).join('\n') : n.text)
    .join('\n')
    .trim()
}

module.exports = { parseFormulier, filterNotes, notesVoorPrompt, isLeeg, isOpmerking }
