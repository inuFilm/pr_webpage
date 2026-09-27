"""Serve the static lab on loopback; no uploads, external calls, or dependencies."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import webbrowser


def main() -> int:
    parser = argparse.ArgumentParser(description="撮影処理学習処のローカル起動")
    parser.add_argument("--port", type=int, default=8771, help="localhost port (default: 8771)")
    parser.add_argument("--no-browser", action="store_true", help="ブラウザを自動で開かない")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    root = Path(__file__).resolve().parents[2]
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        print(f"起動できません: {error}\n別の --port を指定してください。", file=sys.stderr)
        return 1
    url = f"http://127.0.0.1:{args.port}/tools/compolab/"
    print(f"撮影処理学習処: {url}\n停止は Ctrl+C。", flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
