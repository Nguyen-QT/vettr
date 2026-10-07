import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { SCRYPT_KEYLEN } from "../constants";

const scryptAsync = promisify(scrypt);

// Recomputes the hash from the stored salt and compares with a
// timing-safe check, so response time can't leak how many bytes of
// the candidate matched. A null hash is a passwordless account: there
// is nothing to compare, so it fails without spending a scrypt.
export async function verifyPassword(
  password: string,
  storedHash: string | null
): Promise<boolean> {
  if (storedHash === null) return false;

  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derivedKey = (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer;

  if (derivedKey.length !== expected.length) return false;
  return timingSafeEqual(derivedKey, expected);
}
