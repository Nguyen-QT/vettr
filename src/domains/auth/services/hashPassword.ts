import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

import { SCRYPT_KEYLEN, SCRYPT_SALT_BYTES } from "../constants";

const scryptAsync = promisify(scrypt);

// Stored as "saltHex:hashHex" so verifyPassword can recover the salt
// used for this specific hash -- a fresh random salt every call, never
// reused across accounts.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derivedKey = (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}
