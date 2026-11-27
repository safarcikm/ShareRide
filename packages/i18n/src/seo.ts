import type { MessageKey, Translate } from "./translator.ts";

/**
 * A public page with a title of its own (spec 23, 3.4 and 3.6), and the
 * name it is about, in the language shown.
 */
export type PublicPage =
  | { readonly kind: "find" }
  | { readonly kind: "carpool" }
  | { readonly kind: "about" }
  | { readonly kind: "deleteAccount" }
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
    case "deleteAccount":
      return {
        title: t("seo.title", { page: t(deleteAccountPage.title) }),
        description: t("seo.deleteAccountDescription"),
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
  /** How to delete an account (spec 32, section 5), under the documents. */
  readonly deleteAccount: SiteLink;
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
  deleteAccount: { label: "deleteAccount.link", href: "/delete-account" },
  operatorTitle: "about.operatorTitle",
  operator: "about.operator",
  contactTitle: "about.contactTitle",
  contact: "about.contact",
  email: "admin@puffinride.is",
};

/**
 * The account deletion page (spec 32, section 5), at `/delete-account`:
 * how to delete a PuffinRide account in the app or on the website, what is
 * erased, what is kept and for how long (spec 11, 3.5, as the privacy
 * register has it), and where to write. Google Play asks every app with
 * accounts for such a page, open without the app. The screen shows it and
 * the server writes it into the first answer's `<noscript>`, for search
 * engines and Google's check, which do not run the app.
 */
export const deleteAccountPage: {
  readonly path: "/delete-account";
  readonly title: MessageKey;
  readonly intro: MessageKey;
  readonly howTitle: MessageKey;
  readonly afterTitle: MessageKey;
  readonly after: MessageKey;
  readonly erasedTitle: MessageKey;
  readonly erased: readonly MessageKey[];
  readonly keptTitle: MessageKey;
  readonly kept: readonly MessageKey[];
  readonly helpTitle: MessageKey;
  readonly help: MessageKey;
  readonly privacyPolicy: SiteLink;
  /** Where someone signed in deletes the account: Delete my account itself. */
  readonly deleteHref: string;
  readonly email: string;
} = {
  path: "/delete-account",
  title: "deleteAccount.title",
  intro: "deleteAccount.intro",
  howTitle: "deleteAccount.howTitle",
  afterTitle: "deleteAccount.afterTitle",
  after: "deleteAccount.after",
  erasedTitle: "deleteAccount.erasedTitle",
  erased: [
    "deleteAccount.erasedProfile",
    "deleteAccount.erasedSignIn",
    "deleteAccount.erasedRest",
    "deleteAccount.erasedMessages",
  ],
  keptTitle: "deleteAccount.keptTitle",
  kept: [
    "deleteAccount.keptTrips",
    "deleteAccount.keptReviews",
    "deleteAccount.keptReports",
    "deleteAccount.keptSuspended",
    "deleteAccount.keptLaw",
    "deleteAccount.keptBackups",
  ],
  helpTitle: "deleteAccount.helpTitle",
  help: "deleteAccount.help",
  privacyPolicy: { label: "legal.readPrivacy", href: "/legal/privacy" },
  deleteHref: "/settings/privacy/delete",
  email: aboutPage.email,
};

/**
 * The steps to delete an account, naming Profile, Privacy and your data
 * and Delete my account as the app does, so the page follows the app when
 * those names change.
 */
export function deleteAccountSteps(t: Translate): string[] {
  return [
    t("deleteAccount.step1"),
    t("deleteAccount.step2", { profile: t("nav.profile"), privacy: t("settings.privacy") }),
    t("deleteAccount.step3", { delete: t("privacy.delete") }),
    t("deleteAccount.step4"),
  ];
}
