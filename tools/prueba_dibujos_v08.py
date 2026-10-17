"""Pruebas de la v0.8: rectángulo con 8 tiradores, línea central, texto en líneas, Shift horizontal, imán, selección múltiple,
carpetas, plantillas, ventana de propiedades, barra de favoritos movible y barra derecha.
Uso:  TV_MOCK=1 PORT=3111 node server.js  (aparte)  y luego:  python3 tools/prueba_dibujos_v08.py [carpeta]
"""
import json, sys, os
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/capturas_v08'
os.makedirs(OUT, exist_ok=True)
URL = 'http://localhost:3111/'
errors, fails = [], []

def check(name, cond, extra=''):
    print(('OK   ' if cond else 'FALLA'), name, extra)
    if not cond:
        fails.append(name)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 1600, 'height': 950}, bypass_csp=True)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    ev = page.evaluate
    ready = lambda: page.wait_for_function('window.__tv && window.__tv.views.length >= 1 && window.__tv.views.every(v => v.bars.length > 100)', timeout=40000)

    # ---- 0) migración desde v0.7 (versión 5): rayo, imán sí/no, favoritos
    page.goto(URL); ready()
    cfg = ev('JSON.parse(JSON.stringify(window.__tv.cfg))')
    sym = cfg['charts'][0]['symbol']
    bars = ev('window.__tv.views[0].bars.slice(-80).map(b => b.time)')
    old = dict(cfg); old['version'] = 5; old.pop('folders', None)
    old['draw'] = {'favs': ['ray', 'trend'], 'magnet': True, 'keep': False, 'favBar': True, 'hideAll': False, 'styles': {'ray': {'color': '#00ff00'}}}
    old['drawings'] = {sym: [{'id': 'r1', 'type': 'ray', 'pts': [{'t': bars[10], 'p': 100}, {'t': bars[30], 'p': 120}], 'color': '#ff0000', 'width': 1, 'dash': 'solid'}]}
    page.request.post(URL + 'api/config', data=json.dumps(old))
    page.reload(); ready()
    n = ev('JSON.parse(JSON.stringify(window.__tv.cfg))')
    check('v0.7 migra a versión 6', n['version'] == 6)
    check('el rayo antiguo pasa a rayo horizontal con un punto', n['drawings'][sym][0]['type'] == 'hray' and len(n['drawings'][sym][0]['pts']) == 1)
    check('imán sí → débil; favoritos y estilos migran', n['draw']['magnet'] == 'weak' and n['draw']['favs'] == ['hray', 'trend'] and 'hray' in n['draw']['styles'] and 'ray' not in n['draw']['styles'])
    check('hay preferencias nuevas (plantillas, posición de favoritos, carpetas)', n['draw']['templates'] == {} and n['draw']['favPos']['edge'] == 'left' and n['folders'] == {})
    # limpiar para el resto
    clean = dict(n); clean['drawings'] = {}; clean['draw']['magnet'] = 'off'; clean['draw']['favs'] = ['trend', 'hline', 'fib', 'rect']
    page.request.post(URL + 'api/config', data=json.dumps(clean))
    page.reload(); ready()

    drawings = lambda: ev(f"JSON.parse(JSON.stringify(window.__tv.cfg.drawings['{sym}'] || []))")
    folders = lambda: ev(f"JSON.parse(JSON.stringify(window.__tv.cfg.folders['{sym}'] || []))")
    box = page.locator('#grid .cell .chart').first.bounding_box()
    bx, by, bw, bh = box['x'], box['y'], box['width'], box['height']
    P = lambda fx, fy: (bx + bw * fx, by + bh * fy)
    def click(fx, fy, **kw):
        x, y = P(fx, fy); page.mouse.move(x, y); page.mouse.down(); page.mouse.up(); page.wait_for_timeout(60)
    def drag(f1, f2, steps=8):
        x1, y1 = P(*f1); x2, y2 = P(*f2)
        page.mouse.move(x1, y1); page.mouse.down(); page.mouse.move(x2, y2, steps=steps); page.mouse.up(); page.wait_for_timeout(80)
    def pick(cat, label):
        page.click(f'#drawBar [data-k="cat:{cat}"]'); page.wait_for_timeout(80)
        page.click(f'.db-fly .db-row:has-text("{label}")'); page.wait_for_timeout(80)
    def to_page(pt):   # dato {t,p} -> píxeles de la página
        return ev('''(pt) => { const v = window.__tv.views[0], s = v.state; const pane = s.series.getPane().getHTMLElement().getBoundingClientRect();
          const c = document.querySelector('#grid .cell .chart').getBoundingClientRect(); let i = s.bars.findIndex(b => b.time >= pt.t); if (i < 0) i = s.bars.length - 1;
          return [c.left + v.chart.timeScale().logicalToCoordinate(i), pane.top + s.series.priceToCoordinate(pt.p)]; }''', pt)

    # ---- 1) rectángulo con 8 tiradores
    pick('shapes', 'Rectángulo'); drag((0.30, 0.30), (0.50, 0.50))
    r = drawings()[0]
    check('rectángulo creado', r['type'] == 'rect' and len(r['pts']) == 2)
    page.mouse.move(*P(0.40, 0.30)); page.mouse.move(*P(0.40, 0.30)); page.wait_for_timeout(50)
    # tiradores: esquinas + lados; se arrastra el lado derecho (medio derecha)
    pts0 = r['pts']
    a = to_page(pts0[0]); b = to_page(pts0[1])
    right_mid = ((max(a[0], b[0])), (a[1] + b[1]) / 2)
    page.mouse.move(*right_mid); page.mouse.down(); page.mouse.move(right_mid[0] + 120, right_mid[1] + 40, steps=6); page.mouse.up(); page.wait_for_timeout(100)
    r1 = drawings()[0]['pts']
    lt0, rt0 = min(p['t'] for p in pts0), max(p['t'] for p in pts0)
    lt1, rt1 = min(p['t'] for p in r1), max(p['t'] for p in r1)
    pr0 = sorted(p['p'] for p in pts0); pr1 = sorted(p['p'] for p in r1)
    check('lado derecho: crece a la derecha y no toca los otros lados', rt1 > rt0 and lt1 == lt0 and pr0 == pr1, f'{rt0}->{rt1}')
    # esquina inferior derecha
    a = to_page(r1[0]); b = to_page(r1[1])
    corner = (max(a[0], b[0]), max(a[1], b[1]))
    page.mouse.move(*corner); page.mouse.down(); page.mouse.move(corner[0] + 30, corner[1] + 60, steps=6); page.mouse.up(); page.wait_for_timeout(100)
    r2 = drawings()[0]['pts']
    check('esquina: cambia ancho y alto', max(p['p'] for p in r2) == max(p['p'] for p in r1) and min(p['p'] for p in r2) < min(p['p'] for p in r1) and max(p['t'] for p in r2) > rt1)
    page.screenshot(path=f'{OUT}/01_rect_tiradores.png')

    # ---- 2) propiedades del rectángulo: línea central, ampliar; clic fuera acepta; Cancelar y Esc revierten
    rid = drawings()[0]['id']
    page.locator('#selBar .db-btn[title^="Propiedades"]').click(); page.wait_for_timeout(200)
    check('ventana tiene Plantilla, Aceptar y Cancelar', page.locator('.props-actions button').all_inner_texts() == ['Plantilla ▾', 'Aceptar', 'Cancelar'], str(page.locator('.props-actions button').all_inner_texts()))
    page.locator('.field', has_text='Mostrar línea central').locator('input').check()
    page.locator('.field', has_text='Ampliar a la derecha').locator('input').check()
    page.locator('.field', has_text='Ampliar a la izquierda').locator('input').check(); page.wait_for_timeout(100)
    d = drawings()[0]
    check('línea central y ampliar se aplican al momento', d['center'] is True and d['extR'] is True and d['extL'] is True)
    page.screenshot(path=f'{OUT}/02_rect_central.png')
    page.locator('.props-actions button', has_text='Cancelar').click(); page.wait_for_timeout(100)
    d = drawings()[0]
    check('Cancelar descarta los cambios', d['center'] is False and d['extR'] is False and d['extL'] is False)
    check('la ventana se cerró', page.locator('#modal').evaluate("e => e.classList.contains('hidden')"))
    # Aceptar
    page.locator('#selBar .db-btn[title^="Propiedades"]').click(); page.wait_for_timeout(150)
    page.locator('.field', has_text='Mostrar línea central').locator('input').check(); page.wait_for_timeout(60)
    page.locator('.props-actions button', has_text='Aceptar').click(); page.wait_for_timeout(100)
    check('Aceptar conserva los cambios', drawings()[0]['center'] is True)
    # clic en el gráfico acepta
    page.locator('#selBar .db-btn[title^="Propiedades"]').click(); page.wait_for_timeout(150)
    page.locator('.field', has_text='Ampliar a la derecha').locator('input').check(); page.wait_for_timeout(60)
    x, y = P(0.85, 0.85); page.mouse.click(x, y); page.wait_for_timeout(150)
    check('clic fuera (en el gráfico) cierra la ventana aceptando', page.locator('#modal').evaluate("e => e.classList.contains('hidden')") and drawings()[0]['extR'] is True)
    # Esc cancela
    rr = drawings()[0]['pts']; c0 = to_page(rr[0])
    page.mouse.click(*P(0.40, 0.30)); page.wait_for_timeout(60)
    page.evaluate(f"window.__tv.drawStore && 0")
    page.mouse.dblclick(*((c0[0] + to_page(rr[1])[0]) / 2, c0[1])); page.wait_for_timeout(200)
    if page.locator('.props-actions').count():
        page.locator('.field', has_text='Mostrar línea central').locator('input').uncheck(); page.wait_for_timeout(60)
        page.keyboard.press('Escape'); page.wait_for_timeout(100)
        check('Esc cancela los cambios de la ventana', drawings()[0]['center'] is True)
    else:
        check('doble clic abre propiedades del rectángulo', False)
    page.keyboard.press('Escape')

    # ---- 3) línea de tendencia: Shift = horizontal exacta (ignora el imán); texto
    page.click('#drawBar [data-k="magnet"]'); page.get_by_text('Imán fuerte', exact=True).click(); page.wait_for_timeout(60)
    pick('lines', 'Línea de tendencia'); click(0.60, 0.70)
    x, y = P(0.72, 0.62); page.mouse.move(x, y, steps=4)
    page.keyboard.down('Shift'); page.mouse.move(x, y + 5, steps=3); page.mouse.down(); page.mouse.up(); page.keyboard.up('Shift'); page.wait_for_timeout(100)
    tr = [d for d in drawings() if d['type'] == 'trend'][-1]
    check('Shift mantiene la tendencia horizontal exacta (con imán fuerte)', tr['pts'][0]['p'] == tr['pts'][1]['p'] and tr['pts'][0]['t'] != tr['pts'][1]['t'], json.dumps(tr['pts']))
    page.click('#drawBar [data-k="magnet"]'); page.get_by_text('Imán apagado', exact=True).click(); page.wait_for_timeout(60)
    # imán débil lejos de la vela: no pega; imán fuerte: pega
    pos = ev('''(() => { const v = window.__tv.views[0], s = v.state; const i = s.bars.length - 30; const b = s.bars[i];
      const pane = s.series.getPane().getHTMLElement().getBoundingClientRect(); const c = document.querySelector('#grid .cell .chart').getBoundingClientRect();
      let y = s.series.priceToCoordinate(b.high) - 150; if (y < 30) y = s.series.priceToCoordinate(b.low) + 150; return [c.left + v.chart.timeScale().logicalToCoordinate(i), pane.top + y, b.open, b.high, b.low, b.close]; })()''')
    ohlc = pos[2:]
    page.click('#drawBar [data-k="magnet"]'); page.get_by_text('Imán débil', exact=True).click(); page.wait_for_timeout(60)
    page.keyboard.press('Alt+h'); page.mouse.move(pos[0], pos[1]); page.mouse.down(); page.mouse.up(); page.wait_for_timeout(100)
    hl = [d for d in drawings() if d['type'] == 'hline'][-1]['pts'][0]['p']
    check('imán débil: lejos de la vela NO se pega', not any(abs(hl - v) < 1e-9 for v in ohlc))
    page.click('#drawBar [data-k="magnet"]'); page.get_by_text('Imán fuerte', exact=True).click(); page.wait_for_timeout(60)
    page.keyboard.press('Alt+h'); page.mouse.move(pos[0], pos[1]); page.mouse.down(); page.mouse.up(); page.wait_for_timeout(100)
    hl = [d for d in drawings() if d['type'] == 'hline'][-1]['pts'][0]['p']
    check('imán fuerte: lejos de la vela SÍ se pega', any(abs(hl - v) < 1e-9 for v in ohlc), f'{hl} {ohlc} {pos[:2]} mag={ev("window.__tv.cfg.draw.magnet")}')
    page.click('#drawBar [data-k="magnet"]'); page.get_by_text('Imán apagado', exact=True).click(); page.wait_for_timeout(60)

    # ---- 4) texto sobre la línea horizontal y el rayo horizontal (mismos controles)
    page.keyboard.press('Escape')
    pick('lines', 'Rayo horizontal'); click(0.20, 0.20)
    hray = [d for d in drawings() if d['type'] == 'hray'][-1]
    page.locator('#selBar .db-btn[title^="Propiedades"]').click(); page.wait_for_timeout(200)
    labels = page.locator('.props-body .field > span').all_inner_texts()
    check('rayo horizontal tiene todos los ajustes de texto', all(k in labels for k in ['Texto', 'Color del texto', 'Tamaño (px)', 'Posición', 'Lugar del texto']), str(labels))
    page.locator('.props-body input[type=text]').first.fill('LIQUIDEZ'); page.wait_for_timeout(60)
    page.locator('.field', has_text='Posición').locator('select').select_option('below')
    page.locator('.field', has_text='Lugar del texto').locator('select').select_option('right'); page.wait_for_timeout(100)
    d = [d for d in drawings() if d['type'] == 'hray'][-1]
    check('texto, posición y lugar se guardan', d['text'] == 'LIQUIDEZ' and d['tV'] == 'below' and d['tH'] == 'right')
    page.screenshot(path=f'{OUT}/03_hray_texto.png')
    # plantilla desde la ventana
    page.locator('.props-actions button', has_text='Plantilla').click(); page.wait_for_timeout(100)
    page.locator('.tpl-save input').fill('Liquidez roja'); page.locator('.tpl-save button').click(); page.wait_for_timeout(120)
    tp = ev("window.__tv.cfg.draw.templates.hray")
    check('plantilla guardada (con el texto)', tp and tp[0]['name'] == 'Liquidez roja' and tp[0]['style']['text'] == 'LIQUIDEZ')
    page.locator('.props-actions button', has_text='Aceptar').click(); page.wait_for_timeout(100)
    # herramienta con plantilla desde el menú
    page.click('#drawBar [data-k="cat:lines"]'); page.wait_for_timeout(80)
    check('el menú de líneas lista la plantilla', page.locator('.db-fly .db-tpl', has_text='Liquidez roja').count() == 1)
    page.locator('.db-fly .db-tpl', has_text='Liquidez roja').click(); page.wait_for_timeout(80)
    click(0.15, 0.85)
    d = [d for d in drawings() if d['type'] == 'hray'][-1]
    check('un dibujo nuevo nace con la plantilla', d['text'] == 'LIQUIDEZ' and d['tV'] == 'below' and d['tH'] == 'right')
    page.keyboard.press('Escape')
    # plantilla en la ventana de una línea de tendencia y Fibonacci (texto de niveles)
    pick('fib', 'Retroceso'); drag((0.62, 0.55), (0.80, 0.25))
    page.locator('#selBar .db-btn[title^="Propiedades"]').click(); page.wait_for_timeout(200)
    labels = page.locator('.props-body .field > span').all_inner_texts()
    check('Fibonacci tiene ajustes de texto', all(k in labels for k in ['Color del texto', 'Tamaño (px)', 'Posición', 'Lugar del texto']))
    page.locator('.field', has_text='Posición').locator('select').select_option('center'); page.wait_for_timeout(60)
    page.screenshot(path=f'{OUT}/04_fib_texto.png')
    page.locator('.props-actions button', has_text='Aceptar').click(); page.wait_for_timeout(100)
    check('Fibonacci guarda posición de texto', [d for d in drawings() if d['type'] == 'fib'][-1]['tV'] == 'center')
    page.keyboard.press('Escape')

    # ---- 5) selección múltiple: Shift+arrastrar (recuadro) y Ctrl+clic (uno por uno)
    total = len(drawings())
    page.keyboard.down('Shift')
    x1, y1 = P(0.02, 0.05); x2, y2 = P(0.97, 0.97)
    page.mouse.move(x1, y1); page.mouse.down(); page.mouse.move(x2, y2, steps=8); page.mouse.up()
    page.keyboard.up('Shift'); page.wait_for_timeout(120)
    n_sel = ev("window.__tv.drawStore ? 0 : 0")
    sel = ev(f"document.getElementById('selBar').innerText")
    check('Shift + recuadro selecciona varios (barra muestra "N dibujos")', 'dibujos' in sel, sel[:40])
    page.screenshot(path=f'{OUT}/05_seleccion_multiple.png')
    page.keyboard.press('Escape'); page.wait_for_timeout(60)
    # Ctrl+clic uno por uno sobre el rectángulo y el rayo
    rr = [d for d in drawings() if d['type'] == 'rect'][0]['pts']
    p1 = to_page(rr[0]); p2 = to_page(rr[1])
    page.mouse.click((p1[0] + p2[0]) / 2, min(p1[1], p2[1])); page.wait_for_timeout(60)
    hp = [d for d in drawings() if d['type'] == 'hline'][0]['pts'][0]
    hy = to_page(hp)[1]
    page.keyboard.down('Control'); page.mouse.click(bx + bw * 0.93, hy); page.keyboard.up('Control'); page.wait_for_timeout(100)
    sel = ev("document.getElementById('selBar').innerText")
    check('Ctrl + clic suma dibujos uno por uno', sel.startswith('2 dibujos'), sel[:40])
    # mover el grupo
    before = json.dumps(drawings())
    mx, my = (p1[0] + p2[0]) / 2, min(p1[1], p2[1])
    page.mouse.move(mx, my); page.mouse.down(); page.mouse.move(mx + 20, my + 25, steps=5); page.mouse.up(); page.wait_for_timeout(100)
    check('arrastrar mueve todo el grupo', json.dumps(drawings()) != before)
    page.keyboard.press('Control+z'); page.wait_for_timeout(100)
    check('deshacer el movimiento del grupo', json.dumps(drawings()) == before)

    # ---- 6) carpetas: agrupar selección, subcarpetas, arrastrar en el árbol
    page.click('#selBar .db-btn[title^="Agrupar"]'); page.wait_for_timeout(150)
    page.locator('#modalBox input[type=text]').fill('ESTRUCTURA 4H'); page.get_by_text('Crear', exact=True).click(); page.wait_for_timeout(120)
    fl = folders()
    check('carpeta madre creada con los 2 dibujos', len(fl) == 1 and fl[0]['name'] == 'ESTRUCTURA 4H' and sum(1 for d in drawings() if d.get('folder') == fl[0]['id']) == 2)
    page.click('#rightBar [data-k="objects"]'); page.wait_for_timeout(200)
    check('barra derecha abre el panel de objetos', not ev("document.getElementById('objPanel').classList.contains('hidden')"))
    # subcarpeta vacía dentro de la madre
    page.locator('#objPanel .obj-row.folder').first.locator('.obj-btn[title^="Crear una subcarpeta"]').click(); page.wait_for_timeout(150)
    page.locator('#modalBox input[type=text]').fill('LIQUIDEZ 4H'); page.get_by_text('Crear', exact=True).click(); page.wait_for_timeout(150)
    fl = folders()
    sub = [f for f in fl if f['name'] == 'LIQUIDEZ 4H']
    check('subcarpeta dentro de la madre', len(sub) == 1 and sub[0]['parent'] == fl[0]['id'])
    madre0 = fl[0]['id']
    n_sub0 = sum(1 for d in drawings() if d.get('folder') == sub[0]['id'])
    check('la subcarpeta nace con los dibujos que estaban seleccionados', n_sub0 == 2, str(n_sub0))
    # arrastrar un dibujo suelto a la subcarpeta
    loose = [d for d in drawings() if not d.get('folder')]
    check('quedan dibujos sueltos', len(loose) > 0)
    page.keyboard.press('Escape'); page.wait_for_timeout(100)   # sin selección: se arrastra solo esa fila
    src = page.locator('#objPanel .obj-row:not(.folder)').last
    # la fila suelta es la última; el destino es la subcarpeta
    src.drag_to(page.locator('#objPanel .obj-row.folder', has_text='LIQUIDEZ 4H')); page.wait_for_timeout(200)
    check('arrastrar un dibujo a una subcarpeta lo guarda dentro', sum(1 for d in drawings() if d.get('folder') == sub[0]['id']) == n_sub0 + 1, str([(d['type'], d.get('folder') == sub[0]['id'], d.get('folder') == madre0) for d in drawings()]))
    # sacar arrastrando al espacio vacío
    page.screenshot(path=f'{OUT}/06_carpetas.png')
    inner = [d for d in drawings() if d.get('folder') == sub[0]['id']][0]
    page.locator('#objPanel .obj-row:not(.folder)', has_text='').filter(has=page.locator('.obj-btn[title^="Sacar"]')).first.locator('.obj-btn[title^="Sacar"]').first.click(); page.wait_for_timeout(150)
    check('"Sacar de la carpeta" funciona', sum(1 for d in drawings() if d.get('folder')) <= 2)
    # ocultar carpeta madre oculta todo su contenido
    page.locator('#objPanel .obj-row.folder').first.locator('.obj-btn[title^="Ocultar todo"]').click(); page.wait_for_timeout(150)
    madre = fl[0]['id']
    check('ocultar la carpeta oculta sus dibujos', all(d['hidden'] for d in drawings() if d.get('folder') == madre))
    page.locator('#objPanel .obj-row.folder').first.locator('.obj-btn[title^="Mostrar todo"]').click(); page.wait_for_timeout(150)
    # persistencia de carpetas
    page.wait_for_timeout(900); page.reload(); ready(); page.wait_for_timeout(500)
    check('las carpetas sobreviven al recargar', len(folders()) == 2)
    page.click('#rightBar [data-k="objects"]'); page.wait_for_timeout(200)
    check('el panel muestra las carpetas tras recargar', page.locator('#objPanel .obj-row.folder').count() == 2)
    page.click('#rightBar [data-k="objects"]'); page.wait_for_timeout(100)
    check('segundo clic cierra el panel', ev("document.getElementById('objPanel').classList.contains('hidden')"))

    # ---- 7) barra de favoritos movible y que cambia de orientación
    fb = page.locator('#favBar'); grip = page.locator('#favBar .fav-grip')
    check('la barra de favoritos empieza vertical a la izquierda', ev("document.getElementById('favBar').classList.contains('horiz')") is False and ev('window.__tv.cfg.draw.favPos.edge') == 'left')
    def move_fav(fx, fy):
        g = grip.bounding_box(); page.mouse.move(g['x'] + 6, g['y'] + 6); page.mouse.down()
        page.mouse.move(bx + bw * fx, by + bh * fy, steps=8); page.mouse.up(); page.wait_for_timeout(150)
    move_fav(0.5, 0.03)
    check('arriba: horizontal', ev('window.__tv.cfg.draw.favPos.edge') == 'top' and ev("document.getElementById('favBar').classList.contains('horiz')"))
    page.screenshot(path=f'{OUT}/07_favoritos_arriba.png')
    move_fav(0.5, 0.97)
    check('abajo: horizontal', ev('window.__tv.cfg.draw.favPos.edge') == 'bottom' and ev("document.getElementById('favBar').classList.contains('horiz')"))
    move_fav(0.99, 0.5)
    check('derecha: vertical', ev('window.__tv.cfg.draw.favPos.edge') == 'right' and not ev("document.getElementById('favBar').classList.contains('horiz')"))
    page.screenshot(path=f'{OUT}/08_favoritos_derecha.png')
    move_fav(0.01, 0.6)
    check('izquierda: vertical', ev('window.__tv.cfg.draw.favPos.edge') == 'left')
    page.wait_for_timeout(800); page.reload(); ready(); page.wait_for_timeout(300)
    check('la posición se recuerda', ev('window.__tv.cfg.draw.favPos.edge') == 'left')
    br.close()

print('\nErrores de consola:', errors if errors else 'ninguno')
print('FALLAS:', fails if fails else 'ninguna')
sys.exit(1 if fails or errors else 0)
