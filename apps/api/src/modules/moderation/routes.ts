import type { OpenAPIHono } from "@hono/zod-openapi";
import { appealNoticeRoute, myNoticesRoute } from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { AppealError, NoticeService } from "./notices.ts";

/** The person's notices and appeals: open while suspended (spec 9, 3.6.2). */
export function registerNoticeRoutes(
  app: OpenAPIHono<AppEnv>,
  notices: NoticeService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(myNoticesRoute, requireAuth), async (c) =>
    c.json({ notices: await notices.mine(authOf(c).userId) }, 200),
  );

  app.openapi(toOpenApiRoute(appealNoticeRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", appealNoticeRoute.request.params);
    const { text } = validated(c, "json", appealNoticeRoute.request.body);
    const result = await notices.appeal(authOf(c).userId, id, text);
    if (result.ok) return c.json(result.value, 200);
    return appealError(c, result.error);
  });
}

function appealError(c: Context, error: AppealError) {
  switch (error.code) {
    case "not_found":
      return errorResponse(c, 404, "not_found", "There is no such notice of yours.");
    case "not_appealable":
      return errorResponse(c, 409, "not_appealable", "A reinstatement cannot be appealed.");
    case "already_appealed":
      return errorResponse(c, 409, "already_appealed", "This notice has been appealed already.");
    case "window_closed":
      return errorResponse(
        c,
        409,
        "appeal_window_closed",
        "A notice can be appealed for 14 days after it was sent.",
      );
    case "empty":
    case "too_long":
      return errorResponse(c, 400, "validation_failed", "The appeal cannot be sent.", {
        details: [{ path: "text", issue: error.code }],
      });
  }
}
