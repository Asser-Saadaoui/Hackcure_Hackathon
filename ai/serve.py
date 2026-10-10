"""Loopback-only development bridge. No hospital backend or final decision policy.

Run from ai/: python serve.py. State stays in the caller; nothing is logged/saved.
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from triage_pipeline import process_turn

ORIGINS = {'http://localhost:8081', 'http://127.0.0.1:8081', 'http://localhost:8082', 'http://127.0.0.1:8082'}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Do not put patient messages in access logs.

    def respond(self, status, data):
        body = json.dumps(data, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        origin = self.headers.get('Origin')
        if origin in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if self.headers.get('Origin') not in ORIGINS:
            return self.respond(403, {'error': 'Origin not allowed'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Vary', 'Origin')
        self.end_headers()

    def do_GET(self):
        self.respond(200 if self.path == '/health' else 404,
                     {'status': 'prototype', 'clinical_validation': False} if self.path == '/health' else {'error': 'Not found'})

    def do_POST(self):
        if self.path != '/turn':
            return self.respond(404, {'error': 'Not found'})
        if self.headers.get('Origin') and self.headers['Origin'] not in ORIGINS:
            return self.respond(403, {'error': 'Origin not allowed'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 500_000:
                return self.respond(413, {'error': 'Invalid payload size'})
            body = json.loads(self.rfile.read(size))
            message = body.get('message')
            state = body.get('patient_state')
            if not isinstance(message, str) or not 0 < len(message.strip()) <= 1000:
                raise ValueError('Message must contain 1–1000 characters')
            if state is not None and not isinstance(state, dict):
                raise ValueError('Invalid patient state')
            language = body.get('language', 'en')
            if language not in {'en', 'tn_arabizi', 'tn_arabic'}:
                raise ValueError('Unsupported extraction language')
            result = process_turn(state, message, body.get('previous_question_id'), language=language)
            self.respond(200, result)
        except (ValueError, KeyError, TypeError):
            self.respond(400, {'error': 'Invalid turn or stale question. Please start a new conversation.'})
        except Exception:
            self.respond(503, {'error': 'AI unavailable; emergency help must not wait for this app.'})


if __name__ == '__main__':
    print('Sahhanito development AI bridge: http://127.0.0.1:8000 (not for deployment)')
    ThreadingHTTPServer(('127.0.0.1', 8000), Handler).serve_forever()
