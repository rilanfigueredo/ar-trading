# v0.22.4: ejemplo «Swings» con marcas y segmentos (datos simulados)
from playwright.sync_api import sync_playwright
import sys
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={'width': 1600, 'height': 950}).new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:3111/'); pg.wait_for_timeout(3500)
    pg.click('#btnScripts'); pg.wait_for_timeout(400)
    names = pg.locator('.sc-side select option').all_inner_texts()
    idx = [i for i, n in enumerate(names) if 'Swings' in n][0]
    pg.select_option('.sc-side select', index=idx); pg.wait_for_timeout(200)
    pg.click('.sc-btns button >> nth=0'); pg.wait_for_timeout(2500)
    st = pg.inner_text('.sc-status'); print('estado', st); assert 'Funciona' in st
    pg.click('#btnScripts'); pg.wait_for_timeout(800)
    info = pg.evaluate("(()=>{const v=__tv.views[0];const i=v.scriptInfo(v.cfg.scripts[0].uid);return {marks:i.marks?i.marks.length:null, keys:Object.keys(i)}})()")
    print(info)
    pg.screenshot(path=f'{OUT}/v224_swings.png')
    print('ERRORES', errs); assert not errs
    b.close()
