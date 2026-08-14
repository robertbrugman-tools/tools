// Netlify serverless function: haalt een webpagina op en laat Claude
// een titel + samenvatting (3-4 zinnen) genereren.
// De API-sleutel staat als omgevingsvariabele ANTHROPIC_API_KEY in Netlify
// (dezelfde key als bij respyre.js).

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

function getYouTubeId(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1)
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v')
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2]
      if (u.pathname.startsWith('/live/')) return u.pathname.split('/')[2]
    }
  } catch (err) {}
  return null
}

// YouTube's paginatekst scrapen levert niets bruikbaars op (geen transcript,
// vooral UI-tekst). oEmbed geeft gratis en zonder API-key titel + kanaalnaam.
async function fetchYouTubeInfo(url) {
  const resp = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json')
  if (!resp.ok) throw new Error('oEmbed-aanvraag mislukt (' + resp.status + ')')
  const data = await resp.json()
  return {
    title: data.title || '',
    author: data.author_name || '',
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // Gebruikt bij voorkeur SUMMARIZE_ANTHROPIC_KEY (zelfde waarde als ANTHROPIC_API_KEY
  // in Netlify) en valt terug op ANTHROPIC_API_KEY. Reden: op sommige lokale
  // ontwikkelmachines wordt ANTHROPIC_API_KEY systeembreed overschreven door een
  // andere lokaal draaiende tool, waardoor Netlify Dev de juiste waarde niet
  // injecteert. Deze losse naam voorkomt dat conflict, zonder dat dat op elke
  // machine hoeft te worden uitgezocht.
  const key = process.env.SUMMARIZE_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY
  if (!key) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY (of SUMMARIZE_ANTHROPIC_KEY) is niet ingesteld in Netlify.' }),
    }
  }
  if (!key.startsWith('sk-ant-')) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'De gevonden sleutel is geen geldige Anthropic-sleutel (verwacht prefix sk-ant-). Waarschijnlijk overschrijft een andere lokale tool ANTHROPIC_API_KEY. Zet SUMMARIZE_ANTHROPIC_KEY als aparte env var in Netlify om dit te omzeilen.' }),
    }
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Ongeldige aanvraag.' }) }
  }

  const url = (payload.url || '').trim()
  if (!url || !/^https?:\/\//i.test(url)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Geen geldige URL meegegeven.' }) }
  }
  const existingLabels = Array.isArray(payload.existingLabels) ? payload.existingLabels.filter(l => typeof l === 'string').slice(0, 50) : []

  const youtubeId = getYouTubeId(url)
  let pageTitle = ''
  let tekst = ''
  let isYouTube = false
  let youtubeAuthor = ''

  if (youtubeId) {
    isYouTube = true
    try {
      const info = await fetchYouTubeInfo(url)
      pageTitle = info.title
      youtubeAuthor = info.author
      tekst = `YouTube-video.\nTitel: ${info.title}\nKanaal: ${info.author}`
    } catch (err) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Kon YouTube-informatie niet ophalen: ' + err.message }),
      }
    }
  } else {
    let html = ''
    try {
      const pageResp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkbeheerBot/1.0)' },
        redirect: 'follow',
      })
      html = await pageResp.text()
      pageTitle = extractTitle(html)
    } catch (err) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Kon de pagina niet ophalen: ' + err.message }),
      }
    }
    tekst = stripHtml(html)
  }

  if (!tekst) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: pageTitle || url, summary: '', isYouTube, youtubeAuthor }),
    }
  }

  const systeem = isYouTube
    ? `Je beschrijft YouTube-video's voor iemand die snel wil scannen wat hij ermee moet doen. Je krijgt alleen de videotitel en kanaalnaam (geen transcript). Schrijf in het Nederlands, in exact 2 tot 3 zinnen, en maak op basis van titel en kanaal een redelijke inschatting van het onderwerp. Wees expliciet dat dit een inschatting is als de titel niet volledig duidelijk is (bijv. "gaat vermoedelijk over..."). Gebruik geen gedachtestreepje "—".`
    : `Je vat webpagina's samen voor iemand die snel wil scannen wat hij ermee moet doen. Schrijf in het Nederlands, in exact 3 tot 4 zinnen, feitelijk en bondig. Geen inleidende zinnen zoals "Deze pagina gaat over". Begin direct met de inhoud. Gebruik geen gedachtestreepje "—".`

  const labelInstructie = existingLabels.length
    ? `\n\nBestaande labels van de gebruiker: ${existingLabels.join(', ')}. Stel, als een van deze labels duidelijk goed past bij deze pagina, dat label voor in "suggestedLabel". Verzin geen nieuw label en kies geen label als er geen goede match is: gebruik dan een lege string.`
    : `\n\nDe gebruiker heeft nog geen labels. Zet "suggestedLabel" op een lege string.`

  const gebruiker = `Titel (kan onnauwkeurig zijn): ${pageTitle || '(onbekend)'}
URL: ${url}

${isYouTube ? 'Beschikbare informatie (geen transcript)' : 'Paginatekst (geëxtraheerd, kan rommelig zijn)'}:
"""
${tekst}
"""${labelInstructie}

Geef antwoord in exact dit JSON-formaat, zonder andere tekst eromheen:
{"title": "korte duidelijke titel, max 60 tekens", "summary": "samenvatting van ${isYouTube ? '2 tot 3' : '3 tot 4'} zinnen", "suggestedLabel": "exact een van de bestaande labels, of lege string"}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        system: systeem,
        messages: [{ role: 'user', content: gebruiker }],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const msg = (data.error && data.error.message) || ('Fout ' + response.status)
      return { statusCode: response.status, body: JSON.stringify({ error: msg }) }
    }

    const raw = (data.content && data.content[0] && data.content[0].text) || ''
    let parsed
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
    } catch (err) {
      parsed = { title: pageTitle || url, summary: raw.trim() }
    }

    // Alleen een suggestie teruggeven als die exact overeenkomt met een bestaand label
    // (voorkomt dat de AI per ongeluk een nieuw label "verzint" dat niet bestaat)
    const suggestedLabel = existingLabels.find(l => l.toLowerCase() === String(parsed.suggestedLabel || '').toLowerCase()) || ''

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: parsed.title || pageTitle || url,
        summary: parsed.summary || '',
        suggestedLabel,
        isYouTube,
        youtubeAuthor,
      }),
    }
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Verbinding met Anthropic mislukt: ' + err.message }),
    }
  }
}
