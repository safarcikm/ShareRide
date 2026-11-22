import { Redirect, router, useIsFocused } from "expo-router";
import { TabList, TabSlot, TabTrigger, Tabs } from "expo-router/ui";
import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { nextRoute } from "@/auth/next-route";
import { useSessionState } from "@/auth/session";
import type { SessionState } from "@/auth/session-manager";
import { useUnread } from "@/chat/unread";
import { ScreenEdges, useWideScreen } from "@/components/screen";
import { now } from "@/lib/clock";
import { reportError } from "@/lib/error-reporting";
import { takeKeptChoice } from "@/navigation/kept-choice";
import { keepPendingLink, linkNeedingAccount } from "@/navigation/kept-link";
import { menuTabs } from "@/navigation/menu";
import { takeOpenedPath } from "@/navigation/opened-link";
import { TabBar, TabButton } from "@/navigation/tab-bar";

/**
 * The places of the menu (spec 16, 3.1, and Messages). Phones show them as a tab bar
 * under these screens only; screens opened from them come on top,
 * without it. Wide screens show the top bar of the root layout instead.
 * Each place keeps its state while another is shown. An account with
 * sign-up steps left goes on to the next one, and once it is ready, to the
 * choice it kept through sign-up. A link to a screen that needs an account,
 * opened before the account was ready, lands here and is kept too.
 */
export default function MenuLayout() {
  const state = useSessionState();
  const wide = useWideScreen();
  const { total: unread } = useUnread();
  const me = state.status === "signedIn" ? state.me : null;
  const next = me === null ? null : nextRoute(me);
  useOpenedLink(state);
  useKeptChoice(me !== null && next === null);
  if (next !== null) return <Redirect href={next} />;
  return (
    <Tabs style={styles.tabs}>
      <ScreenEdges value={wide ? sideEdges : aboveBar}>
        <TabSlot style={styles.slot} />
      </ScreenEdges>
      <TabList asChild>
        <TabBar hidden={wide}>
          {menuTabs.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton tab={tab} count={tab.name === "messages" ? unread : 0} />
            </TabTrigger>
          ))}
        </TabBar>
      </TabList>
    </Tabs>
  );
}

/** The tab bar pads the bottom edge; on wide screens the top bar pads the top. */
const aboveBar = ["top", "right", "left"] as const;
const sideEdges = ["right", "left", "bottom"] as const;

/**
 * Once the account is ready, opens the booking or Offer kept through
 * sign-up, once. Only while the menu is on screen: a redirect from a screen
 * underneath, while sign-up is still on top, would be lost.
 */
function useKeptChoice(ready: boolean) {
  const focused = useIsFocused();
  const taken = useRef(false);
  useEffect(() => {
    if (!ready) {
      taken.current = false;
      return;
    }
    if (!focused || taken.current) return;
    taken.current = true;
    void takeKeptChoice(now()).then((href) => {
      if (href !== null) router.navigate(href);
    });
  }, [focused, ready]);
}

/**
 * The app opened at a link to a screen that needs an account (spec 20,
 * 3.2), as from an email, before the account was ready: the router showed
 * the menu instead. Keeps the link, for the kept choice once the account is
 * ready, in place of any choice kept before it, and opens Sign in when
 * signed out. Once, and only while the menu is on screen: a push before
 * the navigator is ready would be lost.
 */
function useOpenedLink(state: SessionState) {
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused || (state.status !== "signedIn" && state.status !== "signedOut")) return;
    const link = linkNeedingAccount(takeOpenedPath());
    if (link === null) return;
    const me = state.status === "signedIn" ? state.me : null;
    // A ready account opens the link itself; one waiting to be deleted has
    // only "Keep my account" (spec 11, 3.4.4).
    if (me !== null && (me.deletionScheduledFor !== null || nextRoute(me) === null)) return;
    void (async () => {
      // Opened now, it goes before a booking or Offer kept earlier, which
      // is let go (spec 20, 3.2.2); one chosen after it goes first.
      await takeKeptChoice(now());
      await keepPendingLink(link, now());
      if (me === null) router.push("/sign-in");
    })().catch(reportError);
  }, [focused, state]);
}

const styles = StyleSheet.create({
  tabs: { flex: 1 },
  slot: { flex: 1 },
});
