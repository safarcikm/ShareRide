# Architecture Decision Records

An Architecture Decision Record (ADR) captures one significant decision: the
context, the options considered, what was decided and the consequences. ADRs
let anyone, years from now, understand why the system is the way it is.

## When to write one

Write an ADR when a decision:

- is hard or expensive to reverse (framework, database, provider, data model)
- changes a business rule (pricing, capacity, cancellations)
- adds an external service or a new category of dependency
- affects security, privacy or legal compliance
- will make someone ask "why did we do it this way?"

When in doubt, write a short one.

## How

1. Use the `write-adr` Claude Code skill, or copy [template.md](template.md) to
   `NNNN-short-title.md` with the next free number.
2. Set the status to `Proposed` and open a PR.
3. The owner reviews. On approval, set the status to `Accepted` with the date.
4. Never rewrite an accepted decision. To change it, write a new ADR and set
   the old one's status to `Superseded by ADR NNNN`.

Statuses: `Proposed`, `Accepted`, `Rejected`, `Deprecated`, `Superseded by ADR NNNN`.

## Index

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-monorepo-and-typescript.md) | Monorepo and TypeScript everywhere | Accepted |
| [0003](0003-cross-platform-client-expo.md) | Cross-platform client with Expo | Accepted |
| [0004](0004-backend-modular-monolith.md) | Backend as a TypeScript modular monolith | Accepted |
| [0005](0005-postgresql-postgis.md) | PostgreSQL with PostGIS as the system of record | Accepted |
| [0006](0006-meeting-points-and-segment-pricing.md) | Meeting-point network with per-segment prices and seats | Superseded by ADR 0012 |
| [0007](0007-eea-hosting-and-data-residency.md) | EEA hosting and data residency | Accepted |
| [0008](0008-payments-phased.md) | Phased payments behind a provider-agnostic port | Superseded by ADR 0013 |
| [0009](0009-maps-and-routing.md) | Maps with MapLibre and OpenStreetMap; precomputed routing | Accepted (map display superseded by ADR 0024, routing engine by ADR 0031) |
| [0010](0010-authentication-and-identity.md) | Phone-first authentication and layered identity verification | Accepted (implementation superseded by ADR 0016, sign-in by text by ADR 0046) |
| [0011](0011-localization.md) | Icelandic and English from day one | Accepted (formatting superseded by ADR 0025) |
| [0012](0012-trip-price-level.md) | One price level per trip instead of per-segment price editing | Accepted |
| [0013](0013-in-app-payments-only.md) | All payments through the app, from the beta | Accepted (set aside until milestone 15 by ADR 0038) |
| [0014](0014-passenger-service-fee-from-launch.md) | A passenger service fee from public launch | Accepted |
| [0015](0015-women-only-trips.md) | Women-only trips based on a private self-declaration | Accepted |
| [0016](0016-own-sign-in-module.md) | Our own sign-in module instead of an auth library | Accepted |
| [0017](0017-visual-design-system.md) | Our own visual design system on React Native primitives | Accepted |
| [0018](0018-hosting-on-render-frankfurt.md) | Host the API, worker and database on Render in Frankfurt | Accepted |
| [0019](0019-sms-with-46elks.md) | Send sign-in codes by SMS with 46elks | Superseded by ADR 0023 |
| [0020](0020-error-tracking-with-sentry-eu.md) | Error tracking and uptime checks with Sentry in its EU region | Accepted |
| [0021](0021-map-tiles-from-maptiler.md) | Map tiles from MapTiler | Superseded by ADR 0024 |
| [0022](0022-photo-storage-on-hetzner.md) | Store photos in Hetzner Object Storage in Helsinki | Accepted (re-encoding and link lifetime superseded by ADR 0029, the location by ADR 0037) |
| [0023](0023-sms-with-vonage.md) | Send sign-in codes by SMS with Vonage, 46elks as the fallback | Accepted |
| [0024](0024-own-simple-map-of-iceland.md) | Our own simple map of Iceland instead of map tiles | Accepted |
| [0025](0025-own-date-and-number-formatting.md) | Our own date and number formatting instead of Intl's locale data | Accepted |
| [0026](0026-push-through-expo.md) | Send push notifications through Expo's push service | Accepted |
| [0027](0027-email-through-mailjet.md) | Send email through Mailjet | Accepted |
| [0028](0028-operator-console-web-app-and-passkeys.md) | The operator console as its own web app, signed in with passkeys | Accepted (getting back in without a passkey amended by 0040; a password for now by 0041, on production too by 0044) |
| [0029](0029-photos-cleaned-in-the-browser-and-checked-by-the-api.md) | Photos made in the browser and checked by the API; links signed per hour | Accepted |
| [0030](0030-limit-what-a-whole-trip-brings-the-driver.md) | Limit what a whole trip brings the driver, counting money already booked | Accepted |
| [0031](0031-distances-from-our-own-road-file.md) | Distances between meeting points from our own road file | Accepted |
| [0032](0032-operator-settings-list-ranges-and-versions.md) | Operator settings: the list, their ranges, and versions on trips and bookings | Accepted (the `invite_code_required` default superseded by 0035) |
| [0033](0033-profile-photos-made-in-the-app-and-checked-by-the-api.md) | Profile photos made in the app and checked by the API | Accepted |
| [0034](0034-google-and-apple-sign-in-through-our-api.md) | Google and Apple sign-in through our API, in a browser window | Accepted (app IDs and scheme renamed by 0039) |
| [0035](0035-open-web-beta-reached-by-email.md) | An open beta on the web, reaching members by email | Accepted |
| [0036](0036-meeting-points-go-live-before-their-photo.md) | A meeting point can go live before it has a photo | Accepted |
| [0037](0037-photo-storage-in-nuremberg.md) | Store photos in Hetzner Object Storage in Nuremberg | Accepted |
| [0038](0038-pay-the-driver-in-person-until-card-payments.md) | Passengers pay the driver in person until payments in the app work | Accepted |
| [0039](0039-rename-to-puffinride.md) | Rename the product to PuffinRide, on puffinride.is | Accepted |
| [0040](0040-console-recovery-by-text-code.md) | Get back into the console with a text code and a new passkey | Accepted |
| [0041](0041-console-password-for-now.md) | Sign in to the console with a password for now | Superseded by 0044 |
| [0042](0042-production-on-render-released-with-a-button.md) | Production on Render, released with a button | Accepted |
| [0043](0043-legal-documents-published-from-the-repository.md) | Publish the legal documents from the repository | Proposed |
| [0044](0044-console-password-on-production.md) | The console password on production too | Accepted |
| [0045](0045-google-analytics-on-the-website-after-consent.md) | Google Analytics on the website, only after consent | Accepted |
| [0046](0046-sign-in-by-email-code-and-text-only-to-check-the-number.md) | Sign in with an email code or Google; a text message only checks the number | Accepted |
| [0047](0047-member-passwords-hashed-with-scrypt.md) | Members may set a password, stored as a scrypt hash | Proposed |
| [0048](0048-member-passkeys-on-the-device-only.md) | Face ID or fingerprint for members: passkeys kept on the device | Accepted |
| [0049](0049-draw-link-preview-pictures-with-resvg.md) | Draw link preview pictures on the server with resvg | Proposed |
