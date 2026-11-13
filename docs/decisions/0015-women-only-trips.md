# 0015. Women-only trips based on a private self-declaration

- **Status:** Accepted (2026-11-13, decided by Martin answering open question
  Q12 and the questions in spec 14)
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [spec 14](../specs/2026-11-13-women-only-trips.md),
  [features G5](../product/features.md#g-trust-and-safety),
  [privacy and GDPR](../compliance/privacy-gdpr.md),
  [legal and regulatory](../compliance/legal-and-regulatory.md#9-questions-for-the-lawyer-phase-1-brief),
  open question Q12 (answer A36)

## Context

Some women do not want to ride alone with a man they do not know, and some
women drivers will only offer seats to other women. A women-only option can
bring both onto ShareRide. Lyft offers a similar option, Women+ Connect, for
women and non-binary people. Martin decided to include it in the MVP instead
of waiting for beta feedback.

Constraints:

- **Equal treatment law.** The Act on Equal Status and Equal Rights
  Irrespective of Gender (No. 150/2020), article 17, forbids gender
  discrimination in access to and supply of goods and services, outside
  private and family life. A difference in treatment is allowed when it is
  justified objectively by a legitimate aim and the means are appropriate and
  necessary. The act counts three genders: women, men and people registered
  as neutral. The Gender Autonomy Act (No. 80/2019) lets people define their
  own gender.
- **No way to check gender.** The Icelandic eID gives a name and a national
  ID number, and the number does not show gender. Checking ID documents would
  need a new provider and would contradict self-determination.
- **Privacy.** We collect as little as we need. A gender field for everyone
  would be personal data we do not otherwise need, and it can reveal a
  person's gender identity.

## Options considered

1. **Private opt-in, stored as a date only.** A woman declares in Settings
   that she wants women-only trips; we store when, nothing else. No proof
   is asked. Minimal data and follows gender autonomy. Someone could declare
   falsely; we rely on the community rules and reports.
2. **A gender field in every profile.** Asked of everyone, possibly shown,
   used as a search filter. Flexible, but collects gender from people who do
   not want the feature, and showing it invites discrimination.
3. **Verified gender.** Through ID documents or a registry. Harder to
   misuse, but no practical source exists, it adds cost and a provider, and it
   contradicts self-determination.
4. **Not in the MVP.** The earlier recommendation: decide after the beta.
   Martin chose to include it.

## Decision

We will offer women-only trips in the MVP, based on option 1. A woman opts in
with a private declaration in Settings, stored only as the date she made it;
we never store a gender field or ask for proof. Only a driver who has opted in
can mark a trip women-only, and only women who have opted in can book it.
Everyone in the car must be a woman, including people the driver or a
passenger brings along. Women-only trips are visible to everyone, marked
"Women only". The feature goes live only if the legal opinion confirms it is
allowed.

## Consequences

- People who do not opt in give no gender data at all.
- The public label shows that a woman is driving that trip, and the people on
  a trip can see who booked it. The app says so before someone opts in and
  before a driver marks a trip.
- Everyone sees which trips are women-only, so the option is easy to find,
  but people who cannot book will see trips they cannot take.
- People registered as neutral cannot join. The equal treatment act counts
  them as a gender of their own, so the lawyer is asked whether this is
  allowed.
- A false declaration breaks the community rules. Reports go through spec 9;
  the operator never asks for proof, judges by conduct, and can withdraw
  someone's access to women-only trips.
- A women-only trip is closed to most users, so each one serves fewer people.
  It adds trips for those who would not travel otherwise, and opting in never
  hides ordinary trips.
- Follow-up: a question for the lawyer, a row in the privacy register, text in
  the terms and community rules, and counts in the beta metrics.

## Revisit when

- The legal opinion says the option is not allowed, or only with changes,
  such as including people registered as neutral.
- Reports show the declaration is misused often.
- Beta data shows almost no use, or strong demand for more.
