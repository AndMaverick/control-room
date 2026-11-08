"""A stand-in for the inquiry service, used only by tests. Same contract as the edge function:
200 {ok, ref} on receipt, 422 {fields} on validation, 502 {error: delivery} on failure.
Control it with POST /__mode {"mode": "ok" | "fail" | "slow" | "invalid"} and read it with GET /__log."""
import json, re, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {"mode": "ok", "log": [], "refs": set()}
REF = re.compile(r"^PAR-\d{6}-[A-Z0-9]{4}$")

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body=None):
        self.send_response(code)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-headers", "content-type")
        self.send_header("access-control-allow-methods", "POST, GET, OPTIONS")
        if body is not None:
            data = json.dumps(body).encode()
            self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(data)))
            self.end_headers(); self.wfile.write(data)
        else:
            self.send_header("content-length", "0"); self.end_headers()
    def do_OPTIONS(self): self._send(204)
    def do_GET(self):
        if self.path == "/__log": return self._send(200, STATE["log"])
        self._send(404, {})
    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("content-length", 0)))
        if self.path == "/__mode":
            STATE["mode"] = json.loads(raw)["mode"]
            if json.loads(raw).get("reset"): STATE["log"].clear(); STATE["refs"].clear()
            return self._send(200, {"ok": True})
        body = json.loads(raw)
        STATE["log"].append(body)
        mode = STATE["mode"]
        if mode == "slow": time.sleep(1.8)
        if mode == "fail": return self._send(502, {"ok": False, "error": "delivery"})
        if mode == "invalid": return self._send(422, {"ok": False, "error": "validation", "fields": {"email": "Please enter a valid work email."}})
        if not REF.match(body.get("ref", "")): return self._send(422, {"ok": False, "error": "validation", "fields": {"ref": "bad"}})
        dup = body["ref"] in STATE["refs"]; STATE["refs"].add(body["ref"])
        self._send(200, {"ok": True, "ref": body["ref"], "duplicate": dup})

def serve(port=8766):
    s = ThreadingHTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s

if __name__ == "__main__":
    serve(); print("mock inquiry service on :8766"); threading.Event().wait()
