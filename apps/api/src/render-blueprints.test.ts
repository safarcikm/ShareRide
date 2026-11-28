import { readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { describe, expect, it } from "vitest";

// Render builds the server's image again for every commit a service follows,
// and its build minutes are paid for (2026-11-28: the month's ran out). Each
// service names the paths whose changes leave its image as it is, and these
// tests hold those lists to what the image is made of (apps/api/Dockerfile).

const repo = new URL("../../../", import.meta.url);

const blueprints = ["infra/render/render.yaml", "infra/render/production.yaml"] as const;

interface Service {
  readonly blueprint: string;
  readonly type: string;
  name: string;
  readonly ignoredPaths: string[];
}

/** Each service's type, name and ignored paths, read line by line. */
function servicesOf(blueprint: string): Service[] {
  const lines = readFileSync(new URL(blueprint, repo), "utf8").split("\n");
  const services: Service[] = [];
  let current: Service | undefined;
  let listIndent: number | undefined;
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    const text = line.trim();
    if (listIndent !== undefined) {
      if (text.startsWith("- ") && indent >= listIndent) {
        current?.ignoredPaths.push(text.slice(2).replace(/^"(.*)"$/, "$1"));
        continue;
      }
      listIndent = undefined;
    }
    const type = /^- type: (web|cron)$/.exec(text);
    if (type?.[1] !== undefined) {
      current = { blueprint, type: type[1], name: "", ignoredPaths: [] };
      services.push(current);
      continue;
    }
    const name = /^name: (\S+)$/.exec(text);
    if (current !== undefined && current.name === "" && name?.[1] !== undefined) {
      current.name = name[1];
      continue;
    }
    if (text === "ignoredPaths:") listIndent = indent;
  }
  return services;
}

const services = blueprints.flatMap(servicesOf);

const ignores = (service: Service, path: string) =>
  service.ignoredPaths.some((pattern) => matchesGlob(path, pattern));

/** Files the image is made of, for every service. */
const serverFiles = [
  "apps/api/src/server.ts",
  "apps/api/Dockerfile",
  "packages/domain/src/index.ts",
  "packages/db/migrations/0000_extensions.sql",
  // Code reads the legal texts: a fixed typo must reach the servers.
  "packages/db/src/legal/texts/terms-v3.en.md",
  "packages/i18n/src/messages/en.ts",
  "pnpm-lock.yaml",
  "package.json",
];

/** The website and the console, which only the site's image serves. */
const siteFiles = [
  "apps/mobile/src/app/index.tsx",
  "apps/mobile/app.json",
  "apps/admin/src/main.tsx",
];

/** Files no image is made of (.dockerignore, or never read by a build). */
const nothingForTheImage = [
  "docs/specs/2026-11-27-phone-apps-in-the-stores.md",
  "marketing/README.md",
  "marketing/launch-ads/flyer/preview-a5-1.png",
  "CHANGELOG.md",
  ".claude/skills/write-adr/SKILL.md",
  ".github/workflows/ci.yml",
  "infra/docker/smoke-test.sh",
  "apps/api/src/config.test.ts",
  "apps/mobile/src/__tests__/store-builds.test.ts",
  "apps/mobile/e2e/about.spec.ts",
  "apps/mobile/maestro/flows/sign-up.yaml",
  "apps/mobile/eas.json",
  "apps/admin/e2e/console.spec.ts",
];

describe("Render's build filters (build minutes)", () => {
  it("reads both servers and both clean-up jobs", () => {
    expect(services.map((service) => `${service.type} ${service.name}`)).toEqual([
      "web shareride-staging-api",
      "cron shareride-staging-clean-up",
      "web puffinride-api",
      "cron puffinride-clean-up",
    ]);
  });

  it.each(services.map((service) => [service.name, service] as const))(
    "%s builds again for every change to the server",
    (_name, service) => {
      expect(serverFiles.filter((path) => ignores(service, path))).toEqual([]);
    },
  );

  it.each(services.map((service) => [service.name, service] as const))(
    "%s does not build for docs, marketing, tests, CI or the phone builds",
    (_name, service) => {
      expect(nothingForTheImage.filter((path) => !ignores(service, path))).toEqual([]);
    },
  );

  it("builds the sites again for the website and the console", () => {
    for (const service of services.filter((each) => each.type === "web")) {
      expect(siteFiles.filter((path) => ignores(service, path))).toEqual([]);
    }
  });

  it("leaves the clean-up jobs' images as they are for the website and the console", () => {
    // The job runs apps/api's clean-up only; the site and console in its
    // image are never served.
    for (const service of services.filter((each) => each.type === "cron")) {
      expect(siteFiles.filter((path) => !ignores(service, path))).toEqual([]);
    }
  });
});
