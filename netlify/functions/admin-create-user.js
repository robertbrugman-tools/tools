// Netlify serverless function: maakt een nieuw hub-account aan via de
// Supabase Admin API, met e-mail meteen bevestigd (email_confirm: true).
//
// Waarom niet gewoon sb.auth.signUp() vanuit de browser (zoals eerst)?
// signUp() is de publieke self-service flow en vereist altijd bevestiging
// via een e-mail-link voordat de gebruiker kan inloggen. Voor accounts die
// een beheerder namens iemand anders aanmaakt (met een tijdelijk wachtwoord)
// is dat onnodig en zorgt het voor een account dat niet werkt totdat de
// nieuwe gebruiker een mail vindt en bevestigt, die er soms nooit komt of
// in spam belandt. De Admin API kan dit direct bevestigd aanmaken, maar
// vereist de service-role/secret key, die nooit in de browser mag komen —
// vandaar deze server-side functie.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://swrunlzeydmcskceqdju.supabase.co'
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY is niet ingesteld in Netlify.' }),
    }
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Ongeldige aanvraag.' }) }
  }

  const email = (payload.email || '').trim()
  const password = (payload.password || '').trim()
  if (!email || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: 'E-mail en wachtwoord zijn verplicht.' }) }
  }

  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    })

    const data = await resp.json()

    if (!resp.ok) {
      const msg = data.msg || data.error_description || data.message || ('Fout ' + resp.status)
      return { statusCode: resp.status, body: JSON.stringify({ error: msg }) }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: data.id, email: data.email }),
    }
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Verbinding met Supabase mislukt: ' + err.message }),
    }
  }
}
