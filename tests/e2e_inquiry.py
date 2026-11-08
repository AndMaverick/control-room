"""Native inquiry submission, end to end against a mock of the inquiry service (tests/mock_inquiry_server.py).
Run from the repo root with a static server on :8765 and node_modules beside it. Nothing here reaches a real
service or sends a real message."""
import asyncio, json, mimetypes, pathlib, re, sys, time, urllib.request
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import mock_inquiry_server
from playwright.async_api import async_playwright

NM = pathlib.Path("node_modules")
BASE = "http://localhost:8765/"
EP = "http://127.0.0.1:8766/inquiry"
MOCK = "http://127.0.0.1:8766"

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

def mode(m, reset=False):
    urllib.request.urlopen(urllib.request.Request(MOCK + "/__mode", data=json.dumps({"mode": m, "reset": reset}).encode(), method="POST"))
def log():
    return json.load(urllib.request.urlopen(MOCK + "/__log"))

async def newctx(b, **kw):
    c = await b.new_context(**kw)
    await c.add_init_script(f"window.CR_INQUIRY_ENDPOINT = '{EP}';")
    await c.route("https://cdn.jsdelivr.net/**", route_cdn)
    await c.route("https://www.googletagmanager.com/**", lambda r: r.fulfill(status=200, body="window.__gtm=1;", content_type="text/javascript"))
    return c

async def fill(pg, email="test@example.gov"):
    await pg.fill("#par-name", "Test Person"); await pg.fill("#par-email", email); await pg.fill("#par-org", "Example Ministry")
    await pg.select_option("#par-ch", "Sovereign AI and data residency"); await pg.fill("#par-goal", "Keep citizen data in country while using frontier models.")
    await pg.select_option("#par-scale", "$5 million to $25 million")

async def events(pg):
    return await pg.evaluate("window.dataLayer.filter(a=>a[0]==='event').map(a=>a[1])")

