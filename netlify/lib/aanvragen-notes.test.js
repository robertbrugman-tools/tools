// Draai met: node netlify/lib/aanvragen-notes.test.js
const assert = require('assert')
const { filterNotes, notesVoorPrompt } = require('./aanvragen-notes')

const formulier = [
  '1. Naam | Name', 'Jan Jansen', '',
  '2. Bedrijf | Company', 'Bouw BV', '',
  '3. Locatie van het project | Project location', 'Utrecht', '',
  '4. Oppervlakte | Surface', '300', '',
  '11. Specifieke kenmerken waarmee we rekening moeten houden? | Specific features that should be taken into account?', 'walls', '',
  '12. Beschrijf uw esthetische en ontwerp voorkeuren voor de gevel | Describe your aesthetic and design preferences for the facade', '(Blank)14. Taal voorkeur in communicatie | Preferred language for communication', 'Nederlands',
].join('\n')

let r = filterNotes([{ id: 1, addTime: 'x', text: formulier }, { id: 2, addTime: 'y', text: 'Gebeld, wil een afspraak.' }])
assert.strictEqual(r.verborgen, 1)
assert.strictEqual(r.notes.length, 2)
assert.deepStrictEqual(r.notes[0].items.map(i => i.nr), [11])
assert.strictEqual(r.notes[0].items[0].antwoord, 'walls')
assert.strictEqual(r.notes[1].text, 'Gebeld, wil een afspraak.')
console.log('OK formulier: alleen 11 met antwoord, eigen notitie blijft')

// Beide ingevuld
r = filterNotes([{ id: 1, text: formulier.replace('(Blank)14.', 'Strak en donker\n14.') }])
assert.deepStrictEqual(r.notes[0].items.map(i => i.nr), [11, 12])
assert.strictEqual(r.notes[0].items[1].antwoord, 'Strak en donker')
console.log('OK formulier: 11 en 12 beide ingevuld')

// Alles leeg: de notitie verdwijnt
r = filterNotes([{ id: 1, text: formulier.replace('walls', '(Blank)') }])
assert.strictEqual(r.notes.length, 0)
assert.strictEqual(r.verborgen, 1)
console.log('OK formulier: niets ingevuld, notitie verborgen')

// Zonder lege regels tussen de vragen
r = filterNotes([{ id: 1, text: formulier.replace(/\n\n/g, '\n') }])
assert.ok(r.notes[0] && r.notes[0].items.some(i => i.nr === 11))
console.log('OK formulier: werkt ook zonder lege regels')

// Vrije notitie met cijfers wordt niet aangezien voor een formulier
r = filterNotes([{ id: 1, text: '1. bellen\n2. mailen\n3. offerte' }])
assert.strictEqual(r.notes[0].text, '1. bellen\n2. mailen\n3. offerte')
console.log('OK eigen genummerde notitie blijft staan')

assert.strictEqual(notesVoorPrompt(filterNotes([{ id: 1, text: formulier }])), 'Specifieke kenmerken waarmee we rekening moeten houden?: walls')
console.log('OK prompttekst')
