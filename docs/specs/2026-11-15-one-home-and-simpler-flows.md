# Spec 16: One home and simpler flows

**Owner:** Martin · **Date:** 2026-11-15 · **Status:** Approved
(2026-11-15)

Amends: [spec 1](2026-11-13-sign-in-and-profile.md) (front page, sign-up,
profile, settings), [spec 3](2026-11-13-post-a-trip.md) (driver setup and the
posting steps), [spec 4](2026-11-13-search-and-trip-details.md) (front page
rides, results, trip details), [spec 5](2026-11-13-booking-and-requests.md)
(booking screen, paying) and [spec 15](2026-11-13-visual-design-system.md)
(navigation parts). Rules on prices, seats, payments and cancellations do not
change.

Source: the UX review of 2026-11-15 and its canvas, "ShareRide UX proposals".
Martin approved all six proposals on 2026-11-15. He also asked for times on a
wheel in 5-minute steps and a small X inside text fields; those are built
already (spec 3, 3.5 item 5; spec 15, `TimeField` and `PlaceDropdown`).

## 1. Problem and goal

Walking through the app on 2026-11-15 found these problems:

- The app changes shape when you sign in. The front page disappears and My
  profile becomes the home, with Edit profile as the main button.
- My bookings sits under Profile, and My trips sits under Offer a ride, then
  Before you publish. Someone who both drives and rides has to remember two
  places.
