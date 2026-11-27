import { readdirSync } from "node:fs";
import { join } from "node:path";
import { notWhileDeleting } from "./member-screens";

describe("The screens closed while an account waits to be deleted (spec 11, 3.4.4)", () => {
  it("are every page of Profile under settings: a new one is closed too", () => {
    const pages = readdirSync(join(__dirname, "..", "app", "settings"), {
      recursive: true,
      encoding: "utf8",
    })
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => `settings/${file.replaceAll("\\", "/").replace(/\.tsx$/, "")}`)
      .sort();
    expect(pages).not.toEqual([]);
    expect(pages.filter((page) => !(notWhileDeleting as readonly string[]).includes(page))).toEqual(
      [],
    );
  });
});
