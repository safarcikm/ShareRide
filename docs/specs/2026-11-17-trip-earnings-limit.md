# Spec 17: A limit on what one trip brings the driver

**Owner:** Martin · **Date:** 2026-11-17 · **Status:** Approved
(2026-11-17); not built yet, see the
[implementation plan](../plans/2026-11-17-trip-earnings-limit.md)

Decision record: [ADR 0030](../decisions/0030-limit-what-a-whole-trip-brings-the-driver.md)
(accepted). Open question Q25, answered as A48. This spec amends rules P3,
P4 and M3 in [pricing and seats](../product/pricing-and-seats.md),
[spec 3](2026-11-13-post-a-trip.md) 3.6 (price level),
[spec 6](2026-11-13-changes-and-cancellations.md) 3.2 (changing seats and
price) and [spec 13](2026-11-13-payments.md) 3.4 (payouts). Related:
[legal and regulatory](../compliance/legal-and-regulatory.md),
[ADR 0012](../decisions/0012-trip-price-level.md),
[ADR 0014](../decisions/0014-passenger-service-fee-from-launch.md).

## 1. Problem and goal

Martin asked on 2026-11-17 how to make sure that the overall gain from one
ride never goes over the state's rate per km, when several seats each pay a
price, for example 3 seats.

ShareRide's case for being carpooling and not a taxi service rests on this
cap: Iceland's Taxi Act has no cost-sharing exemption, so the strongest
argument is that a driver only shares the cost of a trip they make anyway
([legal and regulatory](../compliance/legal-and-regulatory.md#1-ride-sharing-versus-taxi-service-highest-priority)).

**Goal:** one rule anyone can check on any trip, "a trip never brings its
driver more than a full car at the cap", that keeps holding whatever happens
after the trip is published: seats added, passengers who don't come, stops
added, bookings on part of the route.

## 2. The rate

- **The state's mileage allowance** (akstursgjald), set by the travel cost
  committee (Ferðakostnaðarnefnd) for state employees who drive their own
  car: 150 kr per km for the first 10 000 km a year, 135 kr from 10 000 to
  20 000 km and 120 kr above, from 1 June 2026 (auglýsing nr. 1/2026,
  checked 2026-11-17). Gravel roads outside towns add 15% (sérstakt gjald)
  and especially difficult conditions add 45% (torfærugjald).
- **It is a full-cost rate.** It covers depreciation, inspection, vehicle
  tax, insurance, fuel, oil, tyres, parts and repairs, not only fuel.
- **Skatturinn's figure is lower.** The 2026 deduction against a car
  allowance is 142 kr per km for the first 1 000 km and falls with distance.
- ShareRide already uses 150 kr (`reference_cost_per_km`, rule P3). This
  spec does not change the rate; the legal opinion may.

For comparison: Germany exempts carpooling when the whole fare per km,
from all passengers together, stays within its federal mileage allowance of
30 euro cents per km (PBefG section 1(2), BRKG section 5(2)). France asks
the driver to keep a share of the cost themselves, with costs capped by its
tax mileage scale.

## 3. How the cap works today

Rule P3 caps each stretch's price per seat at distance × 150 kr ÷ (seats +
1). The driver counts as one of the people sharing the cost, so a full car
pays the driver at most seats ÷ (seats + 1) of 150 kr per km. This is
already the "cap divided by the seats" idea, with the driver counted.

Example: the trip in [pricing and seats](../product/pricing-and-seats.md#worked-example),
Reykjavík → Borgarnes → Blönduós → Akureyri, 74 + 171 + 143 = 388 km. At
150 kr per km that trip costs 58 200 kr. Figures from the pricing code on
`main` (`packages/domain/src/trips/prices.ts`):

| Seats offered | Highest level | One seat, whole route | Full car | Share of 58 200 kr |
| ------------- | ------------- | --------------------- | -------- | ------------------ |
| 1 | 500% | 29 100 kr | 29 100 kr | 50% |
| 2 | 330% | 19 300 kr | 38 600 kr | 66% |
| 3 | 250% | 14 600 kr | 43 800 kr | 75% |
| 4 | 200% | 11 600 kr | 46 400 kr | 80% |
| 8 | 110% | 6 400 kr | 51 200 kr | 88% |

At the suggested level (100%, 5 800 kr a seat) a full car with 3 seats pays
17 400 kr, 30% of the cost.

**Bookings on part of the route don't break it.** The cap is per stretch
and seat, and a stretch never has more seats taken than offered (rule S2).
When 3 seats carry 7 passengers on different parts of the trip (the seats
example in pricing and seats), each stretch still brings at most 3 × its
cap.

So with 3 seats and nothing changed after publishing, the total cannot go
over the limit.

## 4. Where it breaks today

The cap is checked one booking at a time, at the price level of that
moment. Three things let a trip's total run past what rule P3 intends.

1. **Adding seats after people have booked.** Bookings keep the price they
   were made at (P1), and more seats only lower the level for new bookings
   (spec 6, 3.2 item 10). A driver who offers 1 seat at 500%, gets it
   booked, goes to 2 seats (330%), gets that booked, then 3 seats (250%),
   collects 29 100 + 19 300 + 14 600 = **63 000 kr: 108% of the 58 200 kr
   cost**, and 144% of what 3 seats allow. Going on one seat at a time to 8
   seats gives 105 500 kr, 181%. It also happens without anyone gaming it:
   1 seat booked at 500%, then 2 more seats, gives 58 300 kr, so the
   passengers pay the driver's whole car and the driver's own share is gone.
2. **Money kept after a no-show or late cancellation, and the seat sold
   again.** The driver keeps the payment (rule M2), but the seat stops
   counting as taken (rule S1), so a later stop can sell it again. A full
   car at 250% brings 43 800 kr; two passengers don't come at Reykjavík; two
   people book Borgarnes → Akureyri at 11 800 kr each: **67 400 kr, 116%**.
3. **Rounding on short stretches** (A39, already a question for the lawyer):
   8 seats × 100 kr on a 4 km stretch that costs 600 kr.

Gaps 1 and 2 are rare, but they are exactly what would look bad in front of
Samgöngustofa or a court: the app's own records would show a trip bringing
its driver more than the trip cost.

## 5. Options

| Option | Drivers | Passengers | Legal position | Work |
| ------ | ------- | ---------- | -------------- | ---- |
| **A. Keep today's cap per seat** | No change | No change | Gaps 1 to 3 stay open | None |
| **B. Freeze the seats once someone books**, and a paid-for seat stays taken | Can't add a seat after the first booking; an empty seat after a no-show can't be filled | Fewer seats to book | Closes gaps 1 and 2 | Small |
| **C. A trip limit that counts money already booked** (recommended) | No change on normal trips; after adding seats or a no-show, the seats left may cost less | Price fixed when booking, as today; late bookers sometimes pay less | Closes gaps 1 and 2; one number per trip to show the lawyer, the police or Skatturinn | Medium |
| **D. Split the cost after the trip**: prices fall as the car fills and earlier passengers get money back | Same total as C | Final price unknown when booking; small refunds days later | Strongest cost-sharing story | Large: partial refunds, part-route splits, card fees |
| **E. Refund anything over the limit at payout** | Payout unknown until after the trip | Odd small refunds; a credit balance instead would make ShareRide hold stored money (e-money rules) | Closes every gap, after the fact | Medium, and tied to the payment provider |
| **F. Let a full car cover the whole 150 kr per km** (stop counting the driver) | A third more per seat with 3 seats (50 kr per km instead of 37.5) | Pay more on full cars | Weaker: passengers pay the driver's whole car, depreciation and insurance included | Small |

Option F is not an alternative to the others; it decides how high the
limit is. It is decision 2 below.

## 6. Recommendation

**Option C, and keep counting the driver as one of the sharers.**

In plain words: every trip has a limit, what a full car would pay at the
cap. Every booking uses part of it, and money a driver keeps after a
no-show or a late cancellation stays used. The highest price level for the
seats still free is the one that keeps a full car inside the limit.

On a normal trip nothing changes, because today's cap already keeps a full
car inside the limit. The new rule only matters after one of the gaps.

The same examples with the rule:

- **Gap 1.** After the first booking at 29 100 kr, going to 3 seats leaves
  14 700 kr for 2 more seats. The highest level falls to 120%, so each new
  seat costs 7 000 kr: 43 100 kr in all. Adding seats one at a time ends at
  43 700 kr, inside the 43 800 kr limit.
- **Gap 2.** After two no-shows in a full car the limit is used up. The two
  freed seats can still be offered, but only free (0%).
- A driver at the suggested level is hardly ever touched: with 3 seats, 1
  booking at 100% and a no-show, the highest level is still 210%.

Why C over the others: it keeps the price a passenger sees fixed when they
book, it needs no refunds, it builds on the price level drivers already
have (ADR 0012), and it turns the cost-sharing promise into one number per
trip that the app can show and check.

## 7. Rules (proposed changes to pricing and seats)

These replace the matching parts of rules P3 and P4 once approved.

### Trip limit (rule P3)

```text
cap[k]      = round_to_step(distance_km[k] × reference_cost_per_km / (capacity + 1))   (unchanged)
trip_limit  = Σ_k capacity × cap[k]
takings     = Σ price of every booking of the trip whose money goes, or went, to the driver
```

- `takings` counts bookings that are `requested`, `accepted`, `confirmed`,
  `completed` or `no_show`, and `cancelled` bookings the driver is paid for
  (a passenger's cancellation less than 15 minutes before boarding, rule
  M2). A refunded booking counts nothing. Each booking counts the price it
  was made at (its snapshot), not today's prices.
- `trip_limit` uses the trip's capacity now. It is built from the rounded
  caps, so rounding stays as A39 decided and goes with that question.
- The passenger service fee (rule P5) is not part of `takings`
  (section 8).

### The highest price level (rule P4)

```text
free[k] = capacity − occupancy(k)
L_max   = highest step L, at or below today's L_max for the capacity, with
          takings + Σ_k free[k] × p[k](L) ≤ trip_limit
```

- With no bookings, `L_max` is exactly today's.
- When something lowers `L_max` below the trip's level (more seats, a
  no-show, a late cancellation, a stop added), the level is lowered to it
  for new bookings and the driver is told, as more seats do today. If
  nothing fits, `L_max` is 0%: the free seats can still be booked, free.
- Taking money back never happens: bookings keep their price whatever
  changes.

### Checks

- The booking transaction checks `takings ≤ trip_limit` after the booking,
  next to the seat check (rule S2), so two bookings at once cannot pass it
  together.
- The payout job checks each completed trip. A trip over its limit is held
  and the operator alerted. With the rule above this should never happen;
  it would mean a bug.

## 8. The passenger service fee

- From public launch passengers pay a service fee on top of the price
  ([ADR 0014](../decisions/0014-passenger-service-fee-from-launch.md)). It
  goes to ShareRide, not to the driver, so it stays **outside** the trip
  limit. The driver's maximum is the same in the beta and after launch.
- The risk is that the lawyer says the passenger's whole payment is the
  "gjald" for the ride. Then the limit can count the fee too, with one
  setting, and the drivers' highest level falls by the fee per seat.
- When the fee is set, a flat amount per booking reads better than a
  percentage: ShareRide then gains nothing when drivers charge more, which
  helps against looking like a platform that sets and profits from fares.
- New questions for the lawyer: does the fee count towards the cost of the
  ride, and does money kept after a no-show? Both are added to question 2
  in the legal map.

## 9. Screens

- **Price screen (spec 3, 3.6) and Edit trip, price (spec 6):** when the
  trip limit, not the seats, sets the highest level, the screen says why:
  "Passengers have already paid most of this trip's limit, so the seats
  left can cost at most 120%."
- **"Why is there a limit?"** adds one sentence: the limit is for the whole
  trip, so money already paid counts.
- **Passengers:** nothing new; their price is fixed when they book.
- **Console:** the trip page shows takings against the limit; a held payout
  shows in the alerts.
- **Later, with spec 13 receipts:** the driver's receipt and yearly
  statement can show each trip's distance and limit next to what they
  received, which also helps their tax answer (lawyer question 6).

## 10. Data and API

- No new tables: `takings` is summed from the bookings' price snapshots,
  and `trip_limit` from the distances and the capacity.
- Domain: `tripLimit`, `takings`, and `highestPriceLevel` and
  `fitPriceLevel` taking the trip's bookings, with the reason a level fell
  (`more_seats` or `limit_used`).
- API: the booking transaction check; seat, price level and stop changes
  use the new `L_max`; a no-show or a late cancellation refits the level
  and records the change (spec 6, 3.2 item 13); the payout job check.

## 11. Texts (first draft; Icelandic to be reviewed by a native speaker)

| Key | English | Íslenska |
| --- | ------- | -------- |
| `trip.price.limitUsed` | Passengers have already paid most of this trip's limit, so the seats left can cost at most {level}. | Farþegar hafa þegar greitt stóran hluta af hámarki ferðarinnar, svo sætin sem eftir eru mega kosta mest {level}. |
| `trip.price.whyLimit.trip` | The limit is for the whole trip, so what passengers have already paid counts towards it. | Hámarkið gildir fyrir alla ferðina, svo það sem farþegar hafa þegar greitt telst með. |

## 12. Testing

- Domain unit tests for every example in this spec: gaps 1 and 2 closed,
  normal trips unchanged, part-route bookings unchanged.
- A property test (fast-check, already in the domain package): random
  sequences of bookings, seat changes, level changes, stops, no-shows and
  cancellations never leave `takings` above `trip_limit`.
- An integration test: two bookings at once for the last room on a trip.

## 13. Out of scope

- The rate itself and counting the driver: unchanged here, for the legal
  opinion (decision 2).
- The 15% gravel road addition: it needs road surface data; later, if
  drivers on gravel roads ask.
- A yearly limit per driver, for example with the state's lower rates above
  10 000 km a year: belongs with the lawyer's answer on how often a driver
  may drive.
- Rounding on short stretches (A39): unchanged, with the lawyer.

## Decisions

Decided by Martin on 2026-11-17: decision 2 on a decision card, then "I
accept the trip limit", which covers decisions 1, 3 and 4 as recommended.

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Close gaps 1 and 2 with a trip limit that counts money already booked (option C)? | Yes, as recommended |
| 2 | Keep counting the driver as one of the sharers, so a full car with 3 seats pays at most three quarters of 150 kr per km? | Yes, as recommended: the driver keeps their own share. Letting passengers cover the whole 150 kr per km (option F) would give drivers a third more per seat, but the payment would then cover the driver's whole car, which reads as earning, and France asks drivers to keep a share |
| 3 | Does money kept after a no-show or a late cancellation count towards the limit? | Yes, as recommended |
| 4 | Does the passenger service fee count towards the limit? | No, as recommended, unless the lawyer says it must |
