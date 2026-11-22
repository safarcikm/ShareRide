import Head from "expo-router/head";
import { usePathname } from "expo-router";
import { localeFromQuery, pageLinks } from "@/seo/address";

/**
 * A public page's title, description and addresses for search engines
 * (spec 23, 3.5 and 3.6), in the language shown (LanguageProvider sets the
 * page's language). They replace what the
 * server put in the page, which is marked the same way. Only on the pages
 * of 3.4; the server keeps every other page out of the index.
 */
export function PageHead({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  const pathname = usePathname();
  const links = pageLinks(
    globalThis.location.origin,
    pathname,
    localeFromQuery(globalThis.location.search),
  );
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={links.canonical} />
      {links.alternates.map(({ hreflang, href }) => (
        <link key={hreflang} rel="alternate" hrefLang={hreflang} href={href} />
      ))}
    </Head>
  );
}
