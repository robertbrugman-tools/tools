// Netlify serverless function: ontvangt nieuwe zelf-gestuurde mails vanaf het
// lokale sync-script op Robert's Mac (leest via Proton Bridge, zie bewaard-sync/).
// Authenticatie via een gedeeld secret (SYNC_SECRET), geen Mailgun nodig.
//
// Verwerkt de inhoud automatisch bij binnenkomst:
// - bevat de mail een link, dan wordt de pagina achter de eerste link samengevat
//   (zelfde aanpak als netlify/functions/summarize-link.js voor Linkbeheer)
// - bevat de mail vooral eigen tekst, dan krijgt hij een korte samenvatting,
//   voorgestelde tags, en (indien van toepassing) een actiepunt
//
// Verwerking is best-effort: als de AI-call om wat voor reden dan ook mislukt
// (geen key, netwerkfout, time-out, onverwacht antwoord), wordt de mail gewoon
// zonder verwerking opgeslagen. Een AI-storing mag nooit de basisfunctie
// (mail bewaren) breken.

const { getStore } = require('@netlify/blobs')

const SITE_ID = '3811d4ae-1d5e-43ce-b299-bfa15db5a988'

function bewaardStore() {
  return getStore({
    name: 'bewaard',
    siteID: SITE_ID,
    token: process.env.BLOBS_AUTH_TOKEN,
  })
}

function extractLinks(text) {
  if (!text) return []
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/g) || []
  return [...new Set(matches)]
}

function stripHtml(html) {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, 12000)
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? m[1].replace(/\s+/g, ' ').trim() : ''
}

// Anthropic-sleutel: zelfde valkuil-oplossing als summarize-link.js. Op sommige
// lokale ontwikkelmachines wordt ANTHROPIC_API_KEY systeembreed overschreven
// door een andere tool, dus SUMMARIZE_ANTHROPIC_KEY heeft voorrang als aparte,
// niet-conflicterende naam.
function getAnthropicKey() {
  const key = process.env.SUMMARIZE_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY
  if (!key || !key.startsWith('sk-ant-')) return null
  return key
}

async function callClaude(system, user, maxTokens) {
  const key = getAnthropicKey()
  if (!key) throw new Error('Geen geldige Anthropic-sleutel beschikbaar')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    const msg = (data.error && data.error.message) || ('Fout ' + response.status)
    throw new Error(msg)
  }

  // Niet blind content[0] pakken: soms staat het tekstblok niet op index 0.
  // Zoek het eerste blok met type 'text' op, ongeacht positie.
  const blokken = Array.isArray(data.content) ? data.content : []
  const tekstBlok = blokken.find((b) => b && b.type === 'text')
  const raw = (tekstBlok && tekstBlok.text) || ''

  if (!raw) {
    const blokTypes = blokken.map((b) => b && b.type).join(', ') || '(geen blokken)'
    throw new Error(`Leeg antwoord van Claude (stop_reason: ${data.stop_reason || '?'}, blok-types: [${blokTypes}])`)
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  try {
    return JSON.parse(jsonMatch ? jsonMatch[0] : raw)
  } catch (parseErr) {
    const reden = data.stop_reason ? ` (stop_reason: ${data.stop_reason})` : ''
    const staartje = raw.slice(-120).replace(/\s+/g, ' ')
    throw new Error(`${parseErr.message}${reden} — antwoord: "...${staartje}"`)
  }
}

// Vat de pagina achter een URL samen, zelfde stijl als Linkbeheer.
async function processLink(url) {
  const pageResp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BewaardBot/1.0)' },
    redirect: 'follow',
  })
  if (!pageResp.ok) throw new Error('Pagina ophalen mislukt (' + pageResp.status + ')')
  const html = await pageResp.text()
  const pageTitle = extractTitle(html)
  const tekst = stripHtml(html)
  if (!tekst) return { type: 'link', title: pageTitle || url, summary: '' }

  const system = `Je vat webpagina's samen voor iemand die snel wil scannen wat hij ermee moet doen. Schrijf in het Nederlands, in exact 3 tot 4 zinnen, feitelijk en bondig. Geen inleidende zinnen zoals "Deze pagina gaat over". Begin direct met de inhoud. Gebruik geen gedachtestreepje "—".`
  const user = `Titel (kan onnauwkeurig zijn): ${pageTitle || '(onbekend)'}
URL: ${url}

Paginatekst (geëxtraheerd, kan rommelig zijn):
"""
${tekst}
"""

De paginatekst begint mogelijk met menu- en inlogtekst (bijvoorbeeld "Inloggen", "Abonneren", "Mijn nieuws") vóórdat het echte artikel begint. Negeer dat en vat alleen de daadwerkelijke artikelinhoud samen.

Geef antwoord in exact dit JSON-formaat, zonder andere tekst eromheen. Zorg dat het geldige JSON is: escape aanhalingstekens en nieuwe regels binnen de tekstwaarden correct (bijvoorbeeld \" en \\n), en gebruik zelf geen letterlijke nieuwe regel binnen een waarde.
{"title": "korte duidelijke titel, max 60 tekens", "summary": "samenvatting van 3 tot 4 zinnen"}`

  const parsed = await callClaude(system, user, 600)
  return { type: 'link', title: parsed.title || pageTitle || url, summary: parsed.summary || '' }
}

