// A software passkey for integration tests: makes the answers a browser's
// authenticator would, with a P-256 key and the "none" attestation. Never
// import this from application code.
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

type CborValue = number | string | Uint8Array | ReadonlyMap<CborValue, CborValue>;

function cborHead(major: number, length: number): number[] {
  if (length < 24) return [(major << 5) | length];
  if (length < 0x100) return [(major << 5) | 24, length];
  if (length < 0x10000) return [(major << 5) | 25, length >> 8, length & 0xff];
  return [
    (major << 5) | 26,
    (length >>> 24) & 0xff,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
  ];
}

/** CBOR, only as much as WebAuthn needs: integers, text, bytes and maps. */
function cbor(value: CborValue): Uint8Array {
  if (typeof value === "number") {
    return Uint8Array.from(value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value));
  }
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    return Buffer.concat([Uint8Array.from(cborHead(3, bytes.length)), bytes]);
  }
  if (value instanceof Uint8Array) {
    return Buffer.concat([Uint8Array.from(cborHead(2, value.length)), value]);
  }
  const parts: Uint8Array[] = [Uint8Array.from(cborHead(5, value.size))];
  for (const [key, entry] of value) parts.push(cbor(key), cbor(entry));
  return Buffer.concat(parts);
}

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

export interface TestAuthenticatorOptions {
  /** The console's origin the browser would report. */
  readonly origin: string;
  /** Leave the user-verified flag off, as a key without a PIN would. */
  readonly withoutUserVerification?: boolean;
}

export interface TestAuthenticator {
  readonly credentialId: string;
  /** Answers navigator.credentials.create with these options. */
  register(options: { challenge: string; user?: { id: string } }): Record<string, unknown>;
  /** Answers navigator.credentials.get with these options. */
  authenticate(options: { challenge: string }): Record<string, unknown>;
  /** Sets the signature counter, to act like a cloned key. */
  setCounter(counter: number): void;
  /** Answers from now on as if the browser were on another site. */
  setOrigin(origin: string): void;
  /** Answers from now on without checking who is there (no PIN or fingerprint). */
  skipUserVerification(): void;
}

export function createTestAuthenticator(options: TestAuthenticatorOptions): TestAuthenticator {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const credentialId = randomBytes(16);
  const hashOf = (origin: string) => createHash("sha256").update(new URL(origin).hostname).digest();
  let origin = options.origin;
  let rpIdHash = hashOf(origin);
  let counter = 0;
  let userHandle: string | undefined;
  let verified = options.withoutUserVerification === true ? 0 : 0x04;

  function coseKey(key: KeyObject): Uint8Array {
    const jwk = key.export({ format: "jwk" });
    return cbor(
      new Map<CborValue, CborValue>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x ?? "", "base64url")],
        [-3, Buffer.from(jwk.y ?? "", "base64url")],
      ]),
    );
  }

  function counterBytes(): Buffer {
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32BE(counter);
    return bytes;
  }

  function clientData(type: string, challenge: string): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  return {
    credentialId: b64url(credentialId),

    register({ challenge, user }) {
      userHandle = user?.id;
      const idLength = Buffer.alloc(2);
      idLength.writeUInt16BE(credentialId.length);
      const authData = Buffer.concat([
        rpIdHash,
        // User present, user verified (unless left out), attested credential data.
        Uint8Array.from([0x01 | verified | 0x40]),
        counterBytes(),
        Buffer.alloc(16),
        idLength,
        credentialId,
        coseKey(publicKey),
      ]);
      const attestationObject = cbor(
        new Map<CborValue, CborValue>([
          ["fmt", "none"],
          ["attStmt", new Map()],
          ["authData", authData],
        ]),
      );
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: "public-key",
        response: {
          clientDataJSON: b64url(clientData("webauthn.create", challenge)),
          attestationObject: b64url(attestationObject),
          transports: ["internal"],
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },

    authenticate({ challenge }) {
      counter += 1;
      const authData = Buffer.concat([
        rpIdHash,
        Uint8Array.from([0x01 | verified]),
        counterBytes(),
      ]);
      const data = clientData("webauthn.get", challenge);
      const signature = sign(
        "sha256",
        Buffer.concat([authData, createHash("sha256").update(data).digest()]),
        privateKey,
      );
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: "public-key",
        response: {
          clientDataJSON: b64url(data),
          authenticatorData: b64url(authData),
          signature: b64url(signature),
          ...(userHandle === undefined ? {} : { userHandle }),
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },

    setCounter(value) {
      counter = value;
    },

    setOrigin(value) {
      origin = value;
      rpIdHash = hashOf(value);
    },

    skipUserVerification() {
      verified = 0;
    },
  };
}
