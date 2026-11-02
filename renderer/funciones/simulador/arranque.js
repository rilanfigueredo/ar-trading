'use strict';
// Carga lo guardado (escenarios y tramos por par) desde el programa y luego arranca la interfaz.
// Si el guardado falla, el simulador funciona igual (solo que no recuerda); se avisa arriba.
(function () {
  let mem = {};
  const guardar = () => { window.Fn.invocar('simulador:guardar', mem).then((r) => { if (!r.ok) aviso('No se pudo guardar: ' + r.error); }); };
  function aviso(t) { const d = document.createElement('div'); d.className = 'aviso'; d.textContent = t; document.body.insertBefore(d, document.body.firstChild); }
  window.SimStore = {
    get: (k, d) => (mem[k] === undefined || mem[k] === null ? d : mem[k]),
    set: (k, v) => { mem[k] = v; guardar(); },
  };
  window.Fn.invocar('simulador:cargar').then((r) => {
    if (r.ok && r.datos && typeof r.datos === 'object') mem = r.datos; else if (!r.ok) aviso('No se pudo leer lo guardado: ' + r.error);
    const s = document.createElement('script'); s.src = 'app.js'; document.body.appendChild(s);
  });
})();
