# Prueba v0.19 (captura + reproducción) con datos simulados: TV_MOCK=1 PORT=3111 node server.js
from playwright.sync_api import sync_playwright
import sys
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1600, 'height': 950}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.goto('http://127.0.0.1:3111/'); pg.wait_for_timeout(2500)
    ev = pg.evaluate
    # indicadores para ver paneles en la captura
    ev("__tv.cfg.charts[0].src='candles'")
    pg.click('#btnIndicators'); pg.wait_for_timeout(300)
    pg.locator('#panel .ind-head').nth(0).locator('input').check(); pg.wait_for_timeout(800)
    pg.click('#btnIndicators'); pg.wait_for_timeout(300)
    # --- captura
    pg.click('.cam-btn >> nth=0'); pg.wait_for_timeout(200)
    with pg.expect_download() as d:
        pg.click('.ctx-menu >> text=Guardar imagen')
    dl = d.value
    path = f'{OUT}/captura_prueba.png'; dl.save_as(path)
    print('descarga', dl.suggested_filename)
    pg.wait_for_timeout(300)
    print('toast', pg.locator('.toast').all_inner_texts())
    pg.click('#tfButtons button:has-text("1h")'); pg.wait_for_timeout(6000)
    # --- replay
    n0 = ev("__tv.views[0].bars.length")
    pg.click('#btnReplay'); pg.wait_for_timeout(300)
    print('estado', ev("__tv.views[0].replayState"), pg.inner_text('#btnReplay'))
    box = pg.locator('#grid .chart >> nth=0').bounding_box()
    pg.mouse.click(box['x'] + box['width'] * 0.8, box['y'] + 200); pg.wait_for_timeout(600)
    n1 = ev("__tv.views[0].bars.length")
    print('barras antes', n0, 'tras elegir', n1, ev("__tv.views[0].replayState"))
    pg.screenshot(path=f'{OUT}/replay_inicio.png')
    pg.click('.rp-btn[title^="Una vela adelante"]'); pg.wait_for_timeout(200)
    print('paso +1', ev("__tv.views[0].bars.length"))
    pg.click('.rp-btn[title^="Una vela atr"]'); pg.wait_for_timeout(200)
    print('paso -1', ev("__tv.views[0].bars.length"))
    pg.select_option('.rp-speed', '10')
    pg.click('.rp-btn[title^="Reproducir"]'); pg.wait_for_timeout(2500)
    print('tras play 2,5 s a 10/s', ev("__tv.views[0].bars.length"))
    pg.screenshot(path=f'{OUT}/replay_play.png')
    pg.keyboard.press(' '); pg.wait_for_timeout(300)
    k = ev("__tv.views[0].bars.length"); pg.wait_for_timeout(600)
    print('pausa estable', k == ev("__tv.views[0].bars.length"))
    # RSI coherente: último valor del RSI debe corresponder a la última vela visible (panel existe)
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(200)
    print('flecha der', ev("__tv.views[0].bars.length"))
    # salir
    pg.click('.rp-btn[title^="Salir"]'); pg.wait_for_timeout(2500)
    print('salida', ev("__tv.views[0].replayState"), ev("__tv.views[0].bars.length"), ev("__tv.views[0].status"), pg.inner_text('#btnReplay'))
    # cambiar de temporalidad en pleno replay sale solo
    pg.click('#btnReplay'); pg.mouse.click(box['x'] + box['width'] * 0.5, box['y'] + 200); pg.wait_for_timeout(500)
    pg.click('#tfButtons button:has-text("4h")'); pg.wait_for_timeout(2500)
    print('cambio tf', ev("__tv.views[0].replayState"), ev("__tv.views[0].status"))
    b.close()
print('ERRORES:', errs)
