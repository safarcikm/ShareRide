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
opens the console's setup page. `remove` takes the role away and `list`
lists operators. Passkeys are bound to `ADMIN_ORIGIN`, which is
`http://localhost:3000` locally unless you set it.

To work on the console locally, run the API
(`pnpm --filter @shareride/api dev`) with `ADMIN_ORIGIN=http://localhost:5173`
in `.env`, then `pnpm --filter @shareride/admin dev` and open
`http://localhost:5173/admin/`. Vite passes `/admin/v1` on to the API, so
the cookie and the passkeys see one origin. The API serves the built console
at `/admin` itself when `ADMIN_APP_DIR` points at
`apps/admin/dist` (`pnpm --filter @shareride/admin build`), as the image
does.

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

The console's Audit log page reads it through `GET /admin/v1/audit-log`,
newest first, 50 entries a page. Its action filter matches the start of
the name, so `meeting_point.` finds every meeting point action: name new
actions with the record's kind first. "Only this record" filters by
`subjectType` and `subjectId`, so give every action on a record the same
pair. The page shows `before` and `after` field by field.

## Meeting points

`apps/api/src/modules/meeting-points/admin-routes.ts` holds the console's
meeting point routes (`registerMeetingPointsAdminRoutes`), with the work in
`admin-service.ts`:

- `GET /admin/v1/meeting-points` lists every point, drafts and retired
  ones too, by Icelandic name, with the domain's filters
  (`matchesConsoleFilters`): status, region, type, season this month,
  review overdue and part of a name. There are a few hundred points at
  most, so it filters them all in the API.
- `POST /admin/v1/meeting-points` adds a draft; `PUT
  /admin/v1/meeting-points/{id}` saves its fields. Both check the fields
  with `validateMeetingPointDraft` and answer `validation_failed` with each
  field and its problem in `details`, which the form shows by its field.
- An edit sends back the `updatedAt` it loaded. If the point was saved
  since, the edit is refused with `meeting_point_changed`, so one copy
  never overwrites a newer one. The comparison is in SQL, to the
  millisecond, as JavaScript dates hold no more.
- Only a draft's spot is edited there (`move_needed` otherwise): moving a
  point in use recomputes its distances and tells the trips that use it
  (R2.10), its own step. A retired point is not edited
  (`meeting_point_retired`).
- Audit entries are `meeting_point.created` with the fields, and
  `meeting_point.updated` with only the fields that changed. Saving
  without a change writes nothing.

## A console page

The console is `apps/admin`: React for the web, built with Vite, served by
the API at `/admin` with its own content security policy
([security](security.md#operator-console)). It uses the shared design
tokens from `packages/ui` as CSS variables and the app's fonts and texts.

1. Add the page in `apps/admin/src/pages/<area>.tsx`. `useConsole()` gives
   `t` for texts, `call(route, input)` for the API, `navigate(path)` and
   the signed-in `operator`. A call that finds the session ended sends the
   operator back to sign in by itself.
2. Add one entry to `sections` in `apps/admin/src/sections.ts`: its path
   under `/admin/<area>`, its title key and the page. The menu and the
   router follow; a section owns every path below its own, for its detail
   pages.
3. Put its texts in `packages/i18n/src/messages/en.ts` and `is.ts` under
   `admin.<area>.*`, in both languages.
4. Style it with the classes in `apps/admin/src/styles.css` and the
   `var(--…)` tokens, never raw colours or sizes. Lay it out for a laptop
   first, and check it on a phone.
5. Test it in `apps/admin/src/app.test.tsx` style: render `ConsoleApp`
   against the fake API in `apps/admin/src/testing/fake-api.ts`, signed in,
   and drive it as the operator would.
