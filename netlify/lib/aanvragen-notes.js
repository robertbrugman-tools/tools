// Notities uit Pipedrive opschonen.
// De formuliernotitie ("1. Vraag | Question" gevolgd door het antwoord) herhaalt in vraag 1 tot en met 10 wat al in de
// velden van de deal staat. Vanaf vraag 11 staan de vrije antwoorden (specifieke kenmerken, esthetische voorkeuren,
// taalvoorkeur, hoe de aanvrager ons vond). Die houden we, maar alleen als er echt iets is ingevuld. Een vraag zonder
// nummer die over "hoe heeft u ons gevonden" gaat houden we ook. Notities die jij of een collega zelf typt blijven ongewijzigd.

const BEHOUD_VANAF_NR = 11
const BEHOUD_TEKST = /specifieke kenmerken|esthetische|ontwerp\s*voorkeuren|gevonden|found us/i
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
    if (m && (m[1] || /\?\s*$/.test(m[2]))) {
      cur = { nr: m[1] ? Number(m[1]) : null, vraag: m[2].trim(), antwoord: [] }
      items.push(cur)
    } else if (cur && line) {
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
      .filter(i => ((i.nr !== null && i.nr >= BEHOUD_VANAF_NR) || BEHOUD_TEKST.test(i.vraag)) && !isLeeg(i.antwoord))
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

module.exports = { parseFormulier, filterNotes, notesVoorPrompt, isLeeg }
