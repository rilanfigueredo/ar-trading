"""Pruebas de la v0.9: cursor de tiradores, texto/cursiva en rectángulo, Ajustes fijo, barra de propiedades movible,
indicadores en la lista de objetos, tabla, regla fija, zoom y carpetas con estado propio.
Uso:  TV_MOCK=1 PORT=3111 node server.js (aparte) y luego: python3 tools/prueba_dibujos_v09.py [carpeta]
"""
import json, sys, os
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/capturas_v09'
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

    page.goto(URL); ready()
    cfg = ev('JSON.parse(JSON.stringify(window.__tv.cfg))')
    sym = cfg['charts'][0]['symbol']
    # migración desde v0.8 (versión 6, sin selPos ni carpetas con estado)
    old = dict(cfg); old['version'] = 6; old['drawings'] = {}; old['folders'] = {sym: [{'id': 'f1', 'name': 'X', 'parent': None, 'open': True}]}
    old['draw'] = dict(cfg['draw']); old['draw'].pop('selPos', None)
    old['drawings'] = {sym: [{'id': 'z1', 'type': 'zoom', 'pts': [{'t': 1, 'p': 1}, {'t': 2, 'p': 2}]}]}
    page.request.post(URL + 'api/config', data=json.dumps(old))
    page.reload(); ready()
    n = ev('JSON.parse(JSON.stringify(window.__tv.cfg))')
    check('v0.8 migra a versión 7', n['version'] == 7)
    check('nuevas preferencias (barra de propiedades arriba) y carpetas con estado', n['draw']['selPos']['edge'] == 'top' and n['folders'][sym][0]['hidden'] is False and n['folders'][sym][0]['locked'] is False)
    check('un dibujo efímero guardado por error se descarta', n['drawings'] == {})
    clean = dict(n); clean['drawings'] = {}; clean['folders'] = {}
    page.request.post(URL + 'api/config', data=json.dumps(clean)); page.reload(); ready()

    drawings = lambda: ev(f"JSON.parse(JSON.stringify(window.__tv.cfg.drawings['{sym}'] || []))")
    box = page.locator('#grid .cell .chart').first.bounding_box()
    bx, by, bw, bh = box['x'], box['y'], box['width'], box['height']
    P = lambda fx, fy: (bx + bw * fx, by + bh * fy)
    def click(fx, fy):
        x, y = P(fx, fy); page.mouse.move(x, y); page.mouse.down(); page.mouse.up(); page.wait_for_timeout(60)
    def drag(f1, f2, steps=8):
        x1, y1 = P(*f1); x2, y2 = P(*f2)
        page.mouse.move(x1, y1); page.mouse.down(); page.mouse.move(x2, y2, steps=steps); page.mouse.up(); page.wait_for_timeout(80)
    def pick(cat, label):
        page.click(f'#drawBar [data-k="cat:{cat}"]'); page.wait_for_timeout(80)
        page.click(f'.db-fly .db-row:has-text("{label}")'); page.wait_for_timeout(80)
    def to_page(pt):
        return ev('''(pt) => { const v = window.__tv.views[0], s = v.state; const pane = s.series.getPane().getHTMLElement().getBoundingClientRect();
          const c = document.querySelector('#grid .cell .chart').getBoundingClientRect(); let i = s.bars.findIndex(b => b.time >= pt.t); if (i < 0) i = s.bars.length - 1;
          return [c.left + v.chart.timeScale().logicalToCoordinate(i), pane.top + s.series.priceToCoordinate(pt.p)]; }''', pt)

    # ---- barra izquierda: la regla está fuera de los grupos, y hay herramienta de zoom
    check('regla y zoom son botones fijos de la barra', page.locator('#drawBar [data-k="tool:ruler"]').count() == 1 and page.locator('#drawBar [data-k="tool:zoom"]').count() == 1)
    page.click('#drawBar [data-k="cat:text"]'); page.wait_for_timeout(80)
    labels = page.locator('.db-fly .db-label').all_inner_texts()
    check('el grupo de texto ya no incluye la regla (sí la tabla)', labels == ['Texto', 'Tabla'], str(labels))
    page.keyboard.press('Escape'); page.mouse.click(5, 500); page.wait_for_timeout(80)

    # ---- 1) rectángulo: cursor de dos puntas en los tiradores
    pick('shapes', 'Rectángulo'); drag((0.30, 0.30), (0.50, 0.50))
    r = drawings()[0]['pts']
    a = to_page(r[0]); b = to_page(r[1])
    x1, x2 = min(a[0], b[0]), max(a[0], b[0]); y1, y2 = min(a[1], b[1]), max(a[1], b[1])
    curs = lambda: ev("document.querySelector('#grid .cell').dataset.cur || ''")
    spots = {'nwse-resize': (x1, y1), 'nesw-resize': (x2, y1), 'ns-resize': ((x1 + x2) / 2, y1), 'ew-resize': (x2, (y1 + y2) / 2)}
    for cur, (px, py) in spots.items():
        page.mouse.move(px + 30, py + 30); page.mouse.move(px, py, steps=3); page.wait_for_timeout(60)
        check(f'cursor {cur} sobre el tirador', curs() == cur, curs())
    page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2 + 5); page.mouse.move((x1 + x2) / 2 + 2, y2, steps=2); page.wait_for_timeout(60)
    page.mouse.move(bx + bw * 0.9, by + bh * 0.9, steps=3); page.wait_for_timeout(60)
    check('fuera del tirador no hay cursor de redimensionar', curs() == '')

    # ---- 2) texto dentro del rectángulo + cursiva
    page.mouse.click((x1 + x2) / 2, y1); page.wait_for_timeout(80)
    page.locator('#selBar .db-btn[title^="Propiedades"]').click(); page.wait_for_timeout(200)
    labels = page.locator('.props-body .field > span').all_inner_texts()
    check('el rectángulo tiene ajustes de texto con cursiva', all(k in labels for k in ['Texto', 'Color del texto', 'Tamaño (px)', 'Negrita', 'Cursiva', 'Posición', 'Lugar del texto']), str(labels))
    page.locator('.props-body input[type=text]').first.fill('ZONA 4H')
    page.locator('.field', has_text='Cursiva').locator('input').check()
    page.locator('.field', has_text='Posición').locator('select').select_option('above')
    page.locator('.field', has_text='Lugar del texto').locator('select').select_option('right'); page.wait_for_timeout(100)
    page.screenshot(path=f'{OUT}/01_rect_texto.png')
    page.locator('.props-actions button', has_text='Aceptar').click(); page.wait_for_timeout(100)
    d = drawings()[0]
    check('texto del rectángulo guardado (cursiva, arriba, derecha)', d['text'] == 'ZONA 4H' and d['tItalic'] is True and d['tV'] == 'above' and d['tH'] == 'right')
    page.screenshot(path=f'{OUT}/02_rect_texto_grafico.png')
    page.keyboard.press('Escape')

    # ---- cursiva en tendencia y en el texto libre
    pick('lines', 'Línea de tendencia'); click(0.60, 0.70); click(0.80, 0.60)
    page.locator('#selBar .db-btn[title^="Propiedades"]').click(); page.wait_for_timeout(200)
    check('tendencia tiene Cursiva', page.locator('.field', has_text='Cursiva').count() == 1)
    page.locator('.field', has_text='Cursiva').locator('input').check(); page.wait_for_timeout(60)
    page.locator('.props-actions button', has_text='Aceptar').click(); page.wait_for_timeout(100)
    check('cursiva de la tendencia guardada', [x for x in drawings() if x['type'] == 'trend'][-1]['tItalic'] is True)
    page.keyboard.press('Escape')
    pick('text', 'Texto'); click(0.15, 0.20)
    page.wait_for_selector('.draw-text-input'); page.keyboard.type('Nota'); page.keyboard.press('Enter'); page.wait_for_timeout(100)
    page.locator('#selBar .db-btn[title^="Propiedades"]').click(); page.wait_for_timeout(200)
    page.locator('.field', has_text='Cursiva').locator('input').check(); page.wait_for_timeout(60)
    page.locator('.props-actions button', has_text='Aceptar').click(); page.wait_for_timeout(100)
    check('el texto libre tiene cursiva', [x for x in drawings() if x['type'] == 'text'][-1]['italic'] is True)
    page.keyboard.press('Escape')

    # ---- 5) la barra de propiedades: arriba al centro, movible y cambia de orientación
    page.mouse.click((x1 + x2) / 2, y1); page.wait_for_timeout(100)
    sb = page.locator('#selBar')
    bb = sb.bounding_box()
    check('barra de propiedades arriba y centrada', bb['y'] < by + 60 and abs((bb['x'] + bb['width'] / 2) - (bx + 1516 / 2)) < 80, json.dumps(bb))
    check('arriba es horizontal', ev("document.getElementById('selBar').classList.contains('horiz')"))
    page.screenshot(path=f'{OUT}/03_barra_arriba.png')
    def move_bar(fx, fy):
        g = page.locator('#selBar .fav-grip').bounding_box(); page.mouse.move(g['x'] + 6, g['y'] + 6); page.mouse.down()
        page.mouse.move(bx + 1516 * fx, by + bh * fy, steps=8); page.mouse.up(); page.wait_for_timeout(150)
    move_bar(0.99, 0.5)
    check('a la derecha: vertical y se recuerda', ev('window.__tv.cfg.draw.selPos.edge') == 'right' and not ev("document.getElementById('selBar').classList.contains('horiz')"))
    page.screenshot(path=f'{OUT}/04_barra_derecha.png')
    move_bar(0.5, 0.97)
    check('abajo: horizontal', ev('window.__tv.cfg.draw.selPos.edge') == 'bottom' and ev("document.getElementById('selBar').classList.contains('horiz')"))
    move_bar(0.5, 0.02)
    check('vuelve arriba', ev('window.__tv.cfg.draw.selPos.edge') == 'top')
    page.keyboard.press('Escape')

    # ---- 3) Ajustes fijo arriba a la derecha aunque la ventana sea estrecha
    for w in (1600, 1250, 1000):
        page.set_viewport_size({'width': w, 'height': 950}); page.wait_for_timeout(250)
        sbn = page.locator('#btnSettings').bounding_box(); ind = page.locator('#btnIndicators').bounding_box()
        check(f'Ajustes arriba a la derecha con ventana de {w} px', sbn['y'] < 40 and sbn['x'] + sbn['width'] > w - 25 and abs(sbn['y'] - ind['y']) < 3, json.dumps(sbn))
    # el texto de estado cambia de largo: Ajustes no se mueve
    y0 = page.locator('#btnSettings').bounding_box()['y']
    ev("document.getElementById('status').textContent = 'Cargando historial 12345 velas de Binance muy largo'"); page.wait_for_timeout(150)
    check('Ajustes no baja cuando cambia el estado', abs(page.locator('#btnSettings').bounding_box()['y'] - y0) < 2)
    page.screenshot(path=f'{OUT}/05_ajustes_fijo.png')
    page.set_viewport_size({'width': 1600, 'height': 950}); page.wait_for_timeout(250)

    # ---- 6) indicadores activos en la lista de objetos
    ev("(() => { const c = window.__tv.cfg.charts[0]; c.ind.rsi.on = true; c.ind.stoch.on = true; c.maOn.EMA = true; window.__tv.views[0].refreshIndicators(); window.__tv.views[0].refreshMas(); })()")
    page.wait_for_timeout(500)
    page.click('#rightBar [data-k="objects"]'); page.wait_for_timeout(250)
    names = page.locator('#objPanel .obj-head ~ .obj-row:not(.folder) .obj-name').all_inner_texts()
    check('la lista de objetos muestra los indicadores activos', any(x.startswith('RSI') for x in names) and any(x.startswith('Estoc') for x in names) and any(x.startswith('EMA') for x in names), str(names))
    page.screenshot(path=f'{OUT}/06_objetos_indicadores.png')
    row = page.locator('#objPanel .obj-row', has_text='RSI')
    row.locator('.obj-btn').first.click(); page.wait_for_timeout(300)
    check('ocultar un indicador desde la lista', ev('window.__tv.cfg.charts[0].ind.rsi.hide') is True and ev("!window.__tv.views[0].state.sub.rsi"))
    page.locator('#objPanel .obj-row', has_text='RSI').locator('.obj-btn').first.click(); page.wait_for_timeout(300)
    check('volver a mostrarlo', ev('window.__tv.cfg.charts[0].ind.rsi.hide') is False and ev("!!window.__tv.views[0].state.sub.rsi"))
    page.locator('#objPanel .obj-row', has_text='Estoc').locator('.obj-btn').nth(1).click(); page.wait_for_timeout(300)
    check('eliminar un indicador desde la lista', ev('window.__tv.cfg.charts[0].ind.stoch.on') is False)
    page.locator('#objPanel .obj-row', has_text='EMA').locator('.obj-btn').first.click(); page.wait_for_timeout(200)
    check('ocultar una media', ev("window.__tv.cfg.charts[0].mas.find(m => m.id === 'EMA-59').visible") is False)
    page.locator('#objPanel .obj-row', has_text='EMA').locator('.obj-btn').nth(1).click(); page.wait_for_timeout(200)
    check('eliminar una media', ev("!window.__tv.cfg.charts[0].mas.some(m => m.id === 'EMA-59')"))
    ev("(() => { const c = window.__tv.cfg.charts[0]; c.ind.rsi.on = false; window.__tv.views[0].refreshIndicators(); })()")
    page.click('#rightBar [data-k="objects"]'); page.wait_for_timeout(150)

    # ---- 8) zoom a una parte del gráfico
    rng0 = ev('window.__tv.views[0].chart.timeScale().getVisibleLogicalRange()')
    pr0 = ev('window.__tv.views[0].state.series.priceScale().getVisibleRange()')
    page.click('#drawBar [data-k="tool:zoom"]'); page.wait_for_timeout(80)
    check('cursor de zoom activo', ev("document.querySelector('#grid .cell').classList.contains('draw-zoom')"))
    n_before = len(drawings())
    drag((0.35, 0.30), (0.60, 0.55))
    rng1 = ev('window.__tv.views[0].chart.timeScale().getVisibleLogicalRange()')
    pr1 = ev('window.__tv.views[0].state.series.priceScale().getVisibleRange()')
    check('el zoom acerca el tiempo', (rng1['to'] - rng1['from']) < (rng0['to'] - rng0['from']) * 0.5, f"{rng0} -> {rng1}")
    check('el zoom acerca el precio', (pr1['to'] - pr1['from']) < (pr0['to'] - pr0['from']) * 0.7, f"{pr0} -> {pr1}")
    check('el zoom no guarda dibujos y la herramienta vuelve al cursor', len(drawings()) == n_before and ev('window.__tv.drawStore.state.tool') is None)
    page.screenshot(path=f'{OUT}/07_zoom.png')
    page.click('#btnAuto'); page.wait_for_timeout(200)

    # ---- 7) tabla
    pick('text', 'Tabla'); click(0.55, 0.20); page.wait_for_timeout(250)
    check('la tabla abre su editor al crearse', page.locator('.tbl-cell').count() == 6 and 'Tabla' in page.locator('#modalBox h3').inner_text())
    page.locator('.field', has_text='Filas').locator('input').fill('3'); page.locator('.field', has_text='Columnas').locator('input').fill('3')
    page.locator('.field', has_text='Columnas').locator('input').press('Enter'); page.wait_for_timeout(200)
    check('se puede cambiar el número de columnas', page.locator('.tbl-cell').count() == 9)
    texts = ['Nivel', 'Precio', 'Nota', 'Soporte', '3500', 'fuerte', 'Resistencia', '3800', 'débil']
    for i, t in enumerate(texts):
        page.locator('.tbl-cell').nth(i).fill(t)
    tb = [x for x in drawings() if x['type'] == 'table'][0]
    check('el texto de las celdas se guarda', [c['text'] for row in tb['cells'] for c in row] == texts)
    # Shift: seleccionar celdas y cambiar su contorno
    page.locator('.tbl-cell').nth(0).click()
    page.locator('.tbl-cell').nth(1).click(modifiers=['Shift'])
    check('Shift suma celdas a la selección', page.locator('.tbl-cell.sel').count() == 2)
    page.locator('.tbl-cellbox .field', has_text='Color del contorno').locator('input[type=color]').fill('#ff0000')
    page.locator('.tbl-cellbox .field', has_text='Grosor del contorno').locator('input').fill('4'); page.wait_for_timeout(120)
    tb = [x for x in drawings() if x['type'] == 'table'][0]
    check('contorno propio de las celdas elegidas', tb['cells'][0][0].get('bColor') == '#ff0000' and tb['cells'][0][0].get('bWidth') == 4 and tb['cells'][0][1].get('bWidth') == 4 and 'bWidth' not in tb['cells'][1][0])
    # contorno general
    page.locator('.field', has_text='Color del contorno de las celdas').locator('input[type=color]').fill('#00ff00')
    page.locator('.field', has_text='Grosor del contorno (0').locator('input').fill('2'); page.wait_for_timeout(100)
    tb = [x for x in drawings() if x['type'] == 'table'][0]
    check('contorno general de toda la tabla', tb['bColor'] == '#00ff00' and tb['bWidth'] == 2)
    # estilo por columna: columna 1 solo negrita; columna 2 solo cursiva y otro color
    rows = page.locator('.tbl-colrow')
    rows.nth(0).locator('label', has_text='Negrita').locator('input').check()
    rows.nth(1).locator('label', has_text='Cursiva').locator('input').check()
    rows.nth(1).locator('input[type=color]').fill('#ff9800'); page.wait_for_timeout(120)
    tb = [x for x in drawings() if x['type'] == 'table'][0]
    check('estilo por columna independiente', tb['colStyles'][0].get('bold') is True and not tb['colStyles'][0].get('italic') and tb['colStyles'][1].get('italic') is True and tb['colStyles'][1].get('color') == '#ff9800' and not tb['colStyles'][1].get('bold'))
    page.screenshot(path=f'{OUT}/08_tabla_editor.png')
    # plantilla de la tabla
    page.locator('.props-actions button', has_text='Plantilla').click(); page.wait_for_timeout(100)
    page.locator('.tpl-save input').fill('Tabla niveles'); page.locator('.tpl-save button').click(); page.wait_for_timeout(150)
    check('plantilla de tabla guardada con sus columnas', ev('window.__tv.cfg.draw.templates.table[0].style.colStyles[1].italic') is True)
    page.locator('.props-actions button', has_text='Aceptar').click(); page.wait_for_timeout(150)
    page.screenshot(path=f'{OUT}/09_tabla_grafico.png')
    # mover la tabla y editarla con doble clic
    p0 = to_page(tb['pts'][0])
    page.mouse.move(p0[0] + 30, p0[1] + 14); page.mouse.down(); page.mouse.move(p0[0] + 80, p0[1] + 74, steps=6); page.mouse.up(); page.wait_for_timeout(120)
    tb2 = [x for x in drawings() if x['type'] == 'table'][0]
    check('la tabla se puede mover', tb2['pts'][0] != tb['pts'][0])
    page.mouse.dblclick(p0[0] + 80 + 30, p0[1] + 74 + 14); page.wait_for_timeout(250)
    check('doble clic abre el editor de la tabla', page.locator('.tbl-cell').count() == 9)
    page.locator('.props-actions button', has_text='Cancelar').click(); page.wait_for_timeout(100)
    page.keyboard.press('Escape')

    # ---- 9) carpetas con estado propio
    S = "window.__tv.drawStore"
    ev(f"""(() => {{ const st = {S}, sym = '{sym}'; const ids = [0,1,2].map((i) => st.add(sym, Object.assign(window.TVDraw.defaults('hline'), {{ type: 'hline', pts: [{{ t: 1, p: 3000 + i * 50 }}] }})).id);
      const m = st.addFolder(sym, {{ name: 'MADRE' }}); [1,2,3].forEach((n, i) => st.addFolder(sym, {{ name: 'HIJA ' + n, parent: m.id, ids: [ids[i]] }})); st.select(null); }})()""")
    page.click('#rightBar [data-k="objects"]'); page.wait_for_timeout(250)
    def frow(name): return page.locator('#objPanel .obj-row.folder', has_text=name)
    frow('HIJA 1').locator('.obj-btn[title*="Ocultar"]').click(); page.wait_for_timeout(100)
    frow('HIJA 3').locator('.obj-btn[title*="Ocultar"]').click(); page.wait_for_timeout(100)
    vis = lambda: ev(f"{S}.list('{sym}').filter(d => d.type === 'hline' && d.pts[0].t === 1).map(d => !{S}.isHidden('{sym}', d))")
    check('hijas 1 y 3 ocultas', vis() == [False, True, False], str(vis()))
    frow('MADRE').locator('.obj-btn[title*="Ocultar"]').click(); page.wait_for_timeout(100)
    check('madre oculta: todo oculto', vis() == [False, False, False])
    frow('MADRE').locator('.obj-btn[title*="Mostrar"]').click(); page.wait_for_timeout(100)
    check('al mostrar la madre solo se ve la hija que no estaba oculta', vis() == [False, True, False], str(vis()))
    page.screenshot(path=f'{OUT}/10_carpetas_estado.png')
    frow('HIJA 1').locator('.obj-btn[title*="Mostrar"]').click(); page.wait_for_timeout(100)
    check('mostrar una hija a mano funciona', vis() == [True, True, False])
    br.close()

print('\nErrores de consola:', errors if errors else 'ninguno')
print('FALLAS:', fails if fails else 'ninguna')
sys.exit(1 if fails or errors else 0)
