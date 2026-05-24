// Netlify serverless function: proxy naar OpenRouteService
// De ORS API-sleutel staat als omgevingsvariabele ORS_API_KEY in Netlify.
// De sleutel is zo nooit zichtbaar in de broncode of de browser.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const key = process.env.ORS_API_KEY
  if (!key) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ORS_API_KEY is not configured in Netlify.' }),
    }
  }

  try {
    const response = await fetch(
      'https://api.openrouteservice.org/v2/isochrones/driving-car',
      {
        method: 'POST',
        headers: {
          'Authorization': key,
          'Content-Type': 'application/json',
        },
        body: event.body,
      }
    )

    const body = await response.text()

    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body,
    }
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Verbinding met ORS mislukt: ' + err.message }),
    }
  }
}
