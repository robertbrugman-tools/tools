// Tests voor websitegok en bestandscontrole. Draai met: node netlify/lib/aanvragen-raw.test.js
const r = require('./aanvragen-raw.js')
let fout = 0
const T = (naam, ok) => { console.log(ok ? 'OK  ' : 'FAIL', naam); if (!ok) fout = 1 }
const w = e => { const x = r.websiteVanMail(e); return x ? x.label : null }
T('bedrijfsmail geeft www-adres', w('a@bedrijf.nl') === 'www.bedrijf.nl')
T('gmail geeft niets', w('a@gmail.com') === null)
T('hotmail.nl geeft niets', w('a@hotmail.nl') === null)
T('ziggo geeft niets', w('a@ziggo.nl') === null)
T('www in domein niet dubbel', w('a@www.firma.de') === 'www.firma.de')
T('co.uk krijgt www', w('a@bedrijf.co.uk') === 'www.bedrijf.co.uk')
T('ongeldig domein', w('a@bad..nl') === null && w('geen-mail') === null && w('') === null)
T('priveMail gmail', r.priveMail('a@gmail.com') && !r.priveMail('a@bedrijf.nl'))
T('opgeslagen bestand met s3 is niet extern', r.isExternBestand({ remote_location: 's3', file_size: 1500000 }) === false)
T('google drive is extern', r.isExternBestand({ remote_location: 'googledocs', file_size: 10 }) === true)
T('zonder grootte is extern', r.isExternBestand({ remote_location: 's3', file_size: 0 }) === true)
T('zonder remote_location niet extern', r.isExternBestand({ file_size: 10 }) === false)
process.exitCode = fout
