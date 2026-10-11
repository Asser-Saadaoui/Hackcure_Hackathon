"""Security of the photos a patient sends to the hospital (ED chat).

In transit: HTTPS (Caddy in production). On top of TLS, every upload carries
  - sha256: SHA-256 of the base64 payload, recomputed here (integrity: corruption or tampering is rejected);
  - sig:    HMAC-SHA256 over "referral_id.ts.nonce.sha256" with key = SHA-256(session token), which only the patient's
            device and this server know (the server stores exactly that hash): binds the photo to this patient, this
            referral and this moment (authenticity);
  - ts + nonce: rejected if older than 5 minutes or already seen (replay protection).
Then the image is decoded and re-encoded by Pillow: size and pixel limits (decompression bombs), EXIF / GPS and any
other metadata removed, anything that is not a real image rejected. Rate limit: 10 photos per referral per 10 minutes.

At rest: AES-256-GCM (key IMAGE_KEY, 32 bytes base64; in development a key file is generated, mode 0600), with the
message id as associated data (a blob cannot be moved to another message). The SHA-256 of the stored image is kept
and checked on every read; staff receive it in X-Content-SHA256 and the dashboard verifies it before display.
"""
import base64
import binascii
import hashlib
import hmac
import io
import os
import secrets
import threading
import time
from collections import deque
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import ROOT

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 40_000_000          # larger images are refused (decompression bomb guard)
MAX_SIDE = 2048                  # stored images are downscaled to this
FRESHNESS_S = 300
RATE = (10, 600)                 # photos, seconds (per referral)
ENC = 'aes256gcm'

Image.MAX_IMAGE_PIXELS = MAX_PIXELS
_lock = threading.Lock()
_seen: dict[str, float] = {}     # nonce -> expiry (single backend process; use Redis if scaled out)
_uploads: dict[str, deque] = {}  # referral id -> recent upload times


def _key() -> bytes:
    raw = os.environ.get('IMAGE_KEY')
    if raw:
        key = base64.b64decode(raw)
    else:
        path = Path(os.environ.get('IMAGE_KEY_FILE', ROOT / '.image.key'))
        if not path.exists():
            path.write_bytes(base64.b64encode(secrets.token_bytes(32)))
            path.chmod(0o600)
        key = base64.b64decode(path.read_bytes())
    if len(key) != 32:
        raise RuntimeError('IMAGE_KEY must be 32 bytes, base64-encoded')
    return key


_aes = None


def _cipher():
    global _aes
    if _aes is None:
        _aes = AESGCM(_key())
    return _aes


def verify_upload(token_hash: str, referral_id: str, data_b64: str, sha256: str, ts: int, nonce: str, sig: str) -> bytes:
    """Check freshness, replay, integrity and signature; return the decoded bytes."""
    now = time.time()
    if abs(now - ts / 1000) > FRESHNESS_S:
        raise HTTPException(400, 'Photo request expired. Please try again.')
    payload = data_b64.split(',', 1)[-1]   # accepts a data: URL
    digest = hashlib.sha256(payload.encode()).hexdigest()
    if not hmac.compare_digest(digest, sha256.lower()):
        raise HTTPException(400, 'Photo integrity check failed (SHA-256 mismatch).')
    expected = hmac.new(token_hash.encode(), f'{referral_id}.{ts}.{nonce}.{digest}'.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig.lower()):
        raise HTTPException(403, 'Photo signature invalid.')
    with _lock:
        for k in [k for k, exp in _seen.items() if exp < now]:
            del _seen[k]
        if nonce in _seen:
            raise HTTPException(409, 'Photo already received (replay).')
        _seen[nonce] = now + 2 * FRESHNESS_S
        recent = _uploads.setdefault(referral_id, deque())
        while recent and recent[0] < now - RATE[1]:
            recent.popleft()
        if len(recent) >= RATE[0]:
            raise HTTPException(429, 'Too many photos. Please wait a few minutes.')
        recent.append(now)
    try:
        data = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, 'Invalid image data.')
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, 'Image too large (max 8 MB).')
    return data


def sanitize(data: bytes) -> bytes:
    """Decode and re-encode as JPEG: no EXIF / GPS / comments, bounded size; non-images are rejected."""
    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.format not in ('JPEG', 'PNG', 'WEBP', 'MPO'):
                raise HTTPException(415, 'Only JPEG, PNG or WebP photos are accepted.')
            probe.verify()
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)      # keep the orientation, then drop the metadata
            img = img.convert('RGB')
            img.thumbnail((MAX_SIDE, MAX_SIDE))
            out = io.BytesIO()
            img.save(out, 'JPEG', quality=85, optimize=True)   # no exif= / icc: metadata is not carried over
            return out.getvalue()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(415, 'This file is not a valid photo.')


def encrypt(plain: bytes, message_id: str) -> bytes:
    nonce = secrets.token_bytes(12)
    return nonce + _cipher().encrypt(nonce, plain, message_id.encode())


def decrypt(blob: bytes, message_id: str) -> bytes:
    return _cipher().decrypt(blob[:12], blob[12:], message_id.encode())


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


HEADERS = {
    'Cache-Control': 'no-store',                     # medical photo: never kept in a shared or disk cache
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
    'Content-Disposition': 'inline; filename="photo.jpg"',
    'Referrer-Policy': 'no-referrer',
}
