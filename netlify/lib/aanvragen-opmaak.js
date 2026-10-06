// Opmaakregels voor het concept (kopjes) en de verwerking daarvan.
// De mail blijft platte tekst. Het model markeert kopjes met "# ", de server haalt die markering weg
// en geeft de kopjes apart terug, zodat de pagina ze vet kan maken bij "Kopieer opgemaakt".

const OPMAAK = `# OPMAAK VAN HET ANTWOORD (deze regels gaan voor op eerdere opmerkingen over tussenkopjes)
- Informatieaanvragen van bedrijven en grotere projecten (ook R&D en pilot): werk met duidelijke kopjes. Zo schrijft Robert zijn mails: een korte inleiding zonder kopje (bedankje, iets concreets over het project, wat je nog wilt weten), daarna per onderwerp een kopje met korte tekst eronder.
- Markeer elk kopje door de regel te laten beginnen met "# " (hekje en spatie). Het kopje staat op een eigen regel en de tekst begint direct op de regel eronder. Tussen twee onderdelen staat een lege regel. Een kopje heeft geen dubbele punt en mag een vraag zijn.
- Gebruik geen andere opmaak: geen sterretjes, geen vetgedrukte tekst, geen ##. Een opsomming mag, maximaal 4 punten, met een streepje aan het begin van de regel.
- Vaste kopjes, alleen opnemen als ze op deze aanvraag van toepassing zijn, in deze volgorde:
  Nederlands: "Hoe werkt het?", "Irrigatiesysteem", "Aanbrengen", "Investering", "Subsidie" (alleen Nederlandse bedrijven), "R&D-project" of "Pilot" (alleen buiten de Benelux en Duitsland, volgens de regels van het bakje), "Hoe nu verder?"
  Engels: "How it works", "Irrigation system", "Application", "Investment", "R&D project" or "Pilot", "Next steps"
  Duits: "So funktioniert es", "Bewässerungssystem", "Anbringung", "Investition", "Wie geht es weiter?"
- Onder "Hoe nu verder?" staat de vervolgstap (bij voorkeur een online afspraak) en als allerlaatste zin dat de documenten worden meegestuurd. Die laatste zin krijgt geen eigen kopje.
- IRRIGATIE EN KOSTEN: noem nooit bedragen voor het irrigatiesysteem (geen pomp, verdeler, totaalbedrag of schatting). De kosten verschillen per project en zijn niet in een getal te vangen. Onder "Investering" staat voor irrigatie alleen een zin dat de kosten per project verschillen en dat we die graag samen bekijken. Het kopje "Irrigatiesysteem" gaat alleen over werking, duur en wateraandachtspunten. Dit gaat voor op alle eerdere opmerkingen over irrigatiekosten.
- LENGTE: houd de mail compact, ongeveer 300 tot 400 woorden. Schrijf de mail altijd volledig af, inclusief "Hoe nu verder?" en de slotzin over de documenten. Liever kortere onderdelen dan een mail die niet af is.
- Geen kopjes bij afwijzingen, bij betonproducenten en samenwerking, en bij korte antwoorden (bijvoorbeeld alleen een prijsvraag, minder dan ongeveer 120 woorden). Schrijf die in gewone alinea's.`

function schoon(tekst) {
  // Geen gedachtestreepjes, ook niet als het model ze toch gebruikt.
  return String(tekst || '').replace(/\s[—–]\s/g, ', ').replace(/[—–]/g, '-')
}

// Vangnet: haalt regels en zinnen met bedragen voor pomp/verdeler/irrigatiesysteem weg.
function zonderIrrigatiekosten(tekst) {
  const irr = /^\s*[-*•]?\s*(irrigation|irrigatie|bew[aä]sserung)[^:\n]{0,40}:/i
  const pomp = /(pump|pomp|pumpe|distributor|verdeler|verteiler)/i
  const regels = String(tekst || '').split('\n').filter(r => !(irr.test(r) && /€/.test(r)))
  return regels.map(r => {
    if (!(pomp.test(r) && /€/.test(r))) return r
    const zinnen = r.split(/(?<=[.!?])\s+/)
    return zinnen.filter(z => !(pomp.test(z) && /€/.test(z))).join(' ')
  }).join('\n').replace(/\n{3,}/g, '\n\n')
}

// Haalt kopjes uit de tekst: regels met "# " (of ## of **vet**) worden gewone regels, de kopjes komen in een lijst.
function kopjesUitTekst(tekst) {
  const kopjes = []
  const regels = String(tekst || '').split('\n').map(r => {
    const m = r.match(/^\s*#{1,3}\s+(.+?)\s*$/) || r.match(/^\s*\*\*(.+?)\*\*:?\s*$/)
    if (m) {
      const k = m[1].replace(/\*\*/g, '').trim()
      kopjes.push(k)
      return k
    }
    return r.replace(/\*\*/g, '')
  })
  return { tekst: regels.join('\n').replace(/\n{3,}/g, '\n\n').trim(), kopjes }
}

module.exports = { OPMAAK, schoon, kopjesUitTekst, zonderIrrigatiekosten }
