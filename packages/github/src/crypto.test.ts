import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openSecret, parseEncryptionKey, sealSecret } from "./crypto.js";

describe("sealSecret / openSecret", () => {
  const key = parseEncryptionKey(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  it("round-trips plaintext", () => {
    const sealed = sealSecret("ghs_test_token", key);
    assert.notEqual(sealed, "ghs_test_token");
    assert.equal(openSecret(sealed, key), "ghs_test_token");
  });

  it("rejects tampered ciphertext", () => {
    const sealed = sealSecret("secret", key);
    const parts = sealed.split(".");
    parts[1] = Buffer.from("tampered").toString("base64url");
    assert.throws(() => openSecret(parts.join("."), key));
  });

  it("rejects short encryption keys", () => {
    assert.throws(() => parseEncryptionKey("abcd"), /64 hex/);
  });
});
