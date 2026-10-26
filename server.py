"""Máy chủ bảng trắng nháp giữa người dùng và Claude (chỉ dùng thư viện chuẩn).

Trạng thái bảng nằm trong data/board.json. Trình duyệt nhận thay đổi qua SSE
(/api/events) và gửi thao tác qua POST. Khi người dùng khoanh một vùng và hỏi,
một yêu cầu được ghi vào data/requests/<id>.json (+ ảnh <id>.png); Claude trong
terminal đọc yêu cầu đó bằng wb.py rồi trả lời lên bảng qua cùng API.
"""
import argparse
import base64
import json
import mimetypes
import os
import queue
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
# WB_DATA cho phép mỗi dự án có bảng riêng; mặc định là data/ cạnh mã nguồn
DATA = os.path.abspath(os.environ.get("WB_DATA") or os.path.join(ROOT, "data"))
REQS = os.path.join(DATA, "requests")
BOARD = os.path.join(DATA, "board.json")
# file người dùng tải lên từ trình duyệt (WB_UPLOADS để đặt chỗ khác)
UPLOADS = os.path.abspath(os.environ.get("WB_UPLOADS") or os.path.join(DATA, "uploads"))
MAX_UPLOAD = 512 * 1024 * 1024

lock = threading.RLock()
state = {"items": {}, "chat": []}
clients = []  # list[queue.Queue]


def now_ms():
    return int(time.time() * 1000)


def new_id(prefix):
    return prefix + uuid.uuid4().hex[:10]


def load():
    os.makedirs(REQS, exist_ok=True)
    if os.path.exists(BOARD):
        with open(BOARD, encoding="utf-8") as f:
            data = json.load(f)
        state["items"] = data.get("items", {})
        state["chat"] = data.get("chat", [])


def save():
    tmp = BOARD + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp, BOARD)


def broadcast(ev):
    msg = json.dumps(ev, ensure_ascii=False)
    for q in list(clients):
        q.put(msg)


# ---------- geometry ----------
def bbox(it):
    x, y = it.get("x", 0), it.get("y", 0)
    if it.get("type") == "arrow":
        dx, dy = it.get("dx", 0), it.get("dy", 0)
        return (min(x, x + dx), min(y, y + dy), max(x, x + dx), max(y, y + dy))
    return (x, y, x + it.get("w", 200), y + it.get("h", 60))


def overlaps(a, b, pad=0):
    return a[0] < b[2] + pad and a[2] + pad > b[0] and a[1] < b[3] + pad and a[3] + pad > b[1]


def in_region(r):
    box = (r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])
    return [it for it in state["items"].values() if overlaps(bbox(it), box)]


def free_spot(w, h, near):
    """Chỗ trống bên phải vùng `near` (x,y,w,h), dò xuống/sang khi bị che."""
    nx, ny, nw, nh = near
    px, py = nx + nw + 40, ny
    for i in range(80):
        cand = (px, py, px + w, py + h)
        hit = next((bbox(it) for it in state["items"].values() if overlaps(cand, bbox(it), 24)), None)
        if not hit:
            break
        if i % 4 == 3:
            px, py = hit[2] + 32, ny
        else:
            py = hit[3] + 32
    return round(px), round(py)


# ---------- requests ----------
def req_path(rid, ext="json"):
    safe = "".join(c for c in rid if c.isalnum())
    return os.path.join(REQS, f"{safe}.{ext}")


def read_req(rid):
    p = req_path(rid)
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def write_req(req):
    with open(req_path(req["id"]), "w", encoding="utf-8") as f:
        json.dump(req, f, ensure_ascii=False, indent=1)


def list_reqs(status=None):
    out = []
    for name in sorted(os.listdir(REQS)):
        if name.endswith(".json"):
            with open(os.path.join(REQS, name), encoding="utf-8") as f:
                r = json.load(f)
            if status is None or r.get("status") == status:
                out.append(r)
    out.sort(key=lambda r: r["t"])
    return out


def set_req_status(rid, status):
    r = read_req(rid)
    if not r:
        return None
    r["status"] = status
    write_req(r)
    broadcast({"type": "req", "id": rid, "status": status})
    return r


