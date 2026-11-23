# An email to the operator when new members join Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an operator who turns it on gets an email soon after someone
finishes signing up, at most one an hour, with how many joined and never who.

**Architecture:** A new operator notice, `new_members`, in the notification
catalogue: email only. The operator's choice is a time on their
notification settings, `new_members_since`. The notification worker gets one
more step each run: for each operator with the choice on, it asks the domain
rule `newMembersPeriod` whether an email may go now and from when, counts the
members who finished signing up since, and adds a notification when there is
anyone. The email's words are made when it is sent, from the same period.
The console gets a small page of its own, **Emails to you**.

**Tech Stack:** TypeScript domain package (Vitest), Hono, zod-openapi and
Drizzle (API), React with Vite and Testing Library (console).

**Spec:** [spec 25](../specs/2026-11-23-new-member-emails.md).

## Global Constraints

- A new member: `age_confirmed_at` set, status not `deleted` (R25.2).
- At most one email an hour to each operator (R25.3); the gap is a constant
  in the domain, `newMembersEmailGapMinutes`, not a console setting.
- The email names nobody: counts and a time only (R25.4). Nothing about the
  new members in a log line either.
- Email only, to a confirmed address (R25.5); the console's email switch
  holds it like other news.
- Every text in `en.ts` and `is.ts`.
- Migration `0061` (check `packages/db/migrations` first: other threads add
  migrations too).
- Two deploys (conventions, Database): production holds real data, so PR 1
  ships everything that reads the new kind and column, and PR 2 the code
  that writes them. Release PR 1 before PR 2.

## Review Focus

1. A member who finished between two emails is counted once: the periods
   meet and do not overlap.
2. Turning the choice off stops an email already waiting; turning it on again
   counts only from then.
3. An account without the operator role, or waiting to be deleted, gets
   nothing, also from a notification made before the role went.
4. The step costs one small query a run while nobody has the choice on.

## PR 1: the notice, its words and the migration (reading half)

### Task 1: the domain rule

- [ ] `packages/domain/src/notifications/new-members.ts`:
  `newMembersEmailGapMinutes = 60` and
  `newMembersPeriod({ onSince, lastEmailAt, now })`, which gives
  `{ from }` (the later of `onSince` and `lastEmailAt`) or null while within
  the hour after `lastEmailAt`. Tests first.
- [ ] The catalogue: `new_members` with `{ push: false, email: "always",
  sms: false }`, in `operatorNoticeKinds`. A catalogue test that it goes by
  email only.

### Task 2: the migration

- [ ] `notificationPreferences.newMembersSince`, nullable `timestamptz`.
- [ ] `pnpm --filter @shareride/db generate`: migration 0061 with the column
  and the new kind in the three kind checks; Prettier on `meta/*.json`.

### Task 3: the words, and sending one

- [ ] `OperatorNoticeFacts` gets `{ kind: "new_members", count, since, total }`;
  `operatorText` turns it into the subject, body, button and its own footer
  (`NotificationText.footer`, which `emailContent` uses when given).
- [ ] The worker's `operatorFactsOf`: for `new_members`, the period from the
  later of `new_members_since` and the operator's previous `new_members`
  notification to this one's creation; the count of new members in it and
  the members in all. `current` only while the choice is still on (since no
  later than the notification), the account may use the console and the
  count is above zero. The operator's confirmed email.
- [ ] Download my data: `settings.newMemberEmailsSince` when set.
- [ ] `email-previews`: one email about new members in each language.
- [ ] Integration tests: a `new_members` notification made by hand is sent
  with the right count, time and total; skipped once the choice is off or the
  role is gone; `no_email` without a confirmed address.

### Task 4: the docs

- [ ] Spec 25 and this plan, their index rows, the privacy register's
  notification settings row, the CHANGELOG.

## PR 2: the choice and the step (writing half)

### Task 5: the step in the worker

- [ ] `tellOfNewMembers` in `runOnce`, after the switch reminders: the
  operators (active, operator role) with the choice on; for each, the last
  `new_members` notification, `newMembersPeriod`, the count since `from`;
  when above zero, `add` with the key `new_members:<now>`.
- [ ] Integration tests: nothing while off; the first member gives an email
  within a run; someone who has not finished is not counted; a second member
  within the hour waits and comes with the third after it; nobody new, no
  email; members only count once.

### Task 6: the console's routes

- [ ] Contracts: `adminOwnEmailsRoute` (`GET /admin/v1/me/emails`) and
  `adminSetOwnEmailsRoute` (`PUT /admin/v1/me/emails`, `{ newMembers }`),
  both answering `{ newMembers, address }`.
- [ ] `preferences.ts`: `newMembersSinceOf` and `setNewMembersEmail`, which
  keeps the first time when turned on twice and clears it when turned off.
- [ ] Integration tests: an operator turns it on and off; a member without
  the role gets 401 or 403 as other console routes do.

### Task 7: the console page

- [ ] `apps/admin/src/pages/emails.tsx`, a section above Passkeys: the
  checkbox that saves at once, "Saved.", the address or the warning without
  one, and a failed save that says so and shows what is stored. Tests first.

### Task 8: the docs

- [ ] This plan's status, the operator console guide's list of pages if it
  has one, and the production runbook: how to turn it on.
