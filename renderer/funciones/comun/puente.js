// Lado del marco (v0.24): lo que cada función ve como «Fn». No tiene red ni acceso al programa: todo pasa por mensajes
// al programa principal, que solo deja llamar a los canales de ESTA función (prefijo propio) y los reenvía al proceso principal.
(function () {
  'use strict';
  let n = 0; const pend = new Map(); const cbV = []; let visible = true;
  const post = (m) => { try { parent.postMessage(Object.assign({ fn: 1 }, m), '*'); } catch (e) { /* sin padre */ } };
  const q = new URLSearchParams(location.search);
  document.documentElement.dataset.tema = q.get('tema') === 'light' ? 'light' : 'dark';
  const poner = (t) => { const v = t === 'light' ? 'light' : 'dark'; document.documentElement.dataset.tema = v; if (document.body) document.body.dataset.theme = v; };
  const iniciarTema = () => poner(q.get('tema'));
  if (document.body) iniciarTema(); else document.addEventListener('DOMContentLoaded', iniciarTema);
  window.Fn = {
    // Devuelve {ok:true,datos} o {ok:false,error}; nunca lanza.
    invocar(canal, ...args) {
      return new Promise((res) => {
        const id = ++n; pend.set(id, res); post({ tipo: 'llamar', id, canal, args });
        setTimeout(() => { if (pend.has(id)) { pend.delete(id); res({ ok: false, error: 'Sin respuesta del programa (tiempo agotado).' }); } }, 90000);
      });
    },
    copiar: (texto) => new Promise((res) => { const id = ++n; pend.set(id, res); post({ tipo: 'copiar', id, texto: String(texto) }); }),
    alVisible(cb) { cbV.push(cb); },
    get visible() { return visible; },
  };
  window.addEventListener('message', (e) => {
    if (e.source !== parent) return;
    const m = e.data; if (!m || m.fn !== 1) return;
    if (m.tipo === 'respuesta') { const r = pend.get(m.id); if (r) { pend.delete(m.id); r(m.resultado); } }
    else if (m.tipo === 'tema') poner(m.tema);
    else if (m.tipo === 'visible') { visible = !!m.v; cbV.forEach((f) => { try { f(visible); } catch (err) { /* ok */ } }); }
  });
  window.addEventListener('error', (ev) => post({ tipo: 'error', mensaje: String(ev.message || 'error') }));
  window.addEventListener('unhandledrejection', (ev) => post({ tipo: 'error', mensaje: String((ev.reason && ev.reason.message) || ev.reason || 'error') }));
  post({ tipo: 'listo' });
})();