# ---------- handlers ----------
def op_items(body):
    """body: {op:'put', item, place?:{near:[x,y,w,h]}} | {op:'del', id} | {op:'patch', id, set}"""
    with lock:
        op = body.get("op")
        if op == "put":
            it = dict(body["item"])
            it.setdefault("id", new_id("i"))
            it.setdefault("author", "user")
            it.setdefault("z", now_ms())
            near = (body.get("place") or {}).get("near")
            if near:
                it["x"], it["y"] = free_spot(it.get("w", 220), it.get("h", 140), near)
            it["t"] = now_ms()
            state["items"][it["id"]] = it
            save()
            broadcast({"type": "put", "item": it})
            return {"ok": True, "id": it["id"], "x": it.get("x"), "y": it.get("y")}
        if op == "patch":
            it = state["items"].get(body["id"])
            if not it:
                return {"ok": False, "error": "no such item"}
            it.update(body.get("set", {}))
            it["t"] = now_ms()
            save()
            broadcast({"type": "put", "item": it})
            return {"ok": True, "id": it["id"]}
        if op == "del":
            if state["items"].pop(body["id"], None) is not None:
                save()
                broadcast({"type": "del", "id": body["id"]})
            return {"ok": True}
    return {"ok": False, "error": "bad op"}


def op_ask(body):
    rid = time.strftime("%m%d%H%M%S") + uuid.uuid4().hex[:4]
    region = body.get("region")
    with lock:
        items = in_region(region) if region else []
        req = {
            "id": rid,
            "t": now_ms(),
            "status": "pending",
            "question": body.get("question", "").strip(),
            "region": region,
            "items": items,
            "png": False,
        }
        png = body.get("png") or ""
        if png.startswith("data:image/png;base64,") and any(
            i.get("type") in ("stroke", "rect", "arrow", "image") for i in items
        ):
            with open(req_path(rid, "png"), "wb") as f:
                f.write(base64.b64decode(png.split(",", 1)[1]))
            req["png"] = True
        write_req(req)
        msg = {"id": new_id("m"), "role": "user", "text": req["question"], "req": rid,
               "region": region, "t": now_ms(), "thumb": req["png"]}
        state["chat"].append(msg)
        save()
    broadcast({"type": "chat", "msg": msg})
    broadcast({"type": "req", "id": rid, "status": "pending"})
    return {"ok": True, "id": rid}


# ---------- uploads ----------
def safe_name(name):
    name = os.path.basename(name.replace("\\", "/")).strip()
    name = "".join(c if (c.isalnum() or c in " ._-()+[]") else "_" for c in name).lstrip(". ")[:150]
    return name or "file"


def unique_path(name):
    base, ext = os.path.splitext(name)
    fp, i = os.path.join(UPLOADS, name), 1
    while os.path.exists(fp):
        fp = os.path.join(UPLOADS, f"{base} ({i}){ext}")
        i += 1
    return fp


def human(n):
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024 or u == "GB":
            return f"{n:.0f} {u}" if u == "B" else f"{n:.1f} {u}"
        n /= 1024


def list_files():
    if not os.path.isdir(UPLOADS):
        return []
    out = []
    for name in sorted(os.listdir(UPLOADS)):
        fp = os.path.join(UPLOADS, name)
        if os.path.isfile(fp) and not name.endswith(".part"):
            st = os.stat(fp)
            out.append({"name": name, "size": st.st_size, "path": fp, "t": int(st.st_mtime * 1000)})
    return out


def op_upload_done(fp, size, x, y):
    """Đặt thẻ file lên bảng và tạo yêu cầu để Claude trong terminal biết có file mới."""
    name = os.path.basename(fp)
    op_items({"op": "put", "item": {"type": "note", "x": x, "y": y, "w": 260, "h": 90, "color": "sky",
                                    "text": f"📎 **{name}**\n`{human(size)}`", "file": name}})
    op_ask({"region": None, "question": f"📎 Đã tải lên file `{name}` ({human(size)}) → {fp}"})
    return {"ok": True, "name": name, "size": size, "path": fp}


def op_chat(body):
    msg = {"id": new_id("m"), "role": body.get("role", "claude"), "text": body.get("text", ""),
           "req": body.get("req"), "region": body.get("region"), "t": now_ms()}
    with lock:
        state["chat"].append(msg)
        state["chat"] = state["chat"][-300:]
        save()
    broadcast({"type": "chat", "msg": msg})
    return {"ok": True, "id": msg["id"]}


