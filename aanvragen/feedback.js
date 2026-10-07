// Feedback op een concept en beheer van leerregels. De server doet het eigenlijke werk (aanvragen-feedback).
// Gebruikt globals uit index.html: sb, authHeader, esc, data, drafts, ORDER.
(function () {
  const FN = '/.netlify/functions/aanvragen-feedback'
  const ADMIN = 'robert@circe-advies.nl'
  let isAdmin = false

  const style = document.createElement('style')
  style.textContent = `
    .fbx { margin-top: 22px; border-top: 1px solid var(--rule); padding-top: 16px; }
    .fbx .fb-row { display: flex; gap: 8px; margin-bottom: 10px; }
    .fbx .btn.ghost[aria-pressed="true"] { background: var(--green); color: #fff; }
    .fbx textarea { min-height: 72px; }
    .prop { background: var(--green-l); border-radius: 14px; padding: 12px 14px; margin-top: 10px; }
    .prop textarea { min-height: 64px; background: #fff; }
    .prop .row2 { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .prop .row2 select { width: auto; flex: 1 1 160px; }
    .prop .miss { font-size: .82rem; color: var(--warn); margin-top: 6px; }
    .prop.klaar { background: var(--paper); color: var(--mute); font-size: .84rem; }
    #rgBack { position: fixed; inset: 0; background: rgba(33,33,33,.45); z-index: 250; display: flex; align-items: flex-start; justify-content: center; padding: 28px 16px; overflow-y: auto; }
    #rgBox { background: var(--surface); border-radius: 22px; padding: 24px; width: 100%; max-width: 720px; }
    #rgBox h2 { font-family: var(--serif); font-weight: 500; color: var(--green); font-size: 1.2rem; margin-bottom: 4px; }
    .rg { border: 1px solid var(--rule); border-radius: 14px; padding: 12px; margin-top: 10px; }
    .rg.uit { opacity: .55; }
    .rg textarea { min-height: 60px; }
    .rg .row2 { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .rg .row2 select { width: auto; flex: 1 1 160px; }
  `
  document.head.appendChild(style)

  async function call(payload) {
    const h = await authHeader(); if (!h) throw new Error('Niet ingelogd.')
    const res = await fetch(FN, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || ('Fout ' + res.status))
    return body
  }

  async function syncAdmin() {
    try {
      const { data: { session } } = await sb.auth.getSession()
      isAdmin = !!(session && session.user && (session.user.email || '').toLowerCase() === ADMIN)
    } catch (_) { isAdmin = false }
    const b = document.getElementById('btnRegels')
    if (b) b.style.display = isAdmin ? '' : 'none'
    return isAdmin
  }
  syncAdmin()
  try { sb.auth.onAuthStateChange && sb.auth.onAuthStateChange(() => { syncAdmin() }) } catch (_) {}

  const bucketOpts = (sel, cur) => '<option value="">Alle bakjes</option>' + ORDER.filter(k => k !== 'handmatig').map(k =>
    `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(data && data.buckets[k] ? data.buckets[k].naam : k)}</option>`).join('')

  // ---- Onder het concept ----
  window.fbInit = async function (i, d) {
    const box = document.getElementById('fbBox'); if (!box) return
    await syncAdmin()
    d.fb = d.fb || { rating: 0, text: '', msg: '', props: null }
    const f = d.fb
    box.innerHTML = `<div class="fbx">
      <div class="lbl">Klopt dit concept inhoudelijk?</div>
      <div class="fb-row">
        <button class="btn ghost small" data-r="1" aria-pressed="${f.rating === 1}">Goed</button>
        <button class="btn ghost small" data-r="-1" aria-pressed="${f.rating === -1}">Niet goed</button>
      </div>
      <label class="lbl" for="fbText">Toelichting (optioneel)</label>
      <textarea id="fbText" maxlength="1500" placeholder="Bijvoorbeeld: deze aanvraag gaat over mos binnenshuis. Dat moet je in het antwoord noemen.">${esc(f.text)}</textarea>
      <div class="actions"><button class="btn" id="fbSend">Verstuur feedback</button><span class="status-line" id="fbStatus">${esc(f.msg)}</span></div>
      <div id="fbProp"></div>
      <p class="note">${isAdmin ? 'Uit je toelichting stel ik een leerregel voor. Die werkt pas als je hem bevestigt.' : 'Je feedback wordt bewaard. Robert beslist of er een regel van wordt.'}</p>
    </div>`
    if (f.props) renderProps(i, d)
    const st = document.getElementById('fbStatus')
    box.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => {
      f.rating = Number(b.dataset.r)
      box.querySelectorAll('[data-r]').forEach(x => x.setAttribute('aria-pressed', String(Number(x.dataset.r) === f.rating)))
    }))
    document.getElementById('fbText').addEventListener('input', e => { f.text = e.target.value })
    document.getElementById('fbSend').addEventListener('click', async () => {
      if (!f.rating) { st.textContent = 'Kies eerst Goed of Niet goed.'; st.className = 'status-line err'; return }
      const btn = document.getElementById('fbSend'); btn.disabled = true
      st.className = 'status-line'; st.textContent = isAdmin && f.text.trim().length >= 8 ? 'Opslaan en regel formuleren...' : 'Opslaan...'
      try {
        const body = (document.getElementById('dBody') || {}).value || d.tekst || ''
        const r = await call({ action: 'rate', dealId: i.id, bucket: d.bucket, beoordeling: f.rating, toelichting: f.text.trim(), concept: body })
        f.msg = 'Feedback opgeslagen.'
        f.props = isAdmin ? { feedbackId: r.feedbackId, lijst: (r.voorstellen || []).map(v => ({ ...v, status: 'open' })), ontbreekt: r.ontbreekt, dubbel: r.dubbel, fout: r.fout } : null
        st.textContent = f.msg
        renderProps(i, d)
      } catch (err) { st.textContent = err.message; st.className = 'status-line err' }
      btn.disabled = false
    })
  }

  function renderProps(i, d) {
    const wrap = document.getElementById('fbProp'); if (!wrap) return
    const p = d.fb.props
    if (!p) { wrap.innerHTML = ''; return }
    let h = ''
    if (p.fout) h += `<p class="note" style="color:var(--alert)">${esc(p.fout)}</p>`
    if (p.dubbel) h += '<p class="note">Voor dit punt bestaat al een regel. Er is geen nieuwe voorgesteld.</p>'
    if (!p.lijst.length && !p.fout && !p.dubbel) h += '<p class="note">Er is geen algemene regel afgeleid. Schrijf je toelichting wat concreter als je er een regel van wilt maken.</p>'
    p.lijst.forEach((v, n) => {
      if (v.status === 'saved') h += `<div class="prop klaar">Onthouden: ${esc(v.regel)}</div>`
      else if (v.status === 'skipped') h += ''
      else h += `<div class="prop" data-n="${n}">
        <label class="lbl">Voorgestelde leerregel (aan te passen)</label>
        <textarea data-f="regel">${esc(v.regel)}</textarea>
        ${p.ontbreekt && n === 0 ? `<div class="miss">Mist nog: ${esc(p.ontbreekt)} Vul dit aan in de regel hierboven.</div>` : ''}
        <div class="row2"><select data-f="bucket">${bucketOpts(v.bucket || d.bucket)}</select>
          <button class="btn small" data-a="save">Onthouden</button><button class="btn ghost small" data-a="skip">Overslaan</button>
          <span class="status-line" data-f="st"></span></div></div>`
    })
    wrap.innerHTML = h
    wrap.querySelectorAll('.prop[data-n]').forEach(el => {
      const n = Number(el.dataset.n), v = p.lijst[n], st = el.querySelector('[data-f=st]')
      el.querySelector('[data-a=skip]').addEventListener('click', () => { v.status = 'skipped'; renderProps(i, d) })
      el.querySelector('[data-a=save]').addEventListener('click', async () => {
        const regel = el.querySelector('[data-f=regel]').value.trim()
        const bucket = el.querySelector('[data-f=bucket]').value || null
        st.className = 'status-line'; st.textContent = 'Bezig...'
        try {
          await call({ action: 'saveRule', regel, bucket, dealId: i.id, feedbackId: p.feedbackId })
          v.regel = regel; v.status = 'saved'; renderProps(i, d); updateCount()
        } catch (err) { st.textContent = err.message; st.className = 'status-line err' }
      })
    })
  }

  // ---- Leerregelspaneel ----
  let regels = [], maxRegels = 60
  async function updateCount() {
    if (!isAdmin) return
    try { const r = await call({ action: 'list' }); regels = r.regels; maxRegels = r.max
      const b = document.getElementById('btnRegels'); if (b) b.querySelector('span').textContent = 'Leerregels (' + regels.filter(x => x.actief).length + ')' } catch (_) {}
  }
  window.regelsOpen = async function () {
    await syncAdmin(); if (!isAdmin) return
    const back = document.createElement('div'); back.id = 'rgBack'
    back.innerHTML = '<div id="rgBox" role="dialog" aria-label="Leerregels"><h2>Leerregels</h2><p class="note">Deze regels worden bij elk nieuw concept meegegeven en gaan voor de vaste kennis. Een regel die niet meer klopt zet je uit of verwijder je hier.</p><div id="rgList"><p class="note">Laden...</p></div><div class="actions"><button class="btn ghost" id="rgClose">Sluiten</button></div></div>'
    document.body.appendChild(back)
    const close = () => { back.remove(); updateCount() }
    back.addEventListener('click', e => { if (e.target === back) close() })
    back.querySelector('#rgClose').addEventListener('click', close)
    const list = back.querySelector('#rgList')
    async function load() {
      try { const r = await call({ action: 'list' }); regels = r.regels; maxRegels = r.max } catch (err) { list.innerHTML = `<p class="note" style="color:var(--alert)">${esc(err.message)}</p>`; return }
      if (!regels.length) { list.innerHTML = '<p class="note">Nog geen regels. Ze ontstaan zodra je feedback geeft op een concept en een voorstel bevestigt.</p>'; return }
      list.innerHTML = `<p class="note">${regels.filter(x => x.actief).length} van maximaal ${maxRegels} actief.</p>` + regels.map(r => `<div class="rg ${r.actief ? '' : 'uit'}" data-id="${r.id}">
        <textarea data-f="regel">${esc(r.regel)}</textarea>
        <div class="row2"><select data-f="bucket">${bucketOpts(r.bucket)}</select>
          <button class="btn small" data-a="save">Opslaan</button>
          <button class="btn ghost small" data-a="toggle">${r.actief ? 'Zet uit' : 'Zet aan'}</button>
          <button class="btn ghost small" data-a="del">Verwijder</button>
          <span class="status-line" data-f="st"></span></div></div>`).join('')
      list.querySelectorAll('.rg').forEach(el => {
        const id = el.dataset.id, r = regels.find(x => x.id === id), st = el.querySelector('[data-f=st]')
        const run = async (payload, okText) => { st.className = 'status-line'; st.textContent = 'Bezig...'
          try { await call(payload); if (okText) { st.textContent = okText } return true } catch (err) { st.textContent = err.message; st.className = 'status-line err'; return false } }
        el.querySelector('[data-a=save]').addEventListener('click', () => run({ action: 'update', id, regel: el.querySelector('[data-f=regel]').value, bucket: el.querySelector('[data-f=bucket]').value || null }, 'Opgeslagen.'))
        el.querySelector('[data-a=toggle]').addEventListener('click', async () => { if (await run({ action: 'update', id, actief: !r.actief })) load() })
        el.querySelector('[data-a=del]').addEventListener('click', async () => { if (confirm('Deze regel verwijderen?') && await run({ action: 'delete', id })) load() })
      })
    }
    load()
  }
  setTimeout(updateCount, 1500)
})()
