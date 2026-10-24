# v0.22.2: autonomía de pestañas (temporalidades, dibujo) y botón de pantalla completa. Datos simulados.
from playwright.sync_api import sync_playwright
import sys
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--enable-features=FullscreenPopupWindows'])
    pg = b.new_context(viewport={'width': 1600, 'height': 950}).new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:3111/'); pg.wait_for_timeout(3000)
    ev = pg.evaluate
    base = ev("__tv.cfg.tfs.length")
    # quitar una temporalidad en la pestaña 1 (clic derecho sobre el botón 1m si hay menú) -> se simula por la config
    ev("(()=>{__tv.cfg.tfs=__tv.cfg.tfs.filter(t=>t!=='m:1');})()")
    pg.click('#tfButtons >> text=1h'); pg.wait_for_timeout(1500)
    pg.reload(); pg.wait_for_timeout(2500)
    t1 = ev("__tv.cfg.tfs.slice()")
    assert 'm:1' not in t1 and ev("TVApi.windowId") == 'w1', t1
    pg.click('#tabBar .tab-new'); pg.wait_for_load_state(); pg.wait_for_timeout(3000)
    t2 = ev("__tv.cfg.tfs.slice()")
    print('pestaña 2 tfs', t2)
    assert ev("TVApi.windowId") == 'w2' and 'm:1' in t2     # la nueva pestaña empieza con las temporalidades de siempre
    ev("(()=>{__tv.cfg.tfs.push('m:45');})()")
    pg.click('#tfButtons >> text=1h'); pg.wait_for_timeout(1500)
    pg.locator('#tabBar .tab').first.click(); pg.wait_for_load_state(); pg.wait_for_timeout(3000)
    t1b = ev("__tv.cfg.tfs.slice()")
    assert 'm:45' not in t1b and 'm:1' not in t1b, t1b       # la pestaña 1 no cambió con lo de la 2
    # pantalla completa
    assert pg.locator('.fs-btn').count() == 1 and pg.locator('.fs-btn').is_visible()
    cam = pg.locator('.cam-btn').bounding_box(); fs = pg.locator('.fs-btn').bounding_box()
    print('cam', cam, 'fs', fs); assert fs['y'] > cam['y'] + cam['height'] - 1 and abs(fs['x'] - cam['x']) < 2
    pg.click('.fs-btn'); pg.wait_for_timeout(600)
    on = ev("!!document.fullscreenElement"); print('pantalla completa', on)
    if on:
        assert pg.locator('.fs-btn').inner_text() == '⤓'
        pg.screenshot(path=f'{OUT}/v222_full.png')
        pg.click('.fs-btn'); pg.wait_for_timeout(500); assert not ev("!!document.fullscreenElement")
    print('ERRORES', errs); b.close()
