import asyncio, json, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":1440,"height":900})
        errs=[]
        pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_selector("#loader.ok", timeout=90000)
        await pg.screenshot(path="/tmp/01-open.png")
        await pg.click('.scn[data-key="bank"]')
        await pg.wait_for_function("!document.querySelector('#break').disabled")
        await pg.screenshot(path="/tmp/02-brief.png", full_page=False)
        await pg.click("#break")
        await pg.wait_for_selector("#incident .reveal")
        await pg.screenshot(path="/tmp/03-inc1.png")
        for i in range(4):
            await pg.click("#next"); await pg.wait_for_timeout(500)
            await pg.screenshot(path=f"/tmp/0{4+i}-inc{i+2}.png")
        await pg.click("#next")
        await pg.wait_for_selector("#findings:not([hidden])")
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path="/tmp/09-findings.png")
        await pg.click("#conclude"); await pg.wait_for_timeout(5500)
        await pg.screenshot(path="/tmp/10-finale.png")
        print("errors:", errs)
        await b.close()
asyncio.run(main())
