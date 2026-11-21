# Prueba v0.26.24 (Replay conserva el punto al cambiar de temporalidad): TV_MOCK=1 PORT=3111 node server.js
from playwright.sync_api import sync_playwright
import sys
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={'width': 1600, 'height': 950}).new_page()
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.goto('http://127.0.0.1:3111/'); pg.wait_for_timeout(2500)
    ev = pg.evaluate
    def tf(t, w=4000):
        pg.click(f'#tfButtons button:has-text("{t}")'); pg.wait_for_timeout(w)
    def last():
        return ev("(()=>{const v=__tv.views[0];const b=v.bars[v.bars.length-1];return [v.replayState&&1,v.bars.length,b&&b.time,b&&b.high,b&&b.low,b&&b.volume]})()")
    tf('1D')
    pg.click('#btnReplay'); pg.wait_for_timeout(300)
    box = pg.locator('#grid .chart >> nth=0').bounding_box()
    pg.mouse.click(box['x'] + box['width'] * 0.6, box['y'] + 200); pg.wait_for_timeout(600)
    d = last(); print('1D en replay', d, ev("__tv.views[0].replayState"))
    cut = d[2] + 86400
    tf('15m', 6000)
    m = last(); print('15m', m, 'replay activo:', ev("__tv.views[0].replayState"))
    print('  último 15m termina <= fin del día:', m[2] + 900 <= cut, ' y es la última del día:', m[2] + 900 == cut)
    pg.screenshot(path=f'{OUT}/rp_1D_a_15m.png')
    # ida y vuelta: a 1D debe dar vela a medias (si la vela de 1D ya terminó, igual a la original)
    pg.click('.rp-btn[title^="Una vela atr"]'); pg.wait_for_timeout(200)
    pg.click('.rp-btn[title^="Una vela atr"]'); pg.wait_for_timeout(200)
    mid = last(); print('15m dos atrás', mid)
    tf('1D', 6000)
    r = last(); print('1D tras ida y vuelta', r, ev("__tv.views[0].replayState"), pg.inner_text('.rp-info') if pg.locator('.rp-info').count() else '')
    full = ev("(()=>{const v=__tv.views[0];return v.replayState})()"); print('estado', full)
    pg.screenshot(path=f'{OUT}/rp_vuelta_1D.png')
    pg.click('.rp-btn[title^="Una vela adelante"]'); pg.wait_for_timeout(300)
    s = last(); print('1D tras +1 (vela completa)', s)
    # cambio de símbolo/salida
    pg.keyboard.press('Escape'); pg.wait_for_timeout(2500)
    print('tras Esc', ev("__tv.views[0].replayState"), last())
    b.close()
print('ERRORES:', errs)
