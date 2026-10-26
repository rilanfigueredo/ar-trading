# v0.22.5: pestañas vivas (sin recargar), gráfico ampliado por pestaña, zoom con rueda. Datos simulados.
from playwright.sync_api import sync_playwright
import sys, time
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={'width': 1600, 'height': 950}).new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:3111/'); pg.wait_for_timeout(3500)
    ev = pg.evaluate
    ev("window.__marca = 12345")
    # rueda en un gráfico recién abierto: zoom solo horizontal, el rango de precios no se mueve
    rng = "(()=>{const v=__tv.views[0];const r=v.state.series.priceScale().getVisibleRange();const l=v.chart.timeScale().getVisibleLogicalRange();return [r.from,r.to,l.to-l.from]})()"
    r0 = ev(rng); pg.mouse.move(700, 450)
    for _ in range(3): pg.mouse.wheel(0, -300); pg.wait_for_timeout(150)
    r1 = ev(rng); print('rueda: precio', r0[:2], '->', r1[:2], '| velas visibles', round(r0[2]), '->', round(r1[2]))
    assert abs(r0[0] - r1[0]) < 1e-6 and abs(r0[1] - r1[1]) < 1e-6 and r1[2] < r0[2]
    assert ev("__tv.views[0].state.series.priceScale().options().autoScale") is False
    def wait_tab(i):
        for _ in range(80):
            if ev("__tv.tabId") == i: return
            pg.wait_for_timeout(25)
        raise AssertionError('no cambió a ' + i)
    def layout(label_text):
        pg.click('#btnLayout'); pg.wait_for_timeout(200)
        pg.locator('.lay-opt', has_text=label_text).first.click(); pg.wait_for_timeout(1200)
    def opts():
        return pg.locator('.lay-opt span').all_inner_texts()
    pg.click('#btnLayout'); pg.wait_for_timeout(200); labels = opts(); print('diseños', labels); pg.keyboard.press('Escape'); pg.click('#modal .btn', no_wait_after=True) if False else None
    pg.wait_for_timeout(200)
    # pestaña 1: 3 gráficos, ampliar el 2.º
    pg.evaluate("document.querySelectorAll('.lay-opt').length")
    pg.mouse.click(5, 5)
    layout(labels[1])
    n1 = ev("__tv.views.length"); print('pestaña 1 gráficos', n1)
    pg.locator('#grid:not(.tab-off) .max-btn:not(.cam-btn):not(.fs-btn)').nth(1).click(); pg.wait_for_timeout(500)
    assert ev("__tv.max") == 1 and ev("__tv.cfg.max") == 1
    # pestaña 2: otro diseño, ampliar el 1.º
    pg.click('#tabBar .tab-new'); pg.wait_for_timeout(3500)
    assert ev("window.__marca") == 12345, 'la página se recargó'
    assert ev("__tv.tabId") == 'w2' and ev("__tv.views.length") == 1
    layout(labels[3]); n2 = ev("__tv.views.length"); print('pestaña 2 gráficos', n2); assert n2 == 2
    pg.locator('#grid:not(.tab-off) .max-btn:not(.cam-btn):not(.fs-btn)').nth(0).click(); pg.wait_for_timeout(500)
    assert ev("__tv.max") == 0
    ids = ev("__tv.views.map(v=>v.cfg.tf)")
    vref = ev("(window.__v2 = __tv.views[0], 1)")
    # volver y cambiar entre pestañas varias veces: no hay recarga ni reseteo
    ms = []
    for k in range(4):
        t0 = time.time(); pg.locator('#tabBar .tab').nth(0).click(); wait_tab('w1'); ms.append(round((time.time() - t0) * 1000))
        assert ev("window.__marca") == 12345 and ev("__tv.max") == 1 and ev("__tv.views.length") == n1, 'pestaña 1 cambió'
        assert pg.locator('#grid:not(.tab-off) .cell.maxed').count() == 1
        t0 = time.time(); pg.locator('#tabBar .tab').nth(1).click(); wait_tab('w2'); ms.append(round((time.time() - t0) * 1000))
        assert ev("__tv.max") == 0 and ev("__tv.views.length") == n2, 'pestaña 2 cambió'
        assert ev("__tv.views[0] === window.__v2"), 'se recrearon los gráficos'
    print('ms por cambio', ms); assert max(ms) < 800
    # solo se ve la pestaña activa y cada gráfico oculto conserva su tamaño
    vis = ev("[...document.querySelectorAll('#gridStack > #grid')].map(g=>[g.classList.contains('tab-off'), g.getBoundingClientRect().width|0])")
    print('grids', vis); assert sorted(v[0] for v in vis) == [False, True] and vis[0][1] == vis[1][1]
    pg.screenshot(path=f'{OUT}/v225_tab2.png')
    # se guarda por pestaña: recargar el programa conserva todo (pestaña 2 activa)
    pg.wait_for_timeout(900)
    pg.reload(); pg.wait_for_timeout(3500)
    print('tras recargar: pestaña', ev("__tv.tabId"), 'max', ev("__tv.max"), 'gráficos', ev("__tv.views.length"))
    assert ev("__tv.tabId") == 'w2' and ev("__tv.max") == 0
    pg.locator('#tabBar .tab').nth(0).click(); wait_tab('w1'); pg.wait_for_timeout(1500)
    assert ev("__tv.max") == 1 and ev("__tv.views.length") == n1
    # cerrar la pestaña activa pasa a otra y borra sus gráficos
    pg.once('dialog', lambda d: d.accept())
    pg.locator('#tabBar .tab.cur .tab-x').click(); pg.wait_for_timeout(1500)
    assert pg.locator('#tabBar .tab').count() == 1 and ev("document.querySelectorAll('#gridStack > #grid').length") == 1
    print('ERRORES', errs); assert not errs
    b.close()
