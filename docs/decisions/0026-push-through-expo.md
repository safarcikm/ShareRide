# 0026. Send push notifications through Expo's push service

- **Status:** Proposed
- **Date:** 2026-11-15
- **Deciders:** Martin
- **Related:** [spec 7](../specs/2026-11-13-chat-and-notifications.md),
  [milestone 5 plan, 4.5](../plans/2026-11-15-milestone-5-chat-and-notifications.md#45-push),
  [ADR 0003](0003-cross-platform-client-expo.md),
  [ADR 0007](0007-eea-hosting-and-data-residency.md),
  [privacy providers](../compliance/privacy-gdpr.md#providers)

## Context

Spec 7 tells people about booking changes and new chat messages with a push
on their phone. A push carries first names, places, times and, for a chat
message, its text, never the details in R7.9. Every push to an iPhone goes
through Apple's push service (APNs) and every push to an Android phone
through Google's (FCM). Both are United States companies and there is no
EEA alternative, whoever sends the push. ADR 0007 asks that personal data is
processed in the EEA, or that an adequacy decision applies.

The app is built with Expo and EAS (ADR 0003). Expo runs a push service that
takes one kind of token for both platforms, keeps the Apple and Google
credentials in EAS, and forwards each message to APNs or FCM.

## Options considered

1. **Expo's push service.** One HTTP call for both platforms, sent with
   `fetch` (no SDK); receipts say which tokens are dead; free. Adds Expo, a
   United States company, as a processor: it says it is certified under the
   EU-US Data Privacy Framework, keeps push contents only in memory and
   queues until they are handed to Apple or Google, and lists Apple and
   Google as its push sub-processors. A push fails while Expo's service is
   down.
2. **APNs and FCM directly.** One company fewer on the way. Two adapters, an
   Apple key and a Google service account in our secret store, token
   signing and refreshing of our own, and native device tokens in the app.
   The data still goes to the United States, through Apple and Google.
3. **A push vendor** (OneSignal, Airship, WonderPush). Campaigns and
   analytics we do not need, its SDK in the app, and still Apple and Google.
4. **Pushes without content** ("You have news", the rest in the app). Less
   passes through the United States with any option above, but spec 7 shows
   names, times and the message, which is what makes a push useful.

## Decision

We will send push notifications through **Expo's push service**, from the
notification worker with `fetch`, using an Expo access token when it is set
(Expo's "enhanced security", so a leaked device token cannot be used to
push to that device). Contents follow spec 7. The transfer to the United
States relies on the Data Privacy Framework adequacy decision for Expo,
Apple and Google (**verify** their listings before the beta), which ADR 0007
allows.

## Consequences

- One adapter and one kind of token; dead tokens are removed from tickets
  and receipts.
- Martin signs Expo's data processing agreement and checks its listing;
  the privacy notice says pushes pass through Expo, Apple and Google, and
  the lawyer reviews this with the rest before the beta.
- Android builds need a Firebase project, whose key is uploaded to EAS
  ([app builds](../operations/app-builds.md)); iPhone push waits for the
  Apple account.
- The `PushSender` port stays, so option 2 later means a new adapter and
  native device tokens, not a new design.
- If the lawyer advises it, option 4 can be applied to chat pushes alone.

## Revisit when

The Data Privacy Framework is struck down or Expo leaves it, Expo's push
service changes its terms or limits, or the lawyer advises against content
in pushes.
