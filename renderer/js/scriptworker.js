// Worker de scripts (v0.20): ejecuta el script del usuario lejos del programa principal.
// Si el script se cuelga, el programa lo corta desde fuera (terminate) y el gráfico sigue vivo.
importScripts('scriptcore.js');
self.onmessage = (ev) => {
  const req = ev.data;
  try {
    const r = self.TVScriptCore.run(req);
    const tr = [];
    r.plots.forEach((p) => { p.values = Array.from(p.values); });
    self.postMessage({ id: req.id, ok: true, result: r }, tr);
  } catch (e) {
    let info;
    try { info = self.TVScriptCore.explainError(e, req.code); } catch (e2) { info = { kind: 'runtime', line: null, message: String((e && e.message) || e) }; }
    self.postMessage({ id: req.id, ok: false, error: info });
  }
};
