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
    for vp, lang in (({'width': 1280, 'height': 860}, 'bn'), ({'width': 390, 'height': 844}, 'bn'), ({'width': 1280, 'height': 860}, 'en'), ({'width': 390, 'height': 844}, 'en')):
        pg = b.new_page(viewport=vp)
        pg.add_init_script(f"try{{localStorage.setItem('rentora_lang','{lang}')}}catch(e){{}}")
        pg.on('pageerror', lambda e: fails.append(f'{pg.url}: {e}'))
        pg.goto(B + 'app.html?demo=owner'); pg.wait_for_selector('.ledger-hero')
        for r in ['property', 'tenants', 'bills', 'bills/utility', 'money', 'reports', 'messages', 'plan', 'settings', 'home']:
            pg.goto(B + 'app.html#' + r); pg.wait_for_timeout(400)
            if pg.locator('#view .empty p:text("লোড হচ্ছে")').count(): fails.append('stuck loading: ' + r)
        pg.click('#fab' if vp['width'] < 900 else '#payBtnTop'); pg.click('dialog [type=submit]'); pg.wait_for_selector('dialog .doc')
        if ('রসিদ' if lang == 'bn' else 'Receipt') not in pg.inner_text('dialog'): fails.append(f'receipt not shown after payment ({lang})')
        if lang == 'en':
            import re
            texts = pg.evaluate("() => [...document.querySelectorAll('nav a, .topbar, .sheet-head, .sheet-foot, .panel-head, .stat, .ledger-hero')].map(e => e.innerText.replace('বাংলা', ''))")
            left = [t for t in texts if re.search('[\u0980-\u09F2\u09F4-\u09FF]', t)]
            if left: fails.append('untranslated text in English mode: ' + left[0][:80])
        pg.close()
    for url, sel in (('tenant.html?demo=tenant', '.ledger-hero'), ('admin.html?demo=admin', '.ledger-hero'), ('index.html', '#authForm')):
        pg = b.new_page(); pg.on('pageerror', lambda e: fails.append(f'{url}: {e}'))
        pg.goto(B + url); pg.wait_for_selector(sel); pg.wait_for_timeout(300); pg.close()
    b.close()
srv.shutdown()
fails = [f for f in fails if 'esm.sh' not in f or __import__('os').environ.get('CI')]  # offline sandbox: the real client loads from esm.sh
print('\n'.join(fails) or 'ok: demo click-through passed')
sys.exit(1 if fails else 0)
