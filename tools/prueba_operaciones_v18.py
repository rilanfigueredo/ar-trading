# Prueba v0.18 con datos simulados (servidor: TV_MOCK=1 PORT=3111 node server.js). Capturas en /tmp/claude-0/shots
from playwright.sync_api import sync_playwright
import sys
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1600, 'height': 950})
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.goto('http://127.0.0.1:3111/'); pg.wait_for_timeout(2500)
    ev = pg.evaluate
    print('boton', pg.inner_text('#btnData'))
    pg.click('#btnData'); pg.wait_for_timeout(400)
    pg.screenshot(path=f'{OUT}/v18_modal_velas.png')
    pg.select_option('#modalBox select >> nth=0', 'trades'); pg.wait_for_timeout(300)
    pg.click('#modalBox button:has-text("Aplicar")')
    pg.wait_for_timeout(15000)
    print('estado', ev("__tv.views[0].status"))
    print('barras', ev("__tv.views[0].bars.length"), 'ultima', ev("__tv.views[0].bars.slice(-1)[0]"))
    print('src', ev("__tv.cfg.charts[0].src"))
    pg.screenshot(path=f'{OUT}/v18_operaciones.png')
    # delta + cvd
    pg.keyboard.press('Escape')
    pg.click('#btnIndicators'); pg.wait_for_timeout(400)
    pg.screenshot(path=f'{OUT}/v18_panel_ind.png')
    print(pg.locator('#panel .ind-head').all_inner_texts())
    b.close()
print('ERRORES:', errs)
