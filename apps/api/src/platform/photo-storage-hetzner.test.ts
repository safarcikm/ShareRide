import { describe, expect, it } from "vitest";
import { createHetznerPhotoStorage } from "./photo-storage-hetzner.ts";

const key = "meeting-points/0193f0c4-7d4a-7b1e-9c2a-123456789abc.jpg";

const settings = {
  endpoint: "https://hel1.your-objectstorage.com",
  bucket: "shareride-photos",
  accessKey: "TESTACCESSKEY",
  secretKey: "test-secret-key",
};

/** A fetch that records each request and answers with the next status. */
function recordingFetch(...statuses: number[]) {
  const requests: Request[] = [];
  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    return Promise.resolve(new Response(null, { status: statuses.shift() ?? 200 }));
  };
  return { requests, fetch };
}

describe("createHetznerPhotoStorage", () => {
  it("links to the bucket's own host, which the pages allow images from", () => {
    const storage = createHetznerPhotoStorage({ ...settings, fetch: recordingFetch().fetch });
    expect(storage.origin).toBe("https://shareride-photos.hel1.your-objectstorage.com");
  });

  it("stores a photo as a private JPEG with a signed request", async () => {
    const { requests, fetch } = recordingFetch(200);
    const storage = createHetznerPhotoStorage({ ...settings, fetch });
    const file = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    await storage.put(key, file);
    const [request] = requests;
    expect(request?.method).toBe("PUT");
    expect(request?.url).toBe(`https://shareride-photos.hel1.your-objectstorage.com/${key}`);
    expect(request?.headers.get("content-type")).toBe("image/jpeg");
    expect(request?.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=TESTACCESSKEY\/\d{8}\/hel1\/s3\/aws4_request, /,
    );
    expect(request?.headers.get("x-amz-acl")).toBeNull();
    expect(new Uint8Array((await request?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(file);
  });

  it("throws when the bucket refuses, without the keys in the message", async () => {
    const storage = createHetznerPhotoStorage({ ...settings, fetch: recordingFetch(403).fetch });
    const error = await storage.put(key, new Uint8Array([1])).then(
      () => null,
      (caught: unknown) => caught as Error,
    );
    expect(error?.message).toBe("Photo storage answered 403 to PUT.");
    expect(error?.message).not.toContain(settings.secretKey);
  });

  it("deletes a photo, and a photo already gone is fine", async () => {
    const { requests, fetch } = recordingFetch(204, 404);
    const storage = createHetznerPhotoStorage({ ...settings, fetch });
    await storage.remove(key);
    await storage.remove(key);
    expect(requests.map((request) => request.method)).toEqual(["DELETE", "DELETE"]);
  });

  it("reads a photo back with a signed request, for Download my data", async () => {
    const file = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const requests: Request[] = [];
    const storage = createHetznerPhotoStorage({
      ...settings,
      fetch: (input, init) => {
        requests.push(new Request(input, init));
        return Promise.resolve(new Response(file, { status: 200 }));
      },
    });
    expect(await storage.read(key)).toEqual(file);
    const [request] = requests;
    expect(request?.method).toBe("GET");
    expect(request?.url).toBe(`https://shareride-photos.hel1.your-objectstorage.com/${key}`);
    expect(request?.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it("reads nothing for a photo that is gone, and throws when the bucket fails", async () => {
    const { fetch } = recordingFetch(404, 500);
    const storage = createHetznerPhotoStorage({ ...settings, fetch });
    expect(await storage.read(key)).toBeUndefined();
    await expect(storage.read(key)).rejects.toThrow("Photo storage answered 500 to GET.");
  });

  it("throws when a delete fails, so the photo is not taken as gone", async () => {
    const storage = createHetznerPhotoStorage({ ...settings, fetch: recordingFetch(500).fetch });
    await expect(storage.remove(key)).rejects.toThrow("Photo storage answered 500 to DELETE.");
  });

  it("signs a link that lasts two hours from the start of the hour", async () => {
    const storage = createHetznerPhotoStorage({ ...settings, fetch: recordingFetch().fetch });
    const link = new URL(await storage.linkTo(key, new Date("2026-11-17T13:59:30Z")));
    expect(`${link.origin}${link.pathname}`).toBe(
      `https://shareride-photos.hel1.your-objectstorage.com/${key}`,
    );
    expect(link.searchParams.get("X-Amz-Date")).toBe("20261117T130000Z");
    expect(link.searchParams.get("X-Amz-Expires")).toBe("7200");
    expect(link.searchParams.get("X-Amz-Credential")).toBe(
      "TESTACCESSKEY/20261117/hel1/s3/aws4_request",
    );
    expect(link.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives the same link all through the hour, so apps can cache the photo", async () => {
    const storage = createHetznerPhotoStorage({ ...settings, fetch: recordingFetch().fetch });
    const early = await storage.linkTo(key, new Date("2026-11-17T13:00:05Z"));
    const late = await storage.linkTo(key, new Date("2026-11-17T13:59:55Z"));
    const next = await storage.linkTo(key, new Date("2026-11-17T14:00:05Z"));
    expect(late).toBe(early);
    expect(next).not.toBe(early);
  });

  it("refuses a key that is not a photo's", async () => {
    const storage = createHetznerPhotoStorage({ ...settings, fetch: recordingFetch().fetch });
    await expect(storage.put("../other-bucket/x", new Uint8Array([1]))).rejects.toThrow(
      "Not a photo key.",
    );
  });
});
