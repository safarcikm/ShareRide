import type { Translate } from "./translator.ts";

/**
 * A public page with a title of its own (spec 23, 3.4 and 3.6), and the
 * name it is about, in the language shown.
 */
export type PublicPage =
  | { readonly kind: "find" }
  | { readonly kind: "meetingPoints" }
  | { readonly kind: "meetingPoint"; readonly name: string }
  | { readonly kind: "place"; readonly name: string };

export interface PageText {
  readonly title: string;
  readonly description: string;
}

/**
 * A public page's title and description. The app's screens and the
 * server's first answer both take them from here, so a search engine that
 * does not run the app reads the same title as one that does (3.6, item 2).
 */
export function pageText(t: Translate, page: PublicPage): PageText {
  switch (page.kind) {
    case "find":
      return { title: t("seo.findTitle"), description: t("seo.findDescription") };
    case "meetingPoints":
      return {
        title: t("seo.title", { page: t("meetingPoints.title") }),
        description: t("seo.meetingPointsDescription"),
      };
    case "meetingPoint":
      return {
        title: t("seo.title", { page: t("seo.meetingPointTitle", { name: page.name }) }),
        description: t("seo.meetingPointDescription", { name: page.name }),
      };
    case "place":
      return {
        title: t("seo.title", { page: t("seo.placeTitle", { place: page.name }) }),
        description: t("seo.placeDescription", { place: page.name }),
      };
  }
}
