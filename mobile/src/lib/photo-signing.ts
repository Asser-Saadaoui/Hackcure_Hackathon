import * as Crypto from 'expo-crypto';

/**
 * Signed photo upload (backend/app/photo_security.py):
 *   sha256 = SHA-256(base64 payload)                                   integrity
 *   sig    = HMAC-SHA256(key = SHA-256(session token), "referralId.ts.nonce.sha256")   authenticity
 *   ts + nonce                                                         replay protection (5 min, single use)
 * The session token itself never leaves the device in the signature; the server stores exactly its SHA-256.
 */

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
type Bytes = Uint8Array<ArrayBuffer>;
const utf8 = (text: string): Bytes => new Uint8Array(new TextEncoder().encode(text));

async function sha256Bytes(data: Bytes): Promise<Bytes> {
  return new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data));
}

/** HMAC-SHA256 (RFC 2104) from SHA-256: expo-crypto has digests but no HMAC. */
async function hmacSha256(key: Bytes, message: Bytes): Promise<string> {
  const block = 64;
  let k = key.length > block ? await sha256Bytes(key) : key;
  const padded = new Uint8Array(block);
  padded.set(k);
  const inner = new Uint8Array(block + message.length);
  const outer = new Uint8Array(block + 32);
  for (let i = 0; i < block; i++) {
    inner[i] = padded[i] ^ 0x36;
    outer[i] = padded[i] ^ 0x5c;
  }
  inner.set(message, block);
  outer.set(await sha256Bytes(inner), block);
  k = new Uint8Array(0);
  return hex(await sha256Bytes(outer));
}

export async function signPhoto(token: string, referralId: string, base64: string) {
  const data = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;   // strip a data: URL prefix
  const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data);
  const key = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token);
  const ts = Date.now();
  const nonce = hex(Crypto.getRandomBytes(16));
  const sig = await hmacSha256(utf8(key), utf8(`${referralId}.${ts}.${nonce}.${sha256}`));
  return { data, sha256, ts, nonce, sig };
}
