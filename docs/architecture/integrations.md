# External integrations

**Owner:** Martin · **Last reviewed:** 2026-11-13 · **Status:** Proposed

Every external service sits behind a port (interface) in the backend, so a
provider can be replaced by writing one adapter. Providers that process
personal data must offer an EEA region or adequate safeguards and sign a data
processing agreement ([ADR 0007](../decisions/0007-eea-hosting-and-data-residency.md)).

Provider names are candidates to evaluate, not commitments, unless the row
links an ADR that chose one.

| Need | Port | Candidates | Phase | Notes |
| ---- | ---- | ---------- | ----- | ----- |
| Map display | `MapTiles` (client) | **MapTiler** ([ADR 0021](../decisions/0021-map-tiles-from-maptiler.md)); self-hosted Protomaps tiles as the fallback | 2 | MapLibre renderer, OpenStreetMap data ([ADR 0009](../decisions/0009-maps-and-routing.md)) |
| Routing (distances between meeting points) | `RoutingEngine` | Valhalla or OSRM self-hosted on the Iceland extract; or a hosted routing API | 2 | Run offline to fill the legs table; not on every request |
| Place search (geocoding) | `Geocoder` | Our own meeting-point and place-name index; national geodata as a source | 2 | Iceland place names from the national geodata portal; addresses from the official address register |
| SMS (sign-in codes, critical alerts) | `SmsSender` | **Vonage**, EU endpoint ([ADR 0023](../decisions/0023-sms-with-vonage.md)); 46elks as the fallback | 2 | Watch cost and fraud (SMS pumping); rate-limit |
| Email | `EmailSender` | An EU email provider | 2 | Transactional only; templates per language |
| Push notifications | `PushSender` | Expo push service (wraps APNs and FCM) | 2 | Tokens stored per device |
| Error tracking and uptime | n/a | **Sentry, EU data region** ([ADR 0020](../decisions/0020-error-tracking-with-sentry-eu.md)) | 2 | Scrub personal data before sending |
| Object storage (photos) | `FileStorage` | **Hetzner Object Storage, Helsinki** ([ADR 0022](../decisions/0022-photo-storage-on-hetzner.md)) | 2 | Private bucket, signed links, metadata removed before storing |
| Sign in with Apple and Google | n/a (ID tokens checked in the API) | Apple, Google | 2 | Separate controllers for their own sign-in; we keep the subject ID and email |
| Analytics | `Analytics` | PostHog (EU cloud) or self-hosted alternative | After the beta, if needed | None in the beta (spec 12); consent-based; no session recording of personal screens |
| Weather warnings | `WeatherWarnings` | Veðurstofa Íslands (Icelandic Met Office) data services | 4 | Match warning areas to trip routes |
| Road conditions and closures | `RoadConditions` | Vegagerðin web services (DATEX II) | 4 | Match closed road sections to legs |
| Electronic ID | `IdentityVerifier` | Auðkenni directly (OIDC) or through a broker such as Signicat | 4 | Optional verification badge for residents |
| Document ID check (visitors) | `IdentityVerifier` | A document-verification provider with EU processing | 5 | Only if the beta shows a need |
| Payments | `PaymentProvider` | Rapyd, Teya, Straumur (Icelandic acquirers); a non-Icelandic entity would open Stripe or Adyen | 2 | In the app from the beta, see [ADR 0013](../decisions/0013-in-app-payments-only.md); provider chosen in its own ADR |
| Flight status (KEF) | `FlightStatus` | Isavia data or a flight data API | 5 | For airport trips |

## Integration rules

1. **Timeouts and retries** on every outbound call; failures never block a
   booking transaction. Side effects (SMS, email, push) run from the outbox in
   the worker.
2. **Idempotency keys** for anything that sends a message or moves money.
3. **No personal data in URLs or logs** sent to third parties.
4. **Contract tests** for each adapter against the provider's sandbox; unit
   tests use an in-memory fake of the port.
5. **Kill switch:** each integration can be disabled by a feature flag without
   a deploy.
6. **Record the decision:** adding a provider means an ADR or an update to an
   existing one, and an entry in the record of processing activities.
