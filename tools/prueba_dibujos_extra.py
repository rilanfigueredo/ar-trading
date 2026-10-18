"""Pruebas extra de dibujos: migración desde v0.6, dibujos dañados, dos gráficos, tipo de gráfico, escala log.
Uso:  TV_MOCK=1 PORT=3111 node server.js  (en otra terminal)  y luego:  python3 tools/prueba_dibujos_extra.py [carpeta]
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
    ev = page.evaluate
    ready = lambda n=1: page.wait_for_function(f'window.__tv && window.__tv.views.length >= {n} && window.__tv.views.every(v => v.bars.length > 100)', timeout=40000)

    # 1) configuración guardada por la v0.6 (sin dibujos, versión 4) + dibujos dañados
    page.goto(URL); ready()
    cfg = ev('JSON.parse(JSON.stringify(window.__tv.cfg))')
    old = dict(cfg); old.pop('drawings', None); old.pop('draw', None); old['version'] = 4
    sym = old['charts'][0]['symbol']
    r = page.request.post(URL + 'api/config', data=json.dumps(old))
    page.reload(); ready()
    n = ev('window.__tv.cfg')
    check('config v0.6 migra a versión 7', n['version'] == 7)
    check('migración: dibujos vacíos y preferencias por defecto', n['drawings'] == {} and n['draw']['favs'] == ['trend', 'hline', 'fib', 'rect'] and n['draw']['magnet'] == 'off' and n['folders'] == {})
    check('migración: lo demás se conserva', n['charts'][0]['symbol'] == sym and n['theme'] == old['theme'] and n['palette'] == old['palette'])

    bad = dict(old); bad['version'] = 5
    bad['drawings'] = {sym: [
        {'type': 'trend', 'pts': [{'t': 1.7e9, 'p': 100}, {'t': 1.71e9, 'p': 120}], 'color': '#ff0000'},
        {'type': 'inventado', 'pts': [{'t': 1, 'p': 1}]},
        {'type': 'trend', 'pts': [{'t': 'x', 'p': 1}, {'t': 2, 'p': 2}]},
        {'type': 'channel', 'pts': [{'t': 1, 'p': 1}, {'t': 2, 'p': 2}]},
        {'type': 'hline', 'pts': []},
        {'type': 'fib', 'pts': [{'t': 1.7e9, 'p': 100}, {'t': 1.71e9, 'p': 120}]},
    ], 'XYZ': 'no soy lista'}
    bad['draw'] = {'favs': ['trend', 'nada'], 'magnet': 1, 'styles': 'roto'}
    page.request.post(URL + 'api/config', data=json.dumps(bad))
    page.reload(); ready()
    n = ev('window.__tv.cfg')
    kinds = [d['type'] for d in n['drawings'].get(sym, [])]
    check('dibujos dañados se descartan sin romper', kinds == ['trend', 'fib'], str(kinds))
    check('el Fibonacci sin niveles recibe los niveles por defecto', len(n['drawings'][sym][1]['levels']) == 11)
    check('preferencias dañadas se corrigen', n['draw']['favs'] == ['trend'] and n['draw']['magnet'] == 'weak' and n['draw']['styles'] == {})

    # 2) dos gráficos del mismo activo: el dibujo aparece en ambos
    good = dict(old); good['version'] = 5; good['layout'] = '2h'
    good['charts'] = [dict(c) for c in old['charts']]
    good['charts'][1]['symbol'] = good['charts'][0]['symbol']
    good['drawings'] = {}
    page.request.post(URL + 'api/config', data=json.dumps(good))
    page.reload(); ready(2)
    boxes = [page.locator('#grid .cell .chart').nth(i).bounding_box() for i in range(2)]
    page.keyboard.press('Alt+t')
    b = boxes[0]
    page.mouse.move(b['x'] + b['width'] * .2, b['y'] + b['height'] * .6); page.mouse.down(); page.mouse.up()
    page.mouse.move(b['x'] + b['width'] * .7, b['y'] + b['height'] * .3, steps=5); page.mouse.down(); page.mouse.up()
    page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/10_dos_graficos.png')
    check('el dibujo se guarda una sola vez para el activo', len(ev(f"window.__tv.cfg.drawings['{sym}']")) == 1)
    # ¿se pintó en el segundo gráfico? se compara el recorte del gráfico 2 con y sin dibujo (ocultar todos)
    clip = {'x': boxes[1]['x'], 'y': boxes[1]['y'], 'width': boxes[1]['width'], 'height': boxes[1]['height']}
    with_d = page.screenshot(clip=clip)
    page.click('#drawBar [data-k="hideAll"]'); page.wait_for_timeout(250)
    without = page.screenshot(clip=clip)
    page.click('#drawBar [data-k="hideAll"]'); page.wait_for_timeout(250)
    check('el segundo gráfico (mismo activo) también muestra el dibujo', with_d != without)

    # 3) cambiar a gráfico de línea (se recrea la serie): el dibujo sigue
    page.click('#typeButtons [data-type="line"]'); page.wait_for_timeout(500)
    with_line = page.screenshot(clip={'x': boxes[0]['x'], 'y': boxes[0]['y'], 'width': boxes[0]['width'], 'height': boxes[0]['height']})
    page.click('#drawBar [data-k="hideAll"]'); page.wait_for_timeout(250)
    no_line = page.screenshot(clip={'x': boxes[0]['x'], 'y': boxes[0]['y'], 'width': boxes[0]['width'], 'height': boxes[0]['height']})
    page.click('#drawBar [data-k="hideAll"]'); page.wait_for_timeout(250)
    check('tras cambiar a línea el dibujo sigue pintado', with_line != no_line)
    page.screenshot(path=f'{OUT}/11_tipo_linea.png')

    # 4) escala logarítmica y porcentaje: se pinta y se puede tocar
    for sc in ('log', 'percent', 'normal'):
        page.click(f'#scaleButtons [data-scale="{sc}"]'); page.wait_for_timeout(500)
        a = page.screenshot(clip={'x': boxes[0]['x'], 'y': boxes[0]['y'], 'width': boxes[0]['width'], 'height': boxes[0]['height']})
        page.click('#drawBar [data-k="hideAll"]'); page.wait_for_timeout(250)
        c = page.screenshot(clip={'x': boxes[0]['x'], 'y': boxes[0]['y'], 'width': boxes[0]['width'], 'height': boxes[0]['height']})
        page.click('#drawBar [data-k="hideAll"]'); page.wait_for_timeout(250)
        check(f'escala {sc}: el dibujo se pinta', a != c)
        if sc == 'log':
            page.screenshot(path=f'{OUT}/12_escala_log.png')

    # 5) pasar el ratón por el dibujo en escala normal lo resalta
    d = ev(f"window.__tv.cfg.drawings['{sym}'][0].pts")
    px = ev('''(pts) => { const v = window.__tv.views[0], s = v.state; const c = document.querySelector('#grid .cell .chart').getBoundingClientRect();
      const pane = s.series.getPane().getHTMLElement().getBoundingClientRect();
      const mid = [(pts[0].t + pts[1].t) / 2, (pts[0].p + pts[1].p) / 2];
      const lg = (s.bars.findIndex(b => b.time > mid[0]) - 1);
      return [c.left + v.chart.timeScale().logicalToCoordinate(lg), pane.top + s.series.priceToCoordinate(mid[1])]; }''', d)
    page.mouse.move(px[0], px[1]); page.wait_for_timeout(150)
    check('el dibujo se resalta al pasar el ratón (tras cambios de tipo y escala)', ev("document.querySelector('#grid .cell').classList.contains('draw-over')"))

    # 6) zoom vertical sobre el eje: el dibujo sigue pegado a su precio
    box = page.locator('#grid .cell .chart').first.bounding_box()
    page.mouse.move(box['x'] + box['width'] - 25, box['y'] + box['height'] * .5)
    for _ in range(4):
        page.mouse.wheel(0, 200); page.wait_for_timeout(60)
    page.wait_for_timeout(200)
    page.screenshot(path=f'{OUT}/13_zoom_vertical.png')

    # 7) la ventana de propiedades de un texto y el tamaño
    page.keyboard.press('Escape')
    br.close()

print('\nErrores de consola:', errors if errors else 'ninguno')
print('FALLAS:', fails if fails else 'ninguna')
sys.exit(1 if fails or errors else 0)
