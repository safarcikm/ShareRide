import { aboutPage, carpoolPage, type MessageKey } from "@shareride/i18n";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useLanguage } from "@/i18n/language";
import { externalLinkProps, linkProps } from "@/navigation/link-props";
import { puffinRideFacebookPage } from "@/sharing/links";
import { useHover } from "@/theme/hover";
import {
  controlOutline,
  minTouchTarget,
  pageMaxWidth,
  sidePanelFrom,
  sizes,
  spacing,
  typography,
} from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Logo } from "./logo";

/** A link of the footer, its text in the language shown: to a page of the app, or outside it. */
type FooterLink =
  | { readonly text: string; readonly href: string; readonly url?: never }
  | { readonly text: string; readonly url: string; readonly href?: never };

/** The links of the footer, by group. */
function useFooterLinks(facebook: MessageKey) {
  const { t } = useLanguage();
  const page = (label: MessageKey, href: string): FooterLink => ({ text: t(label), href });
  return {
    pages: [
      page(aboutPage.title, aboutPage.path),
      page("carpool.title", carpoolPage.path),
      page("meetingPoints.title", "/meeting-points"),
    ],
    documents: aboutPage.documents.map((document) => page(document.label, document.href)),
    // Our address, written as it is, and our Facebook Page.
    contact: [
      { text: aboutPage.email, url: `mailto:${aboutPage.email}` },
      { text: t(facebook), url: puffinRideFacebookPage },
    ] satisfies FooterLink[],
  };
}

/**
 * The website's footer (spec 30, 3.3), at the end of a public page, which
 * `Screen` shows with `siteFooter`. On a wide screen, under a line as wide
 * as the page, four groups lined up with the page: the logo and name,
 * PuffinRide's pages, the terms and how to reach us. It keeps the page's
 * colour: a band of its own would stop short of the window's edges where
 * the browser keeps room for its scrollbar (spec 18, 3.3, item 4). On a phone's browser, quiet: the same links in
 * small text, wrapping and centred, without the groups' headings. Every
 * link is a real one (spec 23, 3.6, item 6); on the web the footer is the
 * page's `<footer>`, and the groups' headings are not the page's headings.
 */
export function SiteFooter() {
  const { t } = useLanguage();
  const palette = usePalette();
  // Wide as `Screen` counts it (`useWideScreen`), which shows this footer.
  const wide = useWindowDimensions().width >= sidePanelFrom;
  const links = useFooterLinks(wide ? "about.facebook" : "footer.facebook");
  const landmark: object =
    Platform.OS === "web" ? { role: "contentinfo", "aria-label": t("footer.label") } : {};
  if (!wide) {
    return (
      <View
        testID="site-footer"
        {...landmark}
        style={[styles.quiet, { borderTopColor: palette.border }]}
      >
        <View style={styles.quietLinks}>
          {[...links.pages, ...links.documents].map((link) => (
            <FooterLinkText key={link.href} link={link} quiet />
          ))}
        </View>
        <View style={styles.quietLinks}>
          {links.contact.map((link) => (
            <FooterLinkText key={link.url} link={link} quiet />
          ))}
        </View>
      </View>
    );
  }
  return (
    <View testID="site-footer" {...landmark} style={styles.band}>
      <View
        testID="site-footer-content"
        style={[styles.bandContent, { borderTopColor: palette.border }]}
      >
        <View style={styles.brand}>
          <View style={styles.name}>
            <Logo size={sizes.logoSmall} />
            <Text style={[typography.heading, { color: palette.text }]}>{t("app.name")}</Text>
          </View>
          <Text style={[typography.small, { color: palette.textMuted }]}>
            {t("footer.tagline")}
          </Text>
        </View>
        <Group heading={t("app.name")} links={links.pages} />
        <Group heading={t("footer.terms")} links={links.documents} />
        <Group heading={t("footer.contact")} links={links.contact} />
      </View>
    </View>
  );
}

/** A group of links under its heading, on a wide screen. */
function Group({
  heading,
  links,
}: {
  readonly heading: string;
  readonly links: readonly FooterLink[];
}) {
  const palette = usePalette();
  return (
    <View style={styles.group}>
      <Text style={[typography.label, styles.groupHeading, { color: palette.textMuted }]}>
        {heading}
      </Text>
      {links.map((link) => (
        <FooterLinkText key={link.href ?? link.url} link={link} />
      ))}
    </View>
  );
}

/**
 * One link, in the text's colour and underlined under the pointer, as a
 * place in the top bar is marked by more than its colour (spec 18, 3.4).
 * At least a touch target high.
 */
function FooterLinkText({
  link,
  quiet = false,
}: {
  readonly link: FooterLink;
  readonly quiet?: boolean;
}) {
  const palette = usePalette();
  const [hovered, hover] = useHover();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={link.text}
      {...(link.href === undefined ? externalLinkProps(link.url) : linkProps(link.href))}
      {...hover}
      style={[styles.link, quiet && styles.quietLink]}
    >
      <Text
        style={[
          typography.small,
          { color: quiet ? palette.textMuted : palette.text },
          hovered && styles.hovered,
        ]}
      >
        {link.text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // As wide as the page under the top bar (`Screen`), in the middle.
  band: { alignSelf: "stretch", alignItems: "center", marginTop: spacing.xxl },
  bandContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.lg,
    width: "100%",
    maxWidth: pageMaxWidth,
    borderTopWidth: controlOutline,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  brand: { flex: 4, gap: spacing.sm },
  name: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  group: { flex: 3 },
  groupHeading: { marginBottom: spacing.xs },
  link: { minHeight: minTouchTarget, justifyContent: "center", alignSelf: "flex-start" },
  hovered: { textDecorationLine: "underline" },
  quiet: {
    alignSelf: "stretch",
    marginTop: spacing.xl,
    borderTopWidth: controlOutline,
    paddingTop: spacing.md,
  },
  quietLinks: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  quietLink: { alignSelf: "auto", paddingHorizontal: spacing.sm },
});
