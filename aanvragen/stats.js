// Overzicht: aantal binnengekomen aanvragen per dag. De server telt (aanvragen-stats).
// Gebruikt globals uit index.html: authHeader, esc, data.
(function () {
  const FN = '/.netlify/functions/aanvragen-stats'
  const TZ = 'Europe/Amsterdam'

  const style = document.createElement('style')
  style.textContent = `
    #stBack { position: fixed; inset: 0; background: rgba(33,33,33,.45); z-index: 250; display: flex; align-items: flex-start; justify-content: center; padding: 28px 16px; overflow-y: auto; }
    #stBox { background: var(--surface); border-radius: 22px; padding: 24px; width: 100%; max-width: 640px; }
    #stBox h2 { font-family: var(--serif); font-weight: 500; color: var(--green); font-size: 1.2rem; margin-bottom: 4px; }
    #stBox .note { font-size: .84rem; color: var(--mute); margin-bottom: 10px; }
    .st-sum { display: flex; gap: 10px; flex-wrap: wrap; margin: 14px 0 6px; }
    .st-sum div { flex: 1 1 130px; background: var(--paper); border-radius: 14px; padding: 10px 14px; }
    .st-sum b { display: block; font-size: 1.4rem; color: var(--ink); font-variant-numeric: tabular-nums; font-weight: 600; }
    .st-sum span { font-size: .76rem; color: var(--mute); }
    .st-row { display: grid; grid-template-columns: 84px 1fr 34px 86px; gap: 10px; align-items: center; padding: 6px 0; border-top: 1px solid var(--rule-2); font-size: .86rem; }
    .st-row .d { color: var(--ink); }
    .st-row.wk .d { color: var(--mute); }
    .st-row.nu .d { font-weight: 600; }
    .st-bar { height: 14px; background: var(--paper); border-radius: 999px; overflow: hidden; }
    .st-bar i { display: block; height: 100%; background: var(--green); border-radius: 999px; }
    .st-row .n { text-align: right; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
    .st-row .n.nul { color: var(--mute); font-weight: 400; }
    .st-row .o { font-size: .76rem; color: var(--mute); text-align: right; white-space: nowrap; }
    .st-head { border-top: none; font-size: .74rem; color: var(--mute); padding-bottom: 2px; }
    @media (max-width: 520px) { .st-row { grid-template-columns: 70px 1fr 28px 70px; gap: 6px; } }
  `
  document.head.appendChild(style)

  const dagKey = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const label = k => {
    const [y, m, d] = k.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  }
  const isWeekend = k => { const [y, m, d] = k.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); return w === 0 || w === 6 }

  window.statsOpen = async function () {
    const back = document.createElement('div'); back.id = 'stBack'
    back.innerHTML = '<div id="stBox" role="dialog" aria-label="Aanvragen per dag"><h2>Aanvragen per dag</h2><p class="note">Binnengekomen in Pipeline incoming sinds 1 oktober 2026, per kalenderdag (Nederlandse tijd). Afgehandelde aanvragen tellen mee.</p><div id="stBody"><p class="note">Laden...</p></div><div class="actions"><button class="btn ghost" id="stClose">Sluiten</button></div></div>'
    document.body.appendChild(back)
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey) }
    const onKey = e => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    back.addEventListener('click', e => { if (e.target === back) close() })
    back.querySelector('#stClose').addEventListener('click', close)
    const body = back.querySelector('#stBody')
    try {
      const h = await authHeader(); if (!h) { close(); return }
      const res = await fetch(FN, { headers: h })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(r.error || ('Fout ' + res.status))
      const open = {}
      ;((typeof data !== 'undefined' && data && data.items) || []).forEach(i => { const k = dagKey(new Date(i.addTime)); open[k] = (open[k] || 0) + 1 })
      const dagen = r.dagen.slice().reverse() // nieuwste bovenaan
      const max = Math.max(1, ...dagen.map(d => d.aantal))
      const werk = r.dagen.filter(d => !isWeekend(d.dag))
      const gem = werk.length ? (werk.reduce((s, d) => s + d.aantal, 0) / werk.length) : 0
      const top = r.dagen.reduce((a, d) => d.aantal > a.aantal ? d : a, { aantal: -1 })
      body.innerHTML = `<div class="st-sum">
          <div><b>${r.totaal}</b><span>totaal sinds 1 okt</span></div>
          <div><b>${gem.toFixed(1).replace('.', ',')}</b><span>gemiddeld per werkdag</span></div>
          <div><b>${top.aantal > 0 ? top.aantal : '-'}</b><span>${top.aantal > 0 ? 'drukste dag: ' + esc(label(top.dag)) : 'drukste dag'}</span></div>
        </div>
        <div class="st-row st-head"><span>Dag</span><span></span><span style="text-align:right">Nieuw</span><span style="text-align:right">Nog open</span></div>` +
        dagen.map(d => `<div class="st-row ${isWeekend(d.dag) ? 'wk' : ''} ${d.dag === r.today ? 'nu' : ''}">
          <span class="d">${esc(d.dag === r.today ? 'Vandaag' : label(d.dag))}</span>
          <span class="st-bar"><i style="width:${Math.round(d.aantal / max * 100)}%"></i></span>
          <span class="n ${d.aantal ? '' : 'nul'}">${d.aantal}</span>
          <span class="o">${open[d.dag] ? open[d.dag] + ' open' : ''}</span></div>`).join('')
    } catch (err) {
      body.innerHTML = `<p class="note" style="color:var(--alert)">${esc(err.message)}</p>`
    }
  }
})()
