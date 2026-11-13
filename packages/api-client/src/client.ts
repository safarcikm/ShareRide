import {
  errorResponseSchema,
  type ErrorResponse,
  type RouteDefinition,
} from "@shareride/contracts";
import type { z } from "zod";

type ParamsInput<R> = R extends { request: { params: infer P extends z.ZodType } }
  ? { params: z.input<P> }
  : { params?: never };
type QueryInput<R> = R extends { request: { query: infer Q extends z.ZodType } }
  ? { query: z.input<Q> }
  : { query?: never };
type BodyInput<R> = R extends { request: { body: infer B extends z.ZodType } }
  ? { body: z.input<B> }
  : { body?: never };

/** What a call sends: the route's parameters, query and body, typed from the contract. */
export type CallInput<R extends RouteDefinition> = ParamsInput<R> &
  QueryInput<R> &
  BodyInput<R> & {
    /** For routes marked `auth`. */
    readonly accessToken?: string;
    readonly signal?: AbortSignal;
  };

type SuccessStatus<R extends RouteDefinition> = Extract<
  keyof R["responses"],
  200 | 201 | 202 | 204
>;
type DataOf<D> = D extends { schema: infer S extends z.ZodType } ? z.output<S> : undefined;

export type CallSuccess<R extends RouteDefinition> = {
  [S in SuccessStatus<R>]: {
    readonly ok: true;
    readonly status: S;
    readonly data: DataOf<R["responses"][S]>;
  };
}[SuccessStatus<R>];

/**
 * The API's error, or one made by the client: `network_error` (status 0) when
 * the API could not be reached, `unexpected_response` when the reply does not
 * match the contract.
 */
export interface CallFailure {
  readonly ok: false;
  readonly status: number;
  readonly error: ErrorResponse["error"];
}

export type CallResult<R extends RouteDefinition> = CallSuccess<R> | CallFailure;

export interface ApiClientOptions {
  /** For example https://api.shareride.is, without /v1. */
  readonly baseUrl: string;
  readonly fetch?: (input: string, init: RequestInit) => Promise<Response>;
  /** "include" on the web, so the browser sends and keeps the refresh cookie. */
  readonly credentials?: RequestCredentials;
}

export interface ApiClient {
  call<R extends RouteDefinition>(route: R, input: CallInput<R>): Promise<CallResult<R>>;
}

function failure(status: number, code: string, message: string): CallFailure {
  return { ok: false, status, error: { code, message } };
}

type QueryValue = string | number | boolean | undefined;

function buildUrl(baseUrl: string, route: RouteDefinition, input: Record<string, unknown>): string {
  const params = (input["params"] ?? {}) as Record<string, unknown>;
  const path = route.path.replace(/\{(\w+)\}/g, (_match, name: string) =>
    encodeURIComponent(String(params[name])),
  );
  const query = new URLSearchParams();
  const entries = Object.entries((input["query"] ?? {}) as Record<string, QueryValue>);
  for (const [key, value] of entries) {
    if (value !== undefined) query.set(key, String(value));
  }
  const search = query.size > 0 ? `?${query.toString()}` : "";
  return `${baseUrl.replace(/\/+$/, "")}${path}${search}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * A client for the API whose requests and replies are typed from the
 * contracts in `@shareride/contracts`, and whose replies are checked against
 * them. It never throws for HTTP or network errors; it returns them.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const send = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function call<R extends RouteDefinition>(
    route: R,
    input: CallInput<R>,
  ): Promise<CallResult<R>> {
    const values = input as Record<string, unknown>;
    const headers = new Headers({ accept: "application/json" });
    if (input.accessToken !== undefined)
      headers.set("authorization", `Bearer ${input.accessToken}`);
    const init: RequestInit = { method: route.method.toUpperCase(), headers };
    if (route.request?.body !== undefined) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(values["body"] ?? {});
    }
    if (options.credentials !== undefined) init.credentials = options.credentials;
    if (input.signal !== undefined) init.signal = input.signal;

    let response: Response;
    try {
      response = await send(buildUrl(options.baseUrl, route, values), init);
    } catch {
      return failure(0, "network_error", "The API could not be reached.");
    }

    const { status } = response;
    if (status >= 200 && status < 300) {
      const schema = route.responses[status]?.schema;
      if (schema === undefined) return { ok: true, status, data: undefined } as CallResult<R>;
      const parsed = schema.safeParse(await readJson(response));
      return parsed.success
        ? ({ ok: true, status, data: parsed.data } as CallResult<R>)
        : failure(status, "unexpected_response", "The reply does not match the contract.");
    }

    const parsed = errorResponseSchema.safeParse(await readJson(response));
    return parsed.success
      ? { ok: false, status, error: parsed.data.error }
      : failure(status, "unexpected_response", `The API answered ${String(status)}.`);
  }

  return { call };
}