async def main():
    mock_inquiry_server.serve(); mode("ok", reset=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await newctx(b, viewport={"width": 1440, "height": 900})
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))

        # ---- run the simulation so there is real context to preserve
        await pg.goto(BASE + "index.html?utm_source=github&utm_medium=profile&utm_campaign=controlroom")
        await pg.wait_for_selector("#loader.ok", timeout=90000)
        await pg.click('.scn[data-key="sovereign"]'); await pg.wait_for_function("!document.querySelector('#break').disabled")
        await pg.click("#break"); await pg.wait_for_selector("#incident .reveal"); await pg.click("#skip")
        await pg.wait_for_selector("#findings:not([hidden])")
        await pg.evaluate("document.querySelector('#cards article .links a').addEventListener('click',e=>e.preventDefault())")
        await pg.click("#cards article .links a")
        await pg.click("#conclude"); await pg.wait_for_selector("#f3.in", timeout=9000)
        await pg.click("#cta-review"); await pg.wait_for_selector("dialog.par[open]")
        check((await pg.text_content("#par-go")).strip() == "Submit inquiry", "the button reads SUBMIT INQUIRY when the service is configured")
        check(await pg.is_visible("#par-preview"), "the context being included is visible without opening anything")

        # ---- validation blocks, sends nothing
        await pg.click("#par-go")
        check(await pg.is_visible("#par-f") and len(log()) == 0, "empty form is blocked and nothing is sent")
        await fill(pg, "not-an-email"); await pg.click("#par-go")
        check(await pg.is_visible("#par-f") and len(log()) == 0, "invalid email is blocked and nothing is sent")
        await pg.fill("#par-email", "test@example.gov")

        # ---- success is shown only after the service confirms
        mode("slow", reset=True)
        t0 = time.time()
        await pg.click("#par-go")
        await pg.wait_for_selector("#par-wait:not([hidden])")
        check(await pg.is_hidden("#par-sent"), "no success is shown while the service has not answered")
        check(await pg.is_hidden("#par-f"), "the form gives way to the submission moment")
        check(await pg.evaluate("getComputedStyle(document.querySelector('.par-seal i')).animationName") == "seal", "the submission animation runs")
        await pg.wait_for_selector("#par-sent:not([hidden])", timeout=8000)
        check(time.time() - t0 >= 1.7, "confirmation waited for the service (%.1fs)" % (time.time() - t0))
        sent = log()
        check(len(sent) == 1, "exactly one request reached the service")
        r = sent[0]
        check(re.match(r"^PAR-\d{6}-[A-Z0-9]{4}$", r["ref"]) is not None, "request carries a PAR reference " + r["ref"])
        check(r["name"] == "Test Person" and r["email"] == "test@example.gov" and r["org"] == "Example Ministry", "name, email and organization sent")
        check(r["challenge"] == "Sovereign AI and data residency" and r["scale"] == "$5 million to $25 million" and "frontier models" in r["goal"], "challenge, scale and goal sent")
        c = r["context"]
        check(c["env"] == "Sovereign Government AI Program" and c["complete"] is True, "scenario context preserved: " + c["env"])
        check(any("Cost escalation" in i["title"] for i in c["incidents"]) and len(c["incidents"]) == 5, "all five incidents preserved")
        check(any("(source code)" in x for x in c["inspected"]), "inspected tools preserved: " + ", ".join(c["inspected"]))
        check(c["source"] == "github" and c["medium"] == "profile" and c["campaign"] == "controlroom", "referral preserved")
        check(r["where"] == "control-room-finale" and r["page"] == "index.html", "originating page preserved")
        check(r["mdq"] is None and r["mdqConsent"] is False and r["website"] == "", "no modeled assumptions, honeypot empty")
        check(r["elapsed"] > 1000, "elapsed time reported for spam screening")
        check("Your inquiry has been received." in await pg.text_content("#par-sent-t"), "confirmation headline")
        check("Andrew will review your request personally." in await pg.text_content("#par-sent"), "confirmation line")
        check(await pg.text_content("#par-sent-ref") == r["ref"], "the PAR reference is shown")
        check(await pg.evaluate("document.activeElement.id") == "par-sent-t", "focus moves to the confirmation")
        check(await pg.is_visible("#par-back") and await pg.is_visible("#par-maison"), "discreet return and explore options")
        check("andmaverick.com" in await pg.get_attribute("#par-maison", "href"), "Explore Maison goes to andmaverick.com")
        names = await events(pg)
        for n in ["par_open", "par_start", "par_submit", "par_confirmed"]:
            check(n in names, "analytics event " + n)
        check("par_failed" not in names and "par_compose" not in names, "no failure or mailto event on success")
        flat = await pg.evaluate("JSON.stringify(window.dataLayer.map(a=>Array.from(a)))")
        check("test@example.gov" not in flat and "Test Person" not in flat and "Example Ministry" not in flat and "frontier models" not in flat, "no personal data in analytics")
        check(len(await ctx.cookies()) == 0, "no cookies set")
        await pg.click("#par-back"); check(await pg.evaluate("!document.querySelector('dialog.par').open"), "Return to the Control Room closes the dialog")
        await pg.click("#cta-review"); await pg.wait_for_selector("dialog.par[open]")
        check(await pg.input_value("#par-name") == "" and await pg.is_visible("#par-f"), "reopening starts a fresh form after a confirmed inquiry")
        await pg.keyboard.press("Escape")

        # ---- failure preserves everything, retry reuses the reference and succeeds once
        mode("fail", reset=True)
        await pg.click("#cta-review"); await pg.wait_for_selector("dialog.par[open]")
        await fill(pg); await pg.click("#par-go")
        await pg.wait_for_selector("#par-fail:not([hidden])", timeout=8000)
        check(await pg.is_visible("#par-f") and await pg.is_hidden("#par-sent"), "failure returns to the form and shows no success")
        check(await pg.input_value("#par-name") == "Test Person" and "frontier models" in await pg.input_value("#par-goal") and await pg.input_value("#par-scale") == "$5 million to $25 million", "everything entered is preserved")
        check((await pg.text_content("#par-go")).strip() == "Try again" and await pg.is_enabled("#par-go"), "graceful retry offered")
        check((await pg.get_attribute("#par-direct", "href")).startswith("mailto:andrew@andmaverick.com"), "a direct email alternative is offered")
        check("par_failed" in await events(pg), "par_failed recorded")
        mode("ok")
        await pg.click("#par-go"); await pg.wait_for_selector("#par-sent:not([hidden])", timeout=8000)
        refs = [x["ref"] for x in log()]
        check(len(refs) == 2 and refs[0] == refs[1], "retry reuses the same reference so it cannot be counted twice")
        await pg.keyboard.press("Escape")

        # ---- server-side validation message is shown, form kept
        mode("invalid", reset=True)
        await pg.click("#cta-review"); await pg.wait_for_selector("dialog.par[open]")
        await fill(pg); await pg.click("#par-go")
        await pg.wait_for_selector("#par-err:not([hidden])", timeout=8000)
        check("valid work email" in await pg.text_content("#par-err") and await pg.input_value("#par-org") == "Example Ministry", "server validation is shown and input kept")
        await pg.keyboard.press("Escape")

        # ---- duplicate prevention: three rapid attempts, one request
        mode("slow", reset=True)
        await pg.click("#cta-review"); await pg.wait_for_selector("dialog.par[open]")
        await fill(pg)
        await pg.evaluate("(()=>{const f=document.querySelector('#par-f');f.requestSubmit();f.requestSubmit();document.querySelector('#par-go').click();})()")
        await pg.wait_for_selector("#par-sent:not([hidden])", timeout=8000)
        check(len(log()) == 1, "three rapid submissions produced one request")
        await pg.keyboard.press("Escape")

        # ---- honeypot field is invisible to people
        mode("ok", reset=True)
        await pg.click("#cta-review"); await pg.wait_for_selector("dialog.par[open]")
        hp = await pg.evaluate("(()=>{const r=document.querySelector('.par-hp').getBoundingClientRect();return [r.left,r.width]})()")
        check(hp[0] < -1000 or hp[1] <= 1, "the spam trap is off screen")
        await pg.keyboard.press("Escape")

        # ---- million dollar question: assumptions only with consent
        mode("ok", reset=True)
        await pg.goto(BASE + "question.html"); await pg.wait_for_selector("#out .kpi", timeout=90000)
        await pg.fill("#monthly_requests", "12000000"); await pg.wait_for_timeout(700)
        await pg.click("[data-par=question-results]"); await pg.wait_for_selector("dialog.par[open]")
        await fill(pg); await pg.click("#par-go"); await pg.wait_for_selector("#par-sent:not([hidden])", timeout=8000)
        r = log()[-1]
        check(r["mdq"] is None and r["mdqConsent"] is False and "12,000,000" not in json.dumps(r), "assumptions are NOT sent without consent")
        check(r["context"]["mdqUsed"] is True and r["where"] == "question-results" and r["context"]["env"] == "Sovereign Government AI Program", "the tool use and earlier scenario still travel")
        await pg.evaluate("document.querySelector('dialog.par').close()")
        await pg.click("[data-par=question-results]"); await pg.wait_for_selector("dialog.par[open]")
        await fill(pg); await pg.check("#par-mdq-ok"); await pg.click("#par-go"); await pg.wait_for_selector("#par-sent:not([hidden])", timeout=8000)
        r = log()[-1]
        check(r["mdqConsent"] is True and "12,000,000 requests/month" in r["mdq"]["assumptions"], "assumptions sent after explicit consent")
        flat = await pg.evaluate("JSON.stringify(window.dataLayer.map(a=>Array.from(a)))")
        check("12,000,000" not in flat, "modeled assumptions never reach analytics")

        # ---- the receipts invitation reaches the same flow
        await pg.goto(BASE + "receipts.html"); await pg.wait_for_selector("#archive .card")
        await pg.click(".linklike[data-par=receipts]"); await pg.wait_for_selector("dialog.par[open]")
        check(await pg.is_visible("#par-go"), "receipts invitation opens the submission flow")

        # ---- mobile
        m = await newctx(b, viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        mp = await m.new_page(); mode("ok", reset=True)
        await mp.goto(BASE + "index.html#review"); await mp.wait_for_selector("dialog.par[open]")
        await fill(mp); await mp.click("#par-go"); await mp.wait_for_selector("#par-sent:not([hidden])", timeout=8000)
        w = await mp.evaluate("[document.documentElement.scrollWidth, innerWidth, document.querySelector('dialog.par').scrollWidth, document.querySelector('dialog.par').clientWidth]")
        check(w[0] <= w[1] and w[2] <= w[3], "mobile: no horizontal overflow on confirmation %s" % w)
        check(len(log()) == 1, "mobile submission delivered")
        await mp.screenshot(path="/tmp/par-mobile-sent.png")

        # ---- reduced motion: no animation, no artificial pause
        rm = await newctx(b, viewport={"width": 1280, "height": 800}, reduced_motion="reduce")
        rp = await rm.new_page(); mode("ok", reset=True)
        await rp.goto(BASE + "index.html#review"); await rp.wait_for_selector("dialog.par[open]")
        await fill(rp); t0 = time.time(); await rp.click("#par-go"); await rp.wait_for_selector("#par-sent:not([hidden])", timeout=8000)
        check(time.time() - t0 < 1.0, "reduced motion: confirmation is immediate (%.2fs)" % (time.time() - t0))
        check(await rp.evaluate("getComputedStyle(document.querySelector('.par-seal i')).animationName") == "none", "reduced motion: no animation")

        # ---- unreachable service behaves like a failure, not a hang
        mode("ok")
        n = await newctx(b, viewport={"width": 1280, "height": 800})
        await n.add_init_script("window.CR_INQUIRY_ENDPOINT = 'http://127.0.0.1:9/inquiry';")
        np_ = await n.new_page(); await np_.goto(BASE + "index.html#review"); await np_.wait_for_selector("dialog.par[open]")
        await fill(np_); await np_.click("#par-go"); await np_.wait_for_selector("#par-fail:not([hidden])", timeout=20000)
        check(await np_.input_value("#par-org") == "Example Ministry", "network failure keeps the form and offers a retry")

        check(not errs, "no page errors %s" % errs)
        await b.close()
asyncio.run(main())
