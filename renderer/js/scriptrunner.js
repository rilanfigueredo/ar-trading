// Ejecuta scripts en un Worker con límite de tiempo (v0.20).
// Un Worker nuevo por ejecución: si se pasa del tiempo se mata y no queda nada colgado.
// Si el Worker no se puede crear, se muestra el error: NO se ejecuta el script en el programa principal.
(function (root) {
  'use strict';
  const TIME_LIMIT_MS = 3000;
  let seq = 0;
  function base() {
    const s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/[^/]*$/, '') : 'js/';
  }
  const BASE = base();
  // req: { code, params, data, meta } -> Promise<{ok, result}|{ok:false, error}>
  function run(req, limitMs) {
    const limit = limitMs || TIME_LIMIT_MS;
    return new Promise((resolve) => {
      let w;
      try { w = new Worker(BASE + 'scriptworker.js'); } catch (e) {
        return resolve({ ok: false, error: { kind: 'worker', line: null, message: 'No se pudo crear el entorno aislado de scripts: ' + (e && e.message ? e.message : e) } });
      }
      const id = ++seq;
      let done = false;
      const finish = (v) => { if (done) return; done = true; clearTimeout(timer); try { w.terminate(); } catch (e) {} resolve(v); };
      const timer = setTimeout(() => finish({ ok: false, error: { kind: 'timeout', line: null, message: `El script tardó más de ${limit / 1000} segundos y se detuvo (¿bucle infinito o cálculo demasiado pesado?).` } }), limit);
      w.onmessage = (ev) => { if (ev.data && ev.data.id === id) finish(ev.data); };
      w.onerror = (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); finish({ ok: false, error: { kind: 'worker', line: null, message: 'El entorno aislado de scripts falló: ' + (ev && ev.message ? ev.message : 'error desconocido') } }); };
      try { w.postMessage(Object.assign({ id }, req)); } catch (e) {
        finish({ ok: false, error: { kind: 'worker', line: null, message: 'No se pudieron enviar las velas al script: ' + e.message } });
      }
    });
  }
  root.TVScriptRunner = { run, TIME_LIMIT_MS };
})(window);
