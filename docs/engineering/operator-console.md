# Operator console: adding to it

**Owner:** Martin · **Last reviewed:** 2026-11-16

The console is the operator's own web app
([ADR 0028](../decisions/0028-operator-console-web-app-and-passkeys.md)).
Each spec adds its operator pages to it. This page says how, so every
section works the same way. Security details are in
[security](security.md#operator-console).

## A console route in the API

1. Define the route in `packages/contracts` with `auth: "operator"` and a
   path under `/admin/v1/<area>`. Its errors include `401
   operator_unauthenticated`.
2. Put the handlers in the module that owns the records, in
   `apps/api/src/modules/<area>/admin-routes.ts`, exporting
   `register<Area>AdminRoutes(app, dependencies)`. Pass
   `toOpenApiRoute(route, requireOperator)`; the operator is
   `operatorOf(c)`.
3. Register it in `apps/api/src/app.ts` after `registerAdminRoutes`, with
   the shared `requireOperator`.
4. Every action that changes something calls `recordAudit(tx, entry)` from
   `apps/api/src/modules/admin/audit.ts` inside the transaction that makes
   the change:
   - `operator`: `operatorOf(c)`. The `operator` command, which runs on
     the server, writes `sessionId: null`, `request: null` and the account
     it changes as the operator;
   - `action`: a dotted name, the record's kind first and what happened
     last, such as `meeting_point.activated` or `report.dismissed`;
   - `subjectType` and `subjectId`: the record acted on;
   - `before` and `after`: `changedFields(old, new)` from the domain, for
     records the operator curates. For a person's record, list the field
     names that changed, not their values (spec 9, section 7);
   - `request`: `auditRequestOf(c, clientAddress)`.
   Opening something sensitive, such as a conversation or payment details,
   is an action too.
5. Integration tests sign in with `api.signInOperator()` from
   `apps/api/src/testing.ts` and send its `cookie`. Test that the route
   refuses a request without it and that each action writes its entry.

## Becoming an operator

`pnpm --filter @shareride/api operator add <phone number or user ID>`
gives the role and prints a setup link for the first passkey; the link
opens the console's setup page, which comes with the console app
(milestone 8, PR 4). `remove` takes the role away and `list` lists
operators. Locally, passkeys
are bound to `http://localhost:3000` unless `ADMIN_ORIGIN` says otherwise.

## The guard

`guardAdminPaths` in `apps/api/src/modules/admin/require-operator.ts` runs
for every request under `/admin/v1`, before any console route, so a route
that forgets `requireOperator` is still closed. Only the routes in
`openAdminRoutes`, matched exactly as `METHOD /path`, skip it: the sign-in
steps that run before there is a session. Add a route there only if it
cannot need a signed-in operator, and say why in the pull request.

`requireOperator` on a route runs the same check again only when the guard
has not; it is there so the OpenAPI document shows the route as signed in.

## The audit log table

Migration `0020_operator_console.sql` ends with hand-written SQL: triggers
that stamp `created_at` from the database clock, refuse updates, refuse
deleting entries younger than 3 years, and refuse `TRUNCATE`. Drizzle does
not know about them. When a later migration changes `audit_log`, check the
triggers still apply, and never drop them.

## A console page

Comes with the console app (milestone 8, PR 4): a page file and one entry
in `apps/admin/src/sections.ts`, with its texts in `packages/i18n` under
`admin.<area>.*` in both languages.