// Vat eigen tekst samen met tags en (optioneel) een actiepunt.
async function processText(subject, body) {
  const system = `Je verwerkt korte notitie-mails die iemand naar zichzelf stuurt, zodat hij ze later snel kan scannen. Schrijf in het Nederlands. Gebruik geen gedachtestreepje "—".`
  const user = `Onderwerp: ${subject}

Inhoud:
"""
${body.slice(0, 8000)}
"""

Geef antwoord in exact dit JSON-formaat, zonder andere tekst eromheen. Zorg dat het geldige JSON is: escape aanhalingstekens en nieuwe regels binnen de tekstwaarden correct (bijvoorbeeld \" en \\n), en gebruik zelf geen letterlijke nieuwe regel binnen een waarde.
{"summary": "korte samenvatting van 1 tot 2 zinnen, of lege string als de tekst te kort/onduidelijk is om samen te vatten", "tags": ["max 3 korte labels zoals recept, idee, te lezen, taak, herinnering"], "actionItem": "een concreet actiepunt als de tekst een taak/herinnering lijkt te zijn, anders lege string"}`

  const parsed = await callClaude(system, user, 600)
  return {
    type: 'text',
    summary: parsed.summary || '',
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter(t => typeof t === 'string').slice(0, 3) : [],
    actionItem: parsed.actionItem || '',
  }
}

// Best-effort: geeft altijd een (mogelijk leeg) verwerkingsresultaat terug,
// nooit een fout. Een falende AI-call mag de opslag van de mail niet blokkeren.
async function processEntry(subject, body, links) {
  try {
    if (links.length > 0) {
      return await processLink(links[0])
    }
    if (body && body.trim().length >= 20) {
      return await processText(subject, body)
    }
  } catch (err) {
    return { type: links.length > 0 ? 'link' : 'text', error: err.message }
  }
  return null
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const secret = event.headers['x-sync-secret'] || event.headers['X-Sync-Secret']
  if (!secret || secret !== process.env.SYNC_SECRET) {
    return { statusCode: 401, body: 'Ongeldig secret' }
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: 'Ongeldige payload' }
  }

  const { subject, body, messageId, from, receivedAt } = payload
  if (!messageId) {
    return { statusCode: 400, body: 'messageId ontbreekt' }
  }

  const store = bewaardStore()

  // Voorkom dubbele opslag als het lokale script iets nog eens stuurt
  const dedupeKey = `msgid:${messageId}`
  const already = await store.get(dedupeKey)
  if (already) {
    return { statusCode: 200, body: 'Al opgeslagen' }
  }

  const cleanBody = (body || '').trim()
  const cleanSubject = (subject || '(geen onderwerp)').trim()
  const links = extractLinks(cleanBody)

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    subject: cleanSubject,
    body: cleanBody,
    links,
    from: from || '',
    receivedAt: receivedAt || new Date().toISOString(),
    archivedAt: null,
    processing: 'pending',
  }

  // Verwerking gebeurt bewust NA het klaarzetten van entry maar VOOR het
  // wegschrijven: zo staat het resultaat er bij de eerste keer al in, zonder
  // dat een falende AI-call de opslag zelf kan raken (processEntry vangt
  // intern alle fouten af en geeft nooit een exception door).
  const result = await processEntry(cleanSubject, cleanBody, links)
  if (result && !result.error) {
    entry.processing = 'done'
    entry.processed = result
  } else if (result && result.error) {
    entry.processing = 'failed'
    entry.processedError = result.error
  } else {
    entry.processing = 'skipped'
  }

  await store.set(dedupeKey, entry.id)
  await store.setJSON(entry.id, entry)

  return { statusCode: 200, body: 'OK' }
}
