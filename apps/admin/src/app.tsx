import type { ApiClient, CallInput, CallResult } from "@shareride/api-client";
import {
  adminMeRoute,
  adminSignOutRoute,
  type AdminMe,
  type RouteDefinition,
} from "@shareride/contracts";
import { createTranslator, type Locale, type MessageKey } from "@shareride/i18n";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ConsoleContext, type Console } from "./console.tsx";
import { Layout } from "./layout.tsx";
import { recoverPath, setupPath, signInPath } from "./paths.ts";
import { RecoverPage } from "./pages/recover.tsx";
import { SetupPage } from "./pages/setup.tsx";
import { SignInPage } from "./pages/sign-in.tsx";
import { homePath, sectionFor } from "./sections.ts";
import { browserPhotos, type PhotoBrowser } from "./photos.ts";
import type { PasskeyBrowser } from "./webauthn.ts";

export { recoverPath, setupPath, signInPath };

type Session =
  | { readonly state: "checking" }
  | { readonly state: "signedOut"; readonly notice?: MessageKey }
  | { readonly state: "signedIn"; readonly operator: AdminMe };

export interface ConsoleAppProps {
  readonly client: ApiClient;
  readonly passkeys: PasskeyBrowser;
  /** Left out, the browser's canvas makes photos ready to send. */
  readonly photos?: PhotoBrowser;
}

/** Icelandic when the browser prefers it, until the operator's account says. */
function browserLocale(): Locale {
  return navigator.language.toLowerCase().startsWith("is") ? "is" : "en";
}

const currentPath = () => window.location.pathname;

/** The operator console (ADR 0028): sign-in and setup, then the sections. */
export function ConsoleApp({ client, passkeys, photos = browserPhotos }: ConsoleAppProps) {
  const [path, setPath] = useState(currentPath);
  const [locale, setLocale] = useState<Locale>(browserLocale);
  const [session, setSession] = useState<Session>({ state: "checking" });
  // The page asked for when sign-in was needed, to open once signed in.
  const returnTo = useRef(homePath);
  const t = useMemo(() => createTranslator(locale), [locale]);

  // Each visit to a page shows it afresh, even the page on show.
  const [visit, setVisit] = useState(0);
  const navigate = useCallback((to: string, replace = false) => {
    if (replace) window.history.replaceState(null, "", to);
    else window.history.pushState(null, "", to);
    setPath(currentPath());
    setVisit((count) => count + 1);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setPath(currentPath());
      setVisit((count) => count + 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  // Before the browser paints, so the page never shows text in one language
  // while it says it is in the other.
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.title = t("admin.title");
  }, [locale, t]);

  const call = useCallback(
    async <R extends RouteDefinition>(route: R, input: CallInput<R>): Promise<CallResult<R>> => {
      const result = await client.call(route, input);
      if (!result.ok && result.error.code === "operator_unauthenticated") {
        setSession({ state: "signedOut", notice: "admin.signIn.ended" });
      }
      return result;
    },
    [client],
  );

  // Pages that work without a session: they do not ask who is signed in.
  const onSetup = path === setupPath || path === recoverPath;
  useEffect(() => {
    if (session.state !== "checking" || onSetup) return;
    let current = true;
    void client.call(adminMeRoute, {}).then((result) => {
      if (!current) return;
      if (result.ok) {
        setLocale(result.data.locale);
        setSession({ state: "signedIn", operator: result.data });
      } else {
        setSession({ state: "signedOut" });
      }
    });
    return () => {
      current = false;
    };
  }, [client, session.state, onSetup]);

  // Each state has one address: the sign-in page, or the page asked for.
  // Set in the same commit as the page it belongs to, so the page is never
  // shown at another page's address.
  useLayoutEffect(() => {
    if (session.state === "signedOut" && !onSetup && path !== signInPath) {
      // With its query, so a shared link with filters keeps them.
      returnTo.current =
        sectionFor(path) === undefined ? homePath : `${path}${window.location.search}`;
      navigate(signInPath, true);
    }
    if (session.state === "signedIn" && path === signInPath) navigate(homePath, true);
  }, [session.state, path, onSetup, navigate]);

  const signedIn = useCallback(
    (operator: AdminMe) => {
      setLocale(operator.locale);
      setSession({ state: "signedIn", operator });
      navigate(returnTo.current, true);
      returnTo.current = homePath;
    },
    [navigate],
  );

  // Signed out only once the API agrees, so a session never stays live
  // behind a page that says it ended.
  const [signOutFailed, setSignOutFailed] = useState(false);
  const signOut = useCallback(async () => {
    setSignOutFailed(false);
    const result = await client.call(adminSignOutRoute, { body: {} });
    if (result.ok || result.error.code === "operator_unauthenticated") {
      setSession({ state: "signedOut", notice: "admin.signIn.signedOut" });
    } else {
      setSignOutFailed(true);
    }
  }, [client]);

  const value: Console = {
    t,
    locale,
    passkeys,
    photos,
    call,
    navigate,
    operator: session.state === "signedIn" ? session.operator : undefined,
  };

  let page;
  if (path === recoverPath) {
    page = <RecoverPage onSignedIn={signedIn} />;
  } else if (onSetup) {
    page = <SetupPage onSignedIn={signedIn} />;
  } else if (session.state === "checking") {
    page = (
      <p className="loading type-body" role="status">
        {t("common.loading")}
      </p>
    );
  } else if (session.state === "signedOut") {
    page = <SignInPage notice={session.notice} onSignedIn={signedIn} />;
  } else {
    const section = sectionFor(path) ?? sectionFor(homePath);
    const Page = section?.Page;
    page = (
      <Layout
        current={section?.path ?? homePath}
        onSignOut={signOut}
        problem={signOutFailed ? "admin.error" : undefined}
        onSwitchLanguage={() => {
          setLocale(locale === "is" ? "en" : "is");
        }}
      >
        {Page === undefined ? null : <Page key={visit} />}
      </Layout>
    );
  }

  return <ConsoleContext value={value}>{page}</ConsoleContext>;
}
