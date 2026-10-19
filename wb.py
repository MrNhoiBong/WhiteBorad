"""CLI để Claude (trong terminal) quản lý và dùng bảng trắng.

Chạy qua ./wb (tự dùng .venv). Các lệnh chính:
  start | stop | status            quản lý server
  wait [--timeout S]               chờ yêu cầu mới, in tóm tắt vùng được chọn
  show [RID] | look X Y W H        đọc một yêu cầu / một vùng tuỳ ý
  reply [TEXT] [--file F] [--done] trả lời trong khung chat (Markdown + LaTeX)
  note / tex / svg / rect / arrow  vẽ lên bảng, mặc định đặt cạnh vùng đang xử lý
  patch ID [--text ...] | rm ID    sửa / xoá một mục
  done [RID]                       đánh dấu yêu cầu đã xong
"""
import argparse
import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
# WB_DATA cho phép mỗi dự án có bảng riêng; mặc định là data/ cạnh mã nguồn
DATA = os.path.abspath(os.environ.get("WB_DATA") or os.path.join(ROOT, "data"))
PID = os.path.join(DATA, "server.pid")
LOG = os.path.join(DATA, "server.log")
CUR = os.path.join(DATA, "current_req")
CONF = os.path.join(DATA, "port")


def port():
    try:
        return int(open(CONF).read().strip())
    except (OSError, ValueError):
        return 8765


def url(path=""):
    return f"http://127.0.0.1:{port()}{path}"


