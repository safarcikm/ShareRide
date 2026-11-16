import type { z } from "zod";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface ResponseDefinition {
  readonly description: string;
  readonly schema?: z.ZodType;
}

/**
 * One endpoint of the API, described without any framework. The API turns it
 * into a Hono route with OpenAPI documentation; the apps' typed client reads
 * the same object, so the two cannot drift apart.
 */
export interface RouteDefinition {
  readonly method: HttpMethod;
  /** OpenAPI style, for example "/v1/me/sessions/{id}". */
  readonly path: string;
  readonly summary: string;
  readonly tags: readonly string[];
  /**
   * `true`: needs `Authorization: Bearer <access token>`. `"optional"`: works
   * without one, and a signed-in person's token changes what comes back.
   * `"operator"`: a console route under /admin/v1, which needs the operator's
   * session cookie and never takes a bearer token (ADR 0028).
   */
  readonly auth?: boolean | "optional" | "operator";
  readonly request?: {
    readonly params?: z.ZodObject;
    readonly query?: z.ZodObject;
    readonly body?: z.ZodType;
  };
  readonly responses: Readonly<Record<number, ResponseDefinition>>;
}

export function defineRoute<const R extends RouteDefinition>(route: R): R {
  return route;
}
