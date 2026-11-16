// Tables, module by module. Each change is followed by
// `pnpm --filter @shareride/db generate` and a review of the generated SQL.
export * from "./admin.ts";
export * from "./auth.ts";
export * from "./bookings.ts";
export * from "./chat.ts";
export * from "./legal.ts";
export * from "./meeting-points.ts";
export * from "./notifications.ts";
export * from "./payments.ts";
export * from "./trip-day.ts";
export * from "./privacy.ts";
export * from "./trips.ts";
export * from "./users.ts";
export * from "./vehicles.ts";
