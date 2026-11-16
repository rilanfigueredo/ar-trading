// Fractal (v0.26.12): panel lateral. Guarda la estructura marcada con un rectángulo, mide sus características
// (ICT/SMC: barridos de liquidez, mechas, desplazamiento…) y busca estructuras parecidas en otras temporalidades
// del mismo activo. El motor está en fractal.js (puro y con pruebas).
(function (root) {
  'use strict';
  const F = root.TVFractal;
  let X = null;
  let busy = null;           // { cancel: bool } mientras se busca
  let results = null;        // { patId, items: [{ tf, label, score, ... }], info: [texto por temporalidad], at }
  const cache = new Map();   // 'ex|sym|tf|depth' -> { bars, reached, anchor }

  const $p = () => X.$('fractalPanel');
  const isOpen = () => !$p().classList.contains('hidden');
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const fx = () => X.A.cfg.fractal;
  const save = () => { X.saveCfg(); };

  // Temporalidades que se ofrecen: de 3 minutos a 1 mes (más las propias del usuario que caigan en ese rango).
  const BASE_TFS = ['m:3', 'm:5', 'm:15', 'm:30', 'm:60', 'm:120', 'm:240', 'm:360', 'm:480', 'm:720', 'd:1', 'd:3', 'w:1', 'M:1'];
  const MIN_SEC = 180, MAX_SEC = 31 * 86400;
  function tfChoices() {
    const ids = BASE_TFS.slice();
    (X.A.cfg.tfs || []).forEach((id) => {
      let t; try { t = X.L.tfById(id); } catch (e) { return; }
      if (t.kind === 'vol' || t.sec < MIN_SEC || t.sec > MAX_SEC) return;
      if (!ids.includes(t.id)) ids.push(t.id);
    });
    return ids.map((id) => X.L.tfById(id)).sort((a, b) => a.sec - b.sec);
  }

  // ---------- Configuración guardada ----------
  function clean(src) {
    const s = src && typeof src === 'object' ? src : {};
    const pats = [];
    (Array.isArray(s.patterns) ? s.patterns : []).forEach((p) => {
      if (!p || typeof p !== 'object' || !p.feat || !p.feat.shape || !p.feat.m) return;
      const sh = p.feat.shape;
      if (![sh.h, sh.l, sh.c].every((a) => Array.isArray(a) && a.length === F.SHAPE_N && a.every((v) => typeof v === 'number' && isFinite(v)))) return;
      if (!F.MEASURES.every((m) => typeof p.feat.m[m.id] === 'number' && isFinite(p.feat.m[m.id]))) return;
      pats.push({
        id: String(p.id || 'p' + pats.length), name: String(p.name || 'Estructura').slice(0, 60), symbol: String(p.symbol || ''), tf: String(p.tf || 'm:60'),
        t0: Number(p.t0) || 0, t1: Number(p.t1) || 0, at: Number(p.at) || 0, notes: Array.isArray(p.notes) ? p.notes.map((x) => String(x).slice(0, 80)).slice(0, 12) : [], feat: p.feat,
      });
    });
    const search = F.fixSearch(s.search);
    const sel = pats.some((p) => p.id === s.sel) ? s.sel : (pats[0] ? pats[0].id : '');
    return { patterns: pats.slice(0, 200), sel, search };
  }
  const curPat = () => fx().patterns.find((p) => p.id === fx().sel) || null;

  // ---------- Tomar el rectángulo seleccionado ----------
  function selectedRect() {
    const A = X.A, v = X.activeView(), vc = X.activeCfg();
    const sym = vc.symbol;
    const ids = A.drawStore.selIds(sym);
    const list = (A.cfg.drawings[sym] || []);
    const rects = ids.map((id) => list.find((d) => d.id === id)).filter((d) => d && d.type === 'rect' && d.pts && d.pts.length > 1);
    return { v, vc, sym, rects, list };
  }
  function takeRect() {
    const { v, vc, sym, rects, list } = selectedRect();
    if (!rects.length) return say('Primero dibuja un rectángulo que encierre la estructura y haz clic en él para seleccionarlo.', true);
    const r = rects[0];
    const t0 = Math.min(r.pts[0].t, r.pts[1].t), t1 = Math.max(r.pts[0].t, r.pts[1].t);
    const p0 = Math.min(r.pts[0].p, r.pts[1].p), p1 = Math.max(r.pts[0].p, r.pts[1].p);
    const tf = X.L.tfFor(X.L.tfById(vc.tf), vc.exchange || 'binance');
    if (tf.kind === 'vol') return say('Fractal funciona con velas de tiempo, no con velas por volumen.', true);
    if (tf.sec < MIN_SEC) return say('La temporalidad más baja que admite Fractal es 3 minutos. Cambia el gráfico a 3 min o más.', true);
    const bars = v.bars;
    if (!bars || !bars.length) return say('El gráfico todavía no tiene velas cargadas.', true);
    const res = F.buildPattern(bars, t0, t1, tf.sec);
    if (!res.ok) return say(res.reason, true);
    // otros dibujos dentro del rectángulo: se guardan como notas (en esta fase no cambian la búsqueda)
    const notes = [];
    list.forEach((d) => {
      if (d === r || !d.pts || !d.pts.length) return;
      const inside = d.pts.every((q) => q.t >= t0 && q.t <= t1 && q.p >= p0 && q.p <= p1);
      if (!inside) return;
      const base = X.A.drawStore.label(d);
      notes.push(base);
    });
    if (r.text) notes.unshift('Rectángulo: ' + String(r.text).slice(0, 40));
    const n = fx().patterns.length + 1;
    const pat = {
      id: 'p' + Date.now().toString(36), name: (r.text ? String(r.text).slice(0, 30) : 'Estructura ' + n), symbol: sym, tf: tf.id,
      t0, t1, at: Date.now(), notes: notes.slice(0, 12), feat: res.feat,
    };
    fx().patterns.push(pat); fx().sel = pat.id;
    results = null;
    save(); render();
    say(`Estructura guardada: ${res.feat.n} velas de ${tf.label}.`);
  }

  // ---------- Descarga de historial ----------
  async function loadTf(tf, sym, ex, depth, isCancel, onInfo) {
    const key = [ex, sym, tf.id, depth].join('|');
    if (cache.has(key)) return cache.get(key);
    const T = X.L.tfFor(tf, ex);
    if (T.unavailable) throw new Error(T.why);
    const bsec = X.L.baseSec(T);
    let anchor = 0;
    if (X.L.needsAnchor(T)) {
      if (ex !== 'binance') anchor = X.L.GENESIS_SEC;
      else { const f = await X.API.klines({ symbol: sym, interval: T.base, startTime: 0, limit: 1 }); if (f.length) anchor = Math.floor(f[0][0] / 1000); }
    }
    const ratio = Math.max(1, X.L.ratioOf(T));
    const pages = Math.max(1, Math.min(60, Math.ceil((depth * ratio) / 1000)));
    let rows = [], reached = false;
    if (bsec && window.TVHistory && TVHistory.supported(T.base)) {
      const r = await TVHistory.fetchBack(sym, T.base, undefined, pages, isCancel, ex);
      if (!r) return null;
      rows = r.rows; reached = r.reached;
    } else {
      const map = new Map();
      let end;
      for (let p = 0; p < pages; p++) {
        if (isCancel()) return null;
        const params = { exchange: ex, symbol: sym, interval: T.base, limit: 1000 };
        if (end !== undefined) params.endTime = end;
        const got = await X.API.klines(params);
        if (!got.length) { reached = true; break; }
        got.forEach((k) => map.set(k[0], k));
        end = got[0][0] - 1;
        if (got.length < 1000) { reached = true; break; }
        if (onInfo) onInfo(`${tf.label}: ${p + 1}/${pages}`);
      }
      rows = Array.from(map.values()).sort((a, b) => a[0] - b[0]);
    }
    const base = rows.map(X.L.parseKline);
    let bars = X.L.aggregate(base, T, anchor);
    if (bars.length > depth) bars = bars.slice(bars.length - depth);
    const out = { bars, reached, sec: T.sec, anchor };
    cache.set(key, out);
    if (cache.size > 24) cache.delete(cache.keys().next().value);
    return out;
  }

  // ---------- Búsqueda ----------
  async function runSearch() {
    const pat = curPat();
    if (!pat) return say('Primero guarda una estructura.', true);
    const s = fx().search;
    if (!s.tfs.length) return say('Elige al menos una temporalidad donde buscar.', true);
    const vc = X.activeCfg();
    const sym = pat.symbol || vc.symbol, ex = vc.exchange || 'binance';
    const job = { cancel: false };
    busy = job;
    results = { patId: pat.id, items: [], info: [], at: Date.now(), running: true };
    render();
    const isCancel = () => job.cancel;
    const tfs = s.tfs.map((id) => X.L.tfById(id)).sort((a, b) => a.sec - b.sec);
    for (let i = 0; i < tfs.length; i++) {
      if (job.cancel) break;
      const tf = tfs[i];
      progress(`Buscando en ${tf.label} (${i + 1}/${tfs.length})…`);
      try {
        const d = await loadTf(tf, sym, ex, s.depth, isCancel, progress);
        if (!d || job.cancel) break;
        await new Promise((r) => setTimeout(r, 0));
        const excl = pat.tf === tf.id && sym === pat.symbol ? { t0: pat.t0 - tf.sec, t1: pat.t1 + tf.sec } : null;
        const r = F.search(pat.feat, d.bars, s, { tfSec: d.sec, exclude: excl });
        const first = d.bars.length ? d.bars[0].time : 0;
        const since = first ? new Date(first * 1000).toISOString().slice(0, 10) : '—';
        results.info.push(`${tf.label}: ${d.bars.length} velas desde ${since}${d.reached ? '' : ''} · ${r.matches.length} coincidencia${r.matches.length === 1 ? '' : 's'}`);
        r.matches.forEach((m) => results.items.push({ tfId: tf.id, tf: tf.label, sym, ex, score: m.score, t0: m.t0, t1: m.t1, mirrored: m.mirrored, n: m.len, pLow: m.pLow, pHigh: m.pHigh, shape: Math.round(m.shape * 100) }));
      } catch (e) {
        results.info.push(`${tfs[i].label}: ERROR — ${e && e.message ? e.message : e}`);
      }
      results.items.sort((a, b) => b.score - a.score);
      render();
    }
    results.running = false;
    results.cancelled = job.cancel;
    busy = null;
    render();
  }
  function progress(t) { const e = $p().querySelector('.fr-prog'); if (e) e.textContent = t; }

  // ---------- Ir a una coincidencia ----------
  async function goTo(it, mark) {
    const A = X.A, v = X.activeView(), vc = X.activeCfg();
    if (it.sym && it.sym !== vc.symbol) { say('Esta coincidencia es de otro activo (' + it.sym + ').', true); return; }
    if (vc.tf !== it.tfId) {
      if (!A.cfg.tfs.some((x) => X.L.normalizeId(x) === it.tfId)) A.cfg.tfs.push(it.tfId);
      await v.setTf(it.tfId);
      if (A.markActive) A.markActive();
    }
    await v.goToRange(it.t0, it.t1);
    if (mark) {
      const st = A.drawStore;
      const d = Object.assign({ type: 'rect', pts: [{ t: it.t0, p: it.pLow }, { t: it.t1, p: it.pHigh }], chart: vc.id, shared: false },
        st.typeDefaults('rect'), { text: `Fractal ${Math.round(it.score)} %${it.mirrored ? ' (espejo)' : ''}`, color: '#ff9800' });
      st.add(vc.symbol, d);
    }
  }

  // ---------- Dibujo del panel ----------
  let msg = null;
  function say(t, err) { msg = { t, err: !!err }; const e = $p().querySelector('.fr-msg'); if (e) { e.textContent = t; e.className = 'fr-msg hint' + (err ? ' err' : ''); } else render(); }

  function sparkline(feat, w, h) {
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; c.style.width = w + 'px'; c.style.height = h + 'px';
    const g = c.getContext('2d'); g.scale(2, 2);
    const sh = feat.shape, n = sh.c.length, dx = w / (n - 1);
    const y = (v) => h - 2 - v * (h - 4);
    g.strokeStyle = 'rgba(120,123,134,.55)'; g.lineWidth = 1; g.beginPath();
    for (let i = 0; i < n; i++) { g.moveTo(i * dx, y(sh.h[i])); g.lineTo(i * dx, y(sh.l[i])); }
    g.stroke();
    g.strokeStyle = '#2962ff'; g.lineWidth = 1.5; g.beginPath();
    for (let i = 0; i < n; i++) { if (i) g.lineTo(i * dx, y(sh.c[i])); else g.moveTo(0, y(sh.c[i])); }
    g.stroke();
    return c;
  }
  const fmtDate = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');

  function render() {
    const p = $p(); if (!p || !X) return;
    if (!isOpen()) return;
    p.innerHTML = '';
    const c = fx(), s = c.search, pat = curPat();
    p.appendChild(el('h3', '', 'Fractal'));
    const intro = el('div', 'hint', 'Guarda una estructura de precio y busca otras parecidas en distintas temporalidades del mismo activo.');
    p.appendChild(intro);

    // 1. estructura
    p.appendChild(el('div', 'fr-h', '1 · Estructura'));
    const b1 = el('button', 'btn primary', 'Tomar rectángulo seleccionado');
    b1.title = 'Dibuja un rectángulo que encierre la estructura (con tus líneas y textos dentro), haz clic en él para seleccionarlo y pulsa aquí.';
    b1.onclick = takeRect;
    p.appendChild(b1);
    const m = el('div', 'fr-msg hint' + (msg && msg.err ? ' err' : ''), msg ? msg.t : '');
    p.appendChild(m);
    if (!c.patterns.length) p.appendChild(el('div', 'hint', 'Todavía no hay estructuras guardadas.'));
    c.patterns.forEach((q) => {
      const row = el('div', 'fr-pat' + (q.id === c.sel ? ' sel' : ''));
      row.appendChild(sparkline(q.feat, 64, 32));
      const info = el('div', 'fr-pinfo');
      const nm = el('input', 'fr-name'); nm.value = q.name; nm.title = 'Nombre (puedes cambiarlo)';
      nm.onclick = (e) => e.stopPropagation();
      nm.onchange = () => { q.name = nm.value.trim().slice(0, 60) || 'Estructura'; save(); };
      info.appendChild(nm);
      let tfl = q.tf; try { tfl = X.L.tfById(q.tf).label; } catch (e) { /* ok */ }
      info.appendChild(el('div', 'hint small', `${q.symbol} · ${tfl} · ${q.feat.n} velas · ${fmtDate(q.t0)}`));
      row.appendChild(info);
      const del = el('button', 'btn-x', '✕'); del.title = 'Borrar esta estructura';
      del.onclick = (e) => { e.stopPropagation(); c.patterns = c.patterns.filter((z) => z !== q); if (c.sel === q.id) c.sel = c.patterns[0] ? c.patterns[0].id : ''; results = null; save(); render(); };
      row.appendChild(del);
      row.onclick = () => { c.sel = q.id; results = null; save(); render(); };
      p.appendChild(row);
    });

    if (pat) {
      // 2. medidas
      p.appendChild(el('div', 'fr-h', '2 · Medidas de «' + pat.name + '»'));
      if (pat.notes.length) p.appendChild(el('div', 'hint small', 'Dibujos dentro del rectángulo (solo notas por ahora): ' + pat.notes.join(', ')));
      p.appendChild(el('div', 'hint small', 'Marca las medidas que deben parecerse. «Peso» = importancia (1–10). «Obligatoria»: si no se parece, se descarta.'));
      const tb = el('table', 'fr-meas');
      F.MEASURES.forEach((ms) => {
        const cfg = s.meas[ms.id];
        const tr = el('tr', cfg.on ? '' : 'off');
        const td0 = el('td'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = cfg.on;
        cb.onchange = () => { cfg.on = cb.checked; save(); render(); };
        td0.appendChild(cb); tr.appendChild(td0);
        const td1 = el('td'); const lb = el('div', '', ms.label); lb.title = ms.hint; td1.appendChild(lb);
        td1.appendChild(el('div', 'hint small', 'Valor: ' + ms.fmt(pat.feat.m[ms.id]))); tr.appendChild(td1);
        const td2 = el('td'); const w = el('input'); w.type = 'number'; w.min = 1; w.max = 10; w.value = cfg.w; w.className = 'fr-num'; w.title = 'Peso';
        w.onchange = () => { cfg.w = Math.max(1, Math.min(10, Number(w.value) || 1)); save(); }; td2.appendChild(w); tr.appendChild(td2);
        const td3 = el('td'); const rq = el('input'); rq.type = 'checkbox'; rq.checked = cfg.req; rq.title = 'Obligatoria';
        rq.onchange = () => { cfg.req = rq.checked; save(); }; td3.appendChild(rq); tr.appendChild(td3);
        tb.appendChild(tr);
      });
      const thead = el('tr'); ['', 'Medida', 'Peso', 'Oblig.'].forEach((t) => thead.appendChild(el('th', '', t))); tb.insertBefore(thead, tb.firstChild);
      p.appendChild(tb);
    }

    // 3. búsqueda
    p.appendChild(el('div', 'fr-h', '3 · Búsqueda'));
    const slider = (label, key, min, max, step, fmt, hint) => {
      const w = el('div', 'fr-sl'); const l = el('label', '', ''); l.title = hint || '';
      const val = el('b', '', fmt(s[key])); l.append(label + ': ', val);
      const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = s[key];
      r.oninput = () => { s[key] = Number(r.value); val.textContent = fmt(s[key]); };
      r.onchange = () => { save(); };
      w.append(l, r); p.appendChild(w);
    };
    slider('Parecido mínimo', 'minScore', 50, 100, 1, (v) => v + ' %', 'Solo se muestran coincidencias con este parecido o más (50–100 %).');
    slider('Peso de la forma', 'shapeW', 0, 100, 5, (v) => v + ' % forma / ' + (100 - v) + ' % medidas', 'Cuánto cuenta la silueta de las velas frente a las medidas.');
    slider('Variación de velas permitida', 'lenTol', 0, 1, 0.05, (v) => '±' + Math.round(v * 100) + ' %', 'Cuántas velas más o menos puede tener la coincidencia respecto a la estructura guardada.');
    const mir = el('label', 'fr-chk'); const mc = el('input'); mc.type = 'checkbox'; mc.checked = s.mirror;
    mc.onchange = () => { s.mirror = mc.checked; save(); };
    mir.append(mc, ' También buscar la versión invertida (espejo: lo alcista ↔ bajista)'); p.appendChild(mir);
    const dw = el('div', 'fr-sl'); const dl = el('label', '', 'Velas hacia atrás por temporalidad: ');
    const ds = el('select');
    [3000, 5000, 10000, 20000, 40000].forEach((n) => { const o = el('option', '', n.toLocaleString('es')); o.value = n; if (s.depth === n) o.selected = true; ds.appendChild(o); });
    if (![3000, 5000, 10000, 20000, 40000].includes(s.depth)) { const o = el('option', '', String(s.depth)); o.value = s.depth; o.selected = true; ds.appendChild(o); }
    ds.onchange = () => { s.depth = Number(ds.value); save(); };
    dl.appendChild(ds); dw.appendChild(dl); p.appendChild(dw);
    p.appendChild(el('div', 'hint small', 'Más velas = más historial, pero tarda más la primera vez (se guarda en tu equipo).'));

    p.appendChild(el('div', 'hint small', 'Temporalidades donde buscar (de 3 min a 1 mes):'));
    const chips = el('div', 'fr-chips');
    tfChoices().forEach((tf) => {
      const on = s.tfs.includes(tf.id);
      const b = el('button', 'fr-chip' + (on ? ' on' : ''), tf.label);
      b.onclick = () => { s.tfs = on ? s.tfs.filter((x) => x !== tf.id) : s.tfs.concat([tf.id]); save(); render(); };
      chips.appendChild(b);
    });
    p.appendChild(chips);
    const bs = el('button', 'btn primary', busy ? 'Detener' : 'Buscar parecidas');
    bs.onclick = () => { if (busy) { busy.cancel = true; } else runSearch(); };
    p.appendChild(bs);
    p.appendChild(el('div', 'fr-prog hint', ''));

    // resultados
    if (results && results.patId === (pat && pat.id)) {
      p.appendChild(el('div', 'fr-h', 'Coincidencias' + (results.items.length ? ' (' + results.items.length + ')' : '')));
      results.info.forEach((t) => p.appendChild(el('div', 'hint small' + (/ERROR/.test(t) ? ' err' : ''), t)));
      if (!results.running && !results.items.length) p.appendChild(el('div', 'hint', results.cancelled ? 'Búsqueda detenida.' : 'No se encontró nada con ese parecido. Prueba bajar el parecido mínimo, activar el espejo o permitir más variación de velas.'));
      results.items.slice(0, 300).forEach((it) => {
        const row = el('div', 'fr-res');
        const sc = el('b', 'fr-score', Math.round(it.score) + ' %');
        sc.style.color = it.score >= 90 ? '#26a69a' : it.score >= 75 ? '#ff9800' : '#787b86';
        row.appendChild(sc);
        const info = el('div', 'fr-rinfo');
        info.appendChild(el('div', '', `${it.tf} · ${it.n} velas${it.mirrored ? ' · espejo' : ''}`));
        info.appendChild(el('div', 'hint small', fmtDate(it.t0) + ' · forma ' + it.shape + ' %'));
        row.appendChild(info);
        const mk = el('button', 'btn-x', '▭'); mk.title = 'Ir y marcar con un rectángulo en el gráfico';
        mk.onclick = (e) => { e.stopPropagation(); goTo(it, true); };
        row.appendChild(mk);
        row.title = 'Clic: ir a esta zona del gráfico';
        row.onclick = () => goTo(it, false);
        p.appendChild(row);
      });
    }
    p.appendChild(el('div', 'hint small', 'Fractal compara la forma y las medidas de las velas; no predice. Los resultados dependen de los datos descargados de Binance.'));
  }

  function open() {
    X.$('panel').classList.add('hidden'); X.$('btnIndicators').classList.remove('active');
    X.$('objPanel').classList.add('hidden');
    if (window.TVWatch) window.TVWatch.close();
    if (window.TVDrawUI) window.TVDrawUI.refresh();
    $p().classList.remove('hidden');
    X.$('btnFractal').classList.add('active');
    render();
  }
  function close() {
    if (!X) return;
    $p().classList.add('hidden');
    X.$('btnFractal').classList.remove('active');
  }
  function toggle() { isOpen() ? close() : open(); }
  function init(ctx) {
    X = ctx;
    if (!X.A.cfg.fractal) X.A.cfg.fractal = clean(null);
  }
  function refresh() { if (X && isOpen()) render(); }

  root.TVFractalUI = { init, clean, toggle, open, close, refresh };
})(window);
