"""Tìm các bảng trắng đang chạy trên máy này bằng cách dò dải cổng của wb.

Mỗi server trả lời GET /api/info; server bản cũ (chưa có /api/info) vẫn được
nhận ra qua /api/requests nhưng không biết tên thư mục.
"""
import json
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

FIRST, COUNT = 8765, 200  # cùng dải với free_port() trong wb.py


def probe(port, timeout=0.6):
    base = f"http://127.0.0.1:{port}"
    try:
        with urllib.request.urlopen(base + "/api/info", timeout=timeout) as r:
            info = json.loads(r.read())
        if info.get("app") == "wb":
            return info
        return None
    except urllib.error.HTTPError as e:
        if e.code != 404:
            return None
    except (OSError, ValueError):
        return None
    try:  # server bản cũ
        with urllib.request.urlopen(base + "/api/requests?status=pending", timeout=timeout) as r:
            pend = json.loads(r.read())
        if isinstance(pend, list):
            return {"app": "wb", "port": port, "name": None, "dir": None, "host": None, "pending": len(pend), "old": True}
    except (OSError, ValueError):
        pass
    return None


def scan(extra=()):
    ports = sorted(set(range(FIRST, FIRST + COUNT)) | {int(p) for p in extra if p})
    with ThreadPoolExecutor(max_workers=64) as ex:
        found = [b for b in ex.map(probe, ports) if b]
    return sorted(found, key=lambda b: b["port"])
