import { Redirect, router, useIsFocused } from "expo-router";
import { TabList, TabSlot, TabTrigger, Tabs } from "expo-router/ui";
import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { nextRoute } from "@/auth/next-route";
import { useSessionState } from "@/auth/session";
import { useUnread } from "@/chat/unread";
import { ScreenEdges, useWideScreen } from "@/components/screen";
import { now } from "@/lib/clock";
import { takeKeptChoice } from "@/navigation/kept-choice";
import { menuTabs } from "@/navigation/menu";
import { TabBar, TabButton } from "@/navigation/tab-bar";

/**
 * The places of the menu (spec 16, 3.1, and Messages). Phones show them as a tab bar
 * under these screens only; screens opened from them come on top,
 * without it. Wide screens show the top bar of the root layout instead.
 * Each place keeps its state while another is shown. An account with
 * sign-up steps left goes on to the next one, and once it is ready, to the
 * choice it kept through sign-up.
 */
export default function MenuLayout() {
  const state = useSessionState();
  const wide = useWideScreen();
  const { total: unread } = useUnread();
  const me = state.status === "signedIn" ? state.me : null;
  const next = me === null ? null : nextRoute(me);
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

const styles = StyleSheet.create({
  tabs: { flex: 1 },
  slot: { flex: 1 },
});
