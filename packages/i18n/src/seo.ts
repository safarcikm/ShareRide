import type { MessageKey, Translate } from "./translator.ts";

/**
 * A public page with a title of its own (spec 23, 3.4 and 3.6), and the
 * name it is about, in the language shown.
 */
export type PublicPage =
  | { readonly kind: "find" }
  | { readonly kind: "carpool" }
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
    case "carpool":
      return {
        title: t("seo.title", { page: t("seo.carpoolTitle") }),
        description: t("seo.carpoolDescription"),
      };
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

/** A section of the Carpool in Iceland page: a heading, paragraphs, and a link or questions. */
export interface CarpoolSection {
  readonly heading: MessageKey;
  readonly paragraphs: readonly MessageKey[];
  readonly link?: { readonly label: MessageKey; readonly href: string };
  readonly questions?: readonly { readonly question: MessageKey; readonly answer: MessageKey }[];
}

/**
 * The Carpool in Iceland page (spec 23, 3.9), at `/carpool-iceland`: what
 * PuffinRide is and how carpooling with it works, in words, for people who
 * search for it. The screen shows it and the server writes it into the
 * first answer's `<noscript>`, for search engines that do not run the app.
 * Nothing about money (Martin's rule for marketing texts).
 */
export const carpoolPage: {
  readonly path: "/carpool-iceland";
  readonly title: MessageKey;
  readonly intro: MessageKey;
  readonly sections: readonly CarpoolSection[];
} = {
  path: "/carpool-iceland",
  title: "carpool.title",
  intro: "carpool.intro",
  sections: [
    {
      heading: "carpool.howTitle",
      paragraphs: ["carpool.howFind", "carpool.howBook", "carpool.howMeet", "carpool.howOffer"],
    },
    {
      heading: "carpool.pointsTitle",
      paragraphs: ["carpool.points"],
      link: { label: "meetingPoints.open", href: "/meeting-points" },
    },
    { heading: "carpool.roadsTitle", paragraphs: ["carpool.roads"] },
    {
      heading: "carpool.trustTitle",
      paragraphs: ["carpool.trust"],
      link: { label: "carpool.rules", href: "/legal/community-rules" },
    },
    {
      heading: "carpool.questionsTitle",
      paragraphs: [],
      questions: [
        { question: "carpool.taxiQuestion", answer: "carpool.taxiAnswer" },
        { question: "carpool.wordQuestion", answer: "carpool.wordAnswer" },
        { question: "carpool.languageQuestion", answer: "carpool.languageAnswer" },
        { question: "carpool.accountQuestion", answer: "carpool.accountAnswer" },
      ],
    },
  ],
};
