// Past de Hub-startpagina (index.html) aan:
//   1. de knop "Beheer" opent de nieuwe beheerpagina (/beheer/) in plaats van het oude venster
//   2. de tegel "Aanvragen" komt erbij, onder Zakelijk
// Gebruik: node tools/aanvragen/patch-hub.js index.html
// Veilig om vaker te draaien. Er wordt eerst een reservekopie gemaakt (index.html.bak).

const fs = require('fs')
const file = process.argv[2]
if (!file || !fs.existsSync(file)) { console.error('Geef het pad naar index.html mee.'); process.exit(1) }

let s = fs.readFileSync(file, 'utf8')
const orig = s
fs.writeFileSync(file + '.bak', orig)

// 1. Beheer-knop
const knopOud = /(<button id="adminBtn"[^>]*?)onclick="openAdminModal\(\)"/
if (/location\.href='\/beheer\/'/.test(s)) console.log('Beheer-knop: staat al goed.')
else if (knopOud.test(s)) { s = s.replace(knopOud, `$1onclick="location.href='/beheer/'"`); console.log('Beheer-knop: aangepast.') }
else console.log('Beheer-knop: NIET gevonden, niets gewijzigd.')

// 2. Tegel
if (/key:\s*'aanvragen'/.test(s)) console.log('Tegel Aanvragen: staat er al.')
else {
  const m = s.match(/^([ \t]*)\{ key: 'respyre'[^\n]*\n/m)
  if (!m) console.log("Tegel Aanvragen: regel met key: 'respyre' NIET gevonden, niets gewijzigd.")
  else {
    const regel = `${m[1]}{ key: 'aanvragen', category: 'zakelijk', icon: '📥', title: 'Aanvragen', desc: 'Nieuwe Pipedrive-aanvragen in bakjes, met een conceptantwoord.', href: '/aanvragen/' },\n`
    s = s.replace(m[0], m[0] + regel)
    console.log('Tegel Aanvragen: toegevoegd.')
  }
}

if (s === orig) console.log('Geen wijzigingen nodig.')
else { fs.writeFileSync(file, s); console.log('Klaar. Reservekopie: ' + file + '.bak') }
