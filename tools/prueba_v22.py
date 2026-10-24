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
    # --- ventana nueva desde el menú
    w1.click('#btnWin'); w1.wait_for_timeout(400)
    print('menú ventanas:', w1.inner_text('#winList').replace('\n', ' | ')[:200])
    with ctx.expect_page() as pi:
        w1.click('#winList .dd-new')
    w2 = pi.value; watch(w2, 'w2'); w2.wait_for_load_state(); w2.wait_for_timeout(3500)
    ev2 = w2.evaluate
    print('w2 id', ev2("TVApi.windowId"), 'símbolo', ev2("__tv.cfg.charts[0].symbol"), 'tf', ev2("__tv.cfg.charts[0].tf"), 'tipo', ev2("__tv.cfg.charts[0].chartType"), 'layout', ev2("__tv.cfg.layout"), 'etiqueta', w2.inner_text('#winLabel'), 'título', w2.title())
    assert ev2("TVApi.windowId") == 'w2' and ev2("__tv.cfg.charts[0].symbol") == 'BTCUSDT' and ev2("__tv.cfg.charts[0].tf") == 'm:60' and ev2("__tv.cfg.layout") == '1'
    assert ev2("__tv.cfg.charts[0].chartType") == 'candles'          # gráfico limpio: no hereda lo de w1
    assert ev2("__tv.cfg.templates.length") == 1                       # lo compartido sí
    # --- w2: su propia temporalidad y tipo; w1 no cambia
    w2.click('#tfButtons >> text=1D'); w2.wait_for_timeout(1500)
    w2.click('#typeCur'); w2.click('#typeButtons [data-type=area]'); w2.wait_for_timeout(300)
    assert ev2("__tv.cfg.charts[0].tf") == 'd:1' and ev1("__tv.cfg.charts[0].tf") == 'm:240' and ev1("__tv.cfg.charts[0].chartType") == 'line'
    # --- cargar diseño en w2 (la plantilla se guardó en w1: llega por aviso entre ventanas)
    w2.click('#btnTpl'); w2.wait_for_timeout(300)
    print('menú diseños:', w2.inner_text('#tplList').replace('\n', ' | ')[:160])
    assert 'Mi diseño' in w2.inner_text('#tplList')
    w2.click('#tplList .dd-row >> text=Aquí'); w2.wait_for_timeout(800)
    assert ev2("__tv.cfg.charts[0].chartType") == 'line' and ev2("__tv.cfg.charts[0].tf") == 'd:1'   # cambia el estilo, no la temporalidad
    w2.screenshot(path=f'{OUT}/v22_w2.png')
    # --- tema compartido: se cambia en w1 y llega a w2
    ev1("(()=>{ __tv.cfg.theme='light'; })()")
    w1.click('#btnSettings'); w1.wait_for_timeout(300)
    sel = w1.locator('#modalBox select').first
    print('selects de ajustes', w1.locator('#modalBox select').all_inner_texts()[:3])
    w1.click('#btnSettings'); w1.wait_for_timeout(200)
    # --- guardado por ventana: recargar cada una
    w1.wait_for_timeout(800); w2.wait_for_timeout(800)
    w2.reload(); w2.wait_for_timeout(3500); w1.reload(); w1.wait_for_timeout(3500)
    print('tras recargar -> w1 tf', ev1("__tv.cfg.charts[0].tf"), ev1("__tv.cfg.charts[0].chartType"), '| w2 tf', ev2("__tv.cfg.charts[0].tf"), ev2("__tv.cfg.charts[0].chartType"))
    assert ev1("__tv.cfg.charts[0].tf") == 'm:240' and ev2("__tv.cfg.charts[0].tf") == 'd:1'
    # --- hasta 10 ventanas
    pages = [w1, w2]
    for i in range(8):
        w1.click('#btnWin'); w1.wait_for_timeout(250)
        with ctx.expect_page() as pi:
            w1.click('#winList .dd-new')
        pg = pi.value; watch(pg, f'w{len(pages)+1}'); pages.append(pg)
        w1.wait_for_timeout(200)
    print('ventanas abiertas', len(pages), ev1("TVApi.listWindows()") if False else '')
    w1.click('#btnWin'); w1.wait_for_timeout(300)
    print('con 10:', w1.inner_text('#winList').split('\n')[0], '| botón nueva desactivado:', w1.locator('#winList .dd-new').is_disabled())
    assert w1.locator('#winList .dd-new').is_disabled()
    r = ev1("TVApi.openWindow()")
    print('abrir la 11 ->', r); assert r['ok'] is False
    w1.screenshot(path=f'{OUT}/v22_diez.png')
    # --- olvidar una ventana libera un lugar
    w1.locator('#winList .dd-row', has_text='Ventana 10').locator('text=Olvidar').click(); w1.wait_for_timeout(500)
    ids = ev1("TVApi.listWindows()"); print('ids tras olvidar', ids); assert len(ids) == 9 and 'w10' not in ids
    for pg in pages[2:]: pg.close()
    print('ERRORES DE CONSOLA:', errs)
    b.close()
