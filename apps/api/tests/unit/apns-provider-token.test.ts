import { describe, it, expect } from "vitest";
import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import { createApnsTokenProvider } from "@/lib/apns-token.js";

/** A throwaway ES256 key pair standing in for an Apple `.p8` download. */
function makeKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const p8 = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  return { p8, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) as string };
}

function decodeSegment(segment: string): string {
  return Buffer.from(segment, "base64url").toString("utf8");
}

describe("apns provider token", () => {
  it("builds a three-segment JWT with an ES256 header naming the key id", async () => {
    const { p8 } = makeKeyPair();
    const provider = createApnsTokenProvider({
      keyId: "KEY1234567",
      teamId: "TEAM123456",
      p8,
    });

    const token = await provider.getToken();
    const segments = token.split(".");
    expect(segments).toHaveLength(3);
    expect(segments.every((s) => s.length > 0)).toBe(true);

    expect(JSON.parse(decodeSegment(segments[0]!))).toEqual({
      alg: "ES256",
      kid: "KEY1234567",
    });
  });

  it("carries iss and iat, with iat within a minute of now", async () => {
    const { p8 } = makeKeyPair();
    const provider = createApnsTokenProvider({
      keyId: "KEY1234567",
      teamId: "TEAM123456",
      p8,
    });

    const before = Math.floor(Date.now() / 1000);
    const token = await provider.getToken();
    const after = Math.floor(Date.now() / 1000);

    const payload = JSON.parse(decodeSegment(token.split(".")[1]!));
    expect(payload.iss).toBe("TEAM123456");
    expect(typeof payload.iat).toBe("number");
    expect(payload.iat).toBeGreaterThanOrEqual(before - 60);
    expect(payload.iat).toBeLessThanOrEqual(after + 60);
  });

  it("signs with raw R||S (ieee-p1363) so the signature verifies against the .p8 public key", async () => {
    const { p8, publicKeyPem } = makeKeyPair();
    const provider = createApnsTokenProvider({
      keyId: "KEY1234567",
      teamId: "TEAM123456",
      p8,
    });

    const token = await provider.getToken();
    const [header, payload, signature] = token.split(".");
    const signatureBytes = Buffer.from(signature!, "base64url");
    // P1363 = R||S, 64 bytes for P-256. DER would be 70-72 and would fail here.
    expect(signatureBytes).toHaveLength(64);

    const verifier = createVerify("SHA256");
    verifier.update(`${header}.${payload}`);
    // Verify the raw R||S as P1363 — the exact shape APNs parses. Node's verify
    // path does honour dsaEncoding; its default is DER, and these same 64 bytes
    // return false there, so asserting the length *and* a P1363 verification is
    // what makes this a real DER/P1363 trap rather than a re-signing.
    const ok = verifier.verify(
      { key: createPublicKey(publicKeyPem), dsaEncoding: "ieee-p1363" },
      signatureBytes,
    );
    expect(ok).toBe(true);
  });

  it("caches the token for its lifetime and issues a fresh one once it expires", async () => {
    const { p8 } = makeKeyPair();
    const provider = createApnsTokenProvider({
      keyId: "KEY1234567",
      teamId: "TEAM123456",
      p8,
    });

    const first = await provider.getToken();
    expect(await provider.getToken()).toBe(first);

    await provider.__expireForTests();
    const second = await provider.getToken();
    expect(second).not.toBe(first);
  });
});