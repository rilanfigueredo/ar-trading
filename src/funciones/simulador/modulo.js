// Función «Simulador de posiciones» (v0.25). El cálculo vive en la interfaz (renderer/funciones/simulador/calc.js, exits.js, charts.js: puro, sin red);
// este módulo solo guarda lo que el usuario deja (escenarios y tramos de margen por par) en <datos del programa>/funciones/simulador/estado.json.
'use strict';
const fs = require('fs');
const path = require('path');

const CANALES = ['cargar', 'guardar'];
const MAX_BYTES = 2 * 1024 * 1024;

function crear(entorno) {
  const archivo = path.join(entorno.carpeta, 'estado.json');
  return {
    async llamar(nombre, args) {
      if (nombre === 'cargar') {
        if (!fs.existsSync(archivo)) return {};
        try {
          const d = JSON.parse(fs.readFileSync(archivo, 'utf8'));
          if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('formato desconocido');
          return d;
        } catch (e) {
          // Archivo dañado: se aparta (no se borra) y se empieza de cero, avisando.
          try { fs.renameSync(archivo, archivo + '.danado-' + Date.now()); } catch (e2) { /* ok */ }
          throw new Error('Lo guardado del simulador estaba dañado (' + e.message + '). Se guardó una copia aparte y se empieza de cero.');
        }
      }
      if (nombre === 'guardar') {
        const d = args[0];
        if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('Datos no válidos.');
        const txt = JSON.stringify(d);
        if (txt.length > MAX_BYTES) throw new Error('Los datos guardados son demasiado grandes.');
        const tmp = archivo + '.tmp';
        fs.writeFileSync(tmp, txt, 'utf8'); fs.renameSync(tmp, archivo);
        return true;
      }
      throw new Error('Canal desconocido.');
    },
    cerrar() {},
  };
}

module.exports = { id: 'simulador', prefijo: 'simulador', canales: CANALES, crear };
