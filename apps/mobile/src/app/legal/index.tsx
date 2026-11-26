import { Redirect } from "expo-router";

/**
 * The old "Terms, rules and privacy" page: About holds the documents now
 * (spec 30, 3.2), so a saved or shared link to it opens About.
 */
export default function LegalDocumentsScreen() {
  return <Redirect href="/about" />;
}