class H(BaseHTTPRequestHandler):
    server_version = "wb/1"

    def log_message(self, fmt, *a):
        pass

    def send_json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def upath(self):
        # http.server giải mã dòng yêu cầu theo latin-1; khôi phục UTF-8 nếu client gửi tên chưa mã hoá %
        try:
            return self.path.encode("latin-1").decode("utf-8")
        except UnicodeError:
            return self.path

    def do_GET(self):
        u = urlparse(self.upath())
        q = parse_qs(u.query)
        p = u.path
        if p == "/api/state":
            with lock:
                return self.send_json({"items": list(state["items"].values()), "chat": state["chat"],
                                       "reqs": {r["id"]: r["status"] for r in list_reqs()}})
        if p == "/api/events":
            return self.sse()
        if p == "/api/requests":
            st = q.get("status", [None])[0]
            return self.send_json(list_reqs(st))
        if p.startswith("/api/request/"):
            rid = p.rsplit("/", 1)[1]
            if rid.endswith(".png"):
                fp = req_path(rid[:-4], "png")
                if os.path.exists(fp):
                    return self.file(fp)
                return self.send_json({"error": "no png"}, 404)
            r = read_req(rid)
            return self.send_json(r) if r else self.send_json({"error": "not found"}, 404)
        if p == "/api/region":
            r = {k: float(q[k][0]) for k in ("x", "y", "w", "h")}
            with lock:
                return self.send_json(in_region(r))
        if p == "/api/item":
            with lock:
                it = state["items"].get(q.get("id", [""])[0])
            return self.send_json(it or {"error": "not found"}, 200 if it else 404)
        if p == "/api/files":
            return self.send_json(list_files())
        if p.startswith("/api/file/"):
            name = unquote(p[len("/api/file/"):])
            fp = os.path.join(UPLOADS, safe_name(name))
            if safe_name(name) == name and os.path.isfile(fp):
                return self.file(fp, attach=True)
            return self.send_json({"error": "not found"}, 404)
        if p == "/" or p == "":
            p = "/index.html"
        fp = os.path.normpath(os.path.join(STATIC, p.lstrip("/")))
        if fp.startswith(STATIC) and os.path.isfile(fp):
            return self.file(fp)
        self.send_json({"error": "not found"}, 404)

    def file(self, fp, attach=False):
        ctype = mimetypes.guess_type(fp)[0] or "application/octet-stream"
        if attach:  # file người dùng: luôn tải về, không để trình duyệt thực thi
            ctype = "application/octet-stream"
        elif ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(os.path.getsize(fp)))
        self.send_header("Cache-Control", "no-cache")
        if attach:
            self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + quote(os.path.basename(fp)))
            self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        with open(fp, "rb") as f:
            while chunk := f.read(1 << 20):
                self.wfile.write(chunk)

    def upload(self, q):
        """POST /api/upload?name=&x=&y= với thân là nội dung file thô; ghi theo từng khối."""
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_UPLOAD:
            return self.send_json({"ok": False, "error": f"kích thước không hợp lệ (tối đa {human(MAX_UPLOAD)})"}, 413)
        os.makedirs(UPLOADS, exist_ok=True)
        with lock:
            fp = unique_path(safe_name(q.get("name", ["file"])[0]))
            open(fp + ".part", "wb").close()  # giữ chỗ để upload song song không trùng tên
        left = n
        try:
            with open(fp + ".part", "wb") as f:
                while left:
                    chunk = self.rfile.read(min(left, 1 << 20))
                    if not chunk:
                        raise ConnectionError("mất kết nối giữa chừng")
                    f.write(chunk)
                    left -= len(chunk)
            os.replace(fp + ".part", fp)
        except (OSError, ConnectionError) as e:
            try:
                os.remove(fp + ".part")
            except OSError:
                pass
            return self.send_json({"ok": False, "error": str(e)}, 500)
        num = lambda k: round(float(q.get(k, ["0"])[0] or 0))
        with lock:
            return self.send_json(op_upload_done(fp, n, num("x"), num("y")))

    def sse(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        q = queue.Queue()
        clients.append(q)
        try:
            self.wfile.write(b": hi\n\n")
            self.wfile.flush()
            while True:
                try:
                    msg = q.get(timeout=15)
                    self.wfile.write(f"data: {msg}\n\n".encode())
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            clients.remove(q)

    def do_POST(self):
        u = urlparse(self.upath())
        p = u.path
        if p == "/api/upload":
            return self.upload(parse_qs(u.query))
        try:
            b = self.body()
        except json.JSONDecodeError:
            return self.send_json({"ok": False, "error": "bad json"}, 400)
        if p == "/api/items":
            return self.send_json(op_items(b))
        if p == "/api/batch":
            return self.send_json([op_items(x) for x in b.get("ops", [])])
        if p == "/api/ask":
            return self.send_json(op_ask(b))
        if p == "/api/chat":
            return self.send_json(op_chat(b))
        if p.startswith("/api/request/") and p.endswith("/status"):
            rid = p.split("/")[3]
            r = set_req_status(rid, b.get("status", "done"))
            return self.send_json({"ok": bool(r)})
        if p == "/api/clear":
            with lock:
                state["items"] = {}
                save()
            broadcast({"type": "clear"})
            return self.send_json({"ok": True})
        self.send_json({"ok": False, "error": "not found"}, 404)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    load()
    os.makedirs(UPLOADS, exist_ok=True)
    srv = ThreadingHTTPServer((a.host, a.port), H)
    srv.daemon_threads = True
    print(f"whiteboard on http://{a.host}:{a.port}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
