import type { MessageKey, Translate } from "./translator.ts";

/**
 * A public page with a title of its own (spec 23, 3.4 and 3.6), and the
 * name it is about, in the language shown.
 */
export type PublicPage =
  | { readonly kind: "find" }
  | { readonly kind: "carpool" }
  | { readonly kind: "about" }
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
    case "about":
      return {
        title: t("seo.title", { page: t(aboutPage.title) }),
        description: t("seo.aboutDescription"),
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
        { question: "carpool.whatQuestion", answer: "carpool.whatAnswer" },
        { question: "carpool.taxiQuestion", answer: "carpool.taxiAnswer" },
        { question: "carpool.wordQuestion", answer: "carpool.wordAnswer" },
        { question: "carpool.languageQuestion", answer: "carpool.languageAnswer" },
        { question: "carpool.accountQuestion", answer: "carpool.accountAnswer" },
      ],
    },
  ],
};

/**
 * PuffinRide elsewhere: our Facebook Page (spec 28, 3.6) and Instagram
 * profile, @puffinride.is (spec 30, 3.1). The app links to them, and the
 * server names them to Google as ours (spec 23, 3.6, item 8). One place to
 * change when the Page gets its short name.
 */
export const socialProfiles: { readonly facebook: string; readonly instagram: string } = {
  facebook: "https://www.facebook.com/profile.php?id=61597055066444",
  instagram: "https://www.instagram.com/puffinride.is/",
};

/** A link on the About page, or in the website's footer: its text and the app's address. */
export interface SiteLink {
  readonly label: MessageKey;
  readonly href: string;
}

/**
 * The About page (spec 30, 3.1), at `/about`: what PuffinRide is, the
 * legal documents, who runs it and how to reach us. The screen shows it,
 * the website's footer links to the same documents, and the server writes
 * it into the first answer's `<noscript>`, for search engines that do not
 * run the app. Who runs PuffinRide is said as the published Terms say it
 * (R30.2); nothing about money (R30.3).
 */
export const aboutPage: {
  readonly path: "/about";
  readonly title: MessageKey;
  readonly intro: readonly MessageKey[];
  readonly howItWorks: SiteLink;
  readonly documentsTitle: MessageKey;
  readonly documents: readonly SiteLink[];
  readonly operatorTitle: MessageKey;
  readonly operator: MessageKey;
  readonly contactTitle: MessageKey;
  readonly contact: MessageKey;
  /** The address the Terms and the Privacy Policy give; hello@ only sends. */
  readonly email: string;
} = {
  path: "/about",
  title: "about.title",
  intro: ["about.intro", "about.beta"],
  howItWorks: { label: "home.howItWorks", href: carpoolPage.path },
  documentsTitle: "about.documents",
  documents: [
    { label: "legal.terms", href: "/legal/terms" },
    { label: "legal.rules", href: "/legal/community-rules" },
    { label: "legal.privacy", href: "/legal/privacy" },
    { label: "cookies.title", href: "/cookies" },
  ],
  operatorTitle: "about.operatorTitle",
  operator: "about.operator",
  contactTitle: "about.contactTitle",
  contact: "about.contact",
  email: "admin@puffinride.is",
};
