import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  conversationMessagesRoute,
  messageAllPassengersRoute,
  myConversationsRoute,
  readMessagesRoute,
  sendMessageRoute,
} from "@shareride/contracts";
import type { MessageProblem } from "@shareride/domain";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type {
  ChatService,
  ClientIdReused,
  MessageAllError,
  PageError,
  SendError,
} from "./service.ts";

function pageError(c: Context, error: PageError) {
  switch (error.code) {
    case "not_found":
      return errorResponse(
        c,
        404,
        "not_found",
        "There is no such booking of yours, or on your trip.",
      );
    case "message_not_found":
      return errorResponse(c, 404, "not_found", "There is no such message in this conversation.");
    case "not_confirmed":
      return errorResponse(
        c,
        409,
        "not_confirmed",
        "The conversation opens once the booking is confirmed.",
      );
  }
}

function problem(c: Context, error: MessageProblem | ClientIdReused) {
  if (error.code === "client_id_reused") {
    return errorResponse(
      c,
      400,
      "validation_failed",
      "This client ID was used for another message.",
      {
        details: [{ path: "clientId", issue: "reused" }],
      },
    );
  }
  const path = error.code === "empty" || error.code === "too_long" ? "text" : "quick";
  return errorResponse(c, 400, "validation_failed", "The message cannot be sent.", {
    details: [{ path, issue: error.code }],
  });
}

const tooMany = (c: Context) =>
  errorResponse(c, 429, "too_many_messages", "Too many messages in a minute. Wait a moment.");

function sendError(c: Context, error: SendError) {
  switch (error.code) {
    case "not_found":
    case "not_confirmed":
      return pageError(c, error);
    case "chat_closed":
      return errorResponse(
        c,
        409,
        "chat_closed",
        "This conversation is closed. It can still be read.",
      );
    case "too_many_messages":
      return tooMany(c);
    default:
      return problem(c, error);
  }
}

function messageAllError(c: Context, error: MessageAllError) {
  switch (error.code) {
    case "not_found":
      return errorResponse(c, 404, "not_found", "There is no such published trip of yours.");
    case "too_many_messages":
      return tooMany(c);
    default:
      return problem(c, error);
  }
}

export function registerChatRoutes(
  app: OpenAPIHono<AppEnv>,
  service: ChatService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(myConversationsRoute, requireAuth), async (c) =>
    c.json(await service.conversations(authOf(c).userId), 200),
  );

  app.openapi(toOpenApiRoute(conversationMessagesRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", conversationMessagesRoute.request.params);
    const { before } = validated(c, "query", conversationMessagesRoute.request.query);
    const result = await service.messages(authOf(c).userId, id, before);
    return result.ok ? c.json(result.value, 200) : pageError(c, result.error);
  });

  app.openapi(toOpenApiRoute(sendMessageRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", sendMessageRoute.request.params);
    const body = validated(c, "json", sendMessageRoute.request.body);
    const result = await service.send(authOf(c).userId, id, body);
    if (!result.ok) return sendError(c, result.error);
    return c.json(result.value.message, result.value.created ? 201 : 200);
  });

  app.openapi(toOpenApiRoute(readMessagesRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", readMessagesRoute.request.params);
    const { upTo } = validated(c, "json", readMessagesRoute.request.body);
    const result = await service.read(authOf(c).userId, id, upTo);
    return result.ok ? c.body(null, 204) : pageError(c, result.error);
  });

  app.openapi(toOpenApiRoute(messageAllPassengersRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", messageAllPassengersRoute.request.params);
    const body = validated(c, "json", messageAllPassengersRoute.request.body);
    const result = await service.messageAll(authOf(c).userId, id, body);
    return result.ok ? c.json(result.value, 200) : messageAllError(c, result.error);
  });
}
