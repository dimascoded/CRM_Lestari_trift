import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(secret: string, salt: Buffer, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(secret, salt, length, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function hashSecret(secret: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(secret, salt, 64);
  return `scrypt$32768$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function verifySecret(secret: string, encoded: string) {
  const [algorithm, cost, saltHex, keyHex] = encoded.split("$");
  if (algorithm !== "scrypt" || cost !== "32768" || !saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await deriveKey(secret, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 200) {
    throw new Error("Password must contain between 12 and 200 characters.");
  }
  return hashSecret(password);
}

export async function verifyPassword(password: string, encoded: string) {
  if (password.length > 200) return false;
  return verifySecret(password, encoded);
}

export function generateCustomerLoginCode() {
  return String(randomInt(100_000, 1_000_000));
}

export async function hashCustomerLoginCode(code: string) {
  return hashSecret(code);
}

export async function verifyCustomerLoginCode(code: string, encoded: string) {
  return verifySecret(code, encoded);
}
