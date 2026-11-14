// Expo's Metro config with Sentry's additions: each bundle registers its
// debug ID, so Sentry can match an error's stack to the uploaded source maps
// (ADR 0020). Session replay and the feedback widget stay out of the web app.
import sentryMetro from "@sentry/react-native/metro.js";

export default sentryMetro.getSentryExpoConfig(import.meta.dirname, {
  includeWebReplay: false,
  includeWebFeedback: false,
  // The release is the commit (EXPO_PUBLIC_RELEASE), not the app version.
  injectReleaseForWeb: false,
  optionsFile: false,
});
