import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createLogger } from "./logger.ts";

const secret = "a file next to the build that must never be served";

/** A small stand-in for the console's Vite build, and the app's export. */
function builds() {
  const parent = mkdtempSync(join(tmpdir(), "shareride-admin-"));
  writeFileSync(join(parent, "secret.txt"), secret);
  const admin = join(parent, "admin");
  mkdirSync(join(admin, "assets"), { recursive: true });
  writeFileSync(join(admin, "index.html"), "<!doctype html><title>ShareRide console</title>");
  writeFileSync(join(admin, "assets", "index-abc123.js"), "console.log(1);");
  const web = join(parent, "web");
  mkdirSync(web);
  writeFileSync(join(web, "index.html"), "<!doctype html><title>ShareRide</title>");
  return { admin, web };
}

function setup(dirs: { admin?: string; web?: string }) {
  return createApp({
    logger: createLogger({ level: "silent" }),
    checkDatabase: () => Promise.resolve(),
    ...(dirs.web === undefined ? {} : { webAppDir: dirs.web }),
    ...(dirs.admin === undefined ? {} : { adminAppDir: dirs.admin }),
  });
}

describe("the operator console at /admin (ADR 0028)", () => {
  const app = setup(builds());

  it("serves its page for its own paths, never cached and never indexed", async () => {
    for (const path of ["/admin", "/admin/", "/admin/sign-in", "/admin/setup", "/admin/passkeys"]) {
      const response = await app.request(path);
      expect(response.status, path).toBe(200);
      expect(await response.text(), path).toContain("<title>ShareRide console</title>");
      expect(response.headers.get("cache-control"), path).toBe("no-cache");
      expect(response.headers.get("x-robots-tag"), path).toBe("noindex, nofollow");
    }
  });

  it("allows only its own scripts, styles, fonts and API", async () => {
    const policy = (await app.request("/admin")).headers.get("content-security-policy") ?? "";
    expect(policy.split("; ")).toEqual(
      expect.arrayContaining([
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self'",
        "connect-src 'self'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ]),
    );
    expect(policy).not.toContain("unsafe-inline");
  });

  it("serves its hashed files for a year, and 404 for a missing one", async () => {
    const file = await app.request("/admin/assets/index-abc123.js");
    expect(file.status).toBe(200);
    expect(file.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const missing = await app.request("/admin/assets/index-old.js");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-cache");
  });

  it("leaves /admin/v1 to the console's API", async () => {
    const response = await app.request("/admin/v1/no-such-route");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("never serves files outside the build", async () => {
    for (const path of [
      "/admin/../secret.txt",
      "/admin/..%2fsecret.txt",
      "/admin/%2e%2e/secret.txt",
      "/admin/assets/%2e%2e/%2e%2e/secret.txt",
    ]) {
      const response = await app.request(path);
      expect(await response.text(), path).not.toContain(secret);
    }
  });

  it("keeps the app's pages for every other path", async () => {
    const response = await app.request("/trips/abc");
    expect(await response.text()).toContain("<title>ShareRide</title>");
    expect(response.headers.get("content-security-policy")).toContain("'unsafe-inline'");
  });
});

describe("without the console built", () => {
  const app = setup({ web: builds().web });

  it("never opens the public web app at a console path", async () => {
    for (const path of ["/admin", "/admin/setup"]) {
      const response = await app.request(path);
      expect(response.status, path).toBe(404);
      expect(await response.text(), path).not.toContain("<title>ShareRide</title>");
    }
  });
});
