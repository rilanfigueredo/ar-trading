from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1600,'height':950})
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: '+str(e)))
    pg.goto('http://127.0.0.1:3111/'); pg.wait_for_timeout(2500)
    ev=pg.evaluate
    # --- MAs
    pg.click('#btnIndicators'); pg.wait_for_timeout(300)
    print('maOn', ev("__tv.cfg.charts[0].maOn"), 'mas', ev("__tv.cfg.charts[0].mas.map(m=>m.type+m.period+m.color+m.width)"))
    print('ma series before', ev("__tv.views[0].cfg.mas.length"))
    pg.screenshot(path='g1_panel.png')
    # toggle EMA group: first .ind-head in MA section
    heads=pg.locator('#panel .ind-head')
    print('heads', heads.count())
    # EMA head is index 3 (rsi, stoch, pivots, EMA, SMA)
    heads.nth(3).locator('input').check(); pg.wait_for_timeout(500)
    print('maOn', ev("__tv.cfg.charts[0].maOn"))
    pg.screenshot(path='g1_ema.png')
    # RSI + Stoch on
    heads.nth(0).locator('input').check(); pg.wait_for_timeout(500)
    heads.nth(1).locator('input').check(); pg.wait_for_timeout(800)
    print('panes', ev("__tv.views[0].chart ? 1:0"))
    pg.screenshot(path='g1_inds.png')
    # legends buttons
    print('btns', pg.locator('.pane-legend .pl-btn').all_inner_texts())
    b.close()
print(errs)
