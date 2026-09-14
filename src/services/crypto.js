// 비밀번호 해시 (WebCrypto). 브라우저와 Node 모두에서 동작.
// 로컬 인증에서만 직접 사용하며, Firebase 인증은 Firebase 가 자체적으로 해시(scrypt)한다.
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function sha256hex(text) {
  const buf = await subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const ITERATIONS = 100000;

async function derive(password, salt, iterations) {
  const key = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

/** 비밀번호 → { algo, salt, hash, iterations } (평문은 저장하지 않음) */
export async function hashPassword(password) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return { algo: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: b64(salt), hash: b64(hash) };
}

export async function verifyPassword(password, record) {
  if (!record || record.algo !== 'PBKDF2-SHA256') return false;
  const hash = new Uint8Array(await derive(password, unb64(record.salt), record.iterations));
  const expected = unb64(record.hash);
  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];   // 상수 시간 비교
  return diff === 0;
}
