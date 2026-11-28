import { readdirSync } from "node:fs";
import { join } from "node:path";
import { memberScreens, notWhileDeleting } from "./member-screens";

const app = join(__dirname, "..", "app");

/** Every file under a folder of the app's pages, as the layout names it. */
const pagesUnder = (folder: string) =>
  readdirSync(join(app, folder), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".tsx"))
    .map((file) =>
      join(folder, file)
        .replaceAll("\\", "/")
        .replace(/\.tsx$/, ""),
    )
    .sort();

/** A list names `people/[profileId]/index` so, or by its folder. */
const listed = (list: readonly string[], page: string) =>
  list.includes(page) || list.includes(page.replace(/\/index$/, ""));

/**
 * What an account that waits to be deleted meets on the pages that are in
 * neither list of member-screens.ts, each for its reason. A page is open by
 * its address unless something closes it, so a new page has to be put in
 * one of the lists, or here with why.
 */
const decidedElsewhere: readonly string[] = [
  // Not pages: layouts, and the phone's handler of links.
  "_layout",
  "(tabs)/_layout",
  "sign-in/_layout",
  "+native-intent",
  // The page such an account is shown.
  "account/deletion",
  // Open to it on purpose (A59): a notice's email links there, and a person
  // may read or appeal one before the account goes.
  "notices",
  // The tabs send it to the page it is shown (the tabs' layout).
  "(tabs)/index",
  "(tabs)/messages",
  "(tabs)/my-rides",
  "(tabs)/offer",
  "(tabs)/profile",
  // Signing in closes itself for someone signed in, and an invite leads there.
  "sign-in/index",
  "sign-in/code",
  "sign-in/country",
  "sign-in/email-code",
  "sign-in/invite",
  "sign-in/return",
  "invite/[code]",
  // The steps of signing up have their own guards, shut to it.
  "onboarding/about-you",
  "onboarding/terms",
  // Open to anyone, signed in or not: nothing on them is the account's.
  "+not-found",
  "about",
  "carpool-iceland",
  "coming-soon",
  "cookies",
  // How to delete an account (spec 32, section 5): signed in, its button
  // leads to Profile, which closes for an account already waiting.
  "delete-account",
  "legal/index",
  "legal/[type]",
  "meeting-points/index",
  "meeting-points/[id]/index",
  "places/[id]",
  "rides/index",
  "search/index",
  "search/results",
  "trips/[id]/index",
];

describe("The screens closed while an account waits to be deleted (spec 11, 3.4.4)", () => {
  it("are every page of Profile under settings: a new one is closed too", () => {
    const pages = pagesUnder("settings");
    expect(pages).not.toEqual([]);
    expect(pages.filter((page) => !(notWhileDeleting as readonly string[]).includes(page))).toEqual(
      [],
    );
  });

  it("leave no page open by being forgotten: each is in a list, or named here with why", () => {
    const pages = pagesUnder(".");
    expect(pages.length).toBeGreaterThan(50);
    expect(
      pages.filter(
        (page) =>
          !listed(memberScreens, page) &&
          !listed(notWhileDeleting, page) &&
          !decidedElsewhere.includes(page),
      ),
    ).toEqual([]);
  });

  it("name only pages there are", () => {
    const pages = pagesUnder(".");
    const known = (name: string) => pages.includes(name) || pages.includes(`${name}/index`);
    expect(
      [...memberScreens, ...notWhileDeleting, ...decidedElsewhere].filter((name) => !known(name)),
    ).toEqual([]);
  });
});
