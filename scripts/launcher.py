"""Portable Windows launcher for the compiled, browser-only GridSentinel demo."""
import argparse
import mimetypes
import sys
import threading
import urllib.request
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class LocalHandler(SimpleHTTPRequestHandler):
    def list_directory(self, path):
        self.send_error(404, 'Directory browsing is disabled')
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, fmt, *args):
        if args and str(args[1]) not in {'200', '304'}:
            super().log_message(fmt, *args)


def project_root():
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def serve(port, directory):
    handler = partial(LocalHandler, directory=str(directory))
    candidates = list(range(port, min(port + 10, 65536))) + [0] if port else [0]
    for candidate in candidates:
        try:
            server = ThreadingHTTPServer(('127.0.0.1', candidate), handler)
            server.daemon_threads = True
            return server
        except OSError:
            continue
    raise RuntimeError('Unable to bind a local loopback port')


def main():
    parser = argparse.ArgumentParser(description='Run the offline GridSentinel browser demo.')
    parser.add_argument('--port', type=int, default=5173, help='Preferred loopback port (default: 5173; 0 chooses a free port)')
    parser.add_argument('--no-browser', action='store_true', help='Print the URL without opening the default browser')
    parser.add_argument('--self-test', action='store_true', help='Verify the packaged frontend over HTTP, then exit')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('Port must be between 0 and 65535')
    directory = project_root() / 'frontend' / 'dist'
    if not (directory / 'index.html').is_file():
        print('Missing frontend/dist/index.html. Extract the entire ZIP before running GridSentinel.exe.', flush=True)
        if not args.self_test:
            input('Press Enter to close...')
        return 1
    mimetypes.add_type('text/javascript', '.js')
    mimetypes.add_type('text/css', '.css')
    mimetypes.add_type('image/svg+xml', '.svg')
    server = serve(args.port, directory)
    url = f'http://127.0.0.1:{server.server_port}/'
    if args.self_test:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                document = response.read().decode('utf-8')
                if response.status != 200 or 'GridSentinel' not in document:
                    raise RuntimeError('Packaged index page verification failed')
            for path in (directory / 'assets').glob('*'):
                with urllib.request.urlopen(url + 'assets/' + path.name, timeout=10) as response:
                    if response.status != 200 or not response.read(1):
                        raise RuntimeError(f'Asset verification failed: {path.name}')
            print('PASS: packaged frontend and assets are served on loopback.', flush=True)
            return 0
        finally:
            server.shutdown()
            server.server_close()
    print('GridSentinel | EV Charging Network Security & Grid Impact Simulator', flush=True)
    print('Mode: offline browser simulation. No real infrastructure is connected.', flush=True)
    print(f'Open: {url}', flush=True)
    print('Keep this window open. Press Ctrl+C to stop the local application.', flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nGridSentinel stopped.', flush=True)
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
