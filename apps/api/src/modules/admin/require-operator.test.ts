import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../../context.ts";
import {
  clearOperatorCookie,
  createRequireOperator,
  guardAdminPaths,
  openAdminRoutes,
  setOperatorCookie,
} from "./require-operator.ts";
import type { OperatorSessionService } from "./sessions.ts";

const noSessions: OperatorSessionService = {
  start: () => Promise.reject(new Error("not used")),
  authenticate: () => Promise.resolve(null),
  end: () => Promise.resolve(),
  endAllOf: () => Promise.resolve(0),
};

describe("the console's cookie (ADR 0028)", () => {
  const app = new Hono()
    .get("/set", (c) => {
      setOperatorCookie(c, "sr_os_token", true);
      return c.body(null, 204);
    })
    .get("/set-local", (c) => {
      setOperatorCookie(c, "sr_os_token", false);
      return c.body(null, 204);
    })
    .get("/clear", (c) => {
      clearOperatorCookie(c, true);
      return c.body(null, 204);
    });

  it("is sent only to /admin/v1, never to scripts or from other sites, for at most 12 hours", async () => {
    const cookie = (await app.request("/set")).headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sr_operator=sr_os_token");
    expect(cookie).toContain("Path=/admin/v1");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=43200");
  });

  it("works over plain http only in development", async () => {
    const cookie = (await app.request("/set-local")).headers.get("set-cookie") ?? "";
    expect(cookie).not.toContain("Secure");
  });

  it("is cleared on the same path, so the browser really forgets it", async () => {
    const cookie = (await app.request("/clear")).headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sr_operator=;");
    expect(cookie).toContain("Path=/admin/v1");
    expect(cookie).toContain("Max-Age=0");
  });
});

describe("guardAdminPaths", () => {
  const app = new Hono<AppEnv>();
  app.use(
    guardAdminPaths(
      createRequireOperator(noSessions, true),
      new Set(["POST /admin/v1/auth/sign-in"]),
    ),
  );
  app.all("*", (c) => c.text("reached"));

  it("leaves open only the exact routes listed", async () => {
    expect((await app.request("/admin/v1/auth/sign-in", { method: "POST" })).status).toBe(200);
    expect((await app.request("/admin/v1/auth/sign-in")).status).toBe(401);
    expect((await app.request("/admin/v1/auth/sign-in/x", { method: "POST" })).status).toBe(401);
    expect((await app.request("/admin/v1/auth/setup", { method: "POST" })).status).toBe(401);
  });

  it("does not touch the app's API or pages", async () => {
    expect((await app.request("/v1/health")).status).toBe(200);
    expect((await app.request("/admin")).status).toBe(200);
    expect((await app.request("/admin-v1")).status).toBe(200);
  });
});

describe("openAdminRoutes", () => {
  it("opens the passkey sign-in, the password sign-in (ADR 0041) and the two recovery steps (spec 22), nothing else", () => {
    expect([...openAdminRoutes].sort()).toEqual([
      "GET /admin/v1/auth/methods",
      "POST /admin/v1/auth/password",
      "POST /admin/v1/auth/recovery/code",
      "POST /admin/v1/auth/recovery/verify",
      "POST /admin/v1/auth/setup",
      "POST /admin/v1/auth/setup/options",
      "POST /admin/v1/auth/sign-in",
      "POST /admin/v1/auth/sign-in/options",
    ]);
  });
});
