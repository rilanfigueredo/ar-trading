// Fechas en el futuro (v0.22): el eje de abajo sigue mostrando fechas aunque no haya velas más allá de la última.
// El gráfico solo rotula el tiempo donde hay velas; esta primitiva agrega las etiquetas (y la hora de la cruz) a la derecha de la última vela,
// calculando cada fecha como "hora de la última vela + número de velas × duración de la temporalidad".
// La parte de calcular las marcas es lógica pura (`ticks`) y se prueba en Node (test/futureaxis.test.js).
(function (root) {
  'use strict';
  const MIN = 60, HOUR = 3600, DAY = 86400;
  // Pasos posibles del eje, de menor a mayor.
  const STEPS = [
    { k: 's', n: MIN }, { k: 's', n: 5 * MIN }, { k: 's', n: 15 * MIN }, { k: 's', n: 30 * MIN }, { k: 's', n: HOUR }, { k: 's', n: 3 * HOUR },
    { k: 's', n: 6 * HOUR }, { k: 's', n: 12 * HOUR }, { k: 'd', n: 1 }, { k: 'w', n: 1 }, { k: 'M', n: 1 }, { k: 'M', n: 3 }, { k: 'M', n: 6 },
    { k: 'y', n: 1 }, { k: 'y', n: 2 }, { k: 'y', n: 5 }, { k: 'y', n: 10 },
  ];
  const approx = (st) => (st.k === 's' ? st.n : st.k === 'd' ? DAY : st.k === 'w' ? 7 * DAY : st.k === 'M' ? st.n * 30.44 * DAY : st.n * 365.25 * DAY);

  // Fecha ↔ segundos en la zona elegida (utc = true: UTC; si no, la hora local del equipo).
  const parts = (t, utc) => { const d = new Date(t * 1000); return utc ? { Y: d.getUTCFullYear(), M: d.getUTCMonth(), D: d.getUTCDate(), h: d.getUTCHours(), m: d.getUTCMinutes(), wd: d.getUTCDay() } : { Y: d.getFullYear(), M: d.getMonth(), D: d.getDate(), h: d.getHours(), m: d.getMinutes(), wd: d.getDay() }; };
  const make = (utc, Y, M, D, h, m) => (utc ? Date.UTC(Y, M, D, h || 0, m || 0) / 1000 : new Date(Y, M, D, h || 0, m || 0).getTime() / 1000);

  // Marcas del eje entre t0 y t1 (segundos). pxPerSec decide el paso (≈ minPx entre marcas).
  // Devuelve [{ t, type }] con type como el de lightweight-charts: 0 año, 1 mes, 2 día, 3 hora.
  function ticks(t0, t1, pxPerSec, utc, minPx) {
    if (!(pxPerSec > 0) || !(t1 > t0)) return [];
    const want = (minPx || 90) / pxPerSec;
    let st = STEPS[STEPS.length - 1];
    for (const c of STEPS) { if (approx(c) >= want) { st = c; break; } }
    const out = [];
    const typeOf = (t) => { const p = parts(t, utc); return p.M === 0 && p.D === 1 && p.h === 0 && p.m === 0 ? 0 : (p.D === 1 && p.h === 0 && p.m === 0 ? 1 : (p.h === 0 && p.m === 0 ? 2 : 3)); };
    const push = (t) => { if (t >= t0 && t <= t1 && out.length < 400) out.push({ t, type: typeOf(t) }); };
    const p0 = parts(t0, utc);
    if (st.k === 's') {
      let day = make(utc, p0.Y, p0.M, p0.D, 0, 0) - DAY;
      for (let guard = 0; day <= t1 && guard < 4000; guard++) {
        const pd = parts(day + 12 * HOUR, utc);                       // el día calendario real (evita saltos por cambio de hora)
        const start = make(utc, pd.Y, pd.M, pd.D, 0, 0);
        for (let o = 0; o < DAY; o += st.n) push(start + o);
        day = start + DAY;
      }
    } else if (st.k === 'd' || st.k === 'w') {
      let p = { Y: p0.Y, M: p0.M, D: p0.D };
      for (let guard = 0; guard < 4000; guard++) {
        const t = make(utc, p.Y, p.M, p.D, 0, 0);
        if (t > t1) break;
        if (st.k === 'd' || parts(t, utc).wd === 1) push(t);
        const nx = new Date(Date.UTC(p.Y, p.M, p.D + 1));
        p = { Y: nx.getUTCFullYear(), M: nx.getUTCMonth(), D: nx.getUTCDate() };
      }
    } else if (st.k === 'M') {
      let Y = p0.Y, M = p0.M - (p0.M % st.n);
      for (let guard = 0; guard < 2000; guard++) {
        const t = make(utc, Y, M, 1, 0, 0);
        if (t > t1) break;
        push(t);
        M += st.n; while (M > 11) { M -= 12; Y++; }
      }
    } else {
      let Y = p0.Y - (p0.Y % st.n);
      for (let guard = 0; guard < 2000; guard++) {
        const t = make(utc, Y, 0, 1, 0, 0);
        if (t > t1) break;
        push(t);
        Y += st.n;
      }
    }
    return out;
  }

  // Primitiva para la serie principal. env: { bars(), tfSec(), utc(), tickFmt(t, type), timeFmt(t), colors() -> { text, crossBack } }
  function create(env) {
    let chart = null, request = null;
    let views = [], xView = null, xCoord = null;
    function layout() {
      views = []; xView = null;
      if (!chart) return;
      const bars = env.bars(), sec = env.tfSec();
      if (!bars.length || !(sec > 0)) return;
      const ts = chart.timeScale(), lr = ts.getVisibleLogicalRange();
      if (!lr) return;
      const lastIdx = bars.length - 1, lastT = bars[lastIdx].time;
      const xLast = ts.logicalToCoordinate(lastIdx), xNext = ts.logicalToCoordinate(lastIdx + 1);
      if (xLast === null || xNext === null || !(xNext > xLast)) return;
      const pxBar = xNext - xLast, col = env.colors(), utc = env.utc();
      if (lr.to > lastIdx + 0.5) {
        const from = Math.max(lr.from, lastIdx + 1);
        const t0 = lastT + (from - lastIdx) * sec, t1 = lastT + (lr.to - lastIdx) * sec;
        ticks(t0, t1, pxBar / sec, utc, 90).forEach((tk) => {
          const x = xLast + ((tk.t - lastT) / sec) * pxBar;
          if (x < xLast + 45) return;                                  // no se pisa con las etiquetas de las velas reales
          const text = env.tickFmt(tk.t, tk.type);
          views.push({ coordinate: () => x, text: () => text, textColor: () => col.text, backColor: () => 'rgba(0,0,0,0)', tickVisible: () => true });
        });
      }
      // Hora de la cruz cuando está a la derecha de la última vela (allí el gráfico no sabe qué fecha es)
      if (xCoord !== null && xCoord > xLast + pxBar * 0.5) {
        const t = lastT + ((xCoord - xLast) / pxBar) * sec;
        const text = env.timeFmt(Math.round(t));
        const x = xCoord;
        xView = { coordinate: () => x, text: () => text, textColor: () => '#ffffff', backColor: () => col.crossBack, tickVisible: () => true };
      }
    }
    const prim = {
      attached(p) { chart = p.chart; request = p.requestUpdate; },
      detached() { chart = null; request = null; views = []; xView = null; },
      updateAllViews() { try { layout(); } catch (e) { views = []; xView = null; } },
      timeAxisViews() { return xView ? views.concat([xView]) : views; },
      paneViews() { return []; },
      // x de la cruz en píxeles (o null si salió del gráfico)
      setCrosshair(x) { const nx = x === undefined ? null : x; if (nx !== xCoord) { xCoord = nx; if (request) request(); } },
      refresh() { if (request) request(); },
    };
    return prim;
  }

  const api = { create, ticks, STEPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TVFutureAxis = api;
})(typeof self !== 'undefined' ? self : globalThis);
