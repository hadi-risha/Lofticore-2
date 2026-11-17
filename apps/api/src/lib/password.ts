import argon2 from "argon2";

// argon2id with the library defaults, which follow the current OWASP guidance.
export const hashPassword = (plain: string) => argon2.hash(plain, { type: argon2.argon2id });

export async function verifyPassword(hash: string, plain: string) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // a malformed hash should read as "wrong password", not crash the request
    return false;
  }
}

// Used when the email doesn't exist, so a login attempt costs the same time
// either way and can't be used to discover which emails are registered.
let dummyHash: Promise<string> | undefined;
export const burnPasswordCheck = async (plain: string) => {
  dummyHash ??= hashPassword("not-a-real-password");
  await verifyPassword(await dummyHash, plain);
};
