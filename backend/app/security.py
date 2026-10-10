"""Opaque bearer tokens (only their SHA-256 is stored) and scrypt password hashes (stdlib)."""
import hashlib
import hmac
import secrets


def new_token():
    return secrets.token_urlsafe(32)


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1)
    return f'scrypt$16384$8$1${salt.hex()}${digest.hex()}'


def verify_password(password, stored):
    try:
        _, n, r, p, salt, digest = stored.split('$')
        check = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p))
        return hmac.compare_digest(check.hex(), digest)
    except (ValueError, TypeError):
        return False
