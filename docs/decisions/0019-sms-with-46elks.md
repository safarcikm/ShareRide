# 0019. Send sign-in codes by SMS with 46elks

- **Status:** Proposed
- **Date:** 2026-11-13
- **Deciders:** Martin
- **Related:** [ADR 0016](0016-own-sign-in-module.md),
  [integrations](../architecture/integrations.md),
  [milestone 2 plan](../plans/2026-11-13-milestone-2-hosted-and-connected.md)

## Context

Sign-in sends a 6-digit code by SMS (ADR 0016). The provider must reach the
three Icelandic networks (Síminn, Nova, Vodafone) and foreign numbers, keep
data in the EEA, and stay cheap at low volume. SMS pumping fraud is a known
risk. Icelandic operators filter messages with links, and an alphanumeric
sender name such as "ShareRide" is allowed.

## Options considered

1. **46elks.** A Swedish telecom operator with its own servers in Sweden; all
   data processed in the EU; pay per message with no monthly fee; a small HTTP
   API. It treats itself as a data controller under telecom law rather than a
   processor. Smaller than the global providers.
2. **Sinch.** Swedish, large, with direct operator connections and an EU data
   region; more onboarding and account management.
3. **Twilio.** Familiar and well documented, but a United States company,
   the highest price to Iceland of the large providers in 2024, and data
   residency in the EU takes extra setup.
4. **An Icelandic operator's SMS gateway.** Best local delivery, but only for
   Icelandic numbers, so a second provider is needed for visitors.

## Decision

We will send SMS through **46elks**, behind the existing `SmsSender` port,
from a queued job in the worker. Before the beta we test delivery to numbers
on all three Icelandic networks; **Sinch** is the fallback if delivery or
prices disappoint.

## Consequences

- No fixed cost; we pay per message.
- The port keeps the provider replaceable by one adapter.
- The privacy inventory lists 46elks as a separate controller for messages
  it carries.
- We still need our own guard against SMS pumping: the country list, a daily
  budget per country, an alert on unusual volume and a kill switch.

## Revisit when

Delivery to an Icelandic network fails or is slow, prices change, or volume
grows enough that direct operator routes pay off.
