// Hetzner Object Storage in Helsinki (ADR 0022), through its S3 interface:
// requests and links signed with AWS Signature Version 4 by aws4fetch. The
// bucket stays private; the apps show a photo through a signed link.
import { AwsClient } from "aws4fetch";
import { photoKeyPattern, photoLinkLifetimeMs, type PhotoStorage } from "./photo-storage.ts";

export interface HetznerPhotoStorageSettings {
  /** The location's endpoint, such as https://hel1.your-objectstorage.com. */
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKey: string;
  readonly secretKey: string;
  readonly fetch?: typeof globalThis.fetch;
}

const hourMs = 3600_000;

/** How long a request to the bucket may take: a 2 MB upload, with room. */
const requestTimeoutMs = 30_000;

/** A link signed at the start of the hour lasts the hour and one more. */
const linkSeconds = String((hourMs + photoLinkLifetimeMs) / 1000);

/** "20261117T130000Z", the form Signature Version 4 dates take. */
const startOfHour = (now: Date) =>
  new Date(Math.floor(now.getTime() / hourMs) * hourMs)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export function createHetznerPhotoStorage(settings: HetznerPhotoStorageSettings): PhotoStorage {
  const endpoint = new URL(settings.endpoint);
  // The location, such as hel1, is the endpoint's first label and the signing region.
  const region = endpoint.hostname.split(".")[0] ?? "";
  const origin = `https://${settings.bucket}.${endpoint.host}`;
  const client = new AwsClient({
    accessKeyId: settings.accessKey,
    secretAccessKey: settings.secretKey,
    service: "s3",
    region,
    retries: 0,
  });
  const send = settings.fetch ?? globalThis.fetch;

  const urlOf = (key: string) => {
    if (!photoKeyPattern.test(key)) throw new Error("Not a photo key.");
    return `${origin}/${key}`;
  };

  const request = async (method: "PUT" | "DELETE" | "GET", key: string, init: RequestInit = {}) => {
    const signed = await client.sign(urlOf(key), { ...init, method });
    // A request that hangs fails, so the operator can try again.
    return send(signed, { signal: AbortSignal.timeout(requestTimeoutMs) });
  };

  return {
    origin,

    async put(key, file) {
      const response = await request("PUT", key, {
        body: file,
        headers: { "Content-Type": "image/jpeg" },
      });
      if (!response.ok)
        throw new Error(`Photo storage answered ${String(response.status)} to PUT.`);
    },

    async remove(key) {
      const response = await request("DELETE", key);
      if (!response.ok && response.status !== 404) {
        throw new Error(`Photo storage answered ${String(response.status)} to DELETE.`);
      }
    },

    async read(key) {
      const response = await request("GET", key);
      if (!response.ok) {
        // Frees the connection; the answer's text is not needed.
        await response.body?.cancel();
        // The project's own keys may list the bucket, so a missing file is a 404, not a 403.
        if (response.status === 404) return undefined;
        throw new Error(`Photo storage answered ${String(response.status)} to GET.`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },

    async linkTo(key, now) {
      const url = new URL(urlOf(key));
      url.searchParams.set("X-Amz-Expires", linkSeconds);
      const signed = await client.sign(url, {
        method: "GET",
        aws: { signQuery: true, datetime: startOfHour(now) },
      });
      return signed.url;
    },
  };
}
