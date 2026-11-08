import asyncio, mimetypes, pathlib, re
from playwright.async_api import async_playwright
NM = pathlib.Path("node_modules")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        errs=[]; seen=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def cdn(route):
            u = route.request.url; seen.append(u)
            m = re.match(r"https://cdn.jsdelivr.net/pyodide/v0.26.4/full/(.+)", u)
            if m:
                f = NM/"pyodide"/m.group(1)
                if f.exists():
                    ct = "application/wasm" if f.suffix==".wasm" else (mimetypes.guess_type(f.name)[0] or "application/octet-stream")
                    return await route.fulfill(body=f.read_bytes(), headers={"content-type": ct, "access-control-allow-origin": "*"})
            m = re.match(r"https://cdn.jsdelivr.net/npm/@fontsource/([^@]+)@5.3.0/files/(.+)", u)
            if m:
                f = NM/"@fontsource"/m.group(1)/"files"/m.group(2)
                return await route.fulfill(body=f.read_bytes(), headers={"content-type": "font/woff2", "access-control-allow-origin": "*"})
            await route.abort()
        await pg.route("https://cdn.jsdelivr.net/**", cdn)
        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_selector("#loader.ok", timeout=90000)
        await pg.click('.scn[data-key="scale"]'); await pg.wait_for_function("!document.querySelector('#break').disabled")
        await pg.click("#break"); await pg.wait_for_selector("#incident .reveal"); await pg.click("#skip")
        await pg.wait_for_selector("#findings:not([hidden])")
        print("cdn variant ok; errors:", errs, "; cdn requests:", sorted({u.split('/')[-1] for u in seen})[:12])
        await b.close()
asyncio.run(main())
