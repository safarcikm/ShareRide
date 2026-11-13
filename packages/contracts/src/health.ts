import { z } from "zod";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "unavailable"]),
});

export const healthRoute = defineRoute({
  method: "get",
  path: "/v1/health",
  summary: "The API process is running",
  tags: ["health"],
  responses: {
    200: { description: "Running", schema: healthResponseSchema },
  },
});

export const healthReadyRoute = defineRoute({
  method: "get",
  path: "/v1/health/ready",
  summary: "The API can serve requests, including the database",
  tags: ["health"],
  responses: {
    200: { description: "Ready", schema: healthResponseSchema },
    503: { description: "A dependency is unavailable", schema: healthResponseSchema },
    500: { description: "Unexpected error", schema: errorResponseSchema },
  },
});
