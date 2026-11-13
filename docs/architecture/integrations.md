# External integrations

**Owner:** Martin · **Last reviewed:** 2026-11-13 · **Status:** Proposed

Every external service sits behind a port (interface) in the backend, so a
provider can be replaced by writing one adapter. Providers that process
personal data must offer an EEA region or adequate safeguards and sign a data
processing agreement ([ADR 0007](../decisions/0007-eea-hosting-and-data-residency.md)).

Provider names are candidates to evaluate, not commitments.

| Need | Port | Candidates | Phase | Notes |
| ---- | ---- | ---------- | ----- | ----- |
| Map display | `MapTiles` (client) | MapTiler, Stadia Maps, self-hosted Protomaps tiles | 2 | MapLibre renderer, OpenStreetMap data ([ADR 0009](../decisions/0009-maps-and-routing.md)) |
| Routing (distances between meeting points) | `RoutingEngine` | Valhalla or OSRM self-hosted on the Iceland extract; or a hosted routing API | 2 | Run offline to fill the legs table; not on every request |
| Place search (geocoding) | `Geocoder` | Our own meeting-point and place-name index; national geodata as a source | 2 | Iceland place names from the national geodata portal; addresses from the official address register |
| SMS (sign-in codes, critical alerts) | `SmsSender` | An EU SMS provider with good Icelandic delivery | 2 | Watch cost and fraud (SMS pumping); rate-limit |
| Email | `EmailSender` | An EU email provider | 2 | Transactional only; templates per language |
| Push notifications | `PushSender` | Expo push service (wraps APNs and FCM) | 2 | Tokens stored per device |
| Error tracking | n/a | Sentry (EU data region) or similar | 2 | Scrub personal data before sending |
| Analytics | `Analytics` | PostHog (EU cloud) or self-hosted alternative | 3 | Consent-based; no session recording of personal screens |
| Weather warnings | `WeatherWarnings` | Veðurstofa Íslands (Icelandic Met Office) data services | 4 | Match warning areas to trip routes |
| Road conditions and closures | `RoadConditions` | Vegagerðin web services (DATEX II) | 4 | Match closed road sections to legs |
| Electronic ID | `IdentityVerifier` | Auðkenni directly (OIDC) or through a broker such as Signicat | 4 | Optional verification badge for residents |
| Document ID check (visitors) | `IdentityVerifier` | A document-verification provider with EU processing | 5 | Only if the beta shows a need |
| Payments | `PaymentProvider` | Rapyd, Teya, Straumur (Icelandic acquirers); a non-Icelandic entity would open Stripe or Adyen | 5 | See [ADR 0008](../decisions/0008-payments-phased.md) |
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
