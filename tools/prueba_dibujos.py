"""Prueba de las herramientas de dibujo con datos simulados.
Uso:  TV_MOCK=1 PORT=3111 node server.js   (en otra terminal)   y luego:  python3 tools/prueba_dibujos.py [carpeta_capturas]
"""
import json, sys, os
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/capturas_dibujos'
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
    page.goto(URL)
    page.wait_for_function('window.__tv && window.__tv.views[0] && window.__tv.views[0].bars.length > 100', timeout=30000)
    page.wait_for_timeout(800)
    page.screenshot(path=f'{OUT}/00_inicio.png')

    ev = lambda js: page.evaluate(js)
    sym = ev('window.__tv.cfg.charts[0].symbol')
    drawings = lambda: ev(f"JSON.parse(JSON.stringify(window.__tv.cfg.drawings['{sym}'] || []))")
    tool = lambda: ev('window.__tv.views[0].draw ? 1 : 0')
    check('capa de dibujo creada en el gráfico', tool() == 1)
    check('barra lateral presente', page.locator('#drawBar .db-btn').count() >= 8, str(page.locator('#drawBar .db-btn').count()))

    box = page.locator('#grid .cell .chart').first.bounding_box()
    bx, by, bw, bh = box['x'], box['y'], box['width'], box['height']
    def P(fx, fy):  # posición relativa dentro del gráfico
        return bx + bw * fx, by + bh * fy
    def click(fx, fy):
        x, y = P(fx, fy); page.mouse.move(x, y); page.mouse.down(); page.mouse.up(); page.wait_for_timeout(60)
    def drag(f1, f2, steps=8):
        x1, y1 = P(*f1); x2, y2 = P(*f2)
        page.mouse.move(x1, y1); page.mouse.down(); page.mouse.move(x2, y2, steps=steps); page.mouse.up(); page.wait_for_timeout(80)
    def pick(cat, label):
        page.click(f'#drawBar [data-k="cat:{cat}"]'); page.wait_for_timeout(80)
        page.click(f'.db-fly .db-row:has-text("{label}")'); page.wait_for_timeout(80)

    rng0 = ev('JSON.stringify(window.__tv.views[0].chart.timeScale().getVisibleLogicalRange())')

    # 1) línea de tendencia: clic-clic
    pick('lines', 'Línea de tendencia')
    check('cursor de dibujo activo', ev("document.querySelector('#grid .cell').classList.contains('draw-tool')"))
    click(0.30, 0.55); page.mouse.move(*P(0.45, 0.40), steps=5); click(0.50, 0.35)
    d = drawings()
    check('línea de tendencia creada (clic-clic)', len(d) == 1 and d[0]['type'] == 'trend' and len(d[0]['pts']) == 2, json.dumps(d)[:120])
    check('la herramienta vuelve al cursor', ev('window.__tv.views[0].draw && !document.querySelector("#grid .cell").classList.contains("draw-tool")'))
    rng1 = ev('JSON.stringify(window.__tv.views[0].chart.timeScale().getVisibleLogicalRange())')
    check('dibujar no mueve el gráfico', rng0 == rng1, rng0 + ' vs ' + rng1)

    # 2) horizontal con atajo Alt+H
    page.keyboard.press('Alt+h'); click(0.20, 0.30)
    check('línea horizontal (Alt+H)', any(x['type'] == 'hline' for x in drawings()))

    # 3) Fibonacci arrastrando
    page.keyboard.press('Alt+f'); drag((0.55, 0.60), (0.75, 0.30))
    fib = [x for x in drawings() if x['type'] == 'fib']
    check('Fibonacci creado arrastrando', len(fib) == 1 and len(fib[0]['levels']) == 11)

    # 4) rectángulo
    page.keyboard.press('Alt+r'); drag((0.10, 0.65), (0.22, 0.80))
    check('rectángulo', any(x['type'] == 'rect' for x in drawings()))
    page.screenshot(path=f'{OUT}/01_basicos.png')

    # 5) rayo
    pick('lines', 'Rayo'); click(0.40, 0.75); click(0.50, 0.70)
    check('rayo', any(x['type'] == 'ray' for x in drawings()))

    # 6) canal paralelo (3 clics)
    pick('lines', 'Canal paralelo'); click(0.60, 0.80); click(0.75, 0.70); click(0.75, 0.80)
    ch = [x for x in drawings() if x['type'] == 'channel']
    check('canal paralelo (3 puntos)', len(ch) == 1 and len(ch[0]['pts']) == 3)

    # 7) texto
    pick('text', 'Texto'); click(0.30, 0.20)
    page.wait_for_selector('.draw-text-input'); page.keyboard.type('Soporte clave'); page.keyboard.press('Enter'); page.wait_for_timeout(100)
    tx = [x for x in drawings() if x['type'] == 'text']
    check('texto con editor interno', len(tx) == 1 and tx[0]['text'] == 'Soporte clave')

    # 8) polilínea (doble clic para terminar)
    pick('lines', 'Polilínea'); click(0.05, 0.50); click(0.10, 0.45); click(0.15, 0.55)
    x, y = P(0.18, 0.48); page.mouse.move(x, y); page.mouse.dblclick(x, y); page.wait_for_timeout(100)
    pl = [x for x in drawings() if x['type'] == 'poly']
    check('polilínea terminada con doble clic', len(pl) == 1 and len(pl[0]['pts']) >= 3, str(len(pl[0]['pts']) if pl else None))

    # 9) regla (no se guarda)
    n_before = len(drawings())
    pick('text', 'Regla'); drag((0.62, 0.45), (0.80, 0.55))
    page.screenshot(path=f'{OUT}/02_todas_con_regla.png')
    check('la regla no se guarda como dibujo', len(drawings()) == n_before)
    page.keyboard.press('Escape')

    # 10) seleccionar y mover
    before = drawings()[0]['pts']
    x1, y1 = P(0.30, 0.55); x2, y2 = P(0.50, 0.35)
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    page.mouse.move(mx, my); page.wait_for_timeout(80)
    check('resalta al pasar el ratón', ev("document.querySelector('#grid .cell').classList.contains('draw-over')"))
    page.mouse.down(); page.mouse.move(mx + 60, my + 40, steps=6); page.mouse.up(); page.wait_for_timeout(100)
    after = drawings()[0]['pts']
    check('arrastrar mueve el dibujo', after != before and after[0]['t'] != before[0]['t'])
    check('barra del objeto visible al seleccionar', not ev("document.getElementById('selBar').classList.contains('hidden')"))
    page.screenshot(path=f'{OUT}/03_seleccion.png')
    page.keyboard.press('Control+z'); page.wait_for_timeout(100)
    check('Ctrl+Z deshace el movimiento', drawings()[0]['pts'] == before)
    page.keyboard.press('Control+y'); page.wait_for_timeout(100)
    check('Ctrl+Y lo rehace', drawings()[0]['pts'] == after)

    # 11) tirador: mover un punto
    px, py = ev(f"[window.__tv.views[0].draw ? 1 : 0, 0]")
    # 12) bloquear y duplicar desde la barra del objeto
    page.click('#selBar .db-btn[title^="Bloquear"]'); page.wait_for_timeout(80)
    check('bloquear', drawings()[0]['locked'] is True)
    locked_pts = drawings()[0]['pts']
    page.mouse.move(mx + 60, my + 40); page.mouse.down(); page.mouse.move(mx + 120, my + 80, steps=4); page.mouse.up(); page.wait_for_timeout(80)
    check('un dibujo bloqueado no se mueve', drawings()[0]['pts'] == locked_pts)
    page.keyboard.press('Delete'); page.wait_for_timeout(80)
    check('un dibujo bloqueado no se borra', len(drawings()) == n_before)
    page.click('#selBar .db-btn[title^="Bloquear"]'); page.wait_for_timeout(60)
    page.keyboard.press('Control+d'); page.wait_for_timeout(100)
    check('Ctrl+D duplica', len(drawings()) == n_before + 1)

    # 13) panel de objetos
    page.click('#drawBar [data-k="objects"]'); page.wait_for_timeout(200)
    rows = page.locator('#objPanel .obj-row').count()
    check('árbol de objetos lista los dibujos', rows == n_before + 1, str(rows))
    page.screenshot(path=f'{OUT}/04_objetos.png')
    page.locator('#objPanel .obj-row').first.locator('.obj-btn').first.click(); page.wait_for_timeout(100)
    check('ocultar desde el árbol', any(d['hidden'] for d in drawings()))
    page.locator('#objPanel .obj-row').first.locator('.obj-btn').first.click(); page.wait_for_timeout(100)

    # 14) propiedades del Fibonacci (doble clic en una línea de nivel)
    page.click('#drawBar [data-k="objects"]')
    fib = [x for x in drawings() if x['type'] == 'fib'][0]
    page.evaluate(f"window.__tv.views[0].draw && window.TVDraw && 0")
    # abrir propiedades desde el menú contextual del árbol: doble clic en la fila
    page.click('#drawBar [data-k="objects"]')
    page.locator('#objPanel .obj-row', has_text='Fibonacci').dblclick(); page.wait_for_timeout(200)
    check('ventana de propiedades de Fibonacci', page.locator('.fib-row').count() == 11, str(page.locator('.fib-row').count()))
    page.locator('.fib-row').nth(2).locator('input[type=number]').fill('0.45'); page.wait_for_timeout(100)
    fib = [x for x in drawings() if x['type'] == 'fib'][0]
    check('editar un nivel de Fibonacci', any(abs(l['v'] - 0.45) < 1e-9 for l in fib['levels']))
    page.locator('.fib-row').nth(0).locator('input[type=checkbox]').uncheck(); page.wait_for_timeout(100)
    fib = [x for x in drawings() if x['type'] == 'fib'][0]
    check('apagar un nivel', fib['levels'][0]['on'] is False)
    page.get_by_text('+ Agregar nivel').click(); page.wait_for_timeout(100)
    check('agregar un nivel', page.locator('.fib-row').count() == 12)
    page.screenshot(path=f'{OUT}/05_propiedades_fib.png')
    page.keyboard.press('Escape'); page.wait_for_timeout(100)

    # 15) favoritos
    check('barra de favoritos visible', not ev("document.getElementById('favBar').classList.contains('hidden')"))
    page.click('#favBar .db-btn >> nth=1'); page.wait_for_timeout(60)
    check('favorito activa la herramienta', ev('window.__tv.views[0].draw && document.querySelector("#grid .cell").classList.contains("draw-tool")'))
    page.keyboard.press('Escape')

    # 16) imán
    page.click('#drawBar [data-k="magnet"]'); page.wait_for_timeout(60)
    check('imán activado', ev('window.__tv.cfg.draw.magnet') is True)
    page.keyboard.press('Alt+h')
    # se hace clic a ~12 px del máximo de una vela visible: el imán debe pegar el punto a su precio más cercano
    pos = ev('''(() => { const v = window.__tv.views[0], s = v.state; const i = s.bars.length - 40; const b = s.bars[i];
      const x = v.chart.timeScale().logicalToCoordinate(i); const y = s.series.priceToCoordinate(b.high);
      const pane = s.series.getPane().getHTMLElement().getBoundingClientRect(); const c = document.querySelector('#grid .cell .chart').getBoundingClientRect();
      return [c.left + x, pane.top + y + 12, b.open, b.high, b.low, b.close]; })()''')
    page.mouse.move(pos[0], pos[1]); page.mouse.down(); page.mouse.up(); page.wait_for_timeout(100)
    hl = [x for x in drawings() if x['type'] == 'hline']
    check('el imán pega el punto a uno de los 4 precios (A/M/m/C) de esa vela', any(abs(hl[-1]['pts'][0]['p'] - v) < 1e-9 for v in pos[2:]), f"{hl[-1]['pts'][0]['p']} vs {pos[2:]}")
    bars = ev('window.__tv.views[0].bars.map(b=>[b.open,b.high,b.low,b.close]).flat()')
    snapped = any(abs(hl[-1]['pts'][0]['p'] - v) < 1e-9 for v in bars)
    check('el imán pega el precio a la vela', snapped)
    page.click('#drawBar [data-k="magnet"]')

    # 17) ocultar todos
    page.click('#drawBar [data-k="hideAll"]'); page.wait_for_timeout(100)
    page.screenshot(path=f'{OUT}/06_todo_oculto.png')
    check('ocultar todos queda guardado', ev('window.__tv.cfg.draw.hideAll') is True)
    page.click('#drawBar [data-k="hideAll"]'); page.wait_for_timeout(100)

    # 18) otra temporalidad: los dibujos siguen en su lugar (por activo)
    total = len(drawings())
    page.keyboard.press(']'); page.wait_for_timeout(2500)
    page.screenshot(path=f'{OUT}/07_otra_temporalidad.png')
    check('los dibujos son por activo (misma lista en otra temporalidad)', len(drawings()) == total)

    # 19) guardado y recarga
    page.wait_for_timeout(900)
    page.reload()
    page.wait_for_function('window.__tv && window.__tv.views[0] && window.__tv.views[0].bars.length > 100', timeout=30000)
    page.wait_for_timeout(800)
    check('los dibujos sobreviven al recargar', len(drawings()) == total, f'{len(drawings())} vs {total}')
    page.screenshot(path=f'{OUT}/08_recargado.png')

    # 20) eliminar todos + deshacer
    page.click('#drawBar [data-k="clear"]'); page.get_by_text('Eliminar todos', exact=True).last.click(); page.wait_for_timeout(100)
    check('eliminar todos', len(drawings()) == 0)
    page.keyboard.press('Control+z'); page.wait_for_timeout(100)
    check('deshacer eliminar todos', len(drawings()) == total)

    br.close()

print('\nErrores de consola:', errors if errors else 'ninguno')
print('FALLAS:', fails if fails else 'ninguna')
sys.exit(1 if fails or errors else 0)
