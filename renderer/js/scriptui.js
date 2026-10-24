// Ventana de scripts propios (v0.20): biblioteca, editor de código y parámetros por gráfico.
(function (root) {
  'use strict';
  let ctx = null;          // { A, $, openModal, closeModal, activeView, saveCfg, markActive }
  let live = null;         // función que repinta la ventana abierta cuando cambia el estado de un script
  let draft = { id: null, name: '', code: '' };
  const LINE_H = 18, PAD = 6;

  const mk = (tag, props, kids) => { const e = Object.assign(document.createElement(tag), props || {}); (kids || []).forEach((k) => e.append(k)); return e; };
  const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const lib = () => { if (!Array.isArray(ctx.A.cfg.scripts)) ctx.A.cfg.scripts = []; return ctx.A.cfg.scripts; };
  const av = () => ctx.activeView();
  const appliedOf = (view) => { if (!Array.isArray(view.cfg.scripts)) view.cfg.scripts = []; return view.cfg.scripts; };
  const refreshAll = () => ctx.A.views.forEach((v) => v.refreshScripts && v.refreshScripts(true));

  function init(c) { ctx = c; }
  function isOpen() { return !ctx.$('modal').classList.contains('hidden') && ctx.$('modalBox').dataset.kind === 'scripts'; }
  function toggle() { if (isOpen()) ctx.closeModal(); else open(); }
  function onStatus(view) { if (live && view === av()) live(); }

  function select(id) {
    const sc = lib().find((q) => q.id === id);
    draft = sc ? { id: sc.id, name: sc.name, code: sc.code } : { id: null, name: '', code: '' };
  }
  function open(scriptId) {
    if (scriptId) select(scriptId);
    else if (!draft.id && !draft.code && lib().length) select(lib()[0].id);
    ctx.openModal(build, { floating: true, onClose: () => { live = null; } });
  }

  function build(box) {
    box.dataset.kind = 'scripts';
    box.classList.add('wide', 'xwide');
    box.appendChild(mk('h3', { textContent: 'Scripts propios (JavaScript)' }));
    const body = mk('div', { className: 'sc-body' });
    const side = mk('div', { className: 'sc-side' });
    const main = mk('div', { className: 'sc-main' });
    body.append(side, main);
    box.appendChild(body);
    const applied = mk('div', { className: 'sc-applied' });
    box.appendChild(applied);

    // ----- Lista -----
    const listEl = mk('div', { className: 'sc-list' });
    const bNew = mk('button', { className: 'btn small', textContent: '+ Nuevo', title: 'Empezar un script en blanco' });
    const exSel = mk('select', { title: 'Copiar un ejemplo al editor' });
    exSel.appendChild(mk('option', { value: '', textContent: 'Ejemplos…' }));
    (root.TVScriptExamples || []).forEach((e, i) => exSel.appendChild(mk('option', { value: String(i), textContent: e.name })));
    side.append(mk('div', { className: 'sc-side-top' }, [bNew]), listEl, exSel);

    // ----- Editor -----
    const nameI = mk('input', { type: 'text', placeholder: 'Nombre del script', className: 'sc-name' });
    const gutter = mk('div', { className: 'sc-gutter' });
    const ta = mk('textarea', { className: 'sc-code', spellcheck: false, wrap: 'off' });
    ta.setAttribute('autocomplete', 'off'); ta.setAttribute('autocapitalize', 'off');
    const bar = mk('div', { className: 'sc-errbar' });
    const wrap = mk('div', { className: 'sc-edwrap' }, [gutter, ta, bar]);
    const status = mk('div', { className: 'sc-status' });
    const bSave = mk('button', { className: 'btn secondary', textContent: 'Guardar', title: 'Guardar en la biblioteca (Ctrl+S)' });
    const bApply = mk('button', { className: 'btn', textContent: 'Guardar y aplicar al gráfico', title: 'Guardar y dibujarlo en el gráfico activo' });
    const bCopy = mk('button', { className: 'btn secondary', textContent: 'Copiar código', title: 'Copiar el código al portapapeles' });
    const bDel = mk('button', { className: 'btn secondary', textContent: 'Borrar', title: 'Borrar este script de la biblioteca' });
    const help = mk('details', { className: 'sc-help' });
    help.innerHTML = HELP;
    main.append(nameI, wrap, status, mk('div', { className: 'sc-btns' }, [bApply, bSave, bCopy, bDel]), help);

    let errLine = null;
    const total = () => ta.value.split('\n').length;
    function paintGutter() {
      const n = total();
      gutter.innerHTML = '';
      for (let i = 1; i <= n; i++) gutter.appendChild(mk('div', { className: 'sc-ln' + (i === errLine ? ' err' : ''), textContent: String(i) }));
      gutter.scrollTop = ta.scrollTop;
      paintBar();
    }
    function paintBar() {
      if (!errLine) { bar.style.display = 'none'; return; }
      bar.style.display = 'block';
      bar.style.top = (PAD + (errLine - 1) * LINE_H - ta.scrollTop) + 'px';
    }
    ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; paintBar(); });
    ta.addEventListener('input', () => { draft.code = ta.value; if (errLine) { errLine = null; } paintGutter(); setDirty(); });
    nameI.addEventListener('input', () => { draft.name = nameI.value; setDirty(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const a = ta.selectionStart, b = ta.selectionEnd;
        ta.value = ta.value.slice(0, a) + '  ' + ta.value.slice(b);
        ta.selectionStart = ta.selectionEnd = a + 2;
        ta.dispatchEvent(new Event('input'));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(false); }
    });
    let dirty = false;
    function setDirty() { dirty = true; renderStatus(); }

    function goToLine(n) {
      const lines = ta.value.split('\n');
      let pos = 0;
      for (let i = 0; i < Math.min(n - 1, lines.length); i++) pos += lines[i].length + 1;
      ta.focus(); ta.setSelectionRange(pos, pos + (lines[n - 1] || '').length);
      ta.scrollTop = Math.max(0, (n - 3) * LINE_H);
    }

    // ----- Estado del script en el gráfico activo -----
    function appliedEntry() { return draft.id ? appliedOf(av()).find((a) => a.scriptId === draft.id) : null; }
    function renderStatus() {
      status.innerHTML = '';
      status.className = 'sc-status';
      const prevErr = errLine;
      errLine = null;
      const a = appliedEntry();
      if (!draft.id) { status.textContent = 'Script nuevo: escribe el código y pulsa «Guardar y aplicar al gráfico».'; }
      else if (!a) { status.textContent = dirty ? 'Hay cambios sin guardar.' : 'Este script no está aplicado en el gráfico activo.'; }
      else {
        const inf = av().scriptInfo ? av().scriptInfo(a.uid) : { status: 'idle' };
        if (dirty) status.textContent = 'Hay cambios sin guardar (el gráfico sigue con la versión guardada).';
        else if (inf.status === 'error') {
          status.classList.add('err');
          errLine = inf.error.line || null;
          const t = mk('span', { textContent: (inf.error.line ? `Línea ${inf.error.line}: ` : '') + inf.error.message });
          status.appendChild(t);
          if (inf.error.line) { const g = mk('button', { className: 'btn small secondary', textContent: 'Ir a la línea', style: 'margin-left:8px' }); g.onclick = () => goToLine(inf.error.line); status.appendChild(g); }
        } else if (inf.status === 'ok') { status.classList.add('ok'); status.textContent = `Funciona en el gráfico activo (${inf.ms === null ? '' : inf.ms + ' ms'}).`; }
        else if (inf.status === 'running') status.textContent = 'Calculando…';
        else if (inf.status === 'hidden') status.textContent = 'Aplicado pero oculto en este gráfico.';
        else status.textContent = 'Esperando datos del gráfico…';
      }
      if (errLine !== prevErr) paintGutter();
    }

    // ----- Guardar / borrar -----
    function save(apply) {
      const name = (nameI.value || '').trim() || 'Script sin nombre';
      if (!ta.value.trim()) { status.className = 'sc-status err'; status.textContent = 'El script está vacío.'; return; }
      let sc = draft.id ? lib().find((q) => q.id === draft.id) : null;
      if (!sc) { sc = { id: newId('s'), name, code: ta.value }; lib().push(sc); draft.id = sc.id; }
      sc.name = name; sc.code = ta.value; draft.name = name;
      nameI.value = name;
      dirty = false;
      if (apply) {
        const v = av();
        if (!appliedOf(v).some((a) => a.scriptId === sc.id)) appliedOf(v).push({ uid: newId('a'), scriptId: sc.id, params: {}, hide: false });
      }
      ctx.saveCfg();
      refreshAll();
      renderAll();
    }
    bSave.onclick = () => save(false);
    bApply.onclick = () => save(true);
    bCopy.onclick = () => {
      const done = () => { bCopy.textContent = 'Copiado ✓'; setTimeout(() => { bCopy.textContent = 'Copiar código'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); document.execCommand('copy'); done(); });
      else { ta.select(); document.execCommand('copy'); done(); }
    };
    bDel.onclick = () => {
      if (!draft.id) { draft = { id: null, name: '', code: '' }; dirty = false; return renderAll(); }
      if (bDel.dataset.sure !== '1') { bDel.dataset.sure = '1'; bDel.textContent = '¿Seguro? Clic otra vez'; setTimeout(() => { bDel.dataset.sure = ''; bDel.textContent = 'Borrar'; }, 3000); return; }
      const id = draft.id;
      ctx.A.cfg.scripts = lib().filter((q) => q.id !== id);
      ctx.A.views.forEach((v) => { v.cfg.scripts = appliedOf(v).filter((a) => a.scriptId !== id); });
      ctx.saveCfg();
      refreshAll();
      draft = { id: null, name: '', code: '' }; dirty = false;
      if (lib().length) select(lib()[0].id);
      renderAll();
    };
    bNew.onclick = () => { draft = { id: null, name: '', code: '' }; dirty = false; renderAll(); nameI.focus(); };
    exSel.onchange = () => {
      const e = (root.TVScriptExamples || [])[Number(exSel.value)];
      exSel.value = '';
      if (!e) return;
      draft = { id: null, name: e.name.replace(/ \(ejemplo.*\)$/, ''), code: e.code }; dirty = true;
      renderAll();
    };

    // ----- Aplicados en este gráfico (parámetros y colores) -----
    function renderApplied() {
      applied.innerHTML = '';
      const v = av();
      applied.appendChild(mk('h4', { textContent: `Aplicados en el gráfico ${ctx.A.cfg.active + 1}` }));
      const list = appliedOf(v);
      if (!list.length) { applied.appendChild(mk('div', { className: 'hint', textContent: 'Ninguno todavía. Elige un script y pulsa «Guardar y aplicar al gráfico».' })); return; }
      list.forEach((a) => {
        const sc = lib().find((q) => q.id === a.scriptId);
        const inf = v.scriptInfo ? v.scriptInfo(a.uid) : { inputs: [], status: 'idle' };
        const row = mk('div', { className: 'sc-arow' });
        const head = mk('div', { className: 'sc-ahead' });
        head.appendChild(mk('b', { textContent: sc ? sc.name : 'Script borrado' }));
        if (inf.isStrategy) head.appendChild(mk('span', { className: 'sc-badge', textContent: 'estrategia' }));
        if (inf.status === 'error') head.appendChild(mk('span', { className: 'sc-badge err', textContent: 'con error' }));
        const eye = mk('button', { className: 'btn small secondary', textContent: a.hide ? 'Mostrar' : 'Ocultar' });
        eye.onclick = () => { a.hide = !a.hide; ctx.saveCfg(); v.refreshScripts(true); renderAll(); };
        const edit = mk('button', { className: 'btn small secondary', textContent: 'Editar' });
        edit.onclick = () => { if (sc) { select(sc.id); dirty = false; renderAll(); } };
        const rm = mk('button', { className: 'btn small secondary', textContent: 'Quitar' });
        rm.onclick = () => { v.cfg.scripts = appliedOf(v).filter((q) => q.uid !== a.uid); ctx.saveCfg(); v.refreshScripts(); renderAll(); };
        if (inf.isStrategy && window.TVBt) {
          const rep = mk('button', { className: 'btn small secondary', textContent: 'Ver informe', title: 'Mostrar el informe y las operaciones en el panel de abajo' });
          rep.onclick = () => window.TVBt.show(a.uid);
          head.appendChild(rep);
        }
        head.append(eye, edit, rm);
        row.appendChild(head);
        if (inf.status === 'error') row.appendChild(mk('div', { className: 'sc-aerr', textContent: (inf.error.line ? `Línea ${inf.error.line}: ` : '') + inf.error.message }));
        (inf.inputs || []).forEach((p) => {
          const f = mk('label', { className: 'sc-param' });
          f.appendChild(mk('span', { textContent: p.label }));
          let ctl;
          const setVal = (val) => { a.params = a.params || {}; a.params[p.label] = val; ctx.saveCfg(); v.refreshScripts(); };
          if (p.type === 'number') {
            ctl = mk('input', { type: 'number', value: String(p.value), step: String(p.step || 'any') });
            if (p.min !== undefined) ctl.min = String(p.min);
            if (p.max !== undefined) ctl.max = String(p.max);
            ctl.style.width = '90px';
            ctl.onchange = () => { const n = Number(ctl.value); if (isFinite(n) && ctl.value !== '') setVal(n); else ctl.value = String(p.value); };
          } else if (p.type === 'boolean') {
            ctl = mk('input', { type: 'checkbox', checked: !!p.value });
            ctl.onchange = () => setVal(ctl.checked);
          } else if (p.type === 'color') {
            ctl = mk('input', { type: 'color', value: p.value });
            ctl.onchange = () => setVal(ctl.value);
          } else if (p.options) {
            ctl = mk('select');
            p.options.forEach((o) => ctl.appendChild(mk('option', { value: o, textContent: o })));
            ctl.value = p.value;
            ctl.onchange = () => setVal(ctl.value);
          } else {
            ctl = mk('input', { type: 'text', value: String(p.value) });
            ctl.onchange = () => setVal(ctl.value);
          }
          f.appendChild(ctl);
          row.appendChild(f);
        });
        if ((inf.inputs || []).length) {
          const rs = mk('button', { className: 'btn small secondary', textContent: 'Valores por defecto' });
          rs.onclick = () => { a.params = {}; ctx.saveCfg(); v.refreshScripts(true); };
          row.appendChild(rs);
        }
        applied.appendChild(row);
      });
      if (ctx.decorate) ctx.decorate(applied);
    }

    function renderList() {
      listEl.innerHTML = '';
      if (!lib().length) listEl.appendChild(mk('div', { className: 'hint', textContent: 'Sin scripts guardados. Prueba un ejemplo.' }));
      lib().forEach((sc) => {
        const on = appliedOf(av()).some((a) => a.scriptId === sc.id);
        const it = mk('div', { className: 'sc-item' + (sc.id === draft.id ? ' sel' : ''), textContent: (on ? '● ' : '') + sc.name, title: on ? 'Aplicado en el gráfico activo' : '' });
        it.onclick = () => { if (dirty && !confirmLose()) return; select(sc.id); dirty = false; renderAll(); };
        listEl.appendChild(it);
      });
    }
    function confirmLose() { return window.confirm('Hay cambios sin guardar en el editor. ¿Descartarlos?'); }

    function renderAll() {
      nameI.value = draft.name || '';
      if (ta.value !== (draft.code || '')) ta.value = draft.code || '';
      renderList(); renderApplied(); renderStatus(); paintGutter();
    }
    live = () => { if (!applied.contains(document.activeElement)) renderApplied(); renderList(); renderStatus(); };
    renderAll();
  }

  const HELP = `<summary>Ayuda rápida: qué puede usar el script</summary>
<div class="sc-helptxt">
<p><b>Datos</b> (una lista con un número por vela): <code>open high low close volume</code>, <code>time</code> (segundos), y si el gráfico lo tiene <code>buy</code> (volumen de compra), <code>sell</code> y <code>delta</code>. <code>hasBuy</code> dice si existe. También <code>n</code>, <code>symbol</code>, <code>timeframe</code>.</p>
<p><b>Funciones</b>: <code>ta.sma(close, 20)</code>, <code>ta.ema</code>, <code>ta.rma</code>, <code>ta.wma</code>, <code>ta.rsi</code>, <code>ta.macd(close,12,26,9)</code> → <code>{macd, signal, hist}</code>, <code>ta.stoch(14,1,3)</code> → <code>{k, d}</code>, <code>ta.bb(close,20,2)</code> → <code>{mid, upper, lower}</code>, <code>ta.atr(14)</code>, <code>ta.obv()</code>, <code>ta.stdev</code>, <code>ta.highest</code>, <code>ta.lowest</code>, <code>ta.sum</code>, <code>ta.change</code>, <code>ta.cum</code>, <code>ta.crossover(a,b)</code>, <code>ta.crossunder(a,b)</code>.</p>
<p><b>Dibujar</b>: <code>indicator({ name, overlay: true|false })</code> (true = sobre el precio, false = panel aparte) · <code>plot(lista, { color, width, style, title })</code> · <code>histogram(lista, { colorUp, colorDown })</code> · <code>hline(precio, { color, style, title })</code> (nivel). Un hueco se escribe <code>NaN</code> y no se dibuja.</p>
<p><b>Parámetros editables</b>: <code>input('Largo', 14)</code> (número, true/false o texto con <code>{ options: [...] }</code>) · <code>inputColor('Color', '#2962ff')</code>. Se cambian en «Aplicados en este gráfico» y se guardan por gráfico.</p>
<p><b>Estrategias (backtest)</b>: en vez de <code>indicator</code> se declara <code>strategy({ name, overlay, capital, sizeType, size, commission, makerCommission, slippage })</code> y las reglas van dentro de <code>onBar(function (i, pos) { ... })</code>, que se llama una vez por vela, en orden, con <code>i</code> = número de la vela y <code>pos</code> = posición actual (<code>pos.side</code> es <code>'long'</code>, <code>'short'</code> o <code>null</code>; también <code>entryPrice, sl, tp, bars, pnl, equity</code>). Primero se calculan las listas con <code>ta.*</code> (fuera de <code>onBar</code>) y dentro se lee la vela <code>i</code>, por ejemplo <code>rsi[i]</code>.</p>
<p><code>entry('long')</code> / <code>entry('short')</code> (opciones: <code>sl</code> y <code>tp</code> en precio, o <code>slPct</code> y <code>tpPct</code> en %, y <code>size</code> en la unidad del tipo de tamaño) · <code>exit()</code> cierra la posición · <code>exit({ sl: precio })</code> mueve el stop o el objetivo de la posición abierta. Las órdenes se ejecutan en la <b>apertura de la vela siguiente</b> (nunca con datos del futuro: si la estrategia mira velas que aún no existían, el programa lo detecta y da error). Con stop y objetivo en la misma vela se asume el stop. Capital, tipo de tamaño (<code>'percent'</code> % del capital, <code>'amount'</code> monto fijo o <code>'contracts'</code> contratos), tamaño, comisiones (por defecto las de Binance Futuros USDT: taker 0,05 % en órdenes de mercado y maker 0,02 % en el objetivo; verifícalas en tu cuenta) y deslizamiento (0,01 %) se cambian en «Aplicados en este gráfico». Los resultados salen en el panel de abajo y el capital en un panel propio.</p>
<p>Límite: 3 segundos por cálculo. Los scripts no tienen acceso a internet ni al resto del programa.</p>
</div>`;

  root.TVScriptUI = { init, open, toggle, isOpen, onStatus, lib: () => lib() };
})(window);
