/**
 * 密码哈希：WebCrypto PBKDF2-SHA256。
 *
 * Better Auth 默认用纯 JS 的 scrypt，在 Workers 免费套餐（10ms CPU）下容易超时；
 * PBKDF2 由运行时原生实现，Workers 允许的最大迭代次数为 100000。
 * 存储格式：pbkdf2_sha256$<iterations>$<salt base64>$<hash base64>，迭代次数随哈希保存，
 * 以后调整参数不影响旧密码校验。
 */

const PREFIX = "pbkdf2_sha256";
const MAX_ITERATIONS = 100_000;
const MIN_ITERATIONS = 10_000;
const KEY_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function resolveIterations(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return MAX_ITERATIONS;
  return Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, Math.trunc(n)));
}

export async function hashPassword(password: string, iterations = MAX_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return `${PREFIX}$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) return false;
  try {
    const salt = fromBase64(parts[2]);
    const expected = fromBase64(parts[3]);
    const actual = await derive(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
