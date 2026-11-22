import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  addSignInMethodRoute,
  finishProviderSignInRoute,
  listSignInMethodsRoute,
  prepareSignInMethodRoute,
  providerCallbackRoute,
  removeSignInMethodRoute,
  startProviderSignInRoute,
} from "@shareride/contracts";
import { signInProviders, type SignInProvider } from "@shareride/domain";
import { createTranslator, type Locale } from "@shareride/i18n";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { devProviderPath, devSignInPage } from "../../platform/identity-providers.ts";
import type { AccountService } from "../account/index.ts";
import type { BrowserStep, ProviderSignInService } from "./provider-sign-in.ts";
import { confirmCodeError, tokensBodyFor } from "./routes.ts";

export interface ProviderRoutesDependencies {
  readonly providers: ProviderSignInService;
  readonly account: AccountService;
  readonly requireAuth: MiddlewareHandler;
  /** The caller's address as a keyed hash, for the start limit. */
  readonly clientKey: (c: Context) => string;
  readonly secureCookies: boolean;
}

const translators = { is: createTranslator("is"), en: createTranslator("en") };

/** The browser's language for a page of ours: Icelandic when it asks for it first. */
function pageLocale(c: Context): Locale {
  const first = (c.req.header("accept-language") ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("is") ? "is" : "en";
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (character) => `&#${String(character.charCodeAt(0))};`);

/** Nothing on the way between the provider, the API and the app keeps these answers. */
function noStore(c: Context): void {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
}

/** A redirect, or a short page in the browser window when there is nowhere safe to go. */
function browserStep(c: Context, step: BrowserStep) {
  noStore(c);
  if (step.kind === "redirect") return c.redirect(step.location, 303);
  const t = translators[pageLocale(c)];
  const locale = pageLocale(c);
  return c.html(
    `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(t("oauth.page.title"))}</title></head>
<body><p>${escapeHtml(t(`oauth.page.${step.page}`))}</p></body>
</html>
`,
    step.status,
  );
}

const ticketMessages = {
  ticket_invalid:
    "The Google or Apple sign-in is not valid: it was used, took too long, or is not this app's.",
  account_unavailable: "This account cannot sign in.",
  provider_in_use: "This Google or Apple account is used by another ShareRide account.",
  provider_already_linked:
    "This account already has a sign-in method of this kind. Remove it first, then add the new one.",
  provider_expired: "The Google or Apple sign-in took too long. Continue with it again.",
} as const;

/**
 * Google and Apple sign-in (ADR 0034; spec 19): the browser window's start
 * and callback, the app's finish, and Sign-in methods in Settings.
 */
export function registerProviderRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: ProviderRoutesDependencies,
): void {
  const { providers, account, requireAuth, clientKey, secureCookies } = dependencies;

  app.openapi(toOpenApiRoute(startProviderSignInRoute), async (c) => {
    const { provider } = validated(c, "param", startProviderSignInRoute.request.params);
    const query = validated(c, "query", startProviderSignInRoute.request.query);
    const step = await providers.start({
      provider,
      challenge: query.challenge,
      returnUrl: query.returnUrl,
      clientKey: clientKey(c),
    });
    return browserStep(c, step);
  });

  app.openapi(toOpenApiRoute(providerCallbackRoute), async (c) => {
    const query = validated(c, "query", providerCallbackRoute.request.query);
    const step = await providers.callback({
      provider: "google",
      state: query.state,
      code: query.code,
      error: query.error,
    });
    return browserStep(c, step);
  });

  // The development stand-in's page (ADR 0034), only while a provider is it.
  for (const provider of signInProviders.filter((name) => providers.isDevelopment(name))) {
    app.get(devProviderPath(provider), (c) => {
      const state = c.req.query("state");
      const nonce = c.req.query("nonce");
      const redirectUri = c.req.query("redirect_uri");
      noStore(c);
      if (
        state === undefined ||
        nonce === undefined ||
        redirectUri !== providers.callbackUrl(provider)
      ) {
        return browserStep(c, { kind: "page", status: 400, page: "invalid" });
      }
      return c.html(devSignInPage({ provider, state, nonce, redirectUri }));
    });
  }

  app.openapi(toOpenApiRoute(finishProviderSignInRoute), async (c) => {
    const body = validated(c, "json", finishProviderSignInRoute.request.body);
    const result = await providers.finish(body);
    noStore(c);
    if (!result.ok) {
      const { code } = result.error;
      return errorResponse(c, code === "ticket_invalid" ? 400 : 403, code, ticketMessages[code]);
    }
    const outcome = result.value;
    if (outcome.status === "phoneNeeded") {
      return c.json({ ...outcome, expiresAt: outcome.expiresAt.toISOString() }, 200);
    }
    const user = await account.me(outcome.userId);
    return c.json(
      {
        status: "signedIn" as const,
        ...tokensBodyFor(c, outcome.tokens, outcome.platform, secureCookies),
        user,
        isNewUser: false,
      },
      200,
    );
  });

  app.openapi(toOpenApiRoute(listSignInMethodsRoute, requireAuth), async (c) => {
    const methods = await providers.list(authOf(c).userId);
    return c.json(
      {
        methods: methods.map((method) => ({ ...method, linkedAt: method.linkedAt.toISOString() })),
      },
      200,
    );
  });

  app.openapi(toOpenApiRoute(prepareSignInMethodRoute, requireAuth), async (c) => {
    const body = validated(c, "json", prepareSignInMethodRoute.request.body);
    const result = await providers.prepareLink({ ...body, userId: authOf(c).userId });
    if (!result.ok) {
      const { code } = result.error;
      return errorResponse(c, code === "ticket_invalid" ? 400 : 409, code, ticketMessages[code]);
    }
    return c.json({ ...result.value, expiresAt: result.value.expiresAt.toISOString() }, 200);
  });

  app.openapi(toOpenApiRoute(addSignInMethodRoute, requireAuth), async (c) => {
    const body = validated(c, "json", addSignInMethodRoute.request.body);
    const result = await providers.link({ ...body, userId: authOf(c).userId });
    if (!result.ok) {
      const { error } = result;
      switch (error.code) {
        case "provider_expired":
          return errorResponse(c, 400, error.code, ticketMessages[error.code]);
        case "provider_in_use":
        case "provider_already_linked":
          return errorResponse(c, 409, error.code, ticketMessages[error.code]);
        default:
          return confirmCodeError(c, error);
      }
    }
    return c.json({ ...result.value, linkedAt: result.value.linkedAt.toISOString() }, 201);
  });

  app.openapi(toOpenApiRoute(removeSignInMethodRoute, requireAuth), async (c) => {
    const { provider } = validated(c, "param", removeSignInMethodRoute.request.params);
    const removed = await providers.remove(authOf(c).userId, provider satisfies SignInProvider);
    if (!removed) return errorResponse(c, 404, "not_found", "None of this provider is linked.");
    return c.body(null, 204);
  });
}
