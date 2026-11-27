import { router, type Href } from "expo-router";
import { Linking, Platform } from "react-native";

/** An address inside the app, such as "/meeting-points" or a pathname with its params. */
export type AppPath = Href;

/** The address an `<a href>` names: a pathname's params fill its segments, the rest the query. */
export function addressOf(href: AppPath): string {
  if (typeof href === "string") return href;
  const rest = new Map(Object.entries(href.params ?? {}).map(([name, value]) => [name, value]));
  const path = href.pathname.replace(/\[([^\]]+)\]/g, (_segment, name: string) => {
    const value = rest.get(name);
    rest.delete(name);
    return encodeURIComponent(String(value));
  });
  const query = new URLSearchParams(
    [...rest]
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => [name, String(value)]),
  ).toString();
  return query === "" ? path : `${path}?${query}`;
}

/** The parts of a click a link looks at; a press on a phone has none. */
interface Click {
  readonly preventDefault?: () => void;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly button?: number;
}

/**
 * What makes a pressable a real link (spec 23, 3.6, item 6). On the web it
 * is an `<a href>`: search engines follow it to the page, and a click with
 * a modifier key or the middle button is the browser's, such as a new tab;
 * a plain click opens the screen within the app. On a phone, a press that
 * opens the screen. Spread over a `Pressable` with the role `link`.
 *
 * With `replace` the screen takes the place of the one the link is on, so
 * going back from it does not show that one again: for a link that is the
 * way out of a page with nothing on it (spec 31, 3.21).
 */
export function linkProps(
  href: AppPath,
  how: "push" | "replace" = "push",
): {
  readonly href?: string;
  readonly onPress: (event?: Click) => void;
} {
  const open = () => {
    if (how === "replace") router.replace(href);
    else router.push(href);
  };
  if (Platform.OS !== "web") return { onPress: open };
  return {
    href: addressOf(href),
    onPress: (event) => {
      const modified =
        event?.metaKey === true ||
        event?.ctrlKey === true ||
        event?.shiftKey === true ||
        event?.altKey === true ||
        (event?.button ?? 0) !== 0;
      if (modified) return;
      event?.preventDefault?.();
      open();
    },
  };
}

/**
 * What makes a pressable a link to a page outside the app, such as our
 * Facebook Page, or to a `mailto:` address (spec 30, 3.1). On the web it is
 * an `<a href>` the browser opens itself: a web page in a new tab, without
 * telling it where it came from. On a phone, a press opens it in the
 * browser or the mail app; with none to open it, nothing happens, and the
 * link's text still says where it goes. Spread over a `Pressable` with the
 * role `link`.
 */
export function externalLinkProps(url: string): {
  readonly href?: string;
  readonly hrefAttrs?: { readonly target: "_blank"; readonly rel: string };
  readonly onPress?: () => void;
} {
  if (Platform.OS === "web") {
    return /^https?:/.test(url)
      ? { href: url, hrefAttrs: { target: "_blank", rel: "noopener noreferrer" } }
      : { href: url };
  }
  return {
    onPress: () => {
      Linking.openURL(url).catch(() => undefined);
    },
  };
}
