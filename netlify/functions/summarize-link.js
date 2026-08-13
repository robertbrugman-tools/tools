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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY is niet ingesteld in Netlify.' }),
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

  let html = ''
  let pageTitle = ''
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

  const tekst = stripHtml(html)

  if (!tekst) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: pageTitle || url, summary: '' }),
    }
  }

  const systeem = `Je vat webpagina's samen voor iemand die snel wil scannen wat hij ermee moet doen. Schrijf in het Nederlands, in exact 3 tot 4 zinnen, feitelijk en bondig. Geen inleidende zinnen zoals "Deze pagina gaat over". Begin direct met de inhoud. Gebruik geen gedachtestreepje "—".`

  const gebruiker = `Titel (uit <title>-tag, kan onnauwkeurig zijn): ${pageTitle || '(onbekend)'}
URL: ${url}

Paginatekst (geëxtraheerd, kan rommelig zijn):
"""
${tekst}
"""

Geef antwoord in exact dit JSON-formaat, zonder andere tekst eromheen:
{"title": "korte duidelijke titel van de pagina, max 60 tekens", "summary": "samenvatting van 3 tot 4 zinnen"}`

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

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: parsed.title || pageTitle || url,
        summary: parsed.summary || '',
      }),
    }
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Verbinding met Anthropic mislukt: ' + err.message }),
    }
  }
}
