import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * The old "Terms, rules and privacy" page: About holds the documents now
 * (spec 30, 3.2), so a saved or shared link to it opens About, in the
 * language the link asked for, as the server's redirect does.
 */
export default function LegalDocumentsScreen() {
  const { lang } = useLocalSearchParams<{ lang?: string }>();
  return <Redirect href={{ pathname: "/about", params: lang === undefined ? {} : { lang } }} />;
}
