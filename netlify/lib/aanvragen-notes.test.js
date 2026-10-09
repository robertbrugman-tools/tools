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
r = filterNotes([{ id: 1, text: formulier.replace('walls', '(Blank)').replace('Nederlands', '(Blank)') }])
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

// Echte vorm uit Pipedrive: antwoord direct voor de volgende vraag en een vraag zonder nummer
const echt = [
  '1. Naam | Name', 'Furio', '', '2. Bedrijf | Company', 'Costruzioni', '', '3. Locatie | Location', 'Italie', '', '4. Oppervlakte | Surface', '60', '',
  '11. Specifieke kenmerken waarmee we rekening moeten houden? | Specific features that should be taken into account?', 'First floor', '',
  '12. Beschrijf uw esthetische en ontwerp voorkeuren voor de gevel | Describe your aesthetic and design preferences for the facade', 'To be discussed14. Taal voorkeur in communicatie | Preferred language for communication', 'English', '',
  'Hoe heeft u ons gevonden? | How did you find us?', "I know you since the beginning, but you weren't willing to do it in Italy. I hope we can do it now.",
].join('\n')
r = filterNotes([{ id: 1, text: echt }])
assert.deepStrictEqual(r.notes[0].items.map(i => i.antwoord), ['First floor', 'To be discussed', "I know you since the beginning, but you weren't willing to do it in Italy. I hope we can do it now."])
assert.strictEqual(r.notes[0].items[2].vraag, 'Hoe heeft u ons gevonden?')
console.log('OK echte formulier: kenmerken, voorkeur en hoe gevonden blijven, taal valt weg')

// Taalvoorkeur en reCAPTCHA-score horen er niet bij, ook niet met een hoog vraagnummer
r = filterNotes([{ id: 1, text: echt + '\n15. reCAPTCHA bot score | Score\n0.9\n16. Iets anders | Other\nwaarde' }])
assert.ok(!r.notes[0].items.some(i => /taal|recaptcha|anders/i.test(i.vraag)))
console.log('OK taal en reCAPTCHA-score worden niet getoond')

// reCAPTCHA-score direct na het laatste antwoord, met en zonder streepje: hoort niet bij het antwoord
for (const extra of ['\nreCAPTCHA bot score | score\n0.9', '\nRecaptcha bot score: 0.9']) {
  r = filterNotes([{ id: 1, text: echt + extra }])
  const laatste = r.notes[0].items[r.notes[0].items.length - 1]
  assert.ok(!/recaptcha|0\.9/i.test(laatste.antwoord), laatste.antwoord)
}
console.log('OK reCAPTCHA-score komt niet in het antwoord terecht')
