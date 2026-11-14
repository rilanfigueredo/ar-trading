'use strict';
const assert = require('assert');
const P = require('../renderer/js/profile.js');

// zoom: se ajusta a pasos de 10 entre 70 y 200
assert.strictEqual(P.clampZoom(100), 100);
assert.strictEqual(P.clampZoom(104), 100);
assert.strictEqual(P.clampZoom(115), 120);
assert.strictEqual(P.clampZoom(10), 70);
assert.strictEqual(P.clampZoom(999), 200);
assert.strictEqual(P.clampZoom('x'), 100);

// ajustes de interfaz: una configuración vieja (sin ui) queda con valores por defecto
assert.deepStrictEqual(P.cleanUi(undefined), { zoom: 100, drawPanel: true });
assert.deepStrictEqual(P.cleanUi({ zoom: 130, drawPanel: false }), { zoom: 130, drawPanel: false });
assert.deepStrictEqual(P.cleanUi({ zoom: 'mal', drawPanel: 0 }), { zoom: 100, drawPanel: true });

// perfil
const img = 'data:image/png;base64,AAAA';
assert.deepStrictEqual(P.cleanProfile(null), { name: '', img: '', avatar: '', crop: { x: 0, y: 0, z: 1 } });
const p = P.cleanProfile({ name: '  Rilan\n  ', img, avatar: img, crop: { x: 9, y: -9, z: 99 } });
assert.strictEqual(p.name, 'Rilan');
assert.strictEqual(p.crop.z, P.CROP_ZMAX);
assert.strictEqual(p.crop.x, 4);
assert.strictEqual(P.cleanProfile({ name: 'x'.repeat(80) }).name.length, P.NAME_MAX);
// imágenes no válidas se descartan (no se acepta cualquier texto ni URLs externas)
assert.strictEqual(P.cleanProfile({ img: 'http://malo.com/a.png' }).img, '');
assert.strictEqual(P.cleanProfile({ img: 'data:text/html;base64,AAAA' }).img, '');
// sin imagen original no hay avatar recortado
assert.strictEqual(P.cleanProfile({ avatar: img }).avatar, '');

// recorte: con z = 1 una imagen horizontal cubre justo el visor y se puede mover solo a los lados
let g = P.cropGeometry(200, 100, { x: 0, y: 0, z: 1 }, 100);
assert.ok(Math.abs(g.dh - 100) < 1e-9 && Math.abs(g.dw - 200) < 1e-9);
assert.ok(Math.abs(g.dx - -50) < 1e-9 && Math.abs(g.dy) < 1e-9);
g = P.cropGeometry(200, 100, { x: 5, y: 5, z: 1 }, 100);   // movido de más: se limita y no deja huecos
assert.ok(g.dx <= 1e-9 && g.dx + g.dw >= 100 - 1e-9 && Math.abs(g.dy) < 1e-9);
// agrandada: siempre cubre todo
g = P.cropGeometry(100, 100, { x: -9, y: 9, z: 3 }, 100);
assert.ok(g.dx <= 1e-9 && g.dx + g.dw >= 100 - 1e-9 && g.dy <= 1e-9 && g.dy + g.dh >= 100 - 1e-9);
console.log('profile.test.js OK');
