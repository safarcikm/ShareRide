# Security

**Owner:** Martin · **Last reviewed:** 2026-11-13

ShareRide brings strangers together in cars and stores where people travel.
Security failures here can hurt people physically, not only financially. We
use the [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
(ASVS) level 2 as the checklist for the API and the
[OWASP Mobile Application Security](https://mas.owasp.org/) guidance for the
apps.

## Threats we design against

| Threat | Example | Main controls |
| ------ | ------- | ------------- |
| Account takeover | SIM swap, guessed codes | Code expiry and attempt limits, device sessions list, re-verification for sensitive changes |
| SMS fraud (SMS pumping) | Bots trigger thousands of codes to premium numbers | Rate limits per IP, number and prefix; country allow-list; bot checks; spending alerts |
| Scraping and stalking | Collecting who travels where and when | Public profiles show first name only; exact trip details and vehicle plate only to booked passengers; rate-limited search |
| Broken access control | Editing someone else's trip, reading other people's chats | Ownership checks in every application service; tests for each endpoint as another user |
| Overbooking or price tampering | Race conditions, manipulated requests | Server computes prices and availability; transactional capacity check; database constraints |
| Harassment | Abusive messages, unsafe behaviour | Report and block, moderation queue, suspension, retained evidence for reports |
| Data breach | Leaked database or backups | Encryption at rest and in transit, least-privilege database roles, no personal data in logs, access audit |
| Supply chain | Malicious package or action | Lockfile, pinned actions, dependency review, minimal dependencies |
| Admin misuse | Operator account compromised | Separate operator role, passkey or hardware-key sign-in, audit log of every admin action |

## Baseline controls

- HTTPS everywhere; HSTS on the web.
- Tokens stored in secure storage on devices (Keychain, Keystore), HTTP-only
  cookies on the web.
- Input validated with shared Zod schemas at the API edge; output encoded.
- Rate limiting on sign-in, search, booking, messaging and reporting.
- Secrets only in environment secret stores; rotated when people or providers
  change.
- Database: separate roles for the app, migrations and read-only analysis.
- Backups encrypted and access-restricted.
- Security headers and a content security policy on web properties.
- Dependencies and containers scanned in CI; critical findings block merge.

## Safety features (product)

- Meeting points only at public, lit places.
- Exact vehicle details visible to booked passengers only.
- Share trip details with a contact (Phase 5: live location).
- 112 and SafeTravel links on trip screens; reporting from every profile,
  trip and chat.
- Reviews revealed only after both sides have reviewed, to reduce retaliation.

## Process

- Security review of every PR touching auth, booking, payments, personal data
  or admin (use `/security-review` in Claude Code, plus the security-guidance
  plugin during development).
- Threat model updated in this file when a new feature changes the picture.
- External penetration test before public launch (Phase 4) and before
  in-app payments (Phase 5).
- Vulnerability reports handled per [SECURITY.md](../../SECURITY.md).
- Personal data breaches follow the breach procedure in
  [privacy and GDPR](../compliance/privacy-gdpr.md#breaches).
