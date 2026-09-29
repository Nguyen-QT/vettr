import { randomInt } from "node:crypto";

import { EMAIL_VERIFICATION_CODE_EXPIRY_MS } from "../constants";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";

const CODE_LENGTH = 6;
const CODE_UPPER_BOUND = 10 ** CODE_LENGTH;

export type EmailVerificationCode = {
  code: string;
  codeHash: string;
  expiresAt: Date;
};

// Pure helper -- no DB, no logging. The plaintext code is returned only
// so the caller can email it; only codeHash is ever meant to be stored.
// randomInt is a CSPRNG with an exclusive upper bound, and zero-padding
// keeps leading-zero codes at 6 digits, so the full 10^6 keyspace is used.
export function generateEmailVerificationCode(now: Date = new Date()): EmailVerificationCode {
  const code = randomInt(0, CODE_UPPER_BOUND).toString().padStart(CODE_LENGTH, "0");
  return {
    code,
    codeHash: hashEmailVerificationCode(code),
    expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_CODE_EXPIRY_MS),
  };
}
