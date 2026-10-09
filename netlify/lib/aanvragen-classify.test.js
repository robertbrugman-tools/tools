// Tests voor de indeling. Draai met: node netlify/lib/aanvragen-classify.test.js
const c = require('./aanvragen-classify.js')
const F = { locatie: 'L', grootte: 'G', bouwtype: 'B', projectnaam: 'P', specifics: 'S', opmerkingen: 'O' }
const mk = (o = {}) => ({ title: o.title || 'Aanvraag', add_time: '2026-10-02T10:00:00Z', label_ids: o.labels || [], custom_fields: { L: o.land === undefined ? { country: 'Netherlands' } : (o.land ? { country: o.land } : null), G: o.g, S: o.s || '', P: '', B: '', O: '' } })
const org = n => n ? { name: n, label_ids: [] } : null
const T = (name, args, expect) => {
  const r = c.classify(args[0], { name: 'Jan Jansen' }, args[1], F, '')
  const ok = r.bucket === expect
  console.log(ok ? 'OK  ' : 'FAIL', name, '->', r.bucket, '| m2', r.m2, '| lang', r.lang, '|', r.reasons.join(' / '), r.flags.join(' / '))
  if (!ok) process.exitCode = 1
}
T('priv klein NL', [mk({ g: '50 m2', labels: [46] }), org('Privat')], 'p_klein')
T('priv 150 NL', [mk({ g: '150', labels: [46] }), org('')], 'p_nl')
T('priv groot BE', [mk({ g: '1.200 m²', land: 'Belgium', labels: [46] }), org('Private')], 'p_buiten')
T('priv geen m2', [mk({ g: '', labels: [46] }), org('')], 'handmatig')
T('priv range', [mk({ g: '100-200', labels: [46] }), org('')], 'handmatig')
T('bedrijf NL klein', [mk({ g: '20' }), org('Bouwbedrijf X')], 'b_benelux_de')
T('bedrijf DE', [mk({ g: '500', land: 'Deutschland' }), org('Bau GmbH')], 'b_benelux_de')
T('bedrijf FR groot', [mk({ g: '500', land: 'France' }), org('Bati SA')], 'b_europa')
T('bedrijf FR klein', [mk({ g: '80', land: 'France' }), org('Bati SA')], 'b_europa')
T('bedrijf TR', [mk({ g: '500', land: 'Türkiye' }), org('Insaat')], 'grens')
T('bedrijf TR turkey', [mk({ g: '500', land: 'Turkey' }), org('Insaat')], 'grens')
T('bedrijf MX', [mk({ g: '500', land: 'Mexico' }), org('Cemex')], 'b_wereld')
T('bedrijf Oman', [mk({ g: '300', land: 'Oman' }), org('Co')], 'b_wereld')
T('producent label', [mk({ g: '500', labels: [37] }), org('Prefab BV')], 'betonproducent')
T('producent tekst', [mk({ g: '', s: 'We are a precast concrete manufacturer' }), org('Prefab BV')], 'betonproducent')
T('samenwerking', [mk({ g: '', s: 'We would like a partnership as distributor' }), org('Green Co')], 'samenwerking')
T('geen land', [mk({ g: '100', land: null }), org('Co')], 'handmatig')
T('onbekend land', [mk({ g: '100', land: 'Narnia' }), org('Co')], 'handmatig')
T('kale naam', [mk({ g: '100' }), org('Jan Jansen')], 'handmatig')
T('m2 in tekst', [mk({ g: '', s: 'wall of about 2,500 m2 north facing' }), org('Co')], 'b_benelux_de')
// Organisatienaam met accent: \b werkte niet na de é in "Privé"
T('org Privé, klein stukje', [mk({ g: 'Klein stukje', s: 'Kan ik zelf een klein beetje aanbrengen' }), org('Privé')], 'handmatig')
T('org Privé, 200 m2', [mk({ g: '200 m2' }), org('Privé')], 'p_nl')
T('org Privé, 50 m2', [mk({ g: '50 m2' }), org('Privé')], 'p_klein')
T('org PRIVÉ hoofdletters', [mk({ g: '200 m2' }), org('PRIVÉ')], 'p_nl')
T('privé in tekst', [mk({ g: '200 m2', s: 'Dit is voor privé gebruik' }), org('Huis BV')], 'p_nl')
