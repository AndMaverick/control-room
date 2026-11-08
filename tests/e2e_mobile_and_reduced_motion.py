import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for url in ["index.html","receipts.html","question.html"]:
            pg = await b.new_page(viewport={"width":390,"height":844})
            await pg.goto("http://localhost:8765/"+url); await pg.wait_for_timeout(1500)
            w = await pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
            print(url, w)
            if url=="index.html":
                await pg.wait_for_selector("#loader.ok", timeout=90000)
                await pg.click('.scn[data-key="scale"]'); await pg.wait_for_function("!document.querySelector('#break').disabled")
                await pg.click("#break"); await pg.wait_for_selector("#incident .reveal")
                await pg.click("#skip"); await pg.wait_for_selector("#findings:not([hidden])")
                print(" after run", await pg.evaluate("[document.documentElement.scrollWidth, innerWidth]"))
                await pg.screenshot(path="/tmp/m-findings.png")
                await pg.evaluate("document.querySelector('#theatre').scrollIntoView()"); await pg.screenshot(path="/tmp/m-theatre.png")
        # reduced motion
        ctx = await b.new_context(reduced_motion="reduce", viewport={"width":1200,"height":800})
        pg = await ctx.new_page(); await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_selector("#loader.ok", timeout=90000)
        await pg.click('.scn[data-key="sovereign"]'); await pg.wait_for_function("!document.querySelector('#break').disabled")
        await pg.click("#break"); await pg.wait_for_selector("#incident .reveal")
        for _ in range(5):
            await pg.click("#next"); await pg.wait_for_timeout(200)
        await pg.wait_for_selector("#findings:not([hidden])", timeout=5000)
        print("reduced motion flow ok")
        await b.close()
asyncio.run(main())
