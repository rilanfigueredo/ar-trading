# Prueba v0.22 (ventanas nuevas, menús, colores, fechas al futuro) con datos simulados.
# Arrancar antes: TV_MOCK=1 PORT=3111 node server.js (con la carpeta data vacía para una prueba limpia)
from playwright.sync_api import sync_playwright
import sys, json, os
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
errs = []
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
def watch(pg, tag):
    pg.on('console', lambda m: errs.append(f'{tag} {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append(f'{tag} pageerror: {e}'))
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1600, 'height': 950})
    w1 = ctx.new_page(); watch(w1, 'w1')
    w1.goto('http://127.0.0.1:3111/'); w1.wait_for_timeout(3000)
    ev1 = w1.evaluate
    assert ev1("__tv.cfg.version") == 11 or ev1("__tv.cfg.version") >= 11
    # --- colores y botones de la barra
    css = ev1("""(()=>{const g=(s)=>{const e=document.querySelector(s); const c=getComputedStyle(e); return [c.borderTopColor, c.color, c.borderTopWidth]}; return {sym:g('#btnSymbol'), replay:g('#btnReplay'), scripts:g('#btnScripts'), datos:g('#btnData'), ajustes:g('#btnSettings'), bg:getComputedStyle(document.body).backgroundColor}})()""")
    print('estilos', css)
    assert css['sym'][0] == 'rgb(254, 153, 0)' and css['sym'][1] == 'rgb(254, 153, 0)'
    assert css['replay'][0] == 'rgb(41, 98, 255)' and css['bg'] == 'rgb(10, 16, 42)'
    w1.click('#btnScripts'); w1.wait_for_timeout(300)
    on = ev1("getComputedStyle(document.querySelector('#btnScripts')).borderTopColor")
    print('Scripts abierto ->', on); assert on == 'rgb(0, 229, 238)'
    w1.click('#btnScripts'); w1.wait_for_timeout(200)
    # --- menú desplegable de tipo de gráfico y escala
    assert not w1.locator('#typeButtons').is_visible()
    w1.click('#typeCur'); assert w1.locator('#typeButtons').is_visible()
    w1.click('#typeButtons [data-type=line]'); w1.wait_for_timeout(300)
    assert ev1("__tv.cfg.charts[0].chartType") == 'line' and not w1.locator('#typeButtons').is_visible()
    w1.click('#scaleCur'); w1.click('#scaleButtons [data-scale=log]'); w1.wait_for_timeout(300)
    assert ev1("__tv.cfg.charts[0].scale") == 'log'
    w1.click('#scaleCur'); w1.click('#scaleButtons [data-scale=normal]'); w1.wait_for_timeout(300)
    # --- w1: temporalidad 4h y plantilla guardada ("diseño")
    w1.click('#tfButtons >> text=4h'); w1.wait_for_timeout(1500)
    assert ev1("__tv.cfg.charts[0].tf") == 'm:240'
    w1.click('#btnSettings'); w1.wait_for_timeout(400)
    w1.fill('.tpl-name', 'Mi diseño'); w1.click('text=Guardar este gráfico como plantilla'); w1.wait_for_timeout(500)
    assert ev1("__tv.cfg.templates.map(t=>t.name)") == ['Mi diseño'], ev1("__tv.cfg.templates.length")
    w1.click('#btnSettings'); w1.wait_for_timeout(300)
    # --- pestañas: una sola ventana, "+" crea otra y la barra permite cambiar
    assert w1.locator('#tabBar .tab').count() == 1
    w1.click('#tabBar .tab-new'); w1.wait_for_load_state(); w1.wait_for_timeout(3500)
    ev1 = w1.evaluate
    print('url', w1.url, 'pestañas', w1.locator('#tabBar .tab').all_inner_texts())
    assert ev1("TVApi.windowId") == 'w2' and w1.locator('#tabBar .tab').count() == 2
    assert ev1("__tv.cfg.charts[0].symbol") == 'BTCUSDT' and ev1("__tv.cfg.charts[0].tf") == 'm:60' and ev1("__tv.cfg.charts[0].chartType") == 'candles'
    assert ev1("__tv.cfg.templates.length") == 1                       # lo compartido sí
    w1.click('#tfButtons >> text=1D'); w1.wait_for_timeout(1200)
    w1.click('#typeCur'); w1.click('#typeButtons [data-type=area]'); w1.wait_for_timeout(300)
    assert ev1("__tv.cfg.charts[0].tf") == 'd:1'
    assert 'BTCUSDT · 1D' in w1.locator('#tabBar .tab.cur').inner_text()
    # cargar diseño (plantilla guardada en la pestaña 1)
    w1.click('#btnTpl'); w1.wait_for_timeout(300)
    assert 'Mi diseño' in w1.inner_text('#tplList')
    w1.click('#tplList .dd-row >> text=Aquí'); w1.wait_for_timeout(800)
    assert ev1("__tv.cfg.charts[0].chartType") == 'line' and ev1("__tv.cfg.charts[0].tf") == 'd:1'
    w1.screenshot(path=f'{OUT}/v22_tab2.png')
    # volver a la pestaña 1: conserva lo suyo (4h, línea)
    w1.locator('#tabBar .tab').first.click(); w1.wait_for_load_state(); w1.wait_for_timeout(3500)
    assert ev1("TVApi.windowId") == 'w1' and ev1("__tv.cfg.charts[0].tf") == 'm:240' and ev1("__tv.cfg.charts[0].chartType") == 'line'
    # la pestaña activa se recuerda al abrir sin ?w=
    w1.locator('#tabBar .tab').nth(1).click(); w1.wait_for_load_state(); w1.wait_for_timeout(3000)
    w1.goto('http://127.0.0.1:3111/'); w1.wait_for_timeout(3000)
    assert ev1("TVApi.windowId") == 'w2', ev1("TVApi.windowId")
    # hasta 10 pestañas
    for i in range(8):
        w1.click('#tabBar .tab-new'); w1.wait_for_load_state(); w1.wait_for_timeout(1500)
    assert w1.locator('#tabBar .tab').count() == 10 and w1.locator('#tabBar .tab-new').is_disabled()
    print('10 pestañas:', w1.locator('#tabBar .tab').all_inner_texts())
    w1.screenshot(path=f'{OUT}/v22_diez.png')
    # cerrar la actual (con confirmación) pasa a otra
    w1.once('dialog', lambda d: d.accept())
    w1.locator('#tabBar .tab.cur .tab-x').click(); w1.wait_for_load_state(); w1.wait_for_timeout(3000)
    assert w1.locator('#tabBar .tab').count() == 9 and not w1.locator('#tabBar .tab-new').is_disabled()
    print('tras cerrar:', ev1("TVApi.windowId"))
    print('ERRORES DE CONSOLA:', errs)
    b.close()
