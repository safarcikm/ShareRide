# A meeting point for every settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every settlement in Iceland that people live in and can drive
to is a town in place search, and the console can import a meeting point
for each of them as drafts that go live without a photo.

**Architecture:** Three parts. The photo rule (ADR 0036) is a flag on
each checklist item in the domain, which the API's `ready` and
`activate`, the contract and the console read. The places move from the
sample data to reference data in `packages/db/src/places/`, seeded by the
migration command in every environment. The points are a CSV in the
console's import format, checked by unit tests against the import reader
and the road file; the operator imports them.

**Tech Stack:** TypeScript, Drizzle, Hono, React (console), Vitest.

**Spec:** [spec 21](../specs/2026-11-22-meeting-points-for-every-settlement.md).
Martin chose that a point can go live before its photo on 2026-11-22
([ADR 0036](../decisions/0036-meeting-points-go-live-before-their-photo.md)).

## Global Constraints

- One PR: the spec, the ADR, this plan and the code together, since the
  data is built and the code change is small.
- No migration, no new dependency, no new service.
- Places are reference data: `seedPlaces` adds or updates, never deletes.
  A place keeps the ID the sample place had (`sampleId("place:" + key)`),
  so corridors and the search log keep pointing at it.
- The photos thread is building photo storage in parallel; it does not
  touch the activation files.
- Every text in `en.ts` and `is.ts`.

## Review Focus

1. A point with every required item done and no photo: `ready` is true and
   activate works; a point missing another item is refused, and the
   console's list after a refusal keeps the photo item as recommended.
2. Production: the migration command seeds places without the sample
   seed's guard, and a second run changes nothing.
3. The sample seed no longer deletes places it does not list.

## Task 1: The photo is recommended

**Files:** `packages/domain/src/meeting-points/activation.ts` and its
test; `packages/contracts/src/admin-meeting-points.ts`;
`apps/api/src/modules/meeting-points/admin-service.ts` and the admin
meeting point integration test; `apps/admin/src/pages/meeting-points/activation.tsx`
and its test; `packages/i18n/src/messages/en.ts`, `is.ts`.

- [x] Domain test: ready without a photo when the required items are
  done; not ready when another item is missing; `photos` has
  `required: false`.
- [x] `ActivationCheck` gains `required`; `optionalActivationItems` lists
  `photos`; `readyToActivate` reads the required items only.
- [x] Contract: each item has `required`.
- [x] API: `activate` refuses only for missing required items, and names
  only those; integration test activates a draft with no photo.
- [x] Console: the photo item shows "Recommended" while it is not done,
  is not counted in "things still to do", and keeps that after a refused
  activation.
- [x] Texts `admin.activation.recommended`, `admin.activation.item.photos`.

## Task 2: Towns for place search

**Files:** `packages/db/src/places/places.ts`, `seed.ts`, `places.test.ts`;
`packages/db/src/sample/meeting-points.ts`, `seed.ts` and their tests;
`packages/db/src/migrate-cli.ts`; `packages/db/src/seed.ts`.

- [x] `places.ts`: the 110 settlements (Statistics Iceland's code and
  2026 population) and the 7 landmarks; sample keys and attributes kept.
- [x] Tests: unique keys, every settlement code once, the sample keys
  there, the corridors' places there.
- [x] `seedPlaces(db, now)` upserts them (`sample: false`); the sample seed
  calls it instead of its own list and deletes no place.
- [x] `migrate-cli.ts` runs `seedPlaces` after the migrations, always.

## Task 3: The import file

**Files:** `packages/db/src/places/settlement-meeting-points.csv`,
`settlement-meeting-points.test.ts`.

- [x] Tests: every row reads through `readMeetingPointImport` with no
  problem, under 500 rows, no name twice; every point joins a road within
  1 km and reaches the BSÍ point by road; every place reaches a point (its
  municipalities or its radius).

## Task 4: Docs

- [x] Spec 2's R2.3 says "amended by spec 21"; the meeting point guide and
  the console doc say a photo is recommended; the console doc has the
  steps to import the file; the indexes list spec 21, ADR 0036 and this
  plan; `CHANGELOG.md`.

## Task 5: The main sights (added 2026-11-22)

- [x] Martin asked for the tourist spots: `sight-meeting-points.csv`, 32
  points in the sights' car parks (spec 21, 3.6, decisions 6 and 7), the
  25 new sights in `landmarkPlaces`, and `sight-meeting-points.test.ts`.

## After merging (Martin)

On staging and later production: the console's Meeting points page,
Import, the file `packages/db/src/places/settlement-meeting-points.csv`.
Then for each draft: open it in maps, move it if needed, and check its
texts, amenities and season. Then, on the list filtered to drafts, tick
the ones checked and "Confirm and activate N points" (added after this
plan, spec 21 decision 5), which confirms each today. Then the same with
`packages/db/src/places/sight-meeting-points.csv`.
