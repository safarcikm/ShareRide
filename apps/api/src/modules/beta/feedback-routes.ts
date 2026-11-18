import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  adminFeedbackListRoute,
  adminFeedbackReplyRoute,
  adminFeedbackRoute,
  adminFeedbackScreenshotPath,
  adminFeedbackStatusRoute,
  myFeedbackRoute,
  sendFeedbackRoute,
  type AdminFeedback,
  type MyFeedback,
} from "@shareride/contracts";
import { feedbackRules } from "@shareride/domain";
import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { authOf, operatorOf, type AppEnv } from "../../context.ts";
import { errorBody, errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { auditRequestOf } from "../admin/audit.ts";
import type {
  AdminFeedbackView,
  FeedbackService,
  FeedbackView,
  SendFeedbackError,
} from "./feedback.ts";

export interface FeedbackRoutesDependencies {
  readonly feedback: FeedbackService;
  readonly requireAuth: MiddlewareHandler<AppEnv>;
}

export interface FeedbackAdminRoutesDependencies {
  readonly feedback: FeedbackService;
  readonly requireOperator: MiddlewareHandler<AppEnv>;
  readonly clientAddress: (c: Context) => string;
}

const mine = (view: FeedbackView): MyFeedback => ({
  id: view.id,
  kind: view.kind,
  message: view.message,
  hasScreenshot: view.hasScreenshot,
  reply: view.reply,
  repliedAt: view.repliedAt?.toISOString() ?? null,
  createdAt: view.createdAt.toISOString(),
});

const shown = (view: AdminFeedbackView): AdminFeedback => ({
  ...view,
  repliedAt: view.repliedAt?.toISOString() ?? null,
  createdAt: view.createdAt.toISOString(),
});

/** A screenshot in base64 is at most 1.4 MB (`feedbackRules`), with room for the rest. */
const feedbackBodyLimit = Math.ceil(feedbackRules.screenshotMaxBytes / 3) * 4 + 64 * 1024;

type Refusal = Exclude<SendFeedbackError, { readonly code: "rate_limited" }>;

/** Which field a refused feedback names, and why; never what was sent. */
function problemOf(error: Refusal): {
  readonly path: string;
  readonly issue: string;
  readonly message: string;
} {
  switch (error.code) {
    case "kind_unknown":
      return { path: "kind", issue: "unknown", message: "Unknown kind of feedback." };
    case "platform_unknown":
      return { path: "platform", issue: "unknown", message: "Unknown platform." };
    case "message_missing":
      return { path: "message", issue: "missing", message: "Write a message." };
    case "message_too_long":
      return { path: "message", issue: "too_long", message: "At most 2 000 characters." };
    case "details_invalid":
      return { path: error.field, issue: "invalid", message: "The app's details are not valid." };
    case "screenshot_invalid":
      return {
        path: "screenshot",
        issue: error.issue,
        message: "The screenshot must be a JPEG without metadata, of at most 1 MB.",
      };
  }
}

/** Sending feedback and reading my own (spec 12, 3.3 and section 6). */
export function registerFeedbackRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: FeedbackRoutesDependencies,
): void {
  const { feedback, requireAuth } = dependencies;

  app.use(
    sendFeedbackRoute.path,
    bodyLimit({
      maxSize: feedbackBodyLimit,
      onError: (c) =>
        c.json(errorBody("payload_too_large", "A screenshot's file is at most 1 MB."), 413),
    }),
  );

  app.openapi(toOpenApiRoute(sendFeedbackRoute, requireAuth), async (c) => {
    const { screenshot, ...draft } = validated(c, "json", sendFeedbackRoute.request.body);
    const sent = await feedback.send(authOf(c).userId, {
      ...draft,
      ...(screenshot === undefined ? {} : { screenshot: Buffer.from(screenshot, "base64") }),
    });
    if (!sent.ok) {
      if (sent.error.code === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", "Ten a day at most.", {
          retryAfterSeconds: sent.error.retryAfterSeconds,
        });
      }
      const { path, issue, message } = problemOf(sent.error);
      return errorResponse(c, 400, "validation_failed", message, { details: [{ path, issue }] });
    }
    return c.json(mine(sent.value), 201);
  });

  app.openapi(toOpenApiRoute(myFeedbackRoute, requireAuth), async (c) => {
    const list = await feedback.mine(authOf(c).userId);
    return c.json({ feedback: list.map(mine) }, 200);
  });
}

/** The console's feedback routes under /admin/v1 (spec 12, 3.3.4). */
export function registerFeedbackAdminRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: FeedbackAdminRoutesDependencies,
): void {
  const { feedback, requireOperator, clientAddress } = dependencies;

  const by = (c: Context<AppEnv>) => {
    const { userId, sessionId } = operatorOf(c);
    return { operator: { userId, sessionId }, request: auditRequestOf(c, clientAddress) };
  };
  const none = (c: Context<AppEnv>) => errorResponse(c, 404, "not_found", "No such feedback.");

  app.openapi(toOpenApiRoute(adminFeedbackListRoute, requireOperator), async (c) => {
    const filter = validated(c, "query", adminFeedbackListRoute.request.query);
    const list = await feedback.list(filter);
    return c.json({ feedback: list.feedback.map(shown), newCount: list.newCount }, 200);
  });

  app.openapi(toOpenApiRoute(adminFeedbackRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminFeedbackRoute.request.params);
    const view = await feedback.one(id);
    return view === undefined ? none(c) : c.json(shown(view), 200);
  });

  // The picture itself, for the console's <img>: a file, so not in the OpenAPI document.
  app.get(adminFeedbackScreenshotPath(":id"), requireOperator, async (c) => {
    const id = c.req.param("id") ?? "";
    const isId = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);
    const file = isId ? await feedback.screenshot(id, by(c)) : undefined;
    if (file === undefined) return none(c);
    return c.body(new Uint8Array(file), 200, {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
  });

  app.openapi(toOpenApiRoute(adminFeedbackStatusRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminFeedbackStatusRoute.request.params);
    const { status } = validated(c, "json", adminFeedbackStatusRoute.request.body);
    const changed = await feedback.setStatus(id, status, by(c));
    return changed.ok ? c.json(shown(changed.value), 200) : none(c);
  });

  app.openapi(toOpenApiRoute(adminFeedbackReplyRoute, requireOperator), async (c) => {
    const { id } = validated(c, "param", adminFeedbackReplyRoute.request.params);
    const { reply } = validated(c, "json", adminFeedbackReplyRoute.request.body);
    const replied = await feedback.reply(id, reply, by(c));
    if (replied.ok) return c.json(shown(replied.value), 200);
    switch (replied.error.code) {
      case "not_found":
        return none(c);
      case "already_replied":
        return errorResponse(c, 409, "already_replied", "This feedback has its reply already.");
      case "reply_missing":
        return errorResponse(c, 400, "validation_failed", "Write a reply.", {
          details: [{ path: "reply", issue: "missing" }],
        });
      case "reply_too_long":
        return errorResponse(c, 400, "validation_failed", "At most 1 000 characters.", {
          details: [{ path: "reply", issue: "too_long" }],
        });
    }
  });
}
