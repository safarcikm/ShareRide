/**
 * The app's pages a notification may open that are not about one record
 * (a booking, a ride, a conversation or a meeting point have addresses
 * with an ID). The API names one of these as a notification's `path`, and
 * the app opens a path only if it is listed here: a page named on one side
 * alone opened nothing. A new page goes here first.
 */
export const notificationScreens = {
  /** Download my data, when the file is ready (spec 11, 3.2). */
  downloadData: "/settings/privacy/download",
  /** Where a person asks about their data, when a question is answered (spec 11, 3.6). */
  privacy: "/settings/privacy",
  /** Notices from PuffinRide (spec 9). */
  notices: "/notices",
  /** My reports (spec 9). */
  reports: "/settings/reports",
  /** My feedback, when it has a reply (spec 12, 3.3.5). */
  feedback: "/settings/feedback",
  /** Beta news. */
  betaNews: "/settings/beta-news",
} as const;
