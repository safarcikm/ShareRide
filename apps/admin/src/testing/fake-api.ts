import type { ApiClient, CallResult } from "@shareride/api-client";
import type { RouteDefinition } from "@shareride/contracts";
import type { Assertion, PasskeyBrowser, Registration, WebAuthnOptions } from "../webauthn.ts";

type Reply = {
  status: number;
  data?: unknown;
  error?: { code: string; details?: { path: string; issue: string }[] };
};
type Handler = (input: Record<string, unknown>) => Reply;

/**
 * An API that answers each `METHOD path` with a handler the test sets, and
 * records the calls. Unknown routes answer 404.
 */
export function createFakeApi() {
  const handlers = new Map<string, Handler>();
  const calls: { route: string; input: Record<string, unknown> }[] = [];
  const client: ApiClient = {
    call<R extends RouteDefinition>(route: R, input: unknown): Promise<CallResult<R>> {
      const key = `${route.method.toUpperCase()} ${route.path}`;
      const values = input as Record<string, unknown>;
      calls.push({ route: key, input: values });
      const reply = handlers.get(key)?.(values) ?? { status: 404, error: { code: "not_found" } };
      const result =
        reply.status < 300
          ? { ok: true, status: reply.status, data: reply.data }
          : {
              ok: false,
              status: reply.status,
              error: {
                code: reply.error?.code ?? "error",
                message: "",
                ...(reply.error?.details === undefined ? {} : { details: reply.error.details }),
              },
            };
      return Promise.resolve(result as CallResult<R>);
    },
  };
  return {
    client,
    calls,
    on(route: RouteDefinition, handler: Handler | Reply) {
      handlers.set(
        `${route.method.toUpperCase()} ${route.path}`,
        typeof handler === "function" ? handler : () => handler,
      );
    },
    called: (route: RouteDefinition) =>
      calls.filter((call) => call.route === `${route.method.toUpperCase()} ${route.path}`),
  };
}

/** A browser whose passkeys answer at once, or fail as the test says. */
export function createFakePasskeys() {
  const state = { supported: true, failWith: null as Error | null, prompts: [] as string[] };
  const fail = () => {
    if (state.failWith !== null) throw state.failWith;
  };
  const passkeys: PasskeyBrowser = {
    supported: () => state.supported,
    create(options: WebAuthnOptions) {
      state.prompts.push(`create ${options.challenge}`);
      fail();
      return Promise.resolve({
        id: "new-key",
        rawId: "new-key",
        type: "public-key",
        response: { clientDataJSON: options.challenge, attestationObject: "attestation" },
        clientExtensionResults: {},
      } as Registration);
    },
    get(options: WebAuthnOptions) {
      state.prompts.push(`get ${options.challenge}`);
      fail();
      return Promise.resolve({
        id: "saved-key",
        rawId: "saved-key",
        type: "public-key",
        response: {
          clientDataJSON: options.challenge,
          authenticatorData: "data",
          signature: "signature",
        },
        clientExtensionResults: {},
      } as Assertion);
    },
  };
  return { passkeys, state };
}
