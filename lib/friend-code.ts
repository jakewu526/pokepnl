import { randomInt } from "crypto";

// Excludes 0/O and 1/I/L -- easy to misread when someone reads a code aloud
// or copies it by hand.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 7;

// getOrCreateFriendCode (app/actions/friends.ts) doesn't pre-check
// uniqueness -- it attempts a write with a freshly generated code and
// retries on Prisma's P2002 unique-violation, the same DB-constraint-first
// convention the rest of this codebase leans on.
export function generateFriendCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// Codes are shown as e.g. "7K9M-2XQ" for readability, but stored/compared
// without the separator -- this strips whatever the user typed back down to
// the raw alphabet before a lookup.
export function normalizeFriendCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatFriendCode(code: string): string {
  const mid = Math.ceil(code.length / 2);
  return `${code.slice(0, mid)}-${code.slice(mid)}`;
}
