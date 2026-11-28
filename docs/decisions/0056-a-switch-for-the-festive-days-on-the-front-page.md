# 0056. A switch for the festive days on the front page

- **Status:** Proposed
- **Date:** 2026-11-28
- **Deciders:** Martin
- **Related:** [spec 36](../specs/2026-11-28-seasonal-banner.md) (3.8, R36.7);
  [ADR 0032](0032-operator-settings-list-ranges-and-versions.md) (adding a
  setting needs an ADR, R10.4);
  [ADR 0052](0052-animations-css-on-the-web-reanimated-on-phones.md) (the
  motion the days use)

## Context

From spec 36 the front page's banner follows the year in Iceland on its
own: the four seasons, eight big days (Christmas, New Year, Easter, the
first days of summer and winter, 17 June, the August long weekend and
1 December) and five smaller ones (Bóndadagur, Konudagur, Bolludagur,
Öskudagur and Seafarers' Day). A day dresses up the car, wishes people a
good day in a small label and plays a short moment.

The days come from the date alone, so nobody has to do anything for them.
But a day can come at the wrong time: after a disaster or a death in the
country, fireworks and party hats on the front page would be wrong, and
the operator needs to take them down within minutes, without a release
and without a new app in the stores.

The operator's settings are the place for that: they have versions, show
who changed what, and reach the apps through `GET /v1/config`, which the
apps read when they open and every five minutes (spec 10). ADR 0032 fixed
the list of settings; adding one needs an ADR (R10.4).

## Options considered

1. **No switch.** Nothing to build. On a sad day the only way out is a
   release of the website and a new phone app, which takes hours on the
   website and days in the stores.
2. **An environment setting on the server.** No console change. Changing
   it means a deploy in Render, and its change is not recorded with the
   other settings.
3. **A console switch, `festive_days`, on by default.** One more switch on
   the Settings page, recorded like every setting; the apps follow it
   within about five minutes. The seasons stay, so the banner never looks
   broken.

## Decision

We will add the setting `festive_days`, a switch that is on by default, in
a new group "Front page" of the console's Settings, and give it to the
apps as `festiveDays` in `GET /v1/config` (true from an API that does not
say). Off, the front page shows only the season: no day's look, greeting
or moment. Read as it is now, like the other switches.

## Consequences

- The operator can take the days down in a minute from the console, on the
  website and in the apps that are open, and bring them back the same way.
- One more setting to keep: its texts in Icelandic and English in the
  console, a line in the operator's guide and in spec 10's list.
- Until the apps have read the answer, they show the day (the default),
  so an app opened in the first moments after the switch goes off can
  still show it until its next read.
- Follow-up: the build in
  [the plan](../plans/2026-11-28-seasonal-banner.md), second pull request.

## Revisit when

- The operator wants to turn off single days, or only the moments, rather
  than all the days at once.
- Other parts of the front page need a switch of their own, and a group of
  look settings would be clearer.
