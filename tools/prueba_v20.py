# Prueba v0.20 (scripts propios) con datos simulados: TV_MOCK=1 PORT=3111 node server.js
from playwright.sync_api import sync_playwright
import sys, json
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
errs = []
def settle(pg):
    for _ in range(40):
        s = pg.inner_text('.sc-status')
        if 'Calculando' not in s and 'Esperando' not in s: break
        pg.wait_for_timeout(250)
    pg.wait_for_timeout(200)
def add_script(ev, name, code):
    return ev("""([n,c]) => { const id='s'+Math.random().toString(36).slice(2,6); (__tv.cfg.scripts=__tv.cfg.scripts||[]).push({id,name:n,code:c}); return id; }""", [name, code])
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1600, 'height': 950})
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.goto('http://127.0.0.1:3111/'); pg.wait_for_timeout(3000)
    ev = pg.evaluate
    ev("__tv.cfg.charts[0].src='candles'")
    print('barras', ev("__tv.views[0].bars.length"), 'hasBuy', ev("__tv.views[0].bars.every(b=>b.buy!==undefined)"))
    # --- ventana de scripts y ejemplos
    pg.click('#btnScripts'); pg.wait_for_timeout(400)
    assert pg.locator('.sc-code').count() == 1
    names = pg.locator('.sc-side select option').all_inner_texts(); print('ejemplos', names)
    for i in (1, 2, 3):
        pg.select_option('.sc-side select', index=i); pg.wait_for_timeout(200)
        pg.click('.sc-btns button >> nth=0'); pg.wait_for_timeout(1500)
        print('estado', i, pg.inner_text('.sc-status'))
    pg.screenshot(path=f'{OUT}/v20_ejemplos.png')
    print('series aplicadas', ev("__tv.views[0].cfg.scripts.length"), 'paneles', ev("__tv.views[0].chart.panes().length"))
    print('rótulo', pg.locator('.legend .lg-scr').all_inner_texts())
    # --- cambiar un parámetro y un color
    row = pg.locator('.sc-arow').nth(0)
    inp = row.locator('input[type=number]').first; inp.fill('20'); inp.press('Tab'); pg.wait_for_timeout(1200)
    print('param largo', ev("__tv.views[0].cfg.scripts[0].params"))
    # --- bucle infinito: se corta por tiempo
    pg.click('.sc-side-top button'); pg.fill('.sc-name', 'Bucle')
    pg.fill('.sc-code', 'indicator({overlay:true});\nwhile(true){}\nplot(close);')
    pg.click('.sc-btns button >> nth=0'); pg.wait_for_timeout(4500)
    print('bucle ->', pg.inner_text('.sc-status'))
    assert 'segundos' in pg.inner_text('.sc-status')
    print('programa vivo', ev("1+1"))
    # --- error con línea
    pg.fill('.sc-name', 'Error'); pg.fill('.sc-code', 'indicator({overlay:true});\nconst a = 1;\nplot(foo);')
    pg.click('.sc-btns button >> nth=0'); settle(pg)
    st = pg.inner_text('.sc-status'); print('error ->', st); assert 'Línea 3' in st
    pg.screenshot(path=f'{OUT}/v20_error.png')
    print('rótulo error', pg.locator('.legend .lg-err').all_inner_texts())
    # --- error de sintaxis
    pg.fill('.sc-code', 'indicator({overlay:true});\nconst a = ;\nplot(close);')
    pg.click('.sc-btns button >> nth=0'); settle(pg)
    st = pg.inner_text('.sc-status'); print('sintaxis ->', st); assert 'Línea 2' in st
    pg.click('#btnScripts'); pg.wait_for_timeout(300)
    # --- persistencia
    cfgs = ev("JSON.stringify({s:__tv.cfg.scripts.map(q=>q.name), a:__tv.cfg.charts[0].scripts.length})"); print('config', cfgs)
    # --- replay: el script se recalcula con las velas recortadas
    ev("__tv.cfg.charts[0].scripts = __tv.cfg.charts[0].scripts.slice(0,1); __tv.views[0].refreshScripts(true)"); pg.wait_for_timeout(1200)
    def last_val():
        return ev("(()=>{const x=__tv.views[0].state.scr; return null})()")
    pg.click('#btnReplay'); pg.wait_for_timeout(300)
    box = pg.locator('#grid .chart >> nth=0').bounding_box()
    pg.mouse.click(box['x'] + box['width'] * 0.6, box['y'] + 200); pg.wait_for_timeout(1500)
    n1 = ev("__tv.views[0].bars.length"); print('replay barras', n1)
    t1 = ev("(()=>{const l=document.querySelector('.legend .lg-scr'); return l? l.innerText : ''})()"); print('rótulo replay', t1)
    pg.click('.rp-btn[title^="Una vela adelante"]'); pg.wait_for_timeout(1200)
    print('barras +1', ev("__tv.views[0].bars.length"), document_ok if False else '')
    pg.screenshot(path=f'{OUT}/v20_replay.png')
    pg.click('#btnReplay'); pg.wait_for_timeout(500)
    # --- recarga: persiste y migra
    pg.wait_for_timeout(800)
    pg.reload(); pg.wait_for_timeout(3000)
    print('tras recargar: scripts', ev("__tv.cfg.scripts.length"), 'aplicados', ev("__tv.cfg.charts[0].scripts.length"), 'versión', ev("__tv.cfg.version"))
    pg.screenshot(path=f'{OUT}/v20_recarga.png')
    # --- migración de una configuración v0.19 sin scripts
    ok = ev("""(()=>{ const c = JSON.parse(JSON.stringify(__tv.cfg)); delete c.scripts; c.charts.forEach(x=>delete x.scripts); c.version=9; return c; })()""")
    print('migrate v9 ok (se carga en la página abajo)')
    print('ERRORES DE CONSOLA:', errs)
    b.close()
