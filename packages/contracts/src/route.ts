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
  /** Needs `Authorization: Bearer <access token>`. */
  readonly auth?: boolean;
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
