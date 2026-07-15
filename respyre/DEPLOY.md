# Respyre antwoorden — deploy

Tool die een binnengekomen aanvraag omzet in een concept-antwoord in jouw stijl,
op basis van de ingebouwde Respyre-kennis en je eerdere mailvoorbeelden.

## Wat er is toegevoegd

- `respyre/index.html` — de frontend (licht; bevat geen kennis of key).
- `netlify/functions/respyre.js` — de backend. Roept Claude aan, met de
  Respyre-kennis + schrijfstijl ingebouwd. De API-key komt uit een
  omgevingsvariabele, precies zoals `isochrone.js` dat doet met `ORS_API_KEY`.
- `index.html` — bijgewerkt: tools staan nu in twee secties, **Privé** en
  **Zakelijk**. Respyre valt onder Zakelijk.

## Eenmalig instellen (3 stappen)

### 1. API-key als secret in Netlify
Netlify → jouw site → **Site configuration → Environment variables → Add a variable**
- Key: `ANTHROPIC_API_KEY`
- Value: je Anthropic-key (`sk-ant-...`) van https://console.anthropic.com/settings/keys

De key staat zo alleen op de server, nooit in de browser of in Git.

### 2. Toegang aanzetten voor jezelf
De hub regelt toegang per gebruiker via de tabel `hub_permissions`. Als admin
(`robert@circe-advies.nl`) zie je automatisch alle tools, dus voor jou hoeft er
niets. Wil je de tool ook voor andere gebruikers zichtbaar maken, voeg dan via
**⚙ Beheer** de app-key `respyre` aan hun rechten toe.

### 3. Pushen naar GitHub
```
git add index.html respyre/ netlify/functions/respyre.js
git commit -m "Respyre antwoordgenerator + zakelijke sectie"
git push
```
Netlify bouwt en deployt automatisch. Daarna staat de tool op
`https://robertbrugman.nl/respyre/` en in het overzicht onder **Zakelijk**.

## Lokaal testen (optioneel)
Via je bestaande "Start lokale server.command" of `netlify dev` (poort 8888).
Zet dan lokaal de env var: `ANTHROPIC_API_KEY=sk-ant-... netlify dev`

## De kennis bijwerken
Alle productkennis, prijzen en schrijfstijl-voorbeelden staan bovenin
`netlify/functions/respyre.js` in de constante `KENNIS`. Prijs gewijzigd of
nieuw voorbeeld? Pas die tekst aan, commit, push. Geen frontend-wijziging nodig.

## Model
De function gebruikt `claude-sonnet-4-20250514`. Wil je goedkoper of sneller,
wijzig de `model`-regel in `respyre.js` (bijv. een Haiku-model).

## Let op
Elk antwoord is een **concept**. Het model is geïnstrueerd niets te verzinnen en
door te vragen bij ontbrekende gegevens (orientatie, m², foto's), maar prijzen en
projectdetails verschillen per situatie. Altijd nalezen voor je verstuurt.