- Sign-up after pressing Book says nothing about the ride, takes four
  screens, and landed on My profile instead of the ride. That last bug is
  fixed (PR #46).
- An instant booking needs Book, Book again, Pay, then Pay on the payment
  sheet. It says "once your booking is accepted" when nobody has to accept it.
- Offer a ride opens a checklist whose boxes look tappable. It lists a
  profile photo that doesn't exist yet. Step 5 asks for the car and licence a
  second time.
- Small things: the search can't be changed from the results; sorting and
  filtering are mixed together; "akur" lists Akureyri Airport before Akureyri;
  Settings shows only "Íslenska", which reads like the current language.

Goal: one home and one menu that never move, and the fewest steps from
opening the app to a seat booked or a trip published. Every screen should
say where you are and what happens next.

## 2. User stories

- As anyone, I open the app and can search for a ride straight away, signed
  in or not.
- As a passenger, I see my next ride at the top of the home screen.
- As someone who both rides and drives, I find everything coming up in one
  list, and what needs me first.
- As a new passenger, I sign up without losing sight of the ride I chose,
  and come back to it.
- As a passenger, I book an instant ride and pay in one step.
- As a driver, Offer a ride opens the form, and I'm asked for my car and
  licence once, at the end.

## 3. Behaviour

### 3.1 The menu (proposal 1)

1. Four places, always in the same order: **Find**, **My rides**, **Offer**
   and **Profile**. On a phone they are a tab bar at the bottom. On a wide
   screen (spec 15, 4.8) they are links in a bar at the top, with the logo
   and name, and they show on every screen there.
2. On a phone, the tab bar shows on the four main screens. A screen opened
   from one of them, such as a trip, a posting step or Check and pay, comes
   on top with a back button and no tab bar. Going back shows the tab bar
   again. A tab keeps its place: going to Profile and back to Find keeps the
   search you were on.
3. The same four places show when signed out:
   - **Find** works as for anyone.
   - **My rides** says "Sign in to see your rides", with Sign in.
   - **Offer** says "Driving somewhere? Share the empty seats in your car.",
     with "Sign in to offer a ride". After signing up, the posting form opens.
   - **Profile** shows Sign in, the language choice, the meeting points and
     the legal documents.
4. Pressing the tab you are on takes that tab back to its main screen.
5. Signing in or out never changes the menu. After signing in, the app goes
   where the person was heading (a ride, Offer), or to Find. It no longer
   goes to My profile.

### 3.2 Find, the home (proposal 1)

Find replaces both the front page and My profile as the place the app opens.

1. **Top:** the logo and "ShareRide", and the language switch. On a wide
   screen these are in the top bar instead.
2. **Your next ride** (signed in, when one is coming up): the soonest
   confirmed, requested or unpaid booking, or the soonest published trip you
   drive, a ride under way included. It is the same row as in My rides
   (3.3), so it reads the same in both places: Passenger or Driving, the
   status ("Confirmed", "Request sent", "Waiting for payment"), date, times
   and route, the driver and car for a booking, or "1 of 3 seats booked" for
   a trip. A ride that needs you adds its line and button ("Pay by 20:46 to
   keep your seat", with Pay). Pressing it opens the booking or the trip. If
   it can't be loaded, one notice says so, with Try again.
3. **Search:** "Where are you going?", From, To, date ("Any day") and seats
   (1 to 4, as on the results today), then **Find a ride** as the main, filled
   button. Seats move from the results into this form.
4. **Leaving soon:** as today (spec 4, 3.8), with "See all".
5. **Ride cards**, here and in the results:
   - The tag says "Book instantly" or "Driver approves", instead of "Instant"
     and "Request".
   - The line with the driver's whole trip shows only when the trip goes
     further than your part, for example "Anna drives BSÍ → Akureyri".
6. **Bottom:** "Driving somewhere? Share the empty seats in your car." with
   Offer a ride (a secondary button), and the meeting points link.

### 3.3 My rides (proposal 2)

1. Two lists, **Coming up** and **Past**, as two choices at the top.
2. **Coming up** puts the rides that need you first, under "Needs you":
   - a booking to pay before its deadline ("Pay by 20:46 to keep your seat",
     with Pay);
   - a trip you drive with requests to answer ("Answer by 08:10 tomorrow, or
     the requests close", with Answer requests).
3. After that, under "Coming up", every other booking and published trip
   you drive, soonest first. Each row says **Passenger** or **Driving**, its
   status, the date, times and route. A booking adds the driver and car and
   the price. A trip adds the requests waiting, the seats booked on its
   fullest stretch ("1 of 3 seats booked") and the seats free: "Seats free
   on every stretch: 2" when every stretch is the same, otherwise one line
   a stretch ("Borgarnes → Blönduós: 2 free"). Pay and Answer requests open
   the same place as the row.
4. Pressing a row opens the booking (spec 5) or the driver's trip page
   (spec 3), as today.
5. **Past:** the same rows, latest first, without "Needs you".
6. **Nothing coming up:** "Nothing coming up", with Find a ride and Offer a
   ride.
7. Drafts are not rides, so they stay in Offer (3.6, item 2).

### 3.4 Profile (proposal 2)

1. The first name, the languages and "Member since". **Edit profile** is a
   secondary button, and "See it as others do" is a link.
2. Rows, left-aligned: My cars, Driving licence ("Confirmed" or "Not
   confirmed yet"), Meeting points, Settings, and Terms, rules and privacy.
   My cars lists the cars, each opening to edit it, with Add a car. Terms,
   rules and privacy lists the three documents. "See it as others do" shows
   the avatar, first name, languages, "Member since" and About you, never
   the phone number.
3. My cars and Driving licence replace the car and licence parts of "Before
   you publish", which goes (3.6).
4. Under the rows: "Phone number, language and signing out are in
   Settings." The phone number, marked as private, moves from Profile to
   the top of Settings.

### 3.5 Sign up without losing your ride (proposal 3)

1. Three steps, numbered "Step 1 of 3" and so on: 1 the phone number, 2 the
   code, 3 about you. Someone who already has an account is done after step 2.
2. Step 1 is titled "Sign in or create an account": "We text you a 6-digit
   code. New to ShareRide? The same code creates your account."
3. **The ride stays in view.** While a ride is kept through sign-up (spec 5,
   3.1), every step starts with a small card: "You're booking", the date,
   times and route, the seats, the price and the driver, and "We bring you
   back here after signing in." For Offer a ride the card says "Next: offer a
   ride".
4. **Step 3, about you**, replaces Terms and Create profile:
   - first name, with "Everyone sees it. We never show your last name.";
   - the languages you speak, as chips: the language the app is in is ticked
     already, a few common ones show, and the rest are behind "More
     languages";
   - "Add a few words about you (optional)", folded;
   - "I am 18 or older" and "I accept the Terms of Service and the Community
     Rules", as two tick boxes, with links;
   - "The Privacy Policy explains what we collect and why", with a link;
   - the button says "Create account and book", "Create account and send
     request", "Create account and offer a ride", or "Create account" when
     nothing is kept, which then opens Find.
5. When the terms change later (spec 1, 3.4), a signed-in person sees only
   the terms part of step 3, as today.
6. Rules R1.6 to R1.8 and what is stored do not change. The step accepts the
   current documents and saves the profile in that order; if saving fails,
   the person stays on the step with their answers kept.

### 3.6 Offer a ride (proposal 5)

1. **Offer opens step 1 of the form** ("Where are you driving?") directly.
   "Before you publish" goes. The car and licence are asked once, at step 5,
   as today.
2. **Drafts:** when you have a draft, step 1 starts with "Continue your draft:
   Mjódd → N1 Selfoss", which opens it at the step where you left off. With
   more than one, the newest shows, with "See all drafts".
3. **Step 2:** the times at the stops are worked out for you and folded: "Times
   at the 3 stops", a line with each stop and its time, and Change. Change
   unfolds the stop times to change them. A problem with a stop's time
   unfolds them.
4. **Step 5:** what is still missing comes first, as "Two things before you
   publish" (or one): Your car, with Add a car, and Driving licence, with
   Confirm. Until both are done, Publish trip waits, and the text under it
   says why: "Add your car and confirm your licence to publish. Your trip is
   saved as a draft until then."
5. No profile photo row until profile photos exist.

### 3.7 Book in fewer steps (proposal 4)

1. **Trip page:**
   - The date and route, then **Your part** on top: the tag, Get in (time and
     stop) and Get out (time and stop), each with Change, and the seats
     ("2 free on your part", with minus and plus).
   - Change lists the trip's stops to choose from. Get in lists the stops
     before Get out, and Get out the stops after Get in.
   - Then **Who you ride with**: the driver, the car and their preferences,
     and the seat view.
   - Then the route map and the stops, and the cancellation line.
   - The bottom bar keeps the price, the seats and **Book** (or Send
     request), as today.
2. **Check and pay** replaces the booking screen of spec 5, 3.1:
   - The date, the part with times, the driver and car, the seats times the
     price and the total, or "Free".
   - Ticks: "Your seat is confirmed as soon as you pay" (instant); "Free
     cancellation, with a full refund, up to 15 minutes before you get in";
     "{driver}'s number plate shows here once you're booked".
   - The reliability note, as today.
   - **Instant booking:** the button is "Pay {total}". It books the seats
     and opens the payment straight away. There is no second Book and no
     waiting screen.
   - **Request:** the button is "Send request", with the optional message, as
     today. The text says "You pay when {driver} says yes." Paying happens
     from My rides, under Needs you.
   - **Free trips:** the button is "Book", and the booking is confirmed
     without a payment, as today.
3. **If the payment does not finish** (closed, failed or offline), the seats
   stay held until the payment deadline (rule M1), as today. Check and pay
   stays open with "Not paid yet. Your seat is held until {time}." and the
   same Pay button. The booking also shows under Needs you in My rides.
4. **You're booked**, after paying (or after booking a free trip): a shape
   person in the seat view (spec 15), "You're booked!", the day and "Jón
   picks you up at 05:30 at Hlemmur", then **What happens next**:
   - "The number plate shows here before you leave" (or the plate);
   - "Be at {stop} a few minutes before {time}";
   - "Plans change? Cancel for free until {time}".
   Then **Where to stand**, with the meeting point's instructions and Open in
   maps. Buttons: "See it in My rides" (main) and "Find another ride".
5. **Request sent:** the same screen, with "Request sent", "{driver} has
   until {time} to answer" and the next steps for a request.

### 3.8 Small fixes (proposal 6)

1. **Results header:** the route with the date and seats ("Any day · 1 seat")
   is one button with "Change". It opens the search form in place, filled in,
   and Find a ride shows the new results.
2. **Sorting and filtering apart:** "Sort: Earliest ▾" is one chip, and "Book
   instantly only" is a separate filter chip.
3. **From and To list:** towns and areas come first, then meeting points, each
   under a small heading. The sample-data tag shows once under the list
   instead of on every row.
4. **Settings:** the language is two choices side by side, English and
   Íslenska, with the current one ticked. Rows are grouped: Language, Your
   account (Phone number, Signed-in devices), Legal documents, then Sign out
   and Sign out on all devices.
5. **Rows start at the left:** list rows, settings rows and their texts start
   at the left, so they are easy to scan. Titles and buttons stay centred
   (spec 15, 5.1).

## 4. Rules

No business rule changes. Booking still checks rule S4, holds seats under rule
S1 and gives a payment deadline under rule M1. "Book instantly" and "Driver
approves" are new names for the same booking modes. The posting form still
needs a car and the licence declaration before publishing (spec 3, R3.1 and
R3.2).

## 5. Screens

As on the canvas, phone first:

1. Find (signed out, signed in with a next ride), and the same on a wide
   screen with the top bar
2. My rides: Coming up with Needs you, Past, nothing coming up, signed out
3. Profile, signed in and signed out
4. Sign-up steps 1 to 3 with the ride card
5. Trip page with Your part on top; choosing where to get in or out
6. Check and pay, instant and request; not paid yet
7. You're booked; request sent
8. Offer: step 1 with a draft to continue; signed out
9. Posting step 2 with the stop times folded; step 5 with what's missing
10. Search results with the header and the two chips; the From and To list
    with headings; Settings

## 6. Data and API

No new tables. Changes to the API:

- `GET /v1/me/trips` takes `when` (`upcoming` or `past`), as
  `GET /v1/me/bookings` does, so My rides can list past trips. Drafts come
  only with `upcoming`.
- Each stretch of a trip in `GET /v1/me/trips` says how many seats are taken
  on it (`seatsTaken`, the seats bookings hold now, rule S1), for "1 of 3
  seats booked" and the seats free on every stretch.
- Each trip in `GET /v1/me/trips` says when its first open request closes
  (`requestsCloseAt`, null when none waits), for "Answer by 08:10 tomorrow,
  or the requests close".
- "Your next ride" and My rides read `GET /v1/me/bookings` and
  `GET /v1/me/trips` and merge them in the app, soonest first.
- Check and pay creates the booking (`POST /v1/trips/{id}/bookings`), then
  starts the payment (`POST /v1/bookings/{id}/payment`) at once. A retry
  uses the same attempt key, so a double tap never books twice.
- Place search (spec 2, 3.4) returns towns and areas before meeting points, or
  the app groups them.

## 7. Privacy and safety

Nothing new is collected or shown. My rides and Your next ride show only the
person's own bookings and trips. The ride card during sign-up shows what the
trip page already shows to anyone (spec 4, section 7). The driver's number
plate still shows only once booked.

## 8. Texts

The final English and Icelandic texts go into `packages/i18n` with each part.
The main new or changed ones ("Find a ride" keeps `welcome.findRide`):

| Key | English | Icelandic |
| --- | ------- | --------- |
| `nav.find` | Find | Leita |
| `nav.myRides` | My rides | Ferðirnar mínar |
| `nav.offer` | Offer | Bjóða far |
| `nav.profile` | Profile | Prófíll |
| `home.nextRide` | Your next ride | Næsta ferðin þín |
| `home.title` | Where are you going? | Hvert ertu að fara? |
| `myRides.needsYou` | Needs you | Bíður eftir þér |
| `myRides.comingUp` | Coming up | Framundan |
| `myRides.past` | Past | Liðnar |
| `myRides.passenger` | Passenger | Farþegi |
| `myRides.driving` | Driving | Ekur |
| `signIn.title` | Sign in or create an account | Skráðu þig inn eða stofnaðu aðgang |
| `signIn.keptRide` | You're booking | Þú ert að bóka |
| `onboarding.aboutYou` | Last step: about you | Síðasta skref: um þig |
| `booking.checkAndPay` | Check and pay | Yfirfara og greiða |
| `booking.booked` | You're booked! | Sætið er þitt! |
| `results.instant` | Book instantly | Bóka strax |
| `results.request` | Driver approves | Ökumaður samþykkir |
| `results.driverDrives` | {driver} drives {from} → {to} | {driver} ekur {from} → {to} |

"Sætið er þitt!" ("The seat is yours!") avoids "bókuð" or "bókaður", which
depend on gender; the Icelandic review can change it.

## 9. Testing

- **Screen tests** for each part: the tab bar on the four main screens and
  not on screens on top; the signed-out tabs; Your next ride; My rides order
  and Needs you; sign-up with a kept ride through all three steps and back;
  Check and pay through payment, including a payment that does not finish;
  Offer opening step 1 and continuing a draft; the results header, chips,
  grouped place list and language choice.
- **Browser journeys** (`e2e`): booking, requests, posting and sign-up run
  through the new screens, on phone and desktop, in both languages.
- **By hand:** a phone with VoiceOver and TalkBack once phones are tested:
  the tab bar's names and selected state, and the steps.

## 10. Out of scope

- A Messages place in the menu. Spec 7 (chat) may add one later as a fifth
  tab.
- Profile photos (the row comes back with them).
- Apple and Google sign-in (spec 1, 3.3), still later.
- Changing booking, payment or cancellation rules.

## Decisions

| # | Question | Answer |
| - | -------- | ------ |
| 1 | Which proposals? | All six, as on the canvas (Martin, 2026-11-15) |
| 2 | Time wheel | 24-hour hours and minutes in 5-minute steps; times not on 5 minutes rounded up (Martin, 2026-11-15) |
| 3 | Clear X in text fields | Small, inside the field (Martin, 2026-11-15) |
| 4 | Signed out, what do My rides, Offer and Profile show? | A short page with Sign in, so the menu never changes (3.1, item 3) (Martin, 2026-11-15) |
| 5 | Is the tab bar on screens opened on top? | No on phones (back button instead); the top bar is on every screen on wide screens (3.1, item 2) (Martin, 2026-11-15) |
| 6 | Where do drafts live? | On Offer, as "Continue your draft" (3.6, item 2) (Martin, 2026-11-15) |
| 7 | Request trips: pay where? | From My rides, under Needs you, when the driver says yes (3.7, item 2) (Martin, 2026-11-15) |
