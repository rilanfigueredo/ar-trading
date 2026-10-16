from playwright.sync_api import sync_playwright
import time
errs=[]; reqs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1600,'height':950})
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: '+str(e)))
    pg.on('request', lambda r: reqs.append(r.url) if '/api/klines' in r.url else None)
    pg.goto('http://127.0.0.1:3111/'); pg.wait_for_timeout(1500)
    pg.evaluate("(()=>{__tv.cfg.charts[0].tf='s:15'; })()")
    pg.reload(); pg.wait_for_timeout(8000)
    # simulate scrolling back repeatedly
    for i in range(4):
        n0=pg.evaluate("__tv.views[0].bars.length"); reqs.clear(); t=time.time()
        pg.evaluate("(()=>{const v=__tv.views[0]; v.chart.timeScale().setVisibleLogicalRange({from:-50-"+str(i)+",to:100});})()")
        pg.wait_for_timeout(1500)
        print(i,'bars',n0,'->',pg.evaluate("__tv.views[0].bars.length"),'in',round(time.time()-t,2),'s reqs',len(reqs))
        pg.wait_for_timeout(300)
    print('ok sorted', pg.evaluate("(()=>{const b=__tv.views[0].bars;return b.every((x,i)=>i==0||x.time>b[i-1].time)})()"))
    b.close()
print(errs)
