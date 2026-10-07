# Aanvragen: nieuwe Pipedrive-aanvragen in bakjes met conceptantwoord

Pagina: `/aanvragen/`. Inlog via de Hub (zelfde Supabase-account). Toegang voor de admin
(`robert@circe-advies.nl`) of een gebruiker met het recht `aanvragen` in `hub_permissions`.

## Bestanden
- `aanvragen/index.html`: de pagina (bakjes, lijst, detail, conceptgenerator, mailto, kopiëren).
- `netlify/functions/aanvragen-list.js`: haalt aanvragen uit Pipedrive (Pipeline incoming, kolom
  "Form ingevuld", open deals, vanaf 1 oktober 2026) en deelt ze in.
- `netlify/functions/aanvragen-draft.js`: schrijft het concept met de Anthropic API.
- `netlify/lib/aanvragen-classify.js`: de indelingsregels (aanpasbaar bovenin: grens 150 m², landlijsten).
- `netlify/lib/aanvragen-kennis.js`: kennis, schrijfregels en regels per bakje.
- `netlify/lib/pipedrive.js`, `netlify/lib/hub-auth.js`: Pipedrive-client en inlogcontrole.
- `netlify/lib/aanvragen-classify.test.js`: tests voor de indeling (`node netlify/lib/aanvragen-classify.test.js`).

## Omgevingsvariabelen (Netlify, nooit in Git)
- `PIPEDRIVE_API_TOKEN`: Pipedrive API-token.
- `RESPYRE_ANTHROPIC_KEY`: Anthropic-key voor deze app (valt terug op `ANTHROPIC_API_KEY`).
- Optioneel `RESPYRE_MODEL` (standaard `claude-sonnet-5-5`).

## Lokaal testen
`npx netlify-cli dev --port 8888`, daarna `http://localhost:8888/aanvragen/`.
Controle van de Pipedrive-velden: `/.netlify/functions/aanvragen-list?debug=1` (met inlogtoken) toont de ruwe eerste deal.
