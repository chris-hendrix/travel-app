import { createPrivateKey, sign, type KeyObject } from "node:crypto";

/**
 * APNs provider (JWT) token signer.
 *
 * Apple authenticates every push with a short-lived ES256 JWT built from the
 * private key downloaded from the developer portal as a `.p8`. Two details are
 * load-bearing and easy to get wrong:
 *
 *  - the signature must be raw `R‖S` (IEEE P1363). Node's default is DER, which
 *    Apple rejects — hence `dsaEncoding: "ieee-p1363"`.
 *  - tokens are valid for an hour, and regenerating them per push wastes rate
 *    limit, so we cache for 50 minutes.
 */

export interface ApnsTokenConfig {
  /** The 10-character key id from the portal, e.g. `ABC123DEFG`. */
  keyId: string;
  /** The 10-character Apple developer team id. */
  teamId: string;
  /** Contents of the `.p8` file (PKCS#8 PEM, possibly with `\n` escapes). */
  p8: string;
}

/** APNs rejects a token older than 60 minutes; regenerate well before that. */
const TOKEN_TTL_MS = 50 * 60 * 1000;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export interface ApnsTokenProvider {
  getToken(): Promise<string>;
  /** Test-only: force the cached token to look expired. */
  __expireForTests(): void;
}

export function createApnsTokenProvider(
  config: ApnsTokenConfig,
): ApnsTokenProvider {
  const key: KeyObject = createPrivateKey(config.p8.replace(/\\n/g, "\n"));
  const nowSeconds = () => Math.floor(Date.now() / 1000);

  let cached: { token: string; expiresAt: number } | null = null;

  async function getToken(): Promise<string> {
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    const iat = nowSeconds();
    const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
    const payload = base64url(
      JSON.stringify({ iss: config.teamId, iat }),
    );
    const signingInput = `${header}.${payload}`;
    const signature = sign("SHA256", Buffer.from(signingInput), {
      key,
      dsaEncoding: "ieee-p1363",
    });

    const token = `${signingInput}.${base64url(signature)}`;
    cached = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
    return token;
  }

  return {
    getToken,
    __expireForTests() {
      if (cached) cached.expiresAt = 0;
    },
  };
}

/** Test-only: drop the module-level memo so providers are independent. */
export function __resetApnsTokenCacheForTests(): void {
  // Each provider owns its own cache, so there is nothing global to clear.
  // Present so tests can reset deterministically as the cache grows.
}