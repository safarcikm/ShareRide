import type { OpenAPIHono } from "@hono/zod-openapi";
import { currentLegalDocumentRoute } from "@shareride/contracts";
import type { AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { LegalService } from "./service.ts";

const { params, query } = currentLegalDocumentRoute.request;

export function registerLegalRoutes(app: OpenAPIHono<AppEnv>, legal: LegalService): void {
  app.openapi(toOpenApiRoute(currentLegalDocumentRoute), async (c) => {
    const { type } = validated(c, "param", params);
    const { locale = "en" } = validated(c, "query", query);
    const document = await legal.currentDocument(type);
    if (document === undefined) {
      return errorResponse(c, 404, "not_found", "No version of this document is published yet.");
    }
    return c.json(
      {
        type,
        version: document.version,
        material: document.material,
        publishedAt: document.publishedAt.toISOString(),
        locale,
        ...document.texts[locale],
      },
      200,
    );
  });
}
