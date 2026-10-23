// Pruebas del motor de scripts (v0.20)
const assert = require('assert');
const L = require('../renderer/js/lib.js');
const S = require('../renderer/js/scriptcore.js');
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

const N = 120;
const data = { time: [], open: [], high: [], low: [], close: [], volume: [], buy: [] };
for (let i = 0; i < N; i++) {
  const c = 100 + Math.sin(i / 7) * 8 + i * 0.1, o = i ? data.close[i - 1] : c;
  data.time.push(1700000000 + i * 60); data.open.push(o); data.close.push(c);
  data.high.push(Math.max(o, c) + 1); data.low.push(Math.min(o, c) - 1);
  data.volume.push(10 + (i % 7)); data.buy.push(5 + (i % 5));
}
const noBuy = Object.assign({}, data, { buy: null });
const go = (code, d = data, params) => S.run({ code, params, data: d, meta: { name: 'T' } });
const fails = (code, d, re) => { try { go(code, d); } catch (e) { const x = S.explainError(e, code); if (re) assert.ok(re.test(x.message), x.message); return x; } assert.fail('debía fallar: ' + code); };

// Coinciden con lib.js en datos limpios
{
  const r = go('plot(ta.sma(close,20)); plot(ta.ema(close,12)); plot(ta.rsi(close,14));');
  const sm = L.sma(data.close, 20), em = L.ema(data.close, 12), rs = L.rsi(data.close, 14);
  for (let i = 0; i < N; i++) {
    [[0, sm], [1, em], [2, rs]].forEach(([k, ref]) => {
      const v = r.plots[k].values[i];
      if (ref[i] === null) assert.ok(Number.isNaN(v), `hueco ${k} ${i}`); else close(v, ref[i], 1e-7);
    });
  }
}
// Entradas con huecos al inicio no revientan
{
  const gap = data.close.map((v, i) => (i < 10 ? NaN : v));
  const m = S.ta.sma(gap, 5), e = S.ta.ema(gap, 5), r = S.ta.rsi(gap, 5);
  assert.ok(Number.isNaN(m[13]) && !Number.isNaN(m[14]));
  assert.ok(Number.isNaN(e[13]) && !Number.isNaN(e[14]));
  assert.ok(!Number.isNaN(r[16]));
}
// Parámetros, colores y niveles
{
  const code = `indicator({name:'X', overlay:true}); const l=input('Largo',20,{min:2,max:200}); const c=inputColor('Color','#ff0000'); plot(ta.sma(close,l),{color:c,title:'M'}); hline(100,{color:'#00ff00'});`;
  const a = go(code); assert.strictEqual(a.inputs[0].value, 20); assert.strictEqual(a.plots[0].color, '#ff0000'); assert.strictEqual(a.levels.length, 1); assert.strictEqual(a.name, 'X');
  const b = go(code, data, { Largo: 5, Color: '#00ff00' }); assert.strictEqual(b.inputs[0].value, 5); assert.strictEqual(b.plots[0].color, '#00ff00');
  const c = go(code, data, { Largo: 9999 }); assert.strictEqual(c.inputs[0].value, 200);
}
// Volumen de compra
{
  const r = go('plot(buy); plot(delta); histogram(delta);'); assert.strictEqual(r.plots[0].values[3], data.buy[3]); close(r.plots[1].values[3], 2 * data.buy[3] - data.volume[3]);
  assert.strictEqual(go('plot(volume); plot(hasBuy?1:0)', noBuy).plots[1].values[0], 0);
  const x = fails('plot(buy)', noBuy, /volumen de compra/); assert.strictEqual(x.line, 1);
}
// Errores con línea y mensaje claros
{
  let x = fails('const a = 1;\nplot(foo);', data, /«foo» no existe/); assert.strictEqual(x.line, 2);
  x = fails('const a = 1;\nconst b = ;\nplot(close)', data); assert.strictEqual(x.kind, 'syntax'); assert.strictEqual(x.line, 2);
  x = fails('plot(close);\nplot(ta.sma(close, 0));', data, /ta\.sma/); assert.strictEqual(x.line, 2);
  x = fails('\n\nplot(close.map(v=>"a"));', data, /no es un número/); assert.strictEqual(x.line, 3);
  x = fails('const x = 1;', data, /no dibuja nada/);
  x = fails('plot(close, {color:"rojo"})', data, /no es válido/);
  x = fails('plot([1,2,3])', data, /tiene 3 valores/);
  x = fails('plot(close); fetch("http://x")', data); assert.ok(/fetch|función/.test(x.message));
  x = fails('indicator({overlay:true}); histogram(close)', data, /panel aparte/);
  x = fails('', data, /vacío/);
}
// Nunca resultado falso: infinito -> NaN (hueco), no número
{ const r = go('plot(close.map(v=>1/0))'); assert.ok(Number.isNaN(r.plots[0].values[0])); }
// Otras funciones
{
  const r = go('const m=ta.macd(close,12,26,9); plot(m.macd); histogram(m.hist); const s=ta.stoch(14,1,3); plot(s.k); plot(s.d); const b=ta.bb(close,20,2); plot(b.upper); plot(ta.atr(14)); plot(ta.obv());');
  assert.strictEqual(r.plots.length, 7);
  const st = L.stoch ? L.stoch(data.high, data.low, data.close, 14, 1, 3) : null;
  if (st && st.k) for (let i = 20; i < N; i++) close(r.plots[2].values[i], st.k[i], 1e-6);
}
console.log('script.test.js OK');
