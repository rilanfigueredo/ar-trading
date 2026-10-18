"""Pruebas de la v0.10: Ctrl+Z, plantillas en clic derecho, icono de paleta, texto del rectángulo (interior/superior/inferior),
eliminar carpeta con su contenido, barra de propiedades, ventana de Ajustes, objetos por grupos, tabla fijada y pegar desde Excel,
lupa de alejar.
Uso:  TV_MOCK=1 PORT=3111 node server.js (aparte) y luego: python3 tools/prueba_dibujos_v10.py [carpeta]
"""
import json, sys, os
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/capturas_v10'
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
    sym = ev('window.__tv.cfg.charts[0].symbol')
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

    # ---- 1) Ctrl+Z / Ctrl+Y
    pick('lines', 'Línea de tendencia'); click(0.30, 0.55); click(0.50, 0.40)
    check('hay una línea', len(drawings()) == 1)
    w0 = drawings()[0]['width']
    page.locator('#selBar select').first.select_option('5'); page.wait_for_timeout(100)   # el foco queda en la lista
    check('cambio de grosor aplicado', drawings()[0]['width'] == 5)
    page.keyboard.press('Control+z'); page.wait_for_timeout(100)
    check('Ctrl+Z deshace el cambio de grosor (con el foco en la lista)', drawings()[0]['width'] == w0, str(drawings()[0]['width']))
    page.keyboard.press('Control+y'); page.wait_for_timeout(100)
    check('Ctrl+Y lo rehace', drawings()[0]['width'] == 5)
    page.mouse.click(*P(0.9, 0.9)); page.wait_for_timeout(60)
    # varios pasos atrás
    pick('lines', 'Línea horizontal'); click(0.2, 0.3)
    pick('lines', 'Línea horizontal'); click(0.2, 0.4)
    check('3 dibujos', len(drawings()) == 3)
    page.keyboard.press('Control+z'); page.keyboard.press('Control+z'); page.wait_for_timeout(100)
    check('dos Ctrl+Z quitan los dos últimos dibujos', len(drawings()) == 1)
    page.keyboard.press('Control+Shift+z'); page.wait_for_timeout(100)
    check('Ctrl+Shift+Z rehace', len(drawings()) == 2)
    # mover y deshacer
    page.keyboard.press('Control+z'); page.keyboard.press('Control+z'); page.keyboard.press('Control+z'); page.wait_for_timeout(100)
    check('se puede volver hasta el principio', len(drawings()) == 0)
    page.keyboard.press('Control+y'); page.keyboard.press('Control+y'); page.wait_for_timeout(100)
    # polilínea: Ctrl+Z quita el último punto mientras se dibuja
    pick('lines', 'Polilínea'); click(0.05, 0.5); click(0.10, 0.45); click(0.15, 0.55)
    page.keyboard.press('Control+z'); page.wait_for_timeout(60)
    n_pl = ev("window.__tv.views[0].draw.hasDraft()")
    check('Ctrl+Z mientras se dibuja no cierra la herramienta', n_pl is True)
    page.keyboard.press('Escape')
    page.keyboard.press('Control+z'); page.wait_for_timeout(60)

    # ---- plantilla guardada para probar el clic derecho
    before = len(drawings())
    ev(f"window.__tv.drawStore.saveTemplate('trend', 'Tendencia roja', Object.assign(window.TVDraw.defaults('trend'), {{ color: '#ff0000', width: 4, text: 'ROJA' }}))")
    ev(f"window.__tv.drawStore.saveTemplate('trend', 'Tendencia verde', Object.assign(window.TVDraw.defaults('trend'), {{ color: '#00ff00', width: 1 }}))")
    page.click('#drawBar [data-k="cat:lines"]'); page.wait_for_timeout(80)
    check('el menú de la barra izquierda ya NO lista plantillas', page.locator('.db-fly .db-tpl').count() == 0 and page.locator('.db-fly .db-row').count() == 5, str(page.locator('.db-fly .db-row').count()))
    page.keyboard.press('Escape'); page.mouse.click(5, 600); page.wait_for_timeout(60)

    # ---- 2) clic derecho: Plantillas es la 2ª opción
    tr = [d for d in drawings() if d['type'] == 'trend'][0]
    a = to_page(tr['pts'][0]); b = to_page(tr['pts'][1])
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    page.mouse.click(*mid, button='right'); page.wait_for_timeout(150)
    items = page.locator('.ctx-menu > .ctx-item .ctx-check + span, .ctx-menu > .ctx-wrap > .ctx-item > span:nth-child(2)').all_inner_texts()
    labels = ev("[...document.querySelectorAll('body > .ctx-menu > .ctx-item, body > .ctx-menu > .ctx-wrap > .ctx-item')].map(e => e.innerText.replace('▸','').trim())")
    check('orden del menú: Propiedades, Plantillas, Duplicar', labels[:3] == ['Propiedades…', 'Plantillas', 'Duplicar'], str(labels))
    page.locator('.ctx-wrap').hover(); page.wait_for_timeout(120)
    subs = page.locator('.ctx-sub .ctx-item').all_inner_texts()
    check('al pasar el mouse salen las plantillas guardadas', any('roja' in x for x in subs) and any('verde' in x for x in subs), str(subs))
    page.screenshot(path=f'{OUT}/01_clic_derecho_plantillas.png')
    page.locator('.ctx-sub .ctx-item', has_text='roja').click(); page.wait_for_timeout(150)
    tr2 = [d for d in drawings() if d['type'] == 'trend'][0]
    check('elegir una plantilla la aplica al dibujo', tr2['color'] == '#ff0000' and tr2['width'] == 4 and tr2['text'] == 'ROJA')
    page.keyboard.press('Control+z'); page.wait_for_timeout(100)
    check('Ctrl+Z deshace la plantilla aplicada', [d for d in drawings() if d['type'] == 'trend'][0]['color'] != '#ff0000')
    page.mouse.click(*P(0.9, 0.9))

    # ---- 3) icono de la paleta
    page.click('#drawBar [data-k="cat:shapes"]'); page.wait_for_timeout(80); page.click('.db-fly .db-row:has-text("Rectángulo")')
    drag((0.55, 0.30), (0.75, 0.50))
    check('icono de la paleta: cuadrado con muchos colores', page.locator('#selBar .pal-btn svg rect').count() == 9)
    page.locator('#selBar .pal-btn').click(); page.wait_for_timeout(100)
    check('el icono abre la paleta', page.locator('.pal-pop').count() == 1)
    page.screenshot(path=f'{OUT}/02_paleta.png')
    page.keyboard.press('Escape'); page.mouse.click(5, 600)

    # ---- 7) barra de propiedades: más grande y con contorno
    rr = [d for d in drawings() if d['type'] == 'rect'][0]['pts']
    pa = to_page(rr[0]); pb = to_page(rr[1])
    page.mouse.click((pa[0] + pb[0]) / 2, min(pa[1], pb[1])); page.wait_for_timeout(100)
    bb = page.locator('#selBar .db-btn.small').first.bounding_box()
    check('botones de la barra de propiedades más grandes', bb['width'] >= 36 and bb['height'] >= 34, json.dumps(bb))
    bc = ev("getComputedStyle(document.getElementById('selBar')).borderTopColor")
    check('la barra tiene contorno turquesa', bc.replace(' ', '') == 'rgb(0,229,238)', bc)
    page.screenshot(path=f'{OUT}/03_barra_grande.png')

    # ---- 4) texto del rectángulo: interior / superior / inferior
    page.locator('#selBar .db-btn[title^="Propiedades"]').click(); page.wait_for_timeout(200)
    opts = page.locator('.field', has_text='Posición').locator('select option').all_inner_texts()
    check('opciones de posición del rectángulo', [o.split(' ')[0] for o in opts] == ['Interior', 'Superior', 'Inferior'], str(opts))
    page.locator('.props-body input[type=text]').first.fill('ARRIBA')
    page.locator('.field', has_text='Posición').locator('select').select_option('above'); page.wait_for_timeout(120)
    page.screenshot(path=f'{OUT}/04_rect_superior.png')
    page.locator('.props-actions button', has_text='Aceptar').click(); page.wait_for_timeout(100)
    check('texto superior guardado', [d for d in drawings() if d['type'] == 'rect'][0]['tV'] == 'above')
    page.keyboard.press('Escape')

    # ---- 5) eliminar carpeta con su contenido
    S = 'window.__tv.drawStore'
    ev(f"""(() => {{ const st = {S}, sym = '{sym}'; const ids = [0,1,2].map((i) => st.add(sym, Object.assign(window.TVDraw.defaults('hline'), {{ type: 'hline', pts: [{{ t: 1, p: 3000 + i * 50 }}] }})).id);
      const m = st.addFolder(sym, {{ name: 'MADRE' }}); st.addFolder(sym, {{ name: 'HIJA', parent: m.id, ids: [ids[0], ids[1]] }}); st.moveToFolder(sym, [ids[2]], m.id); st.select(null); }})()""")
    n_all = len(drawings())
    page.click('#rightBar [data-k="objects"]'); page.wait_for_timeout(250)
    heads = page.locator('#objPanel .obj-head').all_text_contents()
    check('la lista de objetos separa Indicadores y Dibujos en grupos con título', len(heads) == 2 and heads[0].startswith('Indicadores') and heads[1].startswith('Dibujos'), str(heads))
    page.screenshot(path=f'{OUT}/05_objetos_grupos.png')
    page.locator('#objPanel .obj-row.folder', has_text='MADRE').locator('.obj-btn[title^="Eliminar la carpeta"]').click(); page.wait_for_timeout(150)
    page.get_by_text('Eliminar todo', exact=True).click(); page.wait_for_timeout(150)
    check('eliminar la carpeta madre elimina todo lo que contiene', len(drawings()) == n_all - 3 and ev(f"(window.__tv.cfg.folders['{sym}'] || []).length") == 0, str(len(drawings())))
    page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    check('Ctrl+Z recupera la carpeta y sus dibujos', len(drawings()) == n_all and ev(f"(window.__tv.cfg.folders['{sym}'] || []).length") == 2)
    # bloqueado: no se elimina
    ev(f"{S}.setFolderFlag('{sym}', {S}.folders('{sym}')[1].id, 'locked', true)")
    page.wait_for_timeout(150)
    page.locator('#objPanel .obj-row.folder', has_text='MADRE').locator('.obj-btn[title^="Eliminar la carpeta"]').click(); page.wait_for_timeout(150)
    check('con contenido bloqueado avisa y no elimina', page.get_by_text('bloqueados dentro').count() == 1 and len(drawings()) == n_all)
    page.get_by_text('Cerrar', exact=True).click(); page.wait_for_timeout(100)
    ev(f"{S}.setFolderFlag('{sym}', {S}.folders('{sym}')[1].id, 'locked', false)")
    # "Solo quitar la carpeta" conserva los dibujos
    page.wait_for_timeout(150)
    page.locator('#objPanel .obj-row.folder', has_text='HIJA').locator('.obj-btn[title^="Eliminar la carpeta"]').click(); page.wait_for_timeout(150)
    page.get_by_text('Solo quitar la carpeta', exact=True).click(); page.wait_for_timeout(150)
    check('"Solo quitar la carpeta" conserva los dibujos', len(drawings()) == n_all)
    page.click('#rightBar [data-k="objects"]')

    # ---- 8) ventana de Ajustes: máximo 3/4 del ancho y se cierra al hacer clic fuera
    page.set_viewport_size({'width': 1000, 'height': 800}); page.wait_for_timeout(300)
    page.click('#btnSettings'); page.wait_for_timeout(250)
    sw = page.locator('#modalBox').bounding_box()
    check('Ajustes ocupa como máximo 3/4 del ancho', sw['width'] <= 1000 * 0.75 + 1, json.dumps(sw))
    page.screenshot(path=f'{OUT}/06_ajustes.png')
    page.mouse.click(120, 500); page.wait_for_timeout(200)
    check('clic fuera cierra Ajustes', page.locator('#modal').evaluate("e => e.classList.contains('hidden')"))
    page.click('#btnSettings'); page.wait_for_timeout(200)
    page.click('#btnSettings'); page.wait_for_timeout(200)
    check('el botón Ajustes también cierra la ventana', page.locator('#modal').evaluate("e => e.classList.contains('hidden')"))
    page.click('#btnSettings'); page.wait_for_timeout(200)
    page.locator('#modalBox').click(position={'x': 30, 'y': 80}); page.wait_for_timeout(100)
    check('clic dentro de Ajustes no la cierra', not page.locator('#modal').evaluate("e => e.classList.contains('hidden')"))
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    page.set_viewport_size({'width': 1600, 'height': 950}); page.wait_for_timeout(300)

    # ---- 11) lupa de alejar (solo con zoom)
    zb = page.locator('#drawBar [data-k="tool:zoomout"]')
    check('sin zoom la lupa de alejar está oculta', zb.evaluate("e => e.classList.contains('hidden')"))
    rng0 = ev('window.__tv.views[0].chart.timeScale().getVisibleLogicalRange()')
    page.click('#drawBar [data-k="tool:zoom"]'); drag((0.35, 0.30), (0.60, 0.55)); page.wait_for_timeout(200)
    check('con zoom aparece la lupa de alejar', not zb.evaluate("e => e.classList.contains('hidden')"))
    zi = page.locator('#drawBar [data-k="tool:zoom"]').bounding_box(); zo = zb.bounding_box()
    check('está justo debajo de la lupa de acercar', zo['y'] > zi['y'] and abs(zo['x'] - zi['x']) < 3)
    page.screenshot(path=f'{OUT}/07_lupa_alejar.png')
    page.click('#drawBar [data-k="tool:zoomout"]'); page.wait_for_timeout(250)
    rng1 = ev('window.__tv.views[0].chart.timeScale().getVisibleLogicalRange()')
    check('alejar vuelve a la vista anterior', abs(rng1['from'] - rng0['from']) < 2 and abs(rng1['to'] - rng0['to']) < 2, f'{rng0} {rng1}')
    page.wait_for_timeout(600)
    check('y el icono se oculta otra vez', zb.evaluate("e => e.classList.contains('hidden')"))

    # ---- 10) tabla fijada al borde y pegar desde Excel
    ev(f"window.__tv.drawStore.clear('{sym}')")
    pick('text', 'Tabla'); click(0.60, 0.25); page.wait_for_timeout(250)
    page.locator('.field', has_text='Fijar la tabla').locator('select').select_option('right'); page.wait_for_timeout(100)
    # pegar desde Excel en la primera celda
    ev("""(() => { const inp = document.querySelector('.tbl-cell'); const dt = new DataTransfer(); dt.setData('text/plain', 'Nivel\\tPrecio\\tNota\\nSoporte\\t3500\\tfuerte\\nResistencia\\t3800\\tdébil\\nMedio\\t3650\\t-\\n');
      inp.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()""")
    page.wait_for_timeout(200)
    tb = [d for d in drawings() if d['type'] == 'table'][0]
    check('pegar desde Excel llena la tabla y la agranda', tb['rows'] == 4 and tb['cols'] == 3 and tb['cells'][1][1]['text'] == '3500' and tb['cells'][3][0]['text'] == 'Medio', f"{tb['rows']}x{tb['cols']}")
    check('la tabla quedó fijada a la derecha', tb['pin'] == 'right')
    page.locator('.props-actions button', has_text='Aceptar').click(); page.wait_for_timeout(150)
    page.screenshot(path=f'{OUT}/08_tabla_fija_antes.png')
    pos = ev("(() => { const v = window.__tv.views[0]; return v.state.bars.length; })()")
    # el punto de la tabla (precio) sigue en pantalla; se mueve el gráfico hacia atrás: la tabla no se mueve
    tb_x = None
    cr = page.locator('#grid .cell .chart').first.bounding_box()
    # buscar el borde derecho de la tabla: doble clic cerca de la esquina derecha, a la altura del precio
    py = to_page(tb['pts'][0])[1]
    ev("window.__tv.views[0].chart.timeScale().scrollToPosition(-60, false)"); page.wait_for_timeout(250)
    page.screenshot(path=f'{OUT}/09_tabla_fija_despues.png')
    py = to_page(tb['pts'][0])[1]
    pw_ = ev("window.__tv.views[0].draw ? 1 : 0")
    hx = bx + ev("window.__tv.views[0].chartEl ? 0 : 0")
    # a 40 px del borde derecho del panel (donde está la tabla) a su altura + 8 px
    plot_w = ev("document.querySelector('#grid .cell .chart').clientWidth - 70")
    page.mouse.dblclick(cr['x'] + plot_w - 40, py + 10); page.wait_for_timeout(250)
    modal_open = lambda: not page.locator('#modal').evaluate("e => e.classList.contains('hidden')")
    check('tras mover el gráfico la tabla fija sigue en el mismo sitio de la pantalla (doble clic la abre)', modal_open() and page.locator('.tbl-cell:visible').count() == 12)
    page.locator('.props-actions button', has_text='Cancelar').click(); page.wait_for_timeout(100)
    # sin fijar, la tabla se mueve con el gráfico
    page.keyboard.press('Escape')
    ev(f"window.__tv.drawStore.patch('{sym}', window.__tv.cfg.drawings['{sym}'][0].id, {{ pin: 'none' }})"); page.wait_for_timeout(200)
    page.mouse.dblclick(cr['x'] + plot_w - 40, py + 10); page.wait_for_timeout(250)
    check('sin fijar, la tabla se va con el gráfico (ya no hay nada ahí)', not modal_open())
    # fijada a la izquierda y fuera de la vista vertical: no se ve
    br.close()

print('\nErrores de consola:', errors if errors else 'ninguno')
print('FALLAS:', fails if fails else 'ninguna')
sys.exit(1 if fails or errors else 0)
