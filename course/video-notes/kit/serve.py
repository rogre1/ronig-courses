"""Local server for the video notes page.

Python's built-in http.server ignores Range requests, and without them the browser
cannot seek inside a video. This adds Range support and nothing else.

Run:  python3 serve.py [port]      then open http://localhost:<port>/video-notes/
It serves the folder above this one, so current.json can point at videos elsewhere in it.
"""
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class RangeHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        size = os.path.getsize(path)
        if not m:
            return super().send_head()
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2) or 0))
        end = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
        if start >= size:
            self.send_error(416)
            return None
        end = min(end, size - 1)
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        left = getattr(self, "_remaining", None)
        if left is None:
            return super().copyfile(source, outputfile)
        while left > 0:
            chunk = source.read(min(64 * 1024, left))
            if not chunk:
                break
            try:
                outputfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                break
            left -= len(chunk)
        self._remaining = None

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        if not getattr(self, "_remaining", None):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        # the page saves one frame per note into frames/ next to it; nothing else can be written
        frames = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frames")
        path = os.path.abspath(self.translate_path(self.path))
        size = int(self.headers.get("Content-Length") or 0)
        if os.path.dirname(path) != frames or not path.endswith(".jpg") or not 0 < size < 30_000_000:
            self.send_error(403)
            return
        os.makedirs(frames, exist_ok=True)
        with open(path, "wb") as f:
            f.write(self.rfile.read(size))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    ThreadingHTTPServer(("127.0.0.1", port), partial(RangeHandler, directory=ROOT)).serve_forever()
