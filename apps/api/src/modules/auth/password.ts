import { hash, verify } from '@node-rs/argon2';

// @node-rs/argon2 ships prebuilt binaries and defaults to argon2id, so there is
// no native compiler step in the deployment image.

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // A stored hash that cannot be parsed must fail the login, not crash it.
    return false;
  }
}
