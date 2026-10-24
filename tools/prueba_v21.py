# Prueba v0.21 (estrategias y backtest) con datos simulados: TV_MOCK=1 PORT=3111 node server.js
from playwright.sync_api import sync_playwright
import sys
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
errs = []
def settle(pg, secs=12):
    for _ in range(secs * 4):
        s = pg.inner_text('.sc-status')
        if 'Calculando' not in s and 'Esperando' not in s: break
        pg.wait_for_timeout(250)
    pg.wait_for_timeout(500)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1600, 'height': 950})
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.goto('http://127.0.0.1:3111/'); pg.wait_for_timeout(3000)
    ev = pg.evaluate
    print('barras', ev("__tv.views[0].bars.length"))
    pg.click('#btnScripts'); pg.wait_for_timeout(400)
    names = pg.locator('.sc-side select option').all_inner_texts(); print('ejemplos', names)
    idx = [i for i, n in enumerate(names) if 'Cruce de medias' in n][0]
    pg.select_option('.sc-side select', index=idx); pg.wait_for_timeout(200)
    pg.click('.sc-btns button >> nth=0'); settle(pg)
    print('estado', pg.inner_text('.sc-status'))
    assert 'Funciona' in pg.inner_text('.sc-status')
    # panel fijo abajo, informe (se cierra la ventana flotante de scripts para ver el panel)
    pg.click('#btnScripts'); pg.wait_for_timeout(600)
    assert pg.locator('#btPanel').is_visible()
    print('panel:', pg.inner_text('#btPanel .bt-head').replace('\n', ' | '))
    cards = pg.locator('#btPanel .bt-card').all_inner_texts()
    print('tarjetas', len(cards)); print(' / '.join(c.replace('\n', ' ') for c in cards[:6]))
    st = ev("(()=>{const i=__tv.views[0].scriptInfo(__tv.views[0].cfg.scripts[0].uid); return {n:i.strategy.trades.length, eq:i.strategy.equity.length, bars:__tv.views[0].bars.length, la:i.strategy.lookahead, panes:__tv.views[0].chart.panes().length}})()")
    print('estrategia', st)
    assert st['n'] > 0 and st['eq'] == st['bars'] and st['la']['checked'] is True and st['panes'] >= 2
    print('rótulos', pg.locator('.legend .lg-scr').all_inner_texts(), '| panel capital:', pg.locator('.pane-legend').all_inner_texts())
    # el panel debe quedar pegado abajo y no tapar el gráfico
    pb = pg.locator('#btPanel').bounding_box(); gb = pg.locator('#grid').bounding_box()
    print('panel y', pb['y'], 'alto', pb['height'], '| grid bottom', gb['y'] + gb['height'])
    assert abs((gb['y'] + gb['height']) - pb['y']) < 6
    pg.close_modal = None
    pg.screenshot(path=f'{OUT}/v21_informe.png')
    # pestaña de operaciones y clic en una fila
    pg.click('#btPanel .bt-tab >> nth=1'); pg.wait_for_timeout(300)
    rows = pg.locator('#btPanel .bt-row'); nrows = rows.count(); print('filas', nrows)
    assert nrows == st['n']
    r0 = ev("__tv.views[0].chart.timeScale().getVisibleLogicalRange()")
    k = 0 if nrows < 3 else 2
    tsel = ev(f"__tv.views[0].scriptInfo(__tv.views[0].cfg.scripts[0].uid).strategy.trades[{k}].entryTime")
    rows.nth(k).click(); pg.wait_for_timeout(2500)
    # (si el gráfico carga más historia, los números de vela se desplazan: la operación se busca por su hora de entrada)
    t = ev(f"(()=>{{const tr=__tv.views[0].scriptInfo(__tv.views[0].cfg.scripts[0].uid).strategy.trades.find(q=>q.entryTime=={tsel}); return {{a:tr.entryIdx,b:tr.exitIdx}}}})()")
    r1 = ev("__tv.views[0].chart.timeScale().getVisibleLogicalRange()")
    print('rango antes', r0, 'después', r1, 'operación', t)
    assert r1['from'] <= t['a'] <= r1['to'] and r1['from'] <= t['b'] <= r1['to']
    assert pg.locator('#btPanel .bt-row.sel').count() == 1
    print('líneas de la operación elegida', ev("__tv.views[0].series ? 'ok' : ''"))
    pg.screenshot(path=f'{OUT}/v21_operaciones.png')
    # cambiar un parámetro: la comisión
    pg.click('#btPanel .bt-btn >> nth=0'); pg.wait_for_timeout(500)
    row = pg.locator('.sc-arow').nth(0)
    com = row.locator('.sc-param', has_text='Comisión taker').locator('input')
    com.fill('1'); com.press('Tab'); pg.wait_for_timeout(2500)
    fees = ev("__tv.views[0].scriptInfo(__tv.views[0].cfg.scripts[0].uid).strategy.report.fees")
    print('comisión 1 % -> comisiones pagadas', fees, '| params', ev("__tv.views[0].cfg.scripts[0].params"))
    assert fees > 0
    pg.screenshot(path=f'{OUT}/v21_parametros.png')
    # trampa: estrategia que mira el futuro -> error claro
    pg.click('.sc-side-top button'); pg.fill('.sc-name', 'Futuro')
    pg.fill('.sc-code', "strategy({});\nonBar(function (i, pos) {\n  if (i + 1 < close.length && close[i + 1] > close[i]) entry('long'); else if (pos.side === 'long') exit();\n});")
    pg.click('.sc-btns button >> nth=0'); settle(pg)
    s = pg.inner_text('.sc-status'); print('futuro ->', s); assert 'futuro' in s
    # bucle infinito dentro de onBar: se corta por tiempo
    pg.fill('.sc-name', 'Bucle'); pg.fill('.sc-code', "strategy({});\nonBar(function (i) {\n  while (true) {}\n});")
    pg.click('.sc-btns button >> nth=0'); pg.wait_for_timeout(4500)
    s = pg.inner_text('.sc-status'); print('bucle ->', s); assert 'segundos' in s
    # error con línea dentro de onBar
    pg.fill('.sc-name', 'Error'); pg.fill('.sc-code', "strategy({});\nonBar(function (i) {\n  const a = nada + 1;\n});")
    pg.click('.sc-btns button >> nth=0'); settle(pg)
    s = pg.inner_text('.sc-status'); print('error ->', s); assert 'Línea 3' in s and 'vela' in s
    pg.screenshot(path=f'{OUT}/v21_error.png')
    # volver a la estrategia buena y quitar las de prueba
    ev("(()=>{const v=__tv.views[0]; v.cfg.scripts = v.cfg.scripts.slice(0,1); v.refreshScripts(true);})()")
    pg.click('#btnScripts'); pg.wait_for_timeout(300)
    pg.wait_for_timeout(2500)
    # segundo ejemplo (RSI con stop y objetivo)
    pg.click('#btnScripts'); pg.wait_for_timeout(300)
    idx2 = [i for i, n in enumerate(names) if 'RSI con stop' in n][0]
    pg.select_option('.sc-side select', index=idx2); pg.wait_for_timeout(200)
    pg.click('.sc-btns button >> nth=0'); settle(pg); print('ejemplo 2 ->', pg.inner_text('.sc-status'))
    assert 'Funciona' in pg.inner_text('.sc-status')
    pg.click('#btnScripts'); pg.wait_for_timeout(500)
    assert pg.locator('#btPanel .bt-sel').count() == 1
    print('estrategias en el selector', pg.locator('#btPanel .bt-sel option').all_inner_texts())
    pg.screenshot(path=f'{OUT}/v21_dos.png')
    # replay: se recalcula con las velas recortadas
    pg.click('#btnReplay'); pg.wait_for_timeout(300)
    box = pg.locator('#grid .chart >> nth=0').bounding_box()
    pg.mouse.click(box['x'] + box['width'] * 0.5, box['y'] + 200); pg.wait_for_timeout(2500)
    n1 = ev("__tv.views[0].bars.length"); e1 = ev("__tv.views[0].scriptInfo(__tv.views[0].cfg.scripts[0].uid).strategy.equity.length")
    print('replay barras', n1, 'equity', e1); assert n1 == e1
    pg.click('.rp-btn[title^="Una vela adelante"]'); pg.wait_for_timeout(2000)
    n2 = ev("__tv.views[0].bars.length"); e2 = ev("__tv.views[0].scriptInfo(__tv.views[0].cfg.scripts[0].uid).strategy.equity.length")
    print('replay +1', n2, e2); assert n2 == n1 + 1 and e2 == n2
    pg.screenshot(path=f'{OUT}/v21_replay.png')
    pg.click('#btnReplay'); pg.wait_for_timeout(1500)
    # guardado por gráfico + recarga
    pg.wait_for_timeout(800)
    pg.reload(); pg.wait_for_timeout(4500)
    print('tras recargar: aplicados', ev("__tv.cfg.charts[0].scripts.length"), 'versión', ev("__tv.cfg.version"), 'bt', ev("__tv.cfg.bt"),
          'panel visible', pg.locator('#btPanel').is_visible())
    assert ev("__tv.cfg.version") == 11 and pg.locator('#btPanel').is_visible()
    pg.screenshot(path=f'{OUT}/v21_recarga.png')
    # minimizar el panel
    pg.click('#btPanel .bt-btn >> nth=1'); pg.wait_for_timeout(300)
    assert pg.locator('#btPanel .bt-scroll').count() == 0
    pg.screenshot(path=f'{OUT}/v21_minimizado.png')
    # migración desde una configuración de la v0.20 (versión 10, sin 'bt'): scripts y estrategias se conservan
    pg.wait_for_timeout(1000)
    import json, os
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'config.json')
    c = json.load(open(path, encoding='utf8'))
    c['version'] = 10; c.pop('bt', None)
    json.dump(c, open(path, 'w', encoding='utf8'))
    pg2 = ctx.new_page()
    pg2.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg2.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg2.goto('http://127.0.0.1:3111/'); pg2.wait_for_timeout(4500)
    ev2 = pg2.evaluate
    print('migrado v10 -> versión', ev2("__tv.cfg.version"), 'bt', ev2("__tv.cfg.bt"), 'scripts', ev2("__tv.cfg.scripts.length"), 'aplicados', ev2("__tv.cfg.charts[0].scripts.length"),
          'panel visible', pg2.locator('#btPanel').is_visible())
    assert ev2("__tv.cfg.version") == 11 and ev2("__tv.cfg.bt.h") == 260 and pg2.locator('#btPanel').is_visible()
    # configuración sin ninguna estrategia: no hay panel
    ev2("(()=>{const v=__tv.views[0]; v.cfg.scripts=[]; v.refreshScripts(true);})()"); pg2.wait_for_timeout(1500)
    assert not pg2.locator('#btPanel').is_visible()
    print('sin estrategias el panel se oculta: ok')
    print('ERRORES DE CONSOLA:', errs)
    b.close()
