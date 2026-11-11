# Headless click-through of the demo: every screen must render without a script error.
import sys, http.server, threading, functools
from playwright.sync_api import sync_playwright
root = sys.argv[1] if len(sys.argv) > 1 else '.'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8799), functools.partial(type('Quiet', (http.server.SimpleHTTPRequestHandler,), {'log_message': lambda *a: None}), directory=root))
threading.Thread(target=srv.serve_forever, daemon=True).start()
B = 'http://127.0.0.1:8799/'
fails = []
with sync_playwright() as p:
    b = p.chromium.launch(**({"executable_path": __import__("os").environ["CHROME"], "args": ["--no-sandbox"]} if __import__("os").environ.get("CHROME") else {}))
    for vp in ({'width': 1280, 'height': 860}, {'width': 390, 'height': 844}):
        pg = b.new_page(viewport=vp)
        pg.on('pageerror', lambda e: fails.append(f'{pg.url}: {e}'))
        pg.goto(B + 'app.html?demo=owner'); pg.wait_for_selector('.ledger-hero')
        for r in ['property', 'tenants', 'bills', 'bills/utility', 'money', 'messages', 'plan', 'settings', 'home']:
            pg.goto(B + 'app.html#' + r); pg.wait_for_timeout(400)
            if pg.locator('#view .empty p:text("লোড হচ্ছে")').count(): fails.append('stuck loading: ' + r)
        pg.click('#fab' if vp['width'] < 900 else '#payBtnTop'); pg.click('dialog [type=submit]'); pg.wait_for_selector('dialog .doc')
        if 'রসিদ' not in pg.inner_text('dialog'): fails.append('receipt not shown after payment')
        pg.close()
    for url, sel in (('tenant.html?demo=tenant', '.ledger-hero'), ('admin.html?demo=admin', '.ledger-hero'), ('index.html', '#authForm')):
        pg = b.new_page(); pg.on('pageerror', lambda e: fails.append(f'{url}: {e}'))
        pg.goto(B + url); pg.wait_for_selector(sel); pg.wait_for_timeout(300); pg.close()
    b.close()
srv.shutdown()
print('\n'.join(fails) or 'ok: demo click-through passed')
sys.exit(1 if fails else 0)
