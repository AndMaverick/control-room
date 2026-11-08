"""Build step. Run after changing anything under py/ or when upgrading Pyodide.

  npm install pyodide@0.26.4 @fontsource/cormorant-garamond @fontsource/inter
  python build.py path/to/node_modules

Writes py/manifest.json, blob/* (the Pyodide binaries as gzip+base64 text chunks, so the whole site is
plain text files that need no third-party host) and assets/fonts.css (fonts inlined as data URIs).
With no argument only the manifest is rebuilt.
"""
import base64, gzip, json, pathlib, shutil, sys

root = pathlib.Path(__file__).resolve().parent
py = root / "py"
files = sorted(str(p.relative_to(py)) for p in py.rglob("*.py"))
(py / "manifest.json").write_text(json.dumps({"files": files}, indent=1))
print(len(files), "python files in manifest")

if len(sys.argv) > 1:
    nm = pathlib.Path(sys.argv[1])
    src = nm / "pyodide"
    out = root / "pyodide"; out.mkdir(exist_ok=True)
    for name in ("pyodide.js", "pyodide.asm.js", "pyodide-lock.json"):
        shutil.copy(src / name, out / name)
    blob = root / "blob"; shutil.rmtree(blob, ignore_errors=True); blob.mkdir()
    manifest = {}
    CHUNK = 700_000
    for name, compress in (("pyodide.asm.wasm", True), ("python_stdlib.zip", False)):
        data = (src / name).read_bytes()
        if compress:
            data = gzip.compress(data, 9, mtime=0)
        text = base64.b64encode(data).decode()
        parts = [text[i:i + CHUNK] for i in range(0, len(text), CHUNK)]
        for i, part in enumerate(parts):
            (blob / f"{name}.{i:02d}.txt").write_text(part)
        manifest[name] = {"chunks": len(parts), "gzip": compress}
    (blob / "manifest.json").write_text(json.dumps(manifest, indent=1))
    css = []
    fonts = [("Cormorant Garamond", "cormorant-garamond", [(500, "normal"), (600, "normal"), (500, "italic"), (600, "italic")]),
             ("Inter", "inter", [(300, "normal"), (400, "normal"), (500, "normal")])]
    for family, pkg, variants in fonts:
        for weight, style in variants:
            data = (nm / "@fontsource" / pkg / "files" / f"{pkg}-latin-{weight}-{style}.woff2").read_bytes()
            css.append(f'@font-face{{font-family:"{family}";font-style:{style};font-weight:{weight};font-display:swap;'
                       f'src:url(data:font/woff2;base64,{base64.b64encode(data).decode()}) format("woff2")}}')
    (root / "assets" / "fonts.css").write_text("\n".join(css))
    print("blob chunks and fonts.css written")
