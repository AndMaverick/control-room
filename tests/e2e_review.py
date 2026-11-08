"""Private Architecture Review journey. Run from the repo root with a static server on :8765 and node_modules beside it
(the Python runtime and fonts are served from node_modules, standing in for the CDN)."""
import asyncio, mimetypes, pathlib, re, urllib.parse
from playwright.async_api import async_playwright
NM = pathlib.Path("node_modules")
BASE = "http://localhost:8765/"

async def route_cdn(route):
    u = route.request.url
    m = re.match(r"https://cdn.jsdelivr.net/pyodide/v0.26.4/full/(.+)", u)
    if m and (NM/"pyodide"/m.group(1)).exists():
        f = NM/"pyodide"/m.group(1)
        ct = "application/wasm" if f.suffix == ".wasm" else (mimetypes.guess_type(f.name)[0] or "application/octet-stream")
        return await route.fulfill(body=f.read_bytes(), headers={"content-type": ct, "access-control-allow-origin": "*"})
    m = re.match(r"https://cdn.jsdelivr.net/npm/@fontsource/([^@]+)@5.3.0/files/(.+)", u)
    if m:
        return await route.fulfill(body=(NM/"@fontsource"/m.group(1)/"files"/m.group(2)).read_bytes(), headers={"content-type": "font/woff2", "access-control-allow-origin": "*"})
    await route.abort()

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond: raise SystemExit(1)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}); await ctx.add_init_script("window.CR_INQUIRY_ENDPOINT = '';")
        await ctx.route("https://cdn.jsdelivr.net/**", route_cdn)
        await ctx.route("https://www.googletagmanager.com/**", lambda r: r.fulfill(status=200, body="window.__gtm=1;", content_type="text/javascript"))
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE + "index.html?utm_source=github&utm_medium=profile&utm_campaign=controlroom")
        await pg.wait_for_selector("#loader.ok", timeout=90000)
        await pg.click('.scn[data-key="sovereign"]'); await pg.wait_for_function("!document.querySelector('#break').disabled")
        await pg.click("#break"); await pg.wait_for_selector("#incident .reveal"); await pg.click("#skip")
        await pg.wait_for_selector("#findings:not([hidden])")
        await pg.evaluate("document.querySelector('#cards article .links a').addEventListener('click',e=>e.preventDefault())")
        await pg.click("#cards article .links a")
        await pg.click("#conclude"); await pg.wait_for_selector("#f3.in", timeout=9000)
        check(await pg.is_visible("#cta-review"), "finale shows the principal invitation")
        check(await pg.is_visible("#cta-site"), "Explore AndMaverick remains a secondary path")
        await pg.click("#cta-review"); await pg.wait_for_selector("dialog.par[open]")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300)
        check(await pg.is_visible("#curtain"), "Escape closes the dialog but not the finale")
        await pg.click("#cta-review"); await pg.wait_for_selector("dialog.par[open]")
        await pg.click("#par-f button[type=submit]")
        check(await pg.is_visible("#par-f"), "empty form is blocked")
        await pg.fill("#par-name", "Test Person"); await pg.fill("#par-email", "not-an-email"); await pg.fill("#par-org", "Example Ministry")
        await pg.select_option("#par-ch", "Sovereign AI and data residency"); await pg.fill("#par-goal", "Keep citizen data in country.")
        await pg.select_option("#par-scale", "$5 million to $25 million")
        await pg.click("#par-f button[type=submit]")
        check(await pg.is_visible("#par-f"), "invalid email is blocked")
        await pg.fill("#par-email", "test@example.gov")
        prev = await pg.text_content("#par-preview")
        check("Sovereign Government AI Program" in prev and "github / profile / controlroom" in prev, "preview shows environment and referral")
        check("guard.rails (source code)" in prev or "(source code)" in prev, "preview shows inspected tool")
        check("Million Dollar Question: not used" in prev, "MDQ not used when unvisited")
        await pg.evaluate("document.addEventListener('click',e=>{const a=e.target.closest('#par-mail');if(a){e.preventDefault();window.__href=a.href}},true)")
        await pg.click("#par-f button[type=submit]"); await pg.wait_for_selector("#par-done:not([hidden])")
        href = await pg.evaluate("window.__href")
        check(href.startswith("mailto:andrew@andmaverick.com?subject="), "mailto goes to the published address")
        body = urllib.parse.unquote(href.split("body=")[1])
        for needle in ["PAR-", "Name: Test Person", "Work email: test@example.gov", "Example Ministry", "5 million to $25 million", "budget, not a fee", "Simulation completed: yes", "Incidents run: Cost escalation", "Arrived from: github / profile / controlroom"]:
            check(needle in body, "inquiry contains: " + needle)
        dl = await pg.evaluate("window.dataLayer.map(a=>Array.from(a).slice(0,2).join(':'))")
        check(any(x.startswith("event:par_compose") for x in dl) and any(x.startswith("event:cr_complete") for x in dl) and any(x.startswith("event:par_open") for x in dl), "funnel events recorded: " + ",".join(x for x in dl if x.startswith("event:")))
        check(not any("test@example.gov" in str(x) or "Test Person" in str(x) for x in await pg.evaluate("window.dataLayer.map(a=>JSON.stringify(Array.from(a)))")), "no personal data in analytics events")
        check(len(await ctx.cookies()) == 0, "no cookies set")
        # million dollar question carries context only with consent
        await pg.keyboard.press("Escape")
        await pg.goto(BASE + "question.html"); await pg.wait_for_selector("#out .kpi", timeout=90000)
        await pg.fill("#monthly_requests", "12000000"); await pg.wait_for_timeout(700)
        await pg.click("[data-par=question-results]"); await pg.wait_for_selector("dialog.par[open]")
        check(await pg.is_visible("#par-mdq"), "consent option appears after modeling")
        check("Assumptions:" not in await pg.text_content("#par-preview"), "assumptions not included by default")
        await pg.check("#par-mdq-ok")
        prev = await pg.text_content("#par-preview")
        check("12,000,000 requests/month" in prev, "assumptions included only after consent")
        check("Environment explored: Sovereign Government AI Program" in prev, "context survives across rooms")
        await pg.keyboard.press("Escape")
        # receipts
        await pg.goto(BASE + "receipts.html"); await pg.wait_for_selector("#archive .card")
        await pg.click(".linklike[data-par=receipts]"); await pg.wait_for_selector("dialog.par[open]")
        check(True, "receipts invitation opens the review")
        # mobile
        m = await b.new_context(viewport={"width": 390, "height": 844}); await m.add_init_script("window.CR_INQUIRY_ENDPOINT = '';"); await m.route("https://cdn.jsdelivr.net/**", route_cdn); await m.route("https://www.googletagmanager.com/**", lambda r: r.fulfill(status=200, body="", content_type="text/javascript"))
        mp = await m.new_page(); await mp.goto(BASE + "index.html#review"); await mp.wait_for_selector("dialog.par[open]")
        w = await mp.evaluate("[document.documentElement.scrollWidth, innerWidth, document.querySelector('dialog.par').scrollWidth, document.querySelector('dialog.par').clientWidth]")
        check(w[0] <= w[1] and w[2] <= w[3], "mobile: no horizontal overflow %s" % w)
        await mp.screenshot(path="/tmp/par-mobile.png")
        check(not errs, "no page errors %s" % errs)
        await b.close()
asyncio.run(main())
