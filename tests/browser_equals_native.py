import asyncio, json, subprocess, sys
from playwright.async_api import async_playwright
NATIVE = r'''
import sys, json; sys.path.insert(0, "repo/py")
from control_room import Session, assess
out = {}
for k in ("bank","sovereign","scale"):
    s = Session(k); out[k] = {n: getattr(s, "incident_"+n)() for n in ("cost","injection","drift","sovereignty","economics")}
out["mdq"] = assess({})
print(json.dumps(out))
'''
async def main():
    native = json.loads(subprocess.check_output([sys.executable, "-I", "-c", NATIVE]))
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_selector("#loader.ok", timeout=90000)
        got = await pg.evaluate("""async () => { const e = await CR.loadEngine(); const out = {};
          for (const k of ["bank","sovereign","scale"]) { e.start(k, {}); out[k] = {}; for (const n of ["cost","injection","drift","sovereignty","economics"]) out[k][n] = e.step(n); }
          out.mdq = e.mdq({}); return out; }""")
        same = native == got  # JSON round trip turns 2.0 into 2, which compares equal
        print("browser == native:", same)
        if not same:
            for k in native:
                if k == "mdq":
                    print(k, native[k] == got[k]); continue
                for n in native[k]: 
                    if native[k][n] != got[k][n]: print("DIFF", k, n)
        ver = await pg.evaluate("async () => { const e = await CR.loadEngine(); return await CR.verifyAgainstGitHub(e); }")
        for v in ver: print(v["name"], v["match"], v["hash"])
        await b.close()
asyncio.run(main())
