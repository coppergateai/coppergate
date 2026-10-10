import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

/** Parse a 32-byte key from 64-char hex (or reject). */
export function parseEncryptionKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 64 hex characters");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Seal plaintext as `base64(iv).base64(ciphertext).base64(tag)`.
 */
export function sealSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function openSecret(sealed: string, key: Buffer): string {
  const parts = sealed.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid sealed secret format");
  }
  const [ivB64, dataB64, tagB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
