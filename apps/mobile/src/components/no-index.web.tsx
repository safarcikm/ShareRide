import Head from "expo-router/head";

/**
 * Asks search engines not to index the page (spec 4, R4.6). The server also
 * sends `X-Robots-Tag: noindex` with trip pages; this covers a crawler that
 * runs the app.
 */
export function NoIndex() {
  return (
    <Head>
      <meta name="robots" content="noindex, nofollow" />
    </Head>
  );
}