def api(path, body=None, timeout=10):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    req = urllib.request.Request(url(path), data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def alive():
    try:
        api("/api/requests?status=none", timeout=2)
        return True
    except (urllib.error.URLError, OSError):
        return False


# ---------- server management ----------
def cmd_start(a):
    os.makedirs(DATA, exist_ok=True)
    if a.port:
        open(CONF, "w").write(str(a.port))
    if alive():
        print(f"đang chạy: {url('/')}")
        return
    log = open(LOG, "a")
    p = subprocess.Popen([sys.executable, os.path.join(ROOT, "server.py"), "--port", str(port())],
                         stdout=log, stderr=log, start_new_session=True)
    open(PID, "w").write(str(p.pid))
    for _ in range(30):
        time.sleep(0.2)
        if alive():
            print(f"đã chạy: {url('/')} (pid {p.pid})")
            return
    sys.exit(f"server không lên, xem {LOG}")


def cmd_stop(a):
    try:
        pid = int(open(PID).read())
        os.kill(pid, signal.SIGTERM)
        os.remove(PID)
        print(f"đã dừng pid {pid}")
    except (OSError, ValueError):
        print("server không chạy")


def cmd_status(a):
    if alive():
        pend = api("/api/requests?status=pending")
        print(f"đang chạy: {url('/')} · {len(pend)} yêu cầu chờ")
    else:
        print("không chạy")


# ---------- reading ----------
def short_item(it):
    t, who = it.get("type"), it.get("author", "user")
    pos = f"@({round(it.get('x', 0))},{round(it.get('y', 0))})"
    if t in ("note", "text"):
        return f"- [{it['id']}] {t}({who}) {pos}: {it.get('text', '')}"
    if t == "stroke":
        return f"- [{it['id']}] nét tay({who}) {pos} {it.get('w', 0):.0f}×{it.get('h', 0):.0f} màu {it.get('color', 'ink')}"
    if t == "rect":
        return f"- [{it['id']}] khung({who}) {pos} {it.get('w')}×{it.get('h')}"
    if t == "arrow":
        return f"- [{it['id']}] mũi tên({who}) {pos} → (+{it.get('dx')},+{it.get('dy')})"
    if t == "image":
        return f"- [{it['id']}] hình SVG({who}) \"{it.get('title', '')}\" {pos} {it.get('w')}×{it.get('h')}"
    return f"- [{it['id']}] {t}({who}) {pos}"


def print_req(r):
    print(f"YÊU CẦU {r['id']} [{r['status']}]")
    print(f"Hỏi: {r['question'] or '(không có lời, chỉ khoanh vùng)'}")
    g = r.get("region")
    if g:
        print(f"Vùng: x={g['x']:.0f} y={g['y']:.0f} w={g['w']:.0f} h={g['h']:.0f}")
    if r.get("png"):
        print(f"Ảnh vùng (có nét vẽ/hình): {os.path.join(DATA, 'requests', r['id'] + '.png')}")
    items = r.get("items", [])
    print(f"Mục trong vùng ({len(items)}):" if items else "Vùng trống / không khoanh vùng.")
    for it in sorted(items, key=lambda i: (i.get("y", 0), i.get("x", 0))):
        print(short_item(it))


def cmd_wait(a):
    end = time.time() + a.timeout
    while time.time() < end:
        try:
            pend = api("/api/requests?status=pending")
        except (urllib.error.URLError, OSError):
            pend = []
            time.sleep(2)
        if pend:
            r = pend[0]
            api(f"/api/request/{r['id']}/status", {"status": "seen"})
            r["status"] = "seen"
            open(CUR, "w").write(r["id"])
            print_req(r)
            if len(pend) > 1:
                print(f"(còn {len(pend) - 1} yêu cầu chờ khác)")
            return
        time.sleep(1)
    print("timeout: không có yêu cầu mới")
    sys.exit(2)


def current(rid=None):
    if rid:
        return rid
    try:
        return open(CUR).read().strip()
    except OSError:
        sys.exit("chưa có yêu cầu hiện tại; dùng --req")


def cmd_show(a):
    if a.rid is None and a.pending:
        for r in api("/api/requests?status=pending"):
            print_req(r)
        return
    print_req(api(f"/api/request/{current(a.rid)}"))


def cmd_look(a):
    items = api(f"/api/region?x={a.x}&y={a.y}&w={a.w}&h={a.h}")
    print(f"{len(items)} mục:")
    for it in items:
        print(short_item(it))


def cmd_item(a):
    print(json.dumps(api(f"/api/item?id={a.id}"), ensure_ascii=False, indent=1))


# ---------- writing ----------
def text_arg(a):
    if getattr(a, "file", None):
        return open(a.file, encoding="utf-8").read().rstrip("\n")
    if a.text is None:
        return sys.stdin.read().rstrip("\n")
    return a.text


def placement(a, item):
    if getattr(a, "at", None):
        x, y = a.at.split(",")
        item["x"], item["y"] = float(x), float(y)
        return None
    try:
        r = api(f"/api/request/{current(getattr(a, 'req', None))}")
        g = r.get("region")
    except (SystemExit, urllib.error.URLError):
        g = None
    if not g:
        g = {"x": 0, "y": 0, "w": 0, "h": 0}
    return {"near": [g["x"], g["y"], g["w"], g["h"]]}


def put(a, item):
    item["author"] = "claude"
    res = api("/api/items", {"op": "put", "item": item, "place": placement(a, item)})
    print(f"đã đặt [{res['id']}] tại ({res.get('x')},{res.get('y')})")


def est_lines(text, chars):
    return sum(max(1, -(-len(line) // chars)) for line in text.split("\n"))


def cmd_note(a):
    t = text_arg(a)
    w = a.w or 300
    h = 40 + 26 * est_lines(t, max(10, w // 10)) + 30 * t.count("$$")
    put(a, {"type": "note", "text": t, "color": a.color or "violet", "w": w, "h": h})


def cmd_tex(a):
    t = text_arg(a)
    s = a.size or 28
    longest = max((len(x) for x in t.split("\n")), default=1)
    w = a.w or min(900, max(80, int(longest * s * 0.45)))
    h = int(s * 1.8 * (t.count("\n") + 1)) + (s if "$$" in t else 0)
    put(a, {"type": "text", "text": t, "size": s, "color": a.color or "violet", "w": w, "h": h})


def cmd_svg(a):
    svg = open(a.file, encoding="utf-8").read()
    put(a, {"type": "image", "svg": svg, "title": a.title or "Hình", "w": a.w or 520, "h": a.h or 360})


def cmd_rect(a):
    item = {"type": "rect", "x": a.x, "y": a.y, "w": a.w, "h": a.h, "color": a.color or "violet", "author": "claude"}
    print(api("/api/items", {"op": "put", "item": item}))


def cmd_arrow(a):
    item = {"type": "arrow", "x": a.x, "y": a.y, "dx": a.dx, "dy": a.dy, "color": a.color or "violet", "author": "claude"}
    print(api("/api/items", {"op": "put", "item": item}))


def cmd_patch(a):
    s = {}
    if a.text is not None or a.file:
        s["text"] = text_arg(a)
    for k in ("color", "title"):
        if getattr(a, k):
            s[k] = getattr(a, k)
    if a.svgfile:
        s["svg"] = open(a.svgfile, encoding="utf-8").read()
    if a.at:
        x, y = a.at.split(",")
        s["x"], s["y"] = float(x), float(y)
    print(api("/api/items", {"op": "patch", "id": a.id, "set": s}))


def cmd_rm(a):
    for i in a.ids:
        api("/api/items", {"op": "del", "id": i})
    print(f"đã xoá {len(a.ids)} mục")


def cmd_reply(a):
    rid = current(a.req)
    r = api(f"/api/request/{rid}")
    api("/api/chat", {"role": "claude", "text": text_arg(a), "req": rid, "region": r.get("region")})
    if a.done:
        api(f"/api/request/{rid}/status", {"status": "done"})
    print("đã trả lời" + (" và đóng yêu cầu" if a.done else ""))


def cmd_done(a):
    rid = current(a.rid)
    api(f"/api/request/{rid}/status", {"status": "done"})
    print(f"đã xong {rid}")


def main():
    ap = argparse.ArgumentParser(prog="wb")
    sp = ap.add_subparsers(dest="cmd", required=True)

    p = sp.add_parser("start"); p.add_argument("--port", type=int); p.set_defaults(f=cmd_start)
    sp.add_parser("stop").set_defaults(f=cmd_stop)
    sp.add_parser("status").set_defaults(f=cmd_status)
    p = sp.add_parser("wait"); p.add_argument("--timeout", type=float, default=3300); p.set_defaults(f=cmd_wait)
    p = sp.add_parser("show"); p.add_argument("rid", nargs="?"); p.add_argument("--pending", action="store_true"); p.set_defaults(f=cmd_show)
    p = sp.add_parser("look")
    for k in ("x", "y", "w", "h"):
        p.add_argument(k, type=float)
    p.set_defaults(f=cmd_look)
    p = sp.add_parser("item"); p.add_argument("id"); p.set_defaults(f=cmd_item)

    def writer(name, f, **extra):
        p = sp.add_parser(name)
        p.add_argument("text", nargs="?")
        p.add_argument("--file")
        p.add_argument("--color")
        p.add_argument("--at", help="x,y; mặc định đặt cạnh vùng đang xử lý")
        p.add_argument("--req")
        p.add_argument("--w", type=int)
        for k, v in extra.items():
            p.add_argument("--" + k, **v)
        p.set_defaults(f=f)
        return p

    writer("note", cmd_note)
    writer("tex", cmd_tex, size=dict(type=int))
    p = sp.add_parser("svg"); p.add_argument("--file", required=True); p.add_argument("--title")
    p.add_argument("--w", type=int); p.add_argument("--h", type=int); p.add_argument("--at"); p.add_argument("--req")
    p.set_defaults(f=cmd_svg)
    p = sp.add_parser("rect")
    for k in ("x", "y", "w", "h"):
        p.add_argument(k, type=float)
    p.add_argument("--color"); p.set_defaults(f=cmd_rect)
    p = sp.add_parser("arrow")
    for k in ("x", "y", "dx", "dy"):
        p.add_argument(k, type=float)
    p.add_argument("--color"); p.set_defaults(f=cmd_arrow)
    p = sp.add_parser("patch"); p.add_argument("id"); p.add_argument("--text"); p.add_argument("--file")
    p.add_argument("--color"); p.add_argument("--title"); p.add_argument("--svgfile"); p.add_argument("--at")
    p.set_defaults(f=cmd_patch)
    p = sp.add_parser("rm"); p.add_argument("ids", nargs="+"); p.set_defaults(f=cmd_rm)
    p = sp.add_parser("reply"); p.add_argument("text", nargs="?"); p.add_argument("--file"); p.add_argument("--req")
    p.add_argument("--done", action="store_true"); p.set_defaults(f=cmd_reply)
    p = sp.add_parser("done"); p.add_argument("rid", nargs="?"); p.set_defaults(f=cmd_done)

    a = ap.parse_args()
    if a.cmd not in ("start", "stop", "status") and not alive():
        sys.exit("server chưa chạy: ./wb start")
    a.f(a)


if __name__ == "__main__":
    main()
