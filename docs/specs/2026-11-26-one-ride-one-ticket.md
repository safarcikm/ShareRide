# Spec 31: One ride, one ticket: the same rules for every screen

**Owner:** Martin · **Date:** 2026-11-26 · **Status:** Approved
(2026-11-26): Martin chose "One ride, one ticket" (3.1, B) on the thread's
card, to be built flow by flow as drawn
([plan](../plans/2026-11-26-one-ride-one-ticket.md)). Built (2026-11-27),
and on puffinride.is since that day, on Martin's go; where the build
differs from a drawing, and what is left, is in 3.22. The other choices in
the Decisions section stay his to change. Added on his ask (2026-11-28):
the ride on a map on a booked seat and on the ride I drive (3.8, 3.12,
section 6)

Amends, once approved: [spec 15](2026-11-13-visual-design-system.md) (new
parts, title alignment, the title font's spacing),
[spec 16](2026-11-15-one-home-and-simpler-flows.md) (3.2 Find, 3.3 My rides,
3.4 Profile, 3.6 item 4, the last posting step) and
[spec 18](2026-11-18-laptop-layout.md) (3.5 Find, 3.9 a booking, 3.10 My
rides, 3.12 Profile, 3.14 the driver's trip), and the look, not the
behaviour, of the screens of specs 3 to 9 (3.19). No ADR: no new service,
dependency or business rule. Sign-in is left to
[spec 29](2026-11-25-easier-sign-in.md).

A second reader checked this spec against the app's code on 2026-11-26.
What that settled is in decisions 9 to 16, each a working choice of
Claude's that Martin can change. Decision 17 came with the build, and is
one too.

The proposal as Martin saw it, each screen as it is beside how it would
look: [proposal page](https://claude.ai/artifact/3hMRPHSfiQxqVFkhtdAQtx)
(its files: [images/one-ride-one-ticket/proposal/](images/one-ride-one-ticket/proposal/)).

## 1. Problem and goal

Martin, 2026-11-26: "go over the whole web and make it more orgnaized and
easy to use, focusing on the complex UX/UI. I beliave its in many ways
clunky and disfunctional. I think its visually unorganized and boring. I
like the style we have, but its without a greater thought. Lets make sure
we can do better"

The website was walked on 2026-11-26 as a member uses it: joining as a
driver and as a passenger, offering a ride, asking for a seat, accepting
it, chatting, the trip day and a rating, on a phone (390 by 844) and a
laptop (1280 by 720), about 300 pictures. No screen was named beforehand.

The style holds up. What is missing is a system: each screen was designed
on its own, so the same thing has a different name, shape and place from
one screen to the next.

One thing has several names and shapes:

- The menu says My rides. A second page for drivers, My trips
  (`/drive/trips`), lists the same rides as a different card. Offering is
  called "Offer a ride", "Post a trip" and "Publish trip". Finding is
  "Find", "Find a ride" and "Search".
- There are two search forms: the card on the front page and the screen at
  `/search`.
- A ride is a different card in the results, in My rides, in My trips and
  in a request.
- Profile and Settings overlap; Send feedback is on both.

Everything has the same weight:

- Nearly every block is a white card of the same kind, so nothing says
  where to look first.
- The driver's ride ends in a column of five equal buttons: Edit trip,
  Cancel trip, Share trip details, Post again, Post the return trip.
- Titles are centred on some screens and at the left on others.
- The car's yellow and the Iceland scene live only in the drawings. The
  screens themselves are moss, white and frost, which is why they read as
  dull.

What needs you is easy to miss:

- On Find and in My rides, a request waiting for the driver's answer is a
  small blue tag on a tall white card, with the button under the card. On
  Find that card lists every stretch of the route and pushes the search
  under the first screen.
- On the trip day, "I'm here" comes just under the first screen on a phone.
- A booking's title is its route; its state is a small tag and a line
  under it.
- At the top of a conversation the two most visible things are Report and
  Block.

Long screens list everything:

- The last step of offering a ride opens with three unticked boxes and
  three buttons, then lists the route twice, once as places and once with
  times.
- The driver's ride gives most of its room to one seat bar a stretch and
  little to the person asking for a seat.
- A ride's details put your part, the driver, the car, the seats and the
  route in cards of equal weight.
- Settings is one long page of text, chips, switches and cards.

**Plain defects**, fixed whatever is chosen (3.18).

**Goal:** every screen follows the same six rules, so a member learns the
website once: a ride always looks the same, the title says what is going
on, what needs them comes first, and each screen has one main thing to do.
The colours, fonts, puffins, car, scene and logo stay.

**Anti-goals:** a new look; new features; any change to how booking,
prices, seats, cancelling or sign-in work; a screen that looks tidier but
takes more presses than today for what people do most (finding, booking,
answering a request, messaging, "I'm here"); a function that is on a
screen today and on none afterwards.

## 2. User stories

- As a passenger, I open the website on the day of my ride and the first
  screen tells me when it leaves, where to stand and who to look for, with
  "I'm here" under my thumb.
- As a driver, I open the website and the first thing I see is that Dóra
  asks for a seat, with one button to answer.
- As someone looking for a ride, I compare rides that all look the same:
  the times and places down the left, the price at the right, the driver
  under the tear line.
- As a driver about to publish, I see my ride the way passengers will, and
  what is still missing as one line.
- As anyone, I know what a screen is about from its title, and I find its
  main button in the same place every time.

## 3. Behaviour

### 3.1 Approaches considered

- **A. Tidy up.** Every screen stays as it is. Fix the defects, give every
  page the same head, turn the button columns into rows. Three or four pull
  requests. The website would still feel like many separate screens, and
  still dull.
- **B. One ride, one ticket** (recommended). The six rules of 3.2 on every
  flow; the same style with the screens rearranged. About twelve pull
  requests, flow by flow, each usable on its own.
- **C. A new look.** New colours, fonts and drawings. Martin likes the
  style, and what is wrong is the order, not the style. Not recommended.

Martin chose B on the thread's decision card on 2026-11-26 (decision 1).
The rest of this spec describes B.

### 3.2 The six rules

1. **One ride, one ticket.** A ride is the same card everywhere: the day,
   the two times and places as a timetable, the price. Under a tear line it
   says what that place needs: the driver in the results, your seat in My
   rides, the request to answer for a driver.
2. **The road shows where things stand.** A booking goes Asked, Confirmed,
   Trip day, Done. Offering a ride goes Route, Time, Seats, Price, Check.
   The puffins' car stands at the step you are on.
3. **What needs you comes first, in the car's yellow.** A request to
   answer, a seat to pay for, a ride on its trip day: one yellow card with
   one button, at the top of Find and of My rides (3.3, item 3).
4. **One main button.** At the bottom of the screen on a phone, at the top
   of the side column on a laptop (R31.1). Everything else is a row with
   an icon. What cannot be undone is red and last.
5. **The title says what is going on.** "Your seat is confirmed", "Leaves
   in 10 minutes", "Your ride to Vík": once, at the left, in place of a tag
   and a line that repeat each other.
6. **Colour means something.** Moss is what you can do. Sun yellow is
   yours and now. Glacier blue is waiting and information. Red is a
   problem.

![The parts](images/one-ride-one-ticket/proposal/img/parts.webp)

### 3.3 The parts

New parts of the design system (spec 15, section 5), light and dark. They
need no new colour value; what the colours mean changes in two places,
named in item 3. The red main button, which came with the build (3.19,
decision 17), added two: its edge and its fill under the pointer.

1. **`RideTicket`** takes the place of the four ride cards (`ResultCard`,
   the My rides row, the My trips card, the stretch inside a request).
   - **Day row:** the day ("Fri 27 Nov") in `caption`, then the tags at the
     right: "Book instantly" or "Driver approves" in the results; "You
     drive" or "Passenger" on my own rides; then Share where the ride can
     be shared.
   - **Timetable:** departure time, a ring, the place; the line with the
     duration beside it ("1 h 35 min", with ", 5 stops" for a driver's
     whole route); arrival time, a filled dot, the place. Times are
     Fredoka with tabular digits and line up; a place name that wraps
     keeps its time on its first line.
   - **Price:** at the right of the timetable, with "per seat" or "1 seat"
     under it. A driver's own ride shows no price there.
   - **Tear line:** a dashed line with a notch in each edge, in the page's
     colour.
   - **Foot,** one line: in the results, the driver's picture, name, rating
     or "New driver", and the seats left; on a booking in My rides, the
     driver and the booking's state as a tag; on a ride I drive, "1 of 3
     seats taken" and what it needs ("1 request"). A ride that is mine has
     a moss outline (a moss bottom edge until spec 15's decision 16).
   - It is one link, as the cards are today. Tickets in one row of a grid
     are equally tall, with the foot at the bottom.
2. **`Road`**: a grey road with a dashed middle line, the part behind the
   car in moss, a mark at each step and the car (`PuffinsInCar`, 60 wide)
   on the step you are on, with the steps' names under it and the current
   one in the text colour. For screen readers it is one line: "Step 2 of
   4: Confirmed", which stands under the road in place of the names where
   they have no room (3.20). It takes the place of `StepProgress` on the posting
   steps (signing up keeps the bars). Its marks are not links: on the last posting step the rows open
   the earlier steps (3.11).
3. **`NeedsYouCard`**: a card in `warningSoft` (the soft yellow of an
   amber tag) with an outline in the car's yellow (`people.sun`; a bottom
   edge until spec 15's decision 16):
   a yellow square with an icon, one bold line saying what is asked ("Dóra
   asks for 1 seat"), one line of detail in `warning` ("Mjódd to Selfoss,
   Fri 27 Nov. 11 h left to answer."), and one button. On the
   driver's ride the same card holds the whole request, with Decline and
   Accept side by side.
   - **What needs me** is one of three things, each already known to the
     lists Find and My rides load (section 6): a ride I drive with
     requests whose deadline is still to come; a seat of mine the driver
     accepted, to pay before its deadline (both as today, spec 16, 3.3);
     and a ride on its trip day, from three hours before I get in or
     leave until it is done (spec 8, 3.1). The soonest comes first: by
     the deadline to answer or pay, or by the time to get in or leave.
   - **A rating to give is not among them** (decision 9). It is asked on
     the booking, whose title is then "How was your ride?" (3.8), and
     under Past in My rides (3.10), as well as by the email of today.
   - **The button** is filled where the card is the thing to do (Find, My
     rides, the driver's ride) and outlined on the last posting step,
     where Publish ride is the main button (R31.1).
   - **The colours** are the pair the tags use, `warningSoft` and
     `warning`, which spec 15 names for warnings. From this spec they mean
     "yours and now" (rule 6); the tokens keep their names. `people.sun`
     gains one use outside drawings, the card's outline and the square
     behind its icon; it is never text and never the only sign, since the
     bold line says what is asked.
   - **Status tags follow rule 6** (decision 10). "Driver said yes: pay"
     stays amber. Declined, expired, cancelled and withdrawn, amber or
     blue today, become a quiet tag (`plain`: muted text on the page's
     colour), since nothing is asked of anyone. "Did not show up" becomes
     red (`problem`: `error` on `errorSoft`). `Tag` gains those two kinds.
4. **`ActionRows`**: a card of rows 56 high, built on today's `Row`: an
   icon in a soft square, a label, sometimes the current value in muted
   text, and a chevron. A row that cannot be undone is red, has no chevron
   and comes last. A row either opens a page (chevron), unfolds what is
   under it (a chevron pointing down), holds a switch, or only shows a
   value (no chevron, and not a button). It takes the place of columns of
   secondary buttons and of loose text links.
5. **`ScreenHead`**: Back, then the title at the left with at most one
   line under it, and at most one round icon button at the right (Share).
   On a place of the menu that one control can be an outlined button
   with words, as "Offer a ride" is on My rides (3.10).
   (`PageHead` is already the name of the title for search engines.)
6. **Titles and figures** (Fredoka) are set without kerning and with a
   word space 0.06 em wider (3.18, item 1), on the web, where it was
   measured; the phone apps are checked when they are built (section 10).

Existing parts stay: `Card`, `Tag`, `Chip`, `BottomBar`, `SeatView`,
`Columns`, `Grid`, `PuffinsInCar`, `IcelandScene`, `PuffinByPin`, `TopBar`,
`TabBar`. (`TickList` was to stay too; it went with its one use, the list
of what is missing on the last posting step, which is a `NeedsYouCard`
now: 3.11, item 4.)

As built, in the web app: on a phone
([light](images/one-ride-one-ticket/built/parts-phone-light.webp),
[dark](images/one-ride-one-ticket/built/parts-phone-dark.webp)) and on a
laptop ([light](images/one-ride-one-ticket/built/parts-laptop-light.webp),
[dark](images/one-ride-one-ticket/built/parts-laptop-dark.webp)). Their
exact sizes and colours are in
[spec 15](2026-11-13-visual-design-system.md), section 5.2.

### 3.4 One name each

In English a member reads **ride** for what a driver offers and a passenger
books; "trip" stays only in "Trip day" and in the code and docs
(decision 5). The places are Find, My rides, Offer, Messages and Profile, as
today; their actions are **Find a ride**, **Offer a ride** and **Publish
ride**. "Post a trip", "Publish trip", "My trips" and "Search" (as a
button) go. Icelandic keeps "far" in "Finna far" and "Bjóða far" and "ferð"
for the ride itself.

As built: the console and the legal documents keep "trip" (section 10),
and so do three texts on the marketing pages and About, where "a trip you
are making anyway" is the drive itself. Notices, emails and text messages
say "ride", as they share their words with the app. Where "ride" alone
would read as a passenger's seat, a text says whose it is ("You're the
driver of this ride"). A booking's row reads "Share the ride's
details": "Share ride" is the product's old name, kept out of every text
(ADR 0039).

### 3.5 Find

1. Signed out, a phone's Find stays as it is (spec 16, 3.2), with the rides
   as tickets.
2. Signed in, under the scene: **"Hi Bára"** as the title, at the left.
   Then **one** of:
   - what needs me, as a `NeedsYouCard`, when something does (the
     soonest, 3.3, item 3; under it "and 2 more" opens My rides);
   - otherwise my next ride, as a ticket.
   Then the search card, then "Your next ride" as a ticket when a
   `NeedsYouCard` stands above and my next ride is another ride than the
   one it is about, then "Leaving soon".
3. The search card is the one card of spec 16, 3.2, item 3. `/search` shows
   the same card with the title "Find a ride" and the same button, "Find a
   ride"; there is one search form.
4. A driver's ticket shows the whole route as two ends with ", 5 stops";
   the seats free on each stretch are on the driver's ride (3.12), not on
   Find or My rides.

![Find now](images/one-ride-one-ticket/proposal/img/now-find-first.webp)
![Find proposed](images/one-ride-one-ticket/proposal/img/new-find-first.webp)

As built, on a phone
([light](images/one-ride-one-ticket/built/find-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/find-phone-dark.webp))
and on a laptop
([light](images/one-ride-one-ticket/built/find-laptop-light.webp)). What
differs from the drawing, or was left open by it:

- My next ride has the heading "Your next ride" over its ticket in both
  places, over the search when nothing needs me and under it when
  something does.
- A ticket always says its day, in a list under a day's heading too: the
  same ticket shows on Find, where no heading says it.
- A ride found that is a part of a driver's ride says the whole ride in
  one muted line over the tear line: "Anna drives BSÍ → Akureyri".
- A ride that costs nothing says "Free", with no "per seat" under it.
- A seat of mine has no moss edge until it is confirmed (asked for, or
  accepted and not yet paid, it is not mine yet); until the driver answers,
  its foot says whose answer it waits for ("Waiting for Sigga's answer").
- What counts keeps counting: Find and My rides read the clock again every
  half minute while they are in view, and when the app or the tab comes
  back to the front. "Leaves in 40 minutes" becomes 39, and a need whose
  deadline passes leaves the screen without anything being pressed.
- With text at twice its size on a phone 360 wide, a word longer than a
  whole line of its place ("Kirkjubæjarklaustur,") is broken inside the
  word. Nothing else is, and nothing reaches past the ticket.

### 3.6 Search results

1. The head stays: Back, and the search as a card with Change.
2. One row: the sorting ("Earliest"), one **Filters** chip that opens the
   filters there are today, and the number of rides at the right.
3. Rides are tickets under a heading for each day, with the tag beside the
   day instead of in a band of its own.
4. The list ends with a card, the puffin by its pin beside "That's every
   ride found" and "All rides". The sections for other days and nearby
   meeting points stay as they are.

As built, on a phone
([light](images/one-ride-one-ticket/built/results-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/results-phone-dark.webp))
and on a laptop
([light](images/one-ride-one-ticket/built/results-laptop-light.webp)):

- The sorting chip shows the order alone ("Earliest") and is named "Sort:
  Earliest" for a screen reader. The Filters chip says how many are on
  ("Filters: 1 on") and is then filled. One of the two is open at a time,
  under the row.
- A day's heading no longer counts its rides: the row counts them all.
  When a filter leaves none the count stays and says "0 rides", so a
  screen reader hears what the filter did.
- The end card says "That's every ride found", or "These are the first 50
  rides" when there are more than the list holds. Its second line depends
  on the search. With every ride shown: "Try another day, or see every
  ride leaving soon." for a search on one day, "You can also see every
  ride leaving soon." for any day. With the first 50: "Choose a day to see
  others." for any day, "Filter by time of day to see others." for one
  day.
- `/search` has the title at the left (`ScreenHead`) and Find a ride
  inside the card, as on Find; the bar at the bottom is gone.

### 3.7 A ride's details

1. Head: the day in small text over the title "Selfoss to Vík", Share at
   the right.
2. **Your part of the ride**, as a ticket: the two stops with Change on
   each, the booking tag, and under the tear line the seats with the
   stepper and how many are free on that part.
3. **The driver:** picture, name, rating, rides and what is checked, opening
   the profile; under a line, the car, and the preferences as today.
4. **Where you sit:** the seat picture in a card of its own, with one line
   beside it.
5. **The whole route:** the map and the stops, the ones outside my part
   muted, mine marked "Get in" and "Get out".
6. Rows: free cancellation with its time, "Weather and roads" (the Safety
   links of today), "Report this ride".
7. The bar at the bottom stays: the price for my seats and **Book** (or
   "Ask for a seat").

As built, on a phone
([light](images/one-ride-one-ticket/built/ride-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/ride-phone-dark.webp))
and on a laptop
([light](images/one-ride-one-ticket/built/ride-laptop-light.webp)):

- The title names my part in words, "N1 Borgarnes to Olís Blönduós" (in
  Icelandic with the arrow, section 8), and follows it when I change where
  I get in or out. The line under it about the driver's whole ride is
  gone: the whole route is on the screen. Between places with long names
  on a narrow phone, Share stands over the title, which then has the whole
  width after Back: no name is broken inside a word for the button.
- The ticket's caption, "Your part of the ride", is a heading under the
  page's title. An end has Change when the ride has another stop to choose
  there; beside a long name on a narrow phone, Change stands under its
  place. Change unfolds that end's stops inside the ticket, as radio cards
  with their times, one end at a time, and focus goes to them. A choice,
  or Escape on the web, folds them, and focus goes back to Change. A part
  changed from the whole route's stops folds them too, and leaves focus
  where it is. Under the tear line a phone has the seats with "3 free on
  your part"; the price is in the bar, with what each seat costs under it
  for more than one ("2 × 2,900 ISK").
- A ride that was cancelled has no booking tag on the ticket and no row or
  line about cancelling a booking: there is no seat to book. Nor has it
  seats to choose or "Where you sit" (3.21).
- The driver's card: picture, name, rating or "New driver", and the
  reliability a member sees. The whole line opens the profile and is named
  in one line for a screen reader ("Driver, See profile: Anna, 4.3 (3
  ratings), Reliability: 91%"; "Driver" first since 3.20). A ride's details carry no number of rides and
  nothing about what is checked, and section 6 adds no data, so the card
  has neither; the profile it opens has both.
- "Where you sit" says "2 of 3 seats are free. Seats are not numbered: you
  agree in the car." in the place of the legend. The picture keeps its
  one-line description for screen readers, and is at most `carBeside`
  (176) wide, so a wide card gives its room to the words, and at least
  `carBesideLeast` (120), so the two stand side by side on a phone 360
  wide.
- "The whole route" gives no distance: a ride has none in the API. My
  stops are marked with the tags "Get in" and "Get out", and a stop still
  opens to get in or out there.
- The rows. "Free cancellation", with "Up to 15 min before", unfolds the
  whole sentence. Where the ride is paid in person (ADR 0038) the row is
  "Paying", with "Cash or bank transfer", and unfolds that sentence; a
  free ride has neither. "Weather and roads" is there for a ride that
  leaves the capital area and is not cancelled, as the Safety links were,
  and unfolds them with their line. "Report this ride" is a link, for
  someone signed in who does not drive the ride. With none of the three
  there is no card of rows.
- A row's value goes under its title where the two have no room on one
  line (spec 15, 5.2), so "Free cancellation" is never broken in two.
- The bar's button keeps its texts, "Book" and "Send request".
- On a laptop (3.16, item 6) the ticket has no foot: the seats are in the
  booking panel, beside the price they change, and the panel keeps the
  free cancellation sentence, so the rows leave it out.

Since [spec 34](2026-11-28-co2-saved.md) (3.4, 3.5), the CO₂ the part
saves is a card of one folded row after the whole route, before the rows:
"CO₂ saved" with "About 25 kg, estimated". It unfolds the sentence for the
part and "How we estimate it", which opens About's section. A cancelled
ride has none, nor a part under 1 kg. On a laptop it is in the main
column, after "Where you sit".

### 3.8 A booked seat

1. The **title is the state**: "Request sent", "Bára said yes: pay to keep
   your seat", "Your seat is confirmed", "Leaves in 10 minutes", "How was
   your ride?", "Cancelled". One line under it says what happens next
   ("Bára said yes. See you on Friday at 18:30."). The "Confirmed" tag and
   the line with a tick go.
2. The **road**: Asked, Confirmed, Trip day, Done. A ride booked instantly
   starts at Confirmed. A cancelled or declined booking shows no road.
3. The ride as a **ticket**, with "1 seat" and the price under the tear
   line.
4. **The driver:** picture, name and rating with **Message** at the right;
   under a line the car, and the number plate once it shows.
5. **Where to stand,** once the seat is confirmed: a small map, the place,
   its description, "Open in maps".
6. A notice for paying, as today (the deadline with Pay, or the line about
   paying the driver in person).
7. Rows: Share the ride's details, Weather and roads, Report a problem,
   and **Cancel booking**, red and last.
8. Everything a booking shows today stays, in this order: reports and
   changes to the ride come directly under the title.
9. This screen is the passenger's. What a driver does with a passenger's
   booking is on the driver's ride (3.12), where cancelling it and a
   report lead back to, as today.

As built, on a phone
([light](images/one-ride-one-ticket/built/booking-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/booking-phone-dark.webp))
and on a laptop
([light](images/one-ride-one-ticket/built/booking-laptop-light.webp)):

- The titles, and the line under each: "Request sent" with "Anna has
  until 22:00 to answer."; "Anna said yes: pay to keep your seat", or "Pay
  to keep your seat" for a ride booked instantly, which nobody said yes
  to, with "Your seat is held until 12:30."; "Your seat is confirmed" with
  "Sunday 15 November. Anna picks you up at 10:00 at Borgarnes."; the trip
  day's titles (3.9); "How was your ride?" with until when it can be
  reviewed, while it can; and how a booking ended, "Completed",
  "Declined", "Expired", "Cancelled", "Withdrawn" or "No-show", with why
  as the line under it ("You withdrew this request. That never counts
  against you.", "You cancelled this booking: Plans changed"), in the
  place of the notice that said so. What else a cancellation says, the
  driver's note, the refund and whether it shows on the profile, stands
  under that line, in the head. When an action here changes the state,
  focus moves to the title with what stands under it, which say the
  outcome: after cancelling, a screen reader hears the refund too.
- While the passenger's report that the driver didn't come is open, the
  seat stays confirmed until it is decided (R8.2): the title is "The
  driver didn't come", the report under it says where it stands, and
  there is no road. A seat still confirmed once the ride is over
  promises no pick-up.
- The road has three steps for a ride booked instantly (Confirmed, Trip
  day, Done) and none before it is paid: nothing is confirmed yet. A
  request the driver said yes to stays at Asked until it is paid.
- The ticket is where I am, not a link: the short day, the tag
  "Passenger", my two stops and the time between them, with "1 seat" and
  the price, or "Free", under the tear line.
- The driver's card (the one of a ride's details, 3.7). **Message** is a
  link at the right of the driver once the seat is confirmed, named
  "Message Anna" for a screen reader, and goes under the driver where the
  two have no room. The number plate, once it shows, is a tag at the
  right of the car, named "Number plate AB 123"; before that a line under
  the car says when it shows. A driver who has left shows no rating.
- "Where to stand" has "Open in maps" as a link at its heading's right.
  The small map is our own map of Iceland (ADR 0024) drawn around the
  stop, `mapBeside` (104) wide: it has no streets, so it shows which part
  of the country, and "Open in maps" shows the street.
- Paying. The deadline is the line under the title and **Pay** is the
  main button in the bar, so there is no paying card; the payment opens
  in the bar, in Pay's place, and a payment that did not go through says
  so over Pay, where the passenger is looking. The line about paying the
  driver in person is a notice under the driver and where to stand. A
  driver who opens a passenger's booking paid in person reads "Gunna pays
  you 2,900 ISK in cash or by bank transfer when they get in." there.
- **The route** (added 2026-11-28, Martin: "when you open my ride with
  the details it could show the map there as well with the route"): a
  card headed "The route" with the whole ride on our map of Iceland (ADR
  0024), drawn as on a ride's details (3.7): my part solid along the
  roads with its two stops standing out, the rest of the ride dashed with
  its stops muted. It comes after the ticket, the driver, where to stand
  and the line about paying in person, before the rows, on the trip day
  too. On a laptop it ends the main column as a band, about twice as wide
  as tall, so it is not taller than the window; a ride that crosses most
  of Iceland shows all of it. A screen reader hears "The ride on a map of
  Iceland. Your part: Borgarnes → Blönduós."; a driver who opens the
  booking hears "The passenger's part". It shows while the seat is asked
  for or held and once the ride is over, and not on a booking that ended
  before its ride (cancelled, declined, expired or withdrawn): the ride
  can change after, and is no longer the passenger's to follow, nor
  anyone's who blocked the driver (R9.4). Nor on one whose stop was taken
  off the ride since (spec 6, 3.2): there is no part of the ride to draw
  it on. In the pictures of this section the seat is the
  whole ride; a seat on part of one is
  [drawn so](images/one-ride-one-ticket/built/booking-route-part-phone-light.webp).
- The rows, each only when it has something to do: "The driver didn't
  come" (after the ride, while it can still be said, R8.5), "Share the
  ride's details", "Weather and roads" (as on a ride's details), "Report
  a problem with this ride", and red and last "Cancel booking", which
  opens its screen, or "Withdraw request". Withdrawing asks first, in the
  bar: the red row gives way to the question, focus goes to it, and
  "Keep my request" puts the row and the focus back. The question is
  gone once the driver has answered: the bar then holds what the seat
  needs now.
- The bar holds the one main button, when there is one: Pay; "I'm here"
  (3.9); "Rate the driver", once the ride is over and while it can be
  reviewed; "Find another ride", after a request that was declined,
  expired or withdrawn, and after a booking someone else cancelled. A
  confirmed seat with nothing to do has no bar, nor has a booking the
  passenger cancelled.
- The prompt to turn on notifications or add an email (spec 7, 3.6.2),
  when it shows on this screen, has outlined buttons: the bar's button is
  the only filled one (R31.1).
- A driver who opens a passenger's booking reads the day over the part
  ("Sunday 15 November", "Borgarnes to Blönduós") with the status under
  them, no road, and "Message Gunna" as the first row. Nothing of the
  passenger's is offered: no Pay, no cancelling.

Since [spec 34](2026-11-28-co2-saved.md) (3.6), the same card follows the
driver and where to stand, before the rows, for the passenger: an estimate
while the seat is confirmed, and the grams kept once the ride is done. On
a laptop it is in the main column.

### 3.9 Trip day

1. The title counts down ("Leaves in 10 minutes") and then follows the
   states the trip day has today (spec 8), one title for each; the line
   under it says when and where.
2. Where to stand comes first, then the driver with the number plate as a
   tag.
3. **"I'm here"** is in a bar at the bottom of the screen, and "The driver
   didn't come" takes its place when that is offered.
4. The driver's trip day keeps its list of stops with who gets in and out
   at each; its "I'm here" moves into the bar at the bottom as well.

As built, for the passenger, on a phone
([light](images/one-ride-one-ticket/built/trip-day-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/trip-day-phone-dark.webp))
and on a laptop
([light](images/one-ride-one-ticket/built/trip-day-laptop-light.webp)).
The driver's trip day follows the passenger's, below.

- The titles: "Leaves at 10:00" until the last hour, "Leaves in 10
  minutes" in it, counting while the page is open, and "Trip day" from
  the time to leave. Once the driver has said "I'm here" the title is
  "Anna is at the meeting point", whatever the clock says, and a screen
  reader hears it when it happens: the notice that said so is gone. The
  line under the title is "Today at 10:00 from Borgarnes." ("At 00:30 from
  Borgarnes." for a ride that leaves after midnight, opened the evening
  before).
- The order: where to stand, the driver with Message and the number
  plate, then the ticket, then the rows. The ticket stays, after what is
  needed at the meeting point, as it names where I get out.
- "I'm here" is in the bar: before it opens the bar says from when, and
  once said it says the driver was told. "The driver didn't come", when
  offered (R8.5), is a link in the bar: under "I'm here" while that can
  still be pressed, as someone waiting may do both, and the bar's main
  button once it was said or has closed. The web journey reads the first
  screen on a phone and finds the title, where to stand and "I'm here"
  inside it with no scrolling.
- Until the time to get in, the seat can still be cancelled: "Cancel
  booking" stays the last row.

As built, for the driver, on a phone
([light](images/one-ride-one-ticket/built/driver-trip-day-phone-light.webp)):

- The page is the driver's ride (3.12) with the trip day first: "Trip
  day", "Use this only when parked.", and the stops in order, each with
  its time, who gets in there, with their seats and whether they are
  here, and who gets out. Then what needs the driver, the passengers, the
  ticket, the seats and the rows. The title's line is "Today at 19:44
  from Mjódd bus terminal.", unless a request still waits for an answer.
- "I'm here at Mjódd bus terminal" is the main button, in the bar on a
  phone and at the top of the side column on a laptop. It names the first
  stop that is open; where the times of two stops overlap, the other is
  an outlined button under it. Before a stop opens the bar says from
  when: "At Mjódd bus terminal you can say you're here from 19:14." Once
  said, "We've told your passengers you're here." stands in the button's
  place, with focus, and the stop's card says the same; the next stop's
  button, or from when it can be said there, stands under it.
- "Mark as no-show" stays a quiet button under the passenger at their
  stop, once it can be said, and opens its screen.

### 3.10 My rides

1. Title "My rides" with **Offer a ride** as a small button at its right;
   then Coming up and Past.
2. "Needs you" and "Coming up" as today (spec 16, 3.3), each ride a
   ticket. The foot of a ride that needs me is a yellow tag saying what
   ("Answer Dóra's request", "Pay by 20:46", "Leaves in 40 minutes"), and
   the ticket opens where that is done.
3. Under Past, a finished ride whose rating can still be given has the
   yellow tag "Rate the driver" or "Rate your passenger" in its foot
   (decision 9). The ticket opens the ride, as every ticket does, and the
   ride asks for the rating. (As first written, the ticket opened the
   rating itself; the note under "As built" says why it does not.)
4. My trips (`/drive/trips`) goes; its address leads to My rides. Drafts
   are listed on Offer (3.11, item 6; spec 16, decision 6), and what led
   to My trips today (Back from a posting step opened by its address,
   and deleting a draft) leads to Offer.

As built, on a phone
([light](images/one-ride-one-ticket/built/my-rides-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/my-rides-phone-dark.webp),
[Past](images/one-ride-one-ticket/built/my-rides-past-phone-light.webp))
and a laptop
([light](images/one-ride-one-ticket/built/my-rides-laptop-light.webp)),
with the
[drafts on Offer](images/one-ride-one-ticket/built/offer-drafts-phone-light.webp):
a ticket of My rides holds no button of its own. What it needs is the
yellow tag in its foot, and pressing the ticket opens where that is
done. "Needs you" lists the ride whose deadline or leaving time is
soonest first, as Find does.

- **The title's button** is "Offer a ride", outlined, with a plus before
  the words. It is the button every screen has, 48 high, and not a
  smaller one: it is as easy to press as any, and the parts have no small
  button. On a laptop it stands at the page's right edge, on the
  title's line. Where a narrow phone has no room for it beside the
  title's longest word, it stands over the title, as the head's rule
  says (3.3). With nothing coming up, the screen keeps "Find a ride"
  alone under its sentence: offering is at the title.
- **A rating to give** is the same yellow tag, with a star in place of
  the bell, where the ride's state would stand: "Rate the driver" on a
  seat of mine; on a ride I drove "Rate your passenger" for one passenger
  and "Rate your passengers" for several. It shows while the rating can
  be given: the ride is done, its 14 days run, I have sent nothing, the
  other person has not left and no report on the booking waits. The
  ticket opens the ride, as every ticket does. A booked seat then asks in
  its title, "How was your ride?", with "Rate the driver" as its main
  button (3.8); a ride I drove lists its passengers with "Rate your
  passenger: Dóra" under each (3.12). A ticket that opened the rating
  itself, as item 3 first said, kept a finished ride out of reach from
  My rides for up to 14 days: its messages, a report to make or to
  answer, what was paid, "Post it again".
- **My trips is gone.** `/drive/trips` leads to My rides. "See my rides"
  after publishing opens My rides, as does the link on sharing a ride
  that cannot be found. Back from a posting step opened by its address,
  and deleting a draft, lead to Offer. A ride I drive is shared from its
  page (3.12): its ticket in My rides has no share icon, as it has no
  button of its own.

### 3.11 Offering a ride

1. Each step has Back and the **road** with five stops in place of "Step 5
   of 5" and the bars; the title under it at the left.
2. Steps 1 to 4 keep their fields. Step 4 says the price as kronur for the
   whole way first; the price level in per cent is the control, not the
   headline. On step 2 the time wheel for a day other than today opens at
   08:00, not at the present time (at 03:40 at night it opened at 04:10
   for a ride the next day).
3. **Check and publish:** "This is how people will see your ride." over
   the ride as a ticket. Under it one card of rows with Change, each
   opening the step it opens today: Route ("Mjódd to Vík, with 5 stops"),
   Time, Price, Seats and booking, Car, Preferences and note. The stops
   are listed once, with their times, when Time is opened; the ticket
   shows the two ends. **Delete draft** is a red row, last, and asks
   first, as today.
4. What is still missing (photo, car, licence; spec 16, 3.6, items 4 and
   5) is one `NeedsYouCard`: "One thing before your first ride. Photo and
   car are done. Your driving licence is left.", with the button for the
   next one. They are still asked here and not earlier.
5. **Publish ride** is in the bar at the bottom, as today, and waits until
   nothing is missing.
6. **Drafts** are listed on Offer, over step 1, as rows in one card, the
   one changed last first: the route and day, opening the step where it
   was left, as today. More than three fold under "Show all drafts".
   "See all drafts" and its page go with My trips (3.10). As built (with
   My rides, plan, PR 8c): under the step's title, the heading "Drafts"
   over one card of rows; a row has the route and under it the day and
   time ("Sunday 15 November at 09:00"), or "No time yet", which tells
   two drafts of one route apart. A row is a link a screen reader hears
   as "Continue your draft: Mjódd → N1 Selfoss, Sunday 15 November at
   09:00". "Show all drafts" is the card's last row, with a sign of its
   own as the drafts have; pressed, it goes, the other drafts come and
   focus goes to the first of them. Only the press moves focus: drafts
   read again later come without it.

As built (plan, PR 9), on a phone: step 1 on Offer
([light](images/one-ride-one-ticket/built/offer-route-phone-light.webp)),
the price step
([light](images/one-ride-one-ticket/built/offer-price-phone-light.webp)),
Check and publish with what is missing
([light](images/one-ride-one-ticket/built/offer-check-missing-phone-light.webp))
and ready to publish
([light](images/one-ride-one-ticket/built/offer-check-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/offer-check-phone-dark.webp)),
[adding a meeting point](images/one-ride-one-ticket/built/offer-add-point-phone-light.webp)
and
["Your ride is published"](images/one-ride-one-ticket/built/offer-published-phone-light.webp);
on a laptop,
[step 1](images/one-ride-one-ticket/built/offer-route-laptop-light.webp)
and
[Check and publish](images/one-ride-one-ticket/built/offer-check-laptop-light.webp).

- **The head of a step:** Back beside the road, whose car stands on the
  step: Route, Time, Seats, Price, Check ("Leið", "Tími", "Sæti", "Verð",
  "Yfirfara"). A screen reader hears one line, "Step 2 of 5: Time". The
  title is under them at the left, on a phone too. On Offer, a place of
  the menu, step 1 has no Back and the road has the whole width. The
  bars with "Step 2 of 5" stay where someone signs up (spec 29's
  screens).
- **Adding a meeting point** (step 1, and "Add a stop" on Edit the ride)
  has the head of a step too: Back, which closes it with nothing chosen,
  in place of the cross, and the title at the left. On Edit the ride the
  ride's day, time and route stand over the title, as on its other
  screens. Android's back closes it as Back does; on step 1 it left the
  step, or the app.
- **Step 2:** for a day other than today the departure's wheel opens at
  08:00. For today, and while no day is chosen, it opens at the first
  time one can leave at, as before (spec 3, 3.5, item 5).
- **Step 4** already said the whole way's price in kronur large, with
  the level as the value of its control, so only its head changed. The
  line about the price beside a step on a laptop ("Your ride so far")
  and on Edit the ride (3.19) says kronur first too now: "3,400 ISK the
  whole way · 110%".
- **Check and publish, the ticket:** the one the results show for the
  whole way: the day, "Driver approves" or "Book instantly", the two
  ends with their times, how long it takes with the stops between
  counted, the price ("Free" for a free ride), and in its foot the
  driver as others see them (the picture unless PuffinRide hid it, the
  rating or "New driver") with "3 seats left". It is not pressed. A
  draft with no times yet has no ticket, and no line about one under
  the title.
- **The rows:** Route ("BSÍ bus terminal to Hof, Akureyri, with 1 stop
  on the way"), Time ("Sunday 15 November, 09:00 to 11:00"; a ride that
  ends on a later day has a line for each day, "Sunday 15 November at
  23:00" over "Monday 16 November at 01:00"), Price ("3,400 ISK the
  whole way", or "Free"), Seats and booking, Car, and Preferences and
  note (the preferences in one line, as a passenger reads them, then the
  note or "No note"). A row is a small caption over what is set, with
  "Change" at its right, and one link, which a screen reader hears
  whole: "Route, BSÍ bus terminal to Hof, Akureyri, with 1 stop on the
  way, Change". In Icelandic the Route row shows an arrow between the
  two ends ("BSÍ → Hof, Akureyri, með 1 viðkomustað á leiðinni"), as a
  name after "til" would stand in the wrong case; read out it is "til",
  as on every other screen. Seats and booking, Car, and Preferences and
  note all open step 3, which holds the three, as their links did.
  Opened by its address, the step's Back leads to the price, the step
  before it.
- **What is missing** is one yellow card under the rows, over Delete
  draft. Its title counts ("Three things before you publish", "Two
  things", "One thing"), its line says what is done and what is left
  ("Photo and car are done. Your driving licence is left."), and its one
  button, outlined, does the next: "Add a photo", then "Add a car", then
  "Confirm your licence". Each comes back here. The title says "before
  you publish", not "before your first ride" as item 4 has it: someone
  who has driven before is asked too when one of the three is missing.
  The line under Publish, in the bar, says why it waits.
- **Delete draft** is a red row in a card of its own, last. Pressed, a
  card takes its place and takes focus: "Delete this draft? You can't
  undo this.", with "Delete draft" and "Keep it". "Keep it" brings the
  row back, with focus on it. Deleting leads to Offer.
- **Why publishing did nothing** stands over Publish, in the bar; what
  the server asks to be fixed is listed at the top of the step, as
  before.
- **"Your ride is published"** (3.19) keeps its centred title, which
  takes focus, and has no puffin: it had none, and the puffins' car
  driving off belongs to "You're booked". The ride is the ticket My
  rides has for it, which opens the ride. The share panel stays (spec
  28). "See my rides" is the main button, in the bar; "See your ride",
  the ride as others see it, stays a link. The address says so only
  for a ride that is published and has not left, which is also when it
  can be shared (R28.4): a draft's opens the step where it was left,
  and the address of a ride that is cancelled, has left or is done
  opens that ride's page. The ride is read again each time the screen
  comes back into view, as its ticket leads to where the ride is
  changed and cancelled: the ticket and the text to post have the time
  the ride has now.

### 3.12 The driver's ride

1. Title "Your ride to Vík"; under it what it needs ("1 request needs your
   answer") or its state.
2. The ride as a ticket, with the price for the whole way and the car
   under the tear line.
3. **Needs you:** each request as a `NeedsYouCard`: the passenger with
   rating and rides, opening the profile, the time left, the part asked for
   as a timetable with the seats and price, the message, the seats with
   this request on the fullest stretch of that part as one line ("If you
   accept, 2 of 3 seats are taken from Mjódd to Selfoss"; today it is a
   bar for each stretch, which "Each stretch" still opens), and
   **Decline** and **Accept** side by side. Decline asks why in place, as
   today. "Report Dóra" stays a quiet text link at the card's end.
4. **Passengers:** one card of rows: the picture, the name, their part
   ("Mjódd to Hella, 1 seat, 600 ISK") and the booking's tag, with a round
   **Message** button at the right once the seat is confirmed. Pressing a
   row unfolds it in place (decision 11): See profile, Cancel booking (red
   and last, while it can be cancelled) and Report. Once the ride is done
   the rating shows under the row without unfolding, as today. The card's
   last row is "Message all passengers".
5. **Seats:** one line, "1 of 3 taken at the busiest, Mjódd to Selfoss",
   with "Each stretch" opening the bars of today.
6. **Rows:** Edit the ride, Share this ride, Post it again, Post the way
   back, and Cancel the ride, red and last.

As built, on a phone
([light](images/one-ride-one-ticket/built/driver-ride-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/driver-ride-phone-dark.webp),
[a passenger's row unfolded](images/one-ride-one-ticket/built/driver-ride-passenger-phone-light.webp))
and on a laptop
([light](images/one-ride-one-ticket/built/driver-ride-laptop-light.webp)).
The screens it opens (Edit the ride, cancelling the ride, sharing and
"Message all passengers") are in 3.19, as built in PR 8b; My rides is
in 3.10.

- **The head:** Back leads to My rides when the page was opened by its
  address. The line under the title is the first of these that is true:
  why the ride was cancelled ("You cancelled this ride: Road closed"); "1
  request needs your answer."; on the trip day "Today at 18:15 from Mjódd
  bus terminal."; "This ride has left."; or else its day and time. The
  rows have no heading on a phone.
- **The ticket** is where I am, not a link: the short day, the tag "You
  drive", the two ends with their times, how long the whole way takes
  with the stops between counted ("50 min, 2 stops"), and under the tear
  line "900 ISK the whole way", or "Free", and the car. Until the ride
  leaves, sharing it is the button in the ticket's corner (spec 28, 3.1).
  A cancelled ride keeps its ticket, without the moss edge of a ride that
  is mine, and the two rows that post it again.
- **A request** is one `NeedsYouCard` under the heading "Needs you". Who
  asks is a link to their profile: the picture, the name, their rating or
  the tag "No reviews yet", the reliability figure, and "Member since
  November 2026" while nobody has rated them. The tag stands on white
  there, as its own yellow would not show on the yellow card. The time
  left to answer stands at the right, or under them on a phone. Their
  part is a timetable on white, with "1 seat, 100 ISK" beside its line
  and their message under it, in quotation marks. Then "If you accept, 2
  of 3 seats are taken from Mjódd bus terminal to Olís Norðlingaholt.",
  which names the fullest stretch of their part; a request holds its seat
  from the moment it is sent (rule S1), so the Seats card counts it
  before it is answered. Decline and Accept stand side by side, and
  "Report Einar" is the quiet link at the card's end. Decline asks why in
  place, and "Decline request" there is red (decision 17). Someone who is
  leaving PuffinRide shows no rating, no "No reviews yet", no reliability
  figure and no link; how long they have been a member still shows.
- **Passengers:** the heading has "1 confirmed" at its right. A row is
  the picture, the name, the part with the seats and the price, and the
  booking's tag; "Waiting for payment" is blue for the driver, who waits
  with the passenger (rule 6). Message is a round button at the right of
  a confirmed booking, named "Message Dóra". Pressing the row unfolds it
  in place: their part as a timetable, with the times they get in and
  out, then "See profile" and "Report Dóra" as links, and "Cancel
  booking", red and last, until the time to get in; it opens the screen
  that asks, so it is a link too. The order is not the one first written
  (decision 11): what cannot be undone comes last (R31.3). Someone
  leaving PuffinRide has no profile row. The whole row unfolds it and
  tints under the pointer and while pressed. Once the ride is done the
  reviews stand under the row while there is one to give or to read, and
  nothing does once the 14 days are over with none written.
- **Seats:** a square for each seat, the taken ones filled, with "2 of 3
  taken" beside them and "at the busiest, Mjódd bus terminal to Olís
  Norðlingaholt" under that; the words go under the squares where a car
  of many seats leaves them no room. "Each stretch" opens the bar of each
  stretch, and a ride of one stretch has only the line.
- **The route** (added 2026-11-28, as on a booked seat, 3.8): the whole
  way on our map, its two ends standing out and the stops between as
  dots, after the seats and before the rows. On a laptop it is a band in
  the main column, after the passengers and before "Drive it again", so
  the side column stays whole in a small laptop's window. A screen reader
  hears "Your ride on a map of Iceland: Mjódd bus terminal → N1
  Selfoss." A cancelled ride has none: it keeps its ticket and the two
  rows that post it again.
- **Rows:** Edit the ride, Share this ride, "Share the ride's details",
  "Weather and roads", Post it again, Post the way back, and Cancel the
  ride, red and last. The two in the middle are what the Safety card held
  (spec 9, 3.3), which is gone. "Weather and roads" stays until the last
  stop's time; the two that post the ride again always; the others,
  "Share the ride's details" among them, until the ride leaves. "Share
  the ride's details" has a shield here, to tell it from "Share this
  ride" beside it; a booked seat, which has only the one, keeps the
  sharing icon. A row that makes a draft says "Loading" at its right
  while it does, and the other of the two waits, muted, until it has.
- **What an action did** ("Request declined.", "Booking cancelled. The
  passenger has been told.", "Ride changed. Your passengers have been
  told.") stands over the page's parts as a notice, with focus, as
  before. Nothing on the page is a main button but "I'm here"
  on the trip day (3.9), so on other days it has no bar.
- `look.spec.ts` opens the page on a phone 360 wide with long names for
  every stop and both people, with the text as set and twice as large:
  the title, the ticket, the request, the passengers and the seats hold
  what is in them, and Message stays in its row.

Since [spec 34](2026-11-28-co2-saved.md) (3.7), the CO₂ card follows
Passengers: its passengers' parts added, from the confirmed and completed
bookings, and none before one counts. On a laptop it is in the main
column.

### 3.13 Messages

1. A conversation's top: Back, the picture, the name with "Driver, White
   Toyota Yaris" or "Passenger" under it, and a menu button that holds
   Report and Block. Under it one line with the ride ("Fri 27 Nov, 18:30
   Mjódd to Norðlingaholt"), opening the booking or the driver's ride.
2. The safety line stays, as the first thing in the conversation.
3. The quick answers stay as chips. The field is one line that grows as
   you type, with a round send button.
4. The list of conversations keeps its rows; each shows the ride's day and
   route under the name.

As built (plan, PR 10), on a phone: a conversation
([light](images/one-ride-one-ticket/built/chat-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/chat-phone-dark.webp)),
[its menu open](images/one-ride-one-ticket/built/chat-menu-phone-light.webp),
[three lines written](images/one-ride-one-ticket/built/chat-writing-phone-light.webp)
and
[the list](images/one-ride-one-ticket/built/messages-phone-light.webp);
on a laptop,
[a conversation beside the list](images/one-ride-one-ticket/built/chat-laptop-light.webp).

- **The top stays** while the messages scroll under it, on white with a
  line under it. Until now Back, the name, Report and Block were the
  first lines of the conversation, which opens at its end: they were out
  of view from the first message on. It has Back, with no fill here, the
  picture (the app's 48, where the drawing has 40), the name as the
  screen's title, and under the name "Driver, White Toyota Yaris",
  "Driver" alone while the booking names no car, or "Passenger".
  Icelandic has a dot between the two, "Bílstjóri · Hvítur Toyota
  Yaris", as the colour's capital letter would read wrong after a comma.
  Back and the menu's button are level with the picture's middle, and
  the three stand at the top of a name of several lines (3.18).
- **When the top would leave too little room,** it is the first thing in
  the conversation instead, on a card, and scrolls with it as it did
  before: when it leaves the messages, the quick answers and the bar
  less than 400 of the height the conversation has, which is a phone's
  screen, or its pane on a laptop. That is text twice as large with long
  names on a narrow phone, where the top alone is 600 high, or a phone
  on its side. The menu, open for a moment, is not counted, and stays
  open if the top moves while it is, as when a phone is turned.
- **The menu** is a button of three dots at the right, named "More",
  which says for a screen reader whether it is open. Pressed, two rows
  unfold under the top's first line and push the ride's line down:
  "Report Bára" with a flag, and "Block Bára", red and last (decision
  17). Each closes the menu and opens its own screen, which asks first
  (3.19; spec 9, 3.1 and 3.2), so each is two presses away and neither
  is the first thing seen. Pressed again, the menu folds. Once I blocked
  them it holds Report alone.
- **The ride's line** is a ticket icon, the short day and the time in
  bold, and the part of the way the booking is for with the arrow, as
  the list's rows write it: "Sat 28 Nov, 17:30 Mjódd bus terminal → N1
  Selfoss", and in Icelandic "Lau. 28. nóv. kl. 17:30", as it says a
  time after a day. Long names wrap to another line and are not cut,
  and a name wider than the line breaks inside it. It is one link, read out
  "Saturday 28 November at 17:30, Mjódd bus terminal to N1 Selfoss": to
  the booking for its passenger, and for the driver to their ride, which
  has the passenger on it.
- **The safety line** is the first thing in the conversation, as a quiet
  line with a shield, small and muted, where it was a blue notice. Its
  words are as they were, for paying in the app and for paying the
  driver in person (ADR 0038). Then "You blocked Bára" where that is so,
  how to report a message, and "Sent with the request" over the
  request's message, which the drawing leaves out and the conversation
  keeps (spec 7, 3.1, item 1).
- **The quick answers** are chips over the bar, on the screen's ground,
  and no longer in the bar: one row that scrolls sideways on a phone,
  wrapping on a laptop. "I'm running late" asks how many minutes in
  their place, as before.
- **The field** is in the bar: one line, 52 high as the app's fields
  are (the drawing has 48), round at its ends, with "Write a message" in
  it until something is written. Those words are its name for a screen
  reader too; the label over it is gone. It grows with what is written,
  to about five lines, and scrolls inside from there; emptied or sent,
  it is one line again. As it grows the conversation stays at its end,
  so the last message is not under the bar while an answer to it is
  written. **Send** is a round filled button as high as the
  field, with a paper plane and the name "Send": the screen's one main
  button (R31.1). It stays at the field's foot as the field grows, and
  turns to a spinner while "Message all passengers" sends.
- **A conversation that is closed,** or with a block between the two, or
  read by someone suspended, has one line in the bar that says so, and
  neither field nor chips.
- **The list** keeps its rows, with the ride's day and the booking's part
  under the name ("Saturday 28 November · Mjódd bus terminal → N1
  Selfoss"). On a phone its title, "Messages", is at the left (3.17).
- **On a laptop** the open conversation's pane has the same top, with
  Report and Block in its menu too; they stood beside the name there
  (spec 18, 3.11).
- **"Message all passengers"** (3.19) has the same field and round Send
  in its bar, with the chips over them, in the bar too.
- `look.spec.ts` opens a conversation on a phone 360 wide with a long
  name and long place names, with the text as set and twice as large:
  the top holds what is in it, staying with the text as set and
  scrolling with the conversation twice as large; the field and Send are
  whole in the bar, and a line written twice as large is whole in the
  field, with the conversation still at its end after the field grew for
  it; and the messages keep at least a third of the window. Twice as
  large there, the field shows "Write a" of "Write a message" until
  something is written (plan, PR 12's list).

### 3.14 Profile and settings

1. **One page.** The person's card (the picture with its controls for
   adding, changing and removing it, the name, member since, rating, what
   is checked, Edit, "See your profile as others do"), then groups of
   rows, each row showing what is set now:
   - **Driving:** My cars, Driving licence.
   - **Account:** Email, Phone number, Ways to sign in, Notifications,
     Language.
   - **Safety and privacy:** Privacy and your data, Blocked people, My
     reports, Notices.
   - **Help:** Meeting points, Send feedback, My feedback, About
     PuffinRide, Legal documents.
   - **Sign out**, a row of its own at the end. "Sign out on all devices"
     moves to the end of Ways to sign in.
2. A row opens the page it has today. Three things Settings shows in
   place today have no page (decision 12):
   - **Language** opens a new page, `/settings/language`, with the two
     languages to choose from; the row shows the one in use.
   - **Notifications** opens a new page, `/settings/notifications`, with
     the switches of today and the way to the beta news.
   - **Phone number** only shows the number, as today: no chevron, and its
     line of help stands under the group.
   "Shake to send feedback" is a row with a switch under Send feedback,
   in the phone apps only, as today.
3. `/settings` leads to Profile. Signed out, Profile stays as it is.

As built (plan, PR 11, the first of its two parts), on a phone: Profile
([light](images/one-ride-one-ticket/built/profile-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/profile-phone-dark.webp)),
[the language's page](images/one-ride-one-ticket/built/language-phone-light.webp),
[the notifications' page](images/one-ride-one-ticket/built/notifications-phone-light.webp)
and
[Sign-in methods](images/one-ride-one-ticket/built/sign-in-methods-phone-light.webp);
on a laptop,
[Profile](images/one-ride-one-ticket/built/profile-laptop-light.webp).

- **The title** is "My profile", as it was, at the left with no Back
  (3.17). The drawing says "Profile", which is the place's name in the
  menu.
- **The person's card** has the picture, the name, and two small lines,
  "Speaks English" and "Member since November 2026". **Edit** stands at
  their right, a button with an outline whose name for a screen reader
  stays "Edit profile"; it goes under them where the card has no room for
  both. Then one line that wraps: the rating, "No ratings yet" or the
  star with "4.3 (3 ratings)", and the tags "Phone verified" and "Email
  verified". They are read from my own profile as anyone signed in sees
  it, so the card and "See it as others do" never differ; while it is
  read the line's room is kept, so nothing under it moves when it comes,
  and when it could not be read the line is left out. Then the photo's
  controls at the left (Add a photo or Change photo, Remove photo, and
  Take a photo in the phone apps), with their line of help and what they
  say after a change, and the link "See it as others do". The drawing
  counts rides beside the rating and has the tags as "Phone" and "Email":
  the app counts ratings, and the tags keep the words a person's profile
  has.
- **The groups** are a heading and a card of rows each (3.3), every row
  with its picture, and what is set now at its right:
  - **Driving:** My cars with the cars' names ("Toyota Yaris"; several
    with commas between them; nothing with none), and Driving licence
    with "Confirmed" or "Not confirmed yet".
  - **Account:** Email with the address, or "No email yet", or "Waiting
    for you to open the link sent to …" while a new one waits; Phone
    number, which only shows; Sign-in methods with the ways in use
    ("Email, Google, Password, Face ID or fingerprint"); Notifications;
    Language with the one in use. "Only you can see your phone number."
    is a small line under the group. The row keeps the name the page has,
    "Sign-in methods", where the drawing says "Ways to sign in".
  - **Safety and privacy:** Privacy and your data, Blocked people, My
    reports, Notices.
  - **Help:** Meeting points; Send feedback, which opens the form as it
    did; in the phone apps "Shake to send feedback", a row that is a
    switch, with "Shaking your phone opens Send feedback." under its
    name; My feedback; About PuffinRide; and Legal documents, which
    unfolds the three documents as links under it. Its page has only led
    to About since spec 30, so the row holds the documents themselves.
  - **Sign out** is the one row of a last card, with its chevron as
    drawn. It signs out of this device and returns to Find. It is not
    red: signing in again undoes it (decision 17). While it signs out the
    row is muted, and on the web a sign-out that failed says why under
    it.
- **What a row says is read again** each time Profile comes back into
  view, as after adding a car. A row, or the card's line, that cannot be
  read again keeps what it said: a failed call takes nothing away.
- **A value with no room beside its title** goes under it, as a long
  email does on a narrow phone; a title is never broken to make room. A
  word longer than the row's line, as an email of fifty letters is on a
  phone 360 wide, breaks inside the row; until now it reached past the
  row's edge on the web.
- **The language's page** has "Language" at the left with Back to
  Profile, and the two languages as two cards to choose from, each
  written in its own language and marked so for a screen reader. Choosing
  one changes the app at once and saves it to the account; if saving
  failed, the page says why in the language just chosen, and choosing it
  again tries again. Quick choices are saved one after the other and end
  on the last, and the page says only how the last one went.
- **The notifications' page** has "Notifications" at the left with Back
  to Profile. The two switches are two rows of one card, each with what
  it does under its name: "Ride reminders" and "Beta news". Under the
  card a small line says what is always on. The way to the beta news is
  a row of a second card, "Beta news" with "What PuffinRide has told beta
  testers in the last three months." under it. Why a change could not be
  saved shows under the first card, once when both failed alike, and the
  switch goes back.
- **"Sign out on all devices"** is the last thing on Sign-in methods,
  under its card, with its line of help, also when the ways to sign in
  could not be read. That page itself is spec 29's and is otherwise as it
  was.
- **`/settings`** leads to Profile, signed in or out, and the menu has no
  Settings. Back on a page that Settings opened returns to where it was
  opened from, and to Profile when it was opened by itself, as from an
  email; Beta news then returns to Notifications, where its switch is.
- **On a laptop** (3.16, item 5) the title is over both columns, the
  person's card is the side column, at the left, and the groups and Sign
  out are the main one.
- **Texts that named Settings** now say where the thing is on Profile
  (section 8). The legal texts said "Settings", in the Terms twice and in
  the Privacy Policy four times, until the Terms' version 3 and the
  Privacy Policy's version 4 (2026-11-27, 3.22).

The second part (plan, PR 11b) gave this card to a person's profile, its
preview and Edit profile, made Report and Block rows, and put the heads at
the left on the pages Profile opens: 3.19, as built. Sign-in methods'
picture above was taken again then, with its title at the left.

Since [spec 34](2026-11-28-co2-saved.md) (3.8), the first group is "Your
shared rides": one CO₂ card with what I saved as a passenger and as a
driver, and "Only you can see this." under it. It is not there under 1 kg.

### 3.15 Sign-in

Not changed here: [spec 29](2026-11-25-easier-sign-in.md) is changing that
screen. Once it has landed, one thing joins it from this spec: the ride
someone was about to book shows over the form as a ticket (spec 16, 3.5
already keeps the ride in sight; only its shape changes).

Left for that spec's thread (2026-11-27): its screen was still being built
when this spec's build ended, so the ride over the form keeps spec 16's
small card ("You're booking", `KeptRideCard`).

### 3.16 Wide screens

The kinds of screen, the widths and the top bar of spec 18 stay. What
changes:

1. **Find:** the title and its line stand at the left of the scene, with
   the car on the road at the right; the search row overlaps the scene's
   lower edge as today. Main column: the rides as tickets. Side column:
   signed in, what needs me or my next ride; signed out, "How it works"
   in three lines with **Offer a ride**; then the map, as today. As
   built: the scene behind the title is 132 high and the car 170 wide,
   two `xxl` in from the right; signed in, "Offer a ride" is a line under
   the rides, as before. "How it works" stands whole in a window 1280 by
   720; the map under it is then partly below the fold for someone signed
   out (spec 18, 3.5). Signed in with nothing coming up, the map leads
   the side column and is whole in that window; the link under it, "See
   the meeting points", starts in the window and ends 25 under its edge,
   as the scene is 36 higher than it was. The laptop journey measures
   both.
2. **A booked seat:** main column: the title, the road, where to stand and
   the driver; side column: the ticket, then the rows. On the trip day
   "I'm here" is the main button at the top of the side column. As
   built: the title is the page's head, over both columns. The driver and
   where to stand share a row where the main column has room for both,
   as cards of one height, where to stand first on the trip day. The
   side column begins with what a phone's bar holds (Pay and its sheet,
   the question about withdrawing, "I'm here", "Rate the driver", "Find
   another ride"), then the ticket and the rows; what is open or was
   said there stays when the window turns narrow and wide again. The
   side column is whole in a window 1280 by 720.
3. **The driver's ride:** main column: Needs you, Passengers, then "Drive
   it again" (Post it again, Post the way back). Side column: the ticket,
   Seats in one line, and the rows Edit, Share and Cancel. The side column
   is whole in a window 1280 by 720 (spec 18, decision 14), which the
   one-line Seats makes possible. As built: the title is the page's head,
   over both columns. The side column's rows are Edit the ride, "Share the
   ride's details", "Weather and roads" and Cancel the ride. "Share this
   ride" is not a row there: the ticket, with sharing in its corner,
   stands right over the rows, and with five rows the column was 37 too
   high for that window. On the trip day "I'm here" leads the side
   column, as on a booked seat, whole in that window; until the ride
   leaves the column under it is then whole in a window 800 high, and in
   one 720 high its last row is reached by scrolling the column (51 more
   than fit; left so, 3.22). Whether each stretch shows, what
   "I'm here" told and a draft being made stay when the window turns
   narrow and wide again.
4. **My rides:** a grid of tickets, as today.
5. **Profile:** the person's card in the side column, the groups in the
   main column.
6. **A ride's details and Booking a seat** (as built) keep their columns
   of spec 18 (3.7 and 3.8). A ride's details: main column, the ticket of
   my part, the driver's card, "Where you sit" and the rows, one under the
   other; side column, the booking panel and "The whole route". Get in and
   Get out are the ticket's two ends, so nothing stands in two halves any
   more. Booking a seat: the side column is the ride's ticket and the main
   button under it.

![The driver's ride on a laptop, proposed](images/one-ride-one-ticket/proposal/img/new-laptop-driver-ride-first.webp)

Since [spec 34](2026-11-28-co2-saved.md) (R34.8), the CO₂ card is in the
main column of a ride's details, a booked seat and the driver's ride,
never in a side column, so the side columns stay whole in a window 1280 by
720.

### 3.17 Titles at the left

On a screen where you do something (a ride, a booking, a step, a list, a
conversation, Profile) the title is at the left. Find on a phone while
signed out, the empty and signed-out screens with a puffin, the screens that say a seat is
booked or a ride is published, and About keep a centred title. This
changes Martin's choice of 2026-11-14 (spec 15, 5.1) and is decision 2.

As built (plan, PR 12a): a screen test opens every page a signed-in
member reaches, 86 pages and states, and looks where the title is. It is
at the left on all but the ones named above and About's kin, the legal
documents and Cookies, which the website says about itself. Under a title
at the left nothing in the page's column is centred. What is centred
there belongs to a control or a drawing: what a button says, the number
between a stepper's two buttons, the month between a calendar's arrows,
the price a passenger pays over its slider, a conversation's day and what
PuffinRide says in it, and the words under a puffin; the test names the
pages each of these is on. It looks at words set in the middle, not at a
block placed in the middle of its column. On Find on a phone,
signed in, "Driving somewhere? Share the empty seats in your car." starts
at the left, as the title does; signed out it stays centred with the
rest.

### 3.18 Plain defects

Fixed in a pull request of their own, before the rest and whatever is
chosen:

1. Titles run words together ("N1Vík" for "N1 Vík"): Fredoka's space is
   narrow, and the kerning between "1" or a space and "V" closes it
   further. At 28 px the space is 6.75 px and "N1 Vík" is 72.5 px wide
   with kerning, 77.4 px without. **Fixed:** on the web, every Fredoka
   style is set without kerning and with a word space 0.06 em wider
   (`wordsApart` in the app's tokens).
2. On Edit trip, "Change the preferences and note" runs out of its card.
   **Fixed:** where a part's title and its link do not fit on one line,
   the link goes under the title; the same on the last step of posting.
   "Remove a stop" starts at the left.
3. Profile pictures sit at mid-height beside tall blocks of text (the
   driver's card, a request). **Fixed:** the picture stands at the top,
   with the name; beside a line or two it stays at their middle.

A web journey checks each of the last two in the browser: no link of Edit
trip reaches past its part at 360 wide, and no picture starts under the
top of the text beside it. (Since PR 8b Edit trip is a card of rows,
3.19, and the journey checks that no words of a row reach past the card
at 360 wide. Since PR 9 the last step of posting is a card of rows too,
3.11, looked at 360 and 320 wide in Icelandic.)

Pictures: Edit trip
[before](images/one-ride-one-ticket/defects/edit-trip-before.webp) and
[after](images/one-ride-one-ticket/defects/edit-trip-after.webp) (a phone
360 and 390 wide, and a laptop), and a profile picture beside its text
[before](images/one-ride-one-ticket/defects/picture-before.webp) and
[after](images/one-ride-one-ticket/defects/picture-after.webp).

### 3.19 Every other screen

The sections above describe the screens that change most. Every other
screen a signed-in member reaches keeps what it holds, its order and its
texts, and takes the rules in the same pull request as its flow
(decisions 8 and 13): the head at the left (rule 5), one main button
(rule 4, R31.1), rows in place of columns of buttons and loose links, a
ticket wherever it shows a ride (R31.2), and the tags of rule 6.

| Screen | What changes |
| ------ | ------------ |
| Booking a seat (`/trips/[id]/book`) | My part as a ticket at the top; the main button stays in the bar |
| "You're booked" and "Your ride is published" | The ride as a ticket; the share panel of spec 28 stays; centred, with their puffins |
| Cancelling a booking or a ride, answering a report, "The driver didn't come", "The passenger didn't come", reporting, blocking | The head at the left; the ride as a ticket where it shows today; the main button in the bar, red when it cannot be undone (as built: red when it takes something away, decision 17) |
| Rating (`/bookings/[id]/rate`) | The head at the left; the stars and fields as today |
| Edit trip (`/drive/trips/[id]/edit`) | Its parts become rows with what is set now: Time, Stops (with Add a stop and Remove a stop under it), Price, Seats, Car, How people book, Preferences and note. Each part's screen and "Check the change" keep their fields |
| Sharing a ride, messaging all passengers | The head at the left |
| A person's profile, its preview, Edit profile | The person's card as on Profile (3.14); Report and Block as rows, red and last (as built: last, and only Block red, decision 17) |
| All rides (`/rides`), a place, a meeting point and their list | Rides as tickets; the rest as today. As built: a place and a meeting point list no rides today, so only All rides changed; since PR 12a all four and "What's wrong here?" have the head at the left |
| My cars, a car, the driving licence, the photo | The head at the left (as built: "Remove car" a red row, and the photo's page with the person's card; since PR 12a the cars are rows with pictures, and each page's main button is in the bar) |
| The pages under Settings, Notices, Send feedback, deleting the account | The head at the left (as built: Privacy's links a card of rows, and the button that deletes the account red; since PR 12a each page's main button is in the bar, and confirming with a code has one button and two rows) |

As built, Booking a seat on a phone
([light](images/one-ride-one-ticket/built/book-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/book-phone-dark.webp))
and on a laptop
([light](images/one-ride-one-ticket/built/book-laptop-light.webp)), and
"Request sent" on a
[phone](images/one-ride-one-ticket/built/booked-phone-light.webp) and a
[laptop](images/one-ride-one-ticket/built/booked-laptop-light.webp):

- Booking a seat has its title at the left and the ride as a ticket: the
  day, my two stops with their times, the total with "2 seats × 2,900 ISK"
  under it ("1 seat" for one, which needs no sum; "Free" for a free ride),
  and in the foot the driver's picture and name, with the car at the
  right. The lines "Driver: Jón · Blue Kia Ceed" and "Total" are gone.
  While booking is paused, the banner that says so stays above the title
  on a phone.
- "You're booked" and "Request sent" show the ride as the ticket My rides
  has for it, under the line about the day and time, with "Seat confirmed"
  or "Waiting for Jón's answer" in its foot. It opens the booking.
- "Your ride is published" shows the ride the same way, as the ticket My
  rides has for a ride you drive, which opens the ride (3.11, as built).

As built, the screens around a booking: cancelling it on a phone
([light](images/one-ride-one-ticket/built/cancel-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/cancel-phone-dark.webp))
and on a
[laptop](images/one-ride-one-ticket/built/cancel-laptop-light.webp), and
on a phone
["The driver didn't come"](images/one-ride-one-ticket/built/driver-absent-phone-light.webp),
[rating](images/one-ride-one-ticket/built/rate-phone-light.webp),
[blocking](images/one-ride-one-ticket/built/block-phone-light.webp) and
[reporting](images/one-ride-one-ticket/built/report-phone-light.webp).
Cancelling a ride came with the screens the driver's ride opens (below).

- **The head and the ticket:** cancelling a booking, "The driver didn't
  come", "Mark as no-show" and answering a report have Back and their
  title at the left, and under them the booked seat as its ticket, with
  the seats and the price in its foot, in the place of a small line with
  the day and the two places. Rating has no ticket, as the stars come
  first there: the day stands over "How was your ride?" and the part under
  it. Blocking and reporting show no ride while they ask.
- **The main button is in the bar** at the bottom, on a laptop too: these
  screens stay one column there (spec 18, 3.15).
- **Red or moss:** the main button is red where pressing it takes
  something away: "Cancel booking", with "Keep my booking" outlined under
  it in the same bar; "Withdraw request" in the question on the booking
  (3.8); and "Block Bára". It stays moss where it tells PuffinRide what
  happened: "Tell PuffinRide" (the driver didn't come), "Mark as no-show",
  "Send answer", "Send review" and "Send report". None of these can be
  taken back either, but a red button there would warn people off saying
  what happened, and each of those screens is itself the question "are
  you sure?". "Decline request" on the driver's ride (3.12) is red too:
  it takes away the seat that was asked for. So is "Cancel the ride". The
  no-show screen was looked at again with cancelling a ride, and stays
  moss (below).
- **Why nothing happened** stands over the main button, in the bar, and
  takes focus: "Choose a reason.", "Choose what happened.", "Choose a
  rating from 1 to 5 stars.", a note or a description that is too long,
  and what the server refused. It was at the end of the column, out of
  sight on a phone; a report whose description was too long said so only
  at the field. Pressing again with nothing mended says the same words
  again, for a screen reader too.
- **After it is done:** cancelling, the reports and the answer go back to
  the booking or the trip, where the outcome has focus, as before.
  Blocking, reporting and rating stay on their screen, and the way back
  is then the main button in the bar ("Back to the conversation", "Back",
  "Back to the booking"). After blocking and reporting the outcome is the
  title, at the left, with focus ("Bára is blocked.", "Thank you. We look
  at every report."); after a review the head stays and a notice under it
  says it was sent, with focus. A screen that only says a booking has
  changed meanwhile keeps an outlined button and has no bar, whether it
  finds out on opening or on sending.
- **Blocked, with rides still shared:** the title's line says so, and each
  ride is its ticket with "Cancel booking", "Withdraw request" or "Decline
  request" outlined under it, as before; none is filled, as the way back
  is the main button. Once it is done, what happened stands in the
  button's place and takes focus.
- **Reporting:** "Read the community rules" is a row under the form, and
  "Block Bára too", after a report about a person, is a red row, each
  with its icon.

As built, the screens the driver's ride opens (plan, PR 8b): Edit the
ride on a phone
([light](images/one-ride-one-ticket/built/edit-ride-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/edit-ride-phone-dark.webp))
and on a
[laptop](images/one-ride-one-ticket/built/edit-ride-laptop-light.webp),
and on a phone
[cancelling the ride](images/one-ride-one-ticket/built/cancel-ride-phone-light.webp)
and
[sharing it](images/one-ride-one-ticket/built/share-ride-phone-light.webp).

- **Edit the ride** has Back and its title at the left, the ride's day,
  time and route in small text over it, and under it "Change one thing at
  a time. Before you save, you see what it means for your passengers."
  Its parts are one card of rows, each with its icon and what is set now:
  Time ("Sunday 15 November at 09:00"); Stops, each stop on a line with
  its time, which only shows and opens nothing, with the rows "Add a
  stop" and "Remove a stop" under it (the second only where a stop
  stands between the ends, R6.5); Price ("4,500 ISK the whole way · 100%",
  kronur first since PR 9; it was "100% · the whole route 4,500 ISK");
  Seats; Car; How people book, with the sign the ride's ticket has
  for it; and Preferences and note: the preferences in one line, as a
  passenger reads them on the ride ("Some chat, one suitcase, ask about
  pets, no smoking, no child seat"), then the note or "No note". A value
  with no room beside its title goes under it. The headings with a loose
  link beside each ("Change the time") are gone; a screen reader hears
  "Time, Sunday 15 November at 09:00".
- **A part's screen and "Check the change"** keep their fields. Each has
  Back and its title at the left with the ride over it; choosing the
  meeting point for "Add a stop" is the picker posting has, with its own
  top, until posting is rebuilt (plan, PR 9). Why nothing was saved or
  checked ("This is what the ride has now. Change something first.",
  "Choose the stop to remove.", a note that cannot be saved in its
  field's own words, what the server refused) stands over the main
  button, in the bar, with focus. It was at the end of the column, which
  on the time's screen is under the calendar, and a note that could not
  be saved said nothing there. Another press with nothing mended says it
  again; it goes once that is mended. What is wrong with a new time
  itself (the time the ride has, too soon, further than the bookings
  allow, another ride of the driver's then) stays under the time, at its
  field.
- **Cancelling a ride** takes what cancelling a booking has: Back and
  "Cancel your ride" at the left, and the ride as the ticket its page has
  (the day, "You drive", the two ends, what the whole way costs and the
  car; nothing in its corner) in the place of a small line. The reason,
  who is affected and the note are as before. "Cancel the ride" is the red
  main button, in the bar, over "Keep the ride", outlined; both wait while
  it is cancelled. "Choose a reason." and what the server refused stand
  over them, with focus.
- **Sharing a ride** has the head at the left and the ride as the same
  ticket, in the place of a card with its route and day; the panel of
  spec 28 is under it. **Messaging all passengers** has the head at the
  left, with "Each passenger gets it in their own chat. Passengers don't
  see each other." as its line.
- **"Mark as no-show", looked at again** (decision 17): its main button
  stays moss. It tells the passenger and PuffinRide what happened; the
  passenger can answer, and PuffinRide decides. It is the driver's side
  of "The driver didn't come", which is moss too, and a red button would
  warn a driver off saying what happened. What opens it stays a quiet
  button beside the passenger at their stop on the trip day, shown once
  "I'm here" was said there.

As built, a person's profile, its preview and Edit profile, and the pages
Profile opens (plan, PR 11, the second of its two parts). On a phone: a
person's profile
([light](images/one-ride-one-ticket/built/person-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/person-phone-dark.webp)),
[Edit profile](images/one-ride-one-ticket/built/edit-profile-phone-light.webp),
[Privacy](images/one-ride-one-ticket/built/privacy-phone-light.webp),
[Delete my account](images/one-ride-one-ticket/built/delete-account-phone-light.webp)
and [a car](images/one-ride-one-ticket/built/edit-car-phone-light.webp);
on a laptop,
[a person's profile](images/one-ride-one-ticket/built/person-laptop-light.webp).
The person in them is made up by the journey that takes them.

- **A person's profile** has the title "Profile" ("Prófíll") at the left
  with Back, also while it is read and when the person is not there. The
  name was the title; it is now in the person's card, so the page has one
  title and the name is read after it. The card is Profile's (3.14)
  without Edit and the photo's controls: the picture, the name, "Speaks
  English, Icelandic" and "Member since November 2026", then the one line
  with the rating and the tags "Phone verified" and "Email verified", and
  under it what the person wrote about themselves, at the left. Someone
  who left is not found, as before: "This profile isn't available. The
  person may have left PuffinRide." under the same head.
- **The reliability figure** is a row in a card of its own, with a shield
  for its picture: "Reliability: 96%" or "Reliability: not enough rides
  yet". Pressing it unfolds the three lines of counts under it, as
  pressing the line did before; its chevron now shows that it does. It
  shared a card with the rating, which is in the person's card now.
- **The reviews** are as they were: the heading, the three chips, each
  review a card with "Report review" on the ones I did not write, and
  "Show more reviews".
- **The rules, Report and Block** are the page's last card, on anyone's
  profile but my own, each a row with its picture: "Read the community
  rules", "Report Bára" and "Block Bára". Only Block is red, and it is
  last: it takes something away, where a report tells PuffinRide
  (decision 17), as in a conversation's menu (3.13). They were two loose
  buttons side by side and a link, right under the person's card; they
  now come after the reviews, so reading about a person comes before
  acting on them. Report and Block each open the page they opened
  before, which asks first.
- **"As others see you"**, the preview, is the same page under its own
  head: the title at the left, "This is your public profile. Your phone
  number is never part of it." as its line, and Back to Profile. It has
  no second heading with my name and no rows to report or block.
- **Edit profile** has its title at the left with Back, then the person's
  card with what is saved now and the photo's controls in it, as on
  Profile, then the form as it was. The card changes with the photo at
  once, and with the form once that is saved. It has no Edit, no rating
  and no link to the preview: Profile has those.
- **These three stay one column on a laptop** (spec 18, 3.15), no wider
  than a text reads well.
- **The head is at the left on the pages Profile opens**, with Back, and
  the help under the title is the head's line, at the left; on most of
  these pages it stood centred. They are My cars, a car and "Add a car";
  the driving licence ("Your driving licence"); the photo ("Your profile
  photo"); Email ("Your email");
  "Choose a password"; Sign-in methods; Beta news; Blocked people; My
  reports; Notices; Send feedback and My feedback; Privacy, "Download my
  data", "Ask about my data" and "Delete my account". What a page says
  when it holds nothing yet ("You haven't blocked anyone.") starts at
  the left too. Sign-in methods is spec 29's and took only the head; its
  "Sign out on all devices" has its help at the left. On Notices and Beta
  news the title of a notice or of a piece of news is a heading under the
  page's title on the web; it was a second first-level heading.
- **Privacy** is a card of rows, each with its picture: "Download my
  data", "Ask about my data", "Privacy Policy" and, red and last, "Delete
  my account" (R31.3). The rows had no pictures, and deleting was the
  second of them, in the colour of the others.
- **Deleting the account:** the button that asks for it, "Delete my
  account", is red, and so is the one that confirms it with the code: it
  takes the account away (decision 17). Once it is done the outcome is
  the head, with focus: "Your account will be deleted on 4 December." as
  the title, "You're signed out on every device. …" as its line, and
  "Close" as the one main button, in the bar. The page an account that
  waits to be deleted lands on has the same title at the left, with what
  waiting means as its line; its two buttons, "Keep my account" and "Sign
  out", were as they had been until the last pass (below).
- **A car:** "Remove car" is a red row in a card of its own, the last
  thing on the page (R31.3), in the place of a loose link. It asks first,
  naming the car, as before; the question now takes focus where the row
  stood, and "Keep it" gives focus back to the row.
- **The photo's page** shows the person's card over the photo's controls,
  in the place of the picture alone, centred: the picture, or the letter
  that stands in for it, with the name and the two small lines, as
  Profile's card has them, without the rating. "Add a photo" stays the
  page's one main button.
- **After sending feedback or a question about my data** the thanks are
  the page's title, at the left and with focus, as after a report (above):
  "Thank you. We got your feedback." with "If we reply, you'll see it
  under My feedback in Profile." as its line, and "Thank you. We'll answer
  by email within a month." The way on is the one main button, in the
  bar: "Done", or "Back to Privacy". "My feedback" is a row under the
  head. The page kept its title, and the thanks stood centred under it
  with the buttons in the column.

Where this differs from the table: Report is not red, as above. The
pages took more than the head where a rule asked for it: rows in place
of a column of buttons on Privacy (rule 4), a red row or a red button
where something is taken away (R31.3, decision 17), and the outcome as
the head with one main button after something was sent or deleted
(R31.1).

As built, the last pass, part one (plan, PR 12a): what the paragraphs
above left, and the pages no flow had taken. On a phone:
[My cars](images/one-ride-one-ticket/built/cars-phone-light.webp),
[a car](images/one-ride-one-ticket/built/edit-car-phone-light.webp),
[Edit profile](images/one-ride-one-ticket/built/edit-profile-phone-light.webp),
[Delete my account](images/one-ride-one-ticket/built/delete-account-phone-light.webp),
[Download my data, with the code](images/one-ride-one-ticket/built/download-code-phone-light.webp),
[the meeting points](images/one-ride-one-ticket/built/meeting-points-phone-light.webp),
a meeting point
([light](images/one-ride-one-ticket/built/meeting-point-phone-light.webp),
[dark, in Icelandic](images/one-ride-one-ticket/built/meeting-point-phone-dark.webp)),
["What's wrong here?"](images/one-ride-one-ticket/built/meeting-point-problem-phone-light.webp)
and [All rides](images/one-ride-one-ticket/built/rides-phone-light.webp).

- **One main button, in the bar, on every page** (R31.1). It was at the
  end of the form or the column on these, where a phone shows it only
  after scrolling: "Save profile" on Edit profile; "Save car" on a car and
  on "Add a car"; "Confirm" on the driving licence; "Send the link" on
  Email; "Save password", and "Done" once it is saved; "Delete my
  account"; "Make my file" and "Download the file" on "Download my data";
  "Add a photo" or "Change photo" on the photo's page; "Add a car" on My
  cars while there is none; "Add my email" and "Add an email" where a page
  asks for one first ("Ask about my data", "Choose a password"); "Keep my
  account" on the
  page an account that waits to be deleted lands on; "Send appeal" on
  Notices; and "Send" on "What's wrong here?". These pages stay one column
  on a laptop and keep the bar there.
- **Why the button did nothing** is said over it, in the bar, and takes
  focus, as on the screens around a booking: what the server refused on
  each of these pages. On a form longer than one field, what the form
  itself refuses is said there too, as on Report, since the field can be
  out of sight when the button is pressed: a name or a car's make left
  out, no colour chosen, no reason chosen on "What's wrong here?" (said
  over the button only), a note or an appeal that is empty or too long.
  It goes once the field is mended. Where the page has one field, right
  under its title, what the field has to say stays at the field: an email
  that is no address, a password against the rules, a code of too few
  digits, the box of the licence not ticked.
- **Confirming with a code** (deleting, a file of my data, a new email, a
  password): the button that confirms is the page's main button while the
  code is asked for, in the bar, red where it deletes the account. It is
  there from the start and busy until the code is on its way, so the bar
  does not come and go. "Send a new code" and "Cancel" are rows with
  pictures under the field, in that order; they were two more buttons.
  What the code's field says, and that a new code was sent, stay by the
  field. On Sign-in methods and where a passkey is set up (onboarding
  too) the same form keeps its three buttons under the code, as it was:
  those pages are spec 29's.
- **Never two:** on "Download my data", while a new file is asked for
  with a code beside a file that is ready, the code's button has the bar
  and "Download the file" is not shown; Cancel brings it back. "Make a new
  file" is a row with a picture under "A new file replaces this one." On
  Notices one appeal is written at a time: opening a second notice's
  appeal closes the first, as Cancel does. What was written for a notice
  is kept while its form is closed, either way: an appeal is sent once.
- **My cars** lists the cars as rows with pictures, with "Add a car" as
  the last row; it was a card of names with a button under it. With no
  car yet, "Add a car" is the main button, in the bar. Each opens a
  page, so each is a link, as "Add my email" and "Add an email" are.
- **A row that is at work** shows it: a spinner where its chevron was,
  and no other press meanwhile. "Take a photo", "Remove photo", "Sign
  out", "Send a new code" and "Send the link again" do.
- **Email:** "Send the link again" is a row with a picture under the
  address that waits, as "Send a new code" is; it was an outlined button.
  Why it did not go is said by the row, also while a code is asked for,
  and not over "Send the link".
- **The photo's page:** "Take a photo", in the phone apps, and "Remove
  photo", red and last (R31.3), are rows with pictures under the person's
  card; they were buttons under the main one. What a row did or could not
  do is said in the page, by the rows.
- **The page an account that waits to be deleted lands on:** "Sign out"
  is a row with a picture. Why signing out failed is said by the row, and
  why the account was not kept over "Keep my account".
- **A saved password:** "Your password is saved." is the page's title,
  with focus, with nothing to go back to and "Done" as the main button; it
  was a notice under the title "Choose a password".
- **The page an email's link opens** (`/verify-email`): what the link did
  is the title, at the left and with focus ("Your email is added", "This
  link no longer works", "This email belongs to another account", "Open
  the link from your email"), with its line under it and nothing to go
  back to. The way on, "Go to your profile" or "Open PuffinRide", is the
  page's main button, a link, in the bar; it was a text link under
  centred words.
- **All rides, a place, the meeting points and a meeting point** have
  Back and their title at the left, with the line that stood centred
  under the title as the head's line: what meeting points are, what kind
  of place it is ("Town · South"), what and where a meeting point is
  ("Fuel station · Mýrdalshreppur, South"). The other lines of a meeting
  point (its name in the other language, "Also known as …", the season,
  when it was last checked), the "Sample meeting point" tag and the map's
  hint start at the left. With no rides, All rides keeps its puffin with
  the words centred under it. Until a place or a meeting point is read,
  or when it is not found, Back stands alone where the head has it.
- **A meeting point's two actions** are rows with pictures at the end of
  its page (rule 4): "Open in maps", then "Something wrong here?". They
  were an outlined button and a text link, both centred. The page has no
  main button. Both stay buttons, not links: one leaves the app, the other
  asks to sign in first. That no maps app opened is said under the rows.
- **"What's wrong here?"** has its title at the left with Back and the
  meeting point's name as its line. Once sent, the thanks are the title,
  with focus ("Thank you. We'll check this meeting point."), and "Back" is
  the main button in the bar; they were a centred title with an outlined
  button.

Where a filled button is not in the bar, and stays so: the search card's
on Find and on "Find a ride" (R31.1); "Find a ride" under the puffin of
an empty My rides; and the round button that sends, at the end of the
field in the bar of a conversation and of "Message all passengers"
(3.13). The screen test names each.

Left as they are: Blocked people's list, with an outlined "Unblock" on
each line, which undoes something and is no row that leads on; the
outlined button that confirms removing a car, in its card, as a filled
red one would be the page's second beside "Save car"; what must be
settled before deleting, a card of rows with no pictures; and "Not now"
under the password's field, a text link. On Notices, "Appeal" on a
notice's card and "Cancel" under what is written are outlined buttons in
that card: they open and close the form in the card, as "Unblock" acts on
its own line. Sign-in methods keeps its own buttons, and the code's form
as it was (spec 29).

My rides came with PR 8c (3.10).

Not changed: signing in and joining (`/sign-in`, `/onboarding` and the
invitation link), which are spec 29's; About, the legal
documents, cookies and the public pages for search engines (specs 23 and
30); the console.

### 3.20 A second press, large text, short windows, focus and screen readers

As built, the last pass, part two (plan, PR 12b, in two pull requests).
All of it was named by the reviews of earlier pull requests and left for
the last pass.

**A second press.** A screen's main button stands in the same place on
every screen (R31.1), so a second press meant for one can land on the
next: on the way on after an outcome, before the outcome is read ("Back
to the ride" where "Send report" stood; "Find another ride", under "See
in My rides", where "Send request" stood), or on the next step's button
("Publish ride" after "Check your ride", "Send request" on Booking a seat
after the ride's own).

- For half a second after a main button took a press, no main button
  takes one, and no other button of a screen's bar: the one under the
  main button stands where a lone main button stood.
- From when that press opens another page the half second starts again,
  and once more from when a main button comes after it, or the same one
  says other words. A press waits ten seconds for that and no longer:
  nobody presses a second time for a press that long ago. Words that
  change while the button pressed is busy count when it takes a press
  again.
- A main button whose words change by themselves, as with the number of
  seats, is not held. The buttons, rows and links of a page are never
  held, and only a main button's press starts a wait. The round button
  that sends a message is never held either.
- A held button looks as it did, under the pointer too. To a screen
  reader it says that it is not to be pressed, and it keeps its place and
  its focus for the keyboard: it is not switched off. A main button that
  is a link ("Add a car") opens nothing meanwhile.

**Text twice as large** (WCAG 1.4.4), on a phone 360 wide. No screen that
is measured scrolls sideways with it, and nothing stands over anything
else:

- **The menu's bar.** Each place's name stays inside its place. On the
  web a place is never narrower than the longest word of its name, and
  the places go on a second row when they do not fit beside each other
  (in English "Profile", under the other four). In the
  phone apps a word too long for its place is broken there. The icons of
  a row stand in a line whatever lines the names take: in Icelandic
  "Ferðirnar mínar" has two lines with the text as set, and its icon
  stood higher than the others.
- **The question about cookies** stands over the bar as the bar is laid
  out. Its place was counted from the bar's usual height, so it covered
  the top of a taller bar.
- **Find's name line.** Where the name, Beta and the language have no
  room beside each other, the language goes under the name, still at the
  right, and Beta under the name before either is cut. The line was 85
  wider than the screen, and the language was reached by scrolling
  sideways.
- **The road.** Where its names have no room under it (one of them takes
  two lines, or they are wider than the road together), the line a screen
  reader hears stands under the road in their place, for the eye: "Step 2
  of 4: Confirmed". So it is on a posting step, with five names, and on a
  booking, with four. The names come back when they have room, and keep a
  gap between them.
- **A ride's stops.** "Get in" and "Get out" go under their stop's name
  where the name would be left with less than most of the row, and a name
  longer than a line is broken there. With long names the page was 209
  wider than the screen.

As built, with the text twice as large on a phone 360 wide:
[Find with the menu](images/one-ride-one-ticket/built/large-text-find-phone-light.webp),
[a posting step with its road](images/one-ride-one-ticket/built/large-text-offer-phone-light.webp)
and [a ride's stops](images/one-ride-one-ticket/built/large-text-stops-phone-light.webp).
With the text as set, the Icelandic menu:
[Find](images/one-ride-one-ticket/built/find-phone-dark.webp).

**A short window.** Under 480 high, as a phone on its side or a laptop
zoomed until its window is 320 by 256, a screen's bar took much of the
height: about 88 with one button and 148 with two, more with a notice.
There the bar joins the end of the page and scrolls with it. Its buttons
stand under the page's last part, in the page's column, with no band of
their own; on a public page they stand over the website's footer. They
are the same buttons in the same order, so R31.1 holds and a second press
is held as in a bar. A conversation keeps its field under its messages at
any height, and the menu's bar stays where it is.

A phone's keyboard does not make a window short. It covers the page,
which is laid out as before, so the bar does not move each time a field
is written in. A browser inside another app can make the window itself
shorter for the keyboard: there the bar joins the page while the keyboard
is up, and a notice in it takes no focus as it is put there, or it would
take the keyboard from the field being mended.

**Where the keyboard is.** A press that brings something new puts the
keyboard, and a screen reader, on the new thing; when that closes again
they are on the button that opened it.

- **"Show all drafts"** on Offer: the keyboard is on the link of the
  first draft that came, so Enter opens it. It was on a view around the
  link, and Enter did nothing until Tab. So it is wherever what comes is
  one control and nothing else; where it is more, as a card with words
  and buttons, the whole takes focus as before.
- **Messages' menu,** behind "More" in a conversation's top: Escape
  closes it, and so does Android's back, which then stays in the
  conversation; both put focus on "More" again. A press beside the menu
  closes it too and does what it pressed: on the web a press anywhere
  outside the top, in the phone apps a touch in the conversation. A row
  of the menu that opens a page leaves the menu closed for the way back.
- **"Add a meeting point"** on the first step of offering a ride: as its
  screen takes the step's place, focus goes to its title; when it closes,
  with a point chosen or by Back, focus is on "Add a meeting point"
  again. On Edit's "Add a stop", choosing's title takes focus when
  "Choose another meeting point" brings choosing back, and not as the
  page opens, when the page's own title has it.
- **Profile on a laptop:** who I am stands at the left, and now comes
  first for the keyboard and a reader too, before the rows at its right
  (spec 18, 3.12). The other pages with two columns keep the main one
  first, as it stands at the left there.

**What a screen reader hears.**

- **The driver's card** on a ride has a heading: the driver's name, read
  as "Driver: Anna". A card has no title to see, and the name alone did
  not say who Anna is. For members signed in the driver's line is a link
  to the profile, and its name starts with "Driver" too: a phone's screen
  reader stops at the link and not at the heading in it.
- **A person's name** on the card of a profile, mine or another's, is a
  heading, so the list of headings has the person and not "Profile" and
  "Reviews" only.
- **"Where you sit"** is read before its picture on the web: the heading
  and its line, then the car. They look as they did, the car at the left.
  (In a phone's app a screen reader goes by where things stand, and meets
  the car first.)
- **A ticket that is not pressed** says which end is which: "Get in" and
  "Get out" on a ride I look at, book or have booked, "From" and "To" on
  a ride I offer. On the web the words stand before each end's time,
  heard and not seen; a phone's app says them with the time, "Get in:
  10:00". On Booking a seat "Driver" comes before the name in the
  ticket's foot in the same way. They are words and not the name of a
  group around the end, which the screen readers of phones, VoiceOver and
  TalkBack, do not say. A ticket that is pressed is one button with one
  line, as before.
- **A row that only shows** something, as the phone number on Profile,
  is one stop for a screen reader in a phone's app, which reads its title
  and then its value. They were two. The web reads the two after each
  other, as before.

**Smaller.** A chip is 44 high on the web, where nothing can be pressed
beyond what is drawn; in the phone apps it stays 40 high with 44 to tap.
The page where a driver cancels a ride has a journey that reads the
bar's notice and where focus goes, as cancelling a booking has. And the
words of a notice over a main button have a rule (spec 15, `ActionNotice`):
plain words only where the screen takes them away as the button is
pressed again; what is said without leaving the press, as "Choose a
reason.", is said again on each press.

Left, for the last part or later: arrow keys between the choices of a
group where one is chosen, as the two languages (each is a stop for Tab
today); in Messages, with text twice as large on a phone 360 wide, the
field's "Write a message" cut to "Write a" until something is written,
and its five lines counted in the text as set; the browser's Back with
the screen of a meeting point open, which leaves the step; on Find, the
yellow card beside the rides on a laptop, which a reader meets after
them; Messages' menu closes as a press beside it begins, so something in
the conversation that moved as the top got lower would lose its press
(nothing there is pressed today: a message is reported by a long press),
and in a phone's app on a tablet a touch on my conversations beside the
open one leaves the menu open. "After Show all rides focus goes to the first ride" no longer
applies: it opens the All rides page, which has its own title. To hear
on a phone, and in NVDA on Windows, which cannot be done from here: what
is said of a main button just pressed while it waits, and the lines
above as VoiceOver and TalkBack say them (3.22 says what Martin was
asked and answered on 2026-11-27, and what stays unheard). Seen and left: with text twice
as large on a phone 360 wide the words of "Where you sit" stay beside the
car, in a column of some ten letters; narrower than that they go under it.

As built, a phone on its side, 740 by 360:
[a ride](images/one-ride-one-ticket/built/short-window-ride-phone-light.webp)
and [its end, with the page's button](images/one-ride-one-ticket/built/short-window-ride-end-phone-light.webp).
With the text twice as large on a phone 360 wide:
["Where you sit"](images/one-ride-one-ticket/built/large-text-where-you-sit-phone-light.webp).

### 3.21 The last small things

Small things the reviews of the build named, mended at its end.

- **An address the app does not have,** as an old link or one with a
  mistake in it, has a page of our own: the title "We can't find this
  page" at the left, a line under it, the puffin of a screen with nothing
  on it, and "Find a ride" as the main button in the bar, which leads to
  Find. Find takes the page's place, so going back from Find does not
  show the page again. Back, beside the title, leads where one came from,
  or to Find for someone who opened the address itself. It is open to
  everyone, in the language shown, and not for search engines. Before,
  the router showed its own page: black, in English, with a link to a
  list of every address. That list is turned off, so its address,
  `/_sitemap`, shows this page too.
- **"New driver"** in a ticket's foot and on the driver's card is a quiet
  tag, grey on the page's colour, where a rating would stand. It was
  amber, which rule 6 keeps for what is yours and now. On a request to a
  driver, "No reviews yet" stays in the yellow card's own amber.
- **A ride that was cancelled** (3.7) has no seats to choose, no "Where
  you sit" and no price: nothing is left to pay for. Its page keeps the
  ticket, who drove, the route and "This ride was cancelled." in the bar,
  from its left. On a laptop the price and the line about free seats go
  with the stepper.
- **After blocking someone** (spec 9, 3.2), the line under the title
  counts the bookings and requests the two still hold. One that is
  cancelled, withdrawn or declined from that screen stays as its ticket
  and is no longer counted; with none left the line goes.
- **Messages' menu** (3.13) stands on the page's colour, so its rows, a
  white card, are set apart from the white bar they open in.
- **A draft with no route left** (3.11). A meeting point that goes out of
  use is taken off a draft (spec 3, 3.9), which can leave it one stop or
  none. Its row on Offer then says "No route yet" where it said " → ",
  and opens the draft at its route, with the one stop left as where it
  starts. On a laptop "Your ride so far" keeps Time as a step to come:
  one stop's time is not the ride's.
- **A notification** about beta news, about a reply to my feedback, or
  about an answer to a question on my data, opens its page when tapped
  in the phone apps. The tap did nothing. The pages a notification may
  open are one list now (`notificationScreens` in
  `packages/contracts`), which the API names them from and the app
  opens them by, so a page named on one side alone cannot happen again.
- **"Find another ride"** has one name in Icelandic too, "Finna aðra
  ferð", on a booking that ended as after "You're booked" (3.4). The
  first said "Leita aftur", "Search again".

Kept as it is: on Find on a laptop the yellow card stands beside the
rides, at their right, and the keyboard and a reader meet it after them,
as the eye does.

Left: an address the app does not have is answered as any page of the
app is, with the status 200 and not 404, since the server does not know
the app's addresses. Search engines are told not to list it, twice (the
page's `noindex` and the server's `X-Robots-Tag`); a tool that checks
links by their status would not see a dead one.

As built:
[an address the app does not have](images/one-ride-one-ticket/built/not-found-phone-light.webp)
and [Messages' menu](images/one-ride-one-ticket/built/chat-menu-phone-light.webp).

### 3.22 Against the drawings

At the end of the build each of the proposal's thirteen drawings was laid
beside the screen as built: Find, the results, a ride, a booked seat,
trip day, My rides, Check and publish, a conversation, Profile and the
driver's ride on a phone, Find in the dark and in Icelandic, and Find
and the driver's ride on a laptop. The 84 pictures that
`e2e/pictures.spec.ts` takes of the app, in
[images/one-ride-one-ticket/built/](images/one-ride-one-ticket/built/),
were taken again from the finished build. 62 came out different (days and
times, the quiet "New driver" tag, the menu's chosen place); each was
looked at and replaced. 22 came out the same to the pixel. The four
pictures of the parts' page (`parts-*`) are not that run's and stay as
they were.

**Mended, one thing.** On a laptop a ride I drive keeps My rides chosen in
the menu, as drawn: My rides lists the ride, and its Back leads there. The
menu showed Offer, as it does for every other address under `/drive`. The
screens the ride opens follow it: editing it, cancelling it, a message to
all passengers and "Share this ride". The steps of posting and "Your ride
is published" stay Offer's; the menu takes the steps from the one list
posting has of them (`stepNames`), so a step added later is Offer's too.
The mend was made after the release of 2026-11-27 (#257 to #278) and
goes to puffinride.is with the release after it.

**What differs from a drawing, and stays.** Each for a reason an earlier
section gives. This is what was seen with the pictures side by side, on
the thirteen screens drawn; it is not a proof that nothing else differs.
The people and rides in the built pictures are the test server's, new
members with no ratings yet.

- **Find.** "Your next ride" stands under the search only when the yellow
  card is about another ride (3.5, item 2); the drawing shows one ride in
  both. Find on the website ends with the website's footer (spec 30),
  signed in or not, which came after the drawings, and "Beta" stands
  beside the name (spec 12). Signed in on a laptop, the greeting stands
  in the scene and the yellow card beside the rides (3.16); the drawing
  is of a visitor's Find. The link over the rides leaving soon says "See
  all rides" on a phone as on a laptop; the phone's drawing has "See
  all".
- **A ticket's foot.** "New driver" is a quiet tag (3.21); it is drawn in
  amber.
- **The menu in Icelandic.** The places have their whole names (3.4),
  "Ferðirnar mínar" and "Bjóða far", and on a phone the first takes two
  lines (3.20). The drawing has "Ferðir" and "Bjóða".
- **A ride.** "The whole route" has no distance beside it: a ride has
  none in the API (3.7). The route lists the stops before and after my
  part too, in grey, with a line on how to change where I get in. What
  the driver is fine with stands in outlined bubbles, spec 15's own part
  for it (`NeedBubble`); it is drawn with no outline. "Free cancellation"
  and "Weather and roads" open in their place, so their arrows point
  down.
- **A booked seat and trip day.** "Message" and "I'm here" are words with
  no picture before them. On trip day the seat's ticket stays, under the
  driver. The line about paying the driver shows on a seat that is paid
  in person, which the booking itself says
  ([ADR 0038](../decisions/0038-pay-the-driver-in-person-until-card-payments.md));
  the test server's bookings are not. The rows say "Share the ride's
  details" and "Report a problem with this ride" (3.4).
- **My rides.** Coming up and Past are two chips, drawn as one control of
  two halves. In a ticket's foot the seats taken stand at the left and
  what needs me at the right.
- **The driver's ride.** Its rows have no heading ("Manage" in the
  drawing), and hold "Share the ride's details" and "Weather and roads"
  too, which the Safety card held (3.12). On a laptop "Share this ride"
  is the round button on the ticket and not a row as well (3.16). The
  line under the title is one thing, the first that is true (3.12): with
  a request waiting it says "1 request needs your answer." and no day,
  where the laptop's drawing has the day before it. The car on a
  driver's own screens, here and on Check and publish, reads "Toyota
  Yaris, white", as My cars lists it; it is drawn "White Toyota Yaris",
  which is what a passenger reads.
- **Profile.** The title is "My profile", as a person's is "Profile"
  (3.19). The card also has the languages I speak and the links to change
  or remove my photo. The row to the ways of signing in keeps the name
  its page has, "Sign-in methods" (3.14); it is drawn "Ways to sign in".
  A line under Account says who sees the phone number.
- **A conversation.** As drawn, with the line on how to report a
  message and "Sent with the request" over the words that came with one
  (3.13).

**Left.** The [plan's list for PR 12](../plans/2026-11-26-one-ride-one-ticket.md#pr-12-the-last-pass)
has every item with where it was found; these are the ones with someone
to take them, and the ones that change what a screen does.

- **For Martin:** the legal texts named "Settings", a place the app no
  longer has (the Terms twice, the Privacy Policy four times, in each
  language), and the Privacy Policy "Terms, rules and privacy", which
  About replaced (spec 30). Done on his word of 2026-11-27: the Terms'
  version 3 and the Privacy Policy's version 4 say "in Profile, under
  Notifications" and the like, as the app's own texts do, and a test
  holds the newest texts to the names the app gives its pages
  (`apps/api/src/legal-places.test.ts`). Neither is material, so nobody
  accepts anything again; they are on puffinride.is with the release
  after, and then Martin announces them in the console, as the Terms
  promise for a smaller change (16.1). Listening to the screens: Martin
  was asked for a listen on a real phone with VoiceOver or TalkBack, and
  for typing in a conversation on an iPhone and on Android, and answered
  "listen is alright, mark resolved" (2026-11-27). The item is closed on
  that. The build names and orders what a screen reader meets (3.20); no
  cloud session has heard it or opened the phone apps. He was not asked
  about the particulars, so as far as these docs know nobody has heard
  or seen them: NVDA on Windows, the strip under a conversation that is
  loading or could not be read, and whether VoiceOver says "Write a
  message" twice for the empty field. Q31, which pages close for an
  account that waits to be deleted, is answered as recommended (A59 in
  [open questions](../strategy/open-questions.md), Martin, 2026-11-27):
  Report and the two pages that block a person close, as the other pages
  do, and Notices from PuffinRide stays open. "What's wrong here?" for a
  meeting point, a fifth page of the same kind found when this was
  built, closes with them.
- **For spec 29's thread:** the ride over the sign-in form as a ticket
  (3.15); Sign-in methods' "Change email" in the middle of its page; and
  whether focus moves on that page, which has two `TakesFocus` in one
  place with no key.
- **For a native Icelandic reader:** the status words as titles, "Check
  and publish" as a whole, "bílstjóri" beside "ökumaður", and the smaller
  wordings the plan lists under PR 12.
- **What a screen does, not how it looks:** at 23:35 the time wheel for
  today opens at 00:05, which has passed; on the first step of posting
  the browser's Back leaves the step with the picker of a meeting point
  open; a posting step opened by its address for a ride that is already
  published shows the step; and a draft opened at the address of a ride
  I drive (`/drive/trips/<id>`, which nothing in the app links to) shows
  the ride's page with Back to My rides, and now My rides chosen, though
  drafts are listed on Offer. That page would better lead to the draft's
  step, as "Your ride is published" does for one.
- **Left as it was, on a laptop:** My cars and the driving licence show
  Offer chosen in the menu. Profile lists them, and Offer's last step
  opens them before a first ride, so they have two homes; nothing was
  changed.
- **Smaller things the reviews named:** among them Find on a phone
  moving down a ticket's height when my rides arrive after the rides
  leaving soon, the laptop's side column on the driver's trip day
  reaching past a window 720 high, a placeholder of two lines in a
  conversation's field with text twice as large, and code that serves
  several screens from one screen's folder.
- An address the app does not have answers 200, not 404 (3.21).

## 4. Rules

No business rule changes. Booking, seats (rules S1 to S4), prices and their
caps, payment deadlines (M1), cancelling and the trip's earnings limit work
as today. The posting form still needs a photo, a car and the licence
declaration before publishing (spec 3, R3.1 and R3.2; spec 16, 3.6).

- **R31.1** A screen has at most one main button: the tall filled one,
  in the bar at the bottom on a phone, at the top of the side column on a
  laptop, and in the search card on Find. The only other filled buttons
  are those of `NeedsYouCard`s, one for each thing that needs me (a
  request's Accept, "See the request"). A screen test counts them: one
  main button at most, and no filled button outside a `NeedsYouCard`.
  A screen that stays one column on a laptop (spec 18, 3.15) keeps the
  bar there. As built (PR 12a), the test opens every page a signed-in
  member reaches and says what its one main button is, or that it has
  none, and where it is: the bar; the
  search card, on Find and on "Find a ride"; under the puffin of an empty
  My rides; and, round, at the end of the field in a conversation's bar.
  A part of a page that keeps its own state, as a form does, puts its
  button in the screen's bar (`InBar`). As it stands in the same place on
  every screen, a main button takes no press for half a second after one
  was pressed, nor does another button of the bar (3.20). The round
  button that sends a message is not held: it is pressed again and again.
- **R31.2** A ride is shown as a `RideTicket` wherever a member sees it in
  a list or as a summary.
- **R31.3** An action that cannot be undone is a red row, last in its
  card, and still asks before it acts, as today. Where it asks, the main
  button is red when pressing it takes something away (cancelling,
  withdrawing, blocking), and moss when it tells PuffinRide what happened
  (3.19).
- **R31.4** Sun yellow as a card's colour is kept for what needs the
  member now, and amber as a tag's for what is theirs to do. Neither is
  used for decoration or for a problem (those are red).

## 5. Screens

Each screen as it is now beside the proposal, the first screen and the
whole of it, is on the [proposal page](https://claude.ai/artifact/3hMRPHSfiQxqVFkhtdAQtx)
and in [images/one-ride-one-ticket/proposal/img/](images/one-ride-one-ticket/proposal/img/)
(`now-…` and `new-…`; `-first` is the first screen). The drawings use the
app's own fonts, icons and drawings; fictional people and rides only.

| Screen | Now | Proposed |
| ------ | --- | -------- |
| Find, signed in | [now-find](images/one-ride-one-ticket/proposal/img/now-find.webp) | [new-find](images/one-ride-one-ticket/proposal/img/new-find.webp) |
| Search results | [now-results](images/one-ride-one-ticket/proposal/img/now-results.webp) | [new-results](images/one-ride-one-ticket/proposal/img/new-results.webp) |
| A ride's details | [now-trip](images/one-ride-one-ticket/proposal/img/now-trip.webp) | [new-trip](images/one-ride-one-ticket/proposal/img/new-trip.webp) |
| A booked seat | [now-booking](images/one-ride-one-ticket/proposal/img/now-booking.webp) | [new-booking](images/one-ride-one-ticket/proposal/img/new-booking.webp) |
| Trip day | [now-trip-day](images/one-ride-one-ticket/proposal/img/now-trip-day.webp) | [new-trip-day](images/one-ride-one-ticket/proposal/img/new-trip-day.webp) |
| Offering, last step | [now-offer](images/one-ride-one-ticket/proposal/img/now-offer.webp) | [new-offer](images/one-ride-one-ticket/proposal/img/new-offer.webp) |
| The driver's ride | [now-driver-ride](images/one-ride-one-ticket/proposal/img/now-driver-ride.webp) | [new-driver-ride](images/one-ride-one-ticket/proposal/img/new-driver-ride.webp) |
| My rides | [now-my-rides](images/one-ride-one-ticket/proposal/img/now-my-rides.webp), [My trips](images/one-ride-one-ticket/proposal/img/now-my-rides-2.webp) | [new-my-rides](images/one-ride-one-ticket/proposal/img/new-my-rides.webp) |
| A conversation | [now-chat](images/one-ride-one-ticket/proposal/img/now-chat.webp) | [new-chat](images/one-ride-one-ticket/proposal/img/new-chat.webp) |
| Profile and settings | [now-profile](images/one-ride-one-ticket/proposal/img/now-profile.webp), [Settings](images/one-ride-one-ticket/proposal/img/now-profile-2.webp) | [new-profile](images/one-ride-one-ticket/proposal/img/new-profile.webp) |
| Find, laptop | [now-laptop-find](images/one-ride-one-ticket/proposal/img/now-laptop-find.webp) | [new-laptop-find](images/one-ride-one-ticket/proposal/img/new-laptop-find.webp) |
| The driver's ride, laptop | [now-laptop-driver-ride](images/one-ride-one-ticket/proposal/img/now-laptop-driver-ride.webp) | [new-laptop-driver-ride](images/one-ride-one-ticket/proposal/img/new-laptop-driver-ride.webp) |
| Find, Icelandic and dark | | [new-home-is-dark](images/one-ride-one-ticket/proposal/img/new-home-is-dark.webp) |

How the pictures were made, and how to make them again:
[images/one-ride-one-ticket/src/](images/one-ride-one-ticket/src/README.md).

## 6. Data and API

No new tables and no new endpoint: every screen shows what it shows
today, in another order and shape. One thing is missing from what Find and
My rides load, named below.

- What needs me (3.3, item 3) is worked out from my upcoming bookings and
  the rides I drive (`GET /v1/me/bookings` and `GET /v1/me/trips` with
  `when=upcoming`), which Find and My rides already load and merge (spec
  16, section 6). They carry what the three kinds need: a booking's
  status, `paymentDueAt` and `tripDay`; a ride's `openRequests`,
  `requestsCloseAt` and `phase`. Which comes first, and its kind, is a
  function in `packages/domain`, used by Find and My rides alike; it
  takes the place of `needsYou` in `my-rides/rides.ts`.
- **Missing today:** "Dóra asks for 1 seat, Mjódd to Selfoss" names the
  person, the seats and the part asked for. A ride in `GET /v1/me/trips`
  carries only the number of requests and their first deadline. Working
  choice (decision 14): the ride gains `firstRequest`, the first name,
  the seats and the two stops of the request that closes first, which the
  driver already sees on the ride. With more than one request the card
  says "2 requests to answer". Built so: `firstRequest` is null when no
  request waits, and its first name is null where there is none. Of two
  requests that close at the same minute it is the one sent first. It is
  read with the number of requests and their first deadline in one go, so
  the three always agree.
- A rating to give is known from a finished booking's `review`, which My
  rides loads under Past. Find loads upcoming rides only, which is why a
  rating is not raised there (decision 9). **Missing for a ride I
  drove:** a ride in `GET /v1/me/trips` said nothing of its passengers'
  reviews. Built so: the ride gains `toRate`, the IDs of its completed
  bookings the driver can still rate, in the order they were made, and
  `closesAt`, when the last of those times ends; null when there is none.
  A booking counts while its 14 days run (`reviewsOpenSince` in
  `packages/domain`), the driver has not reviewed it, no report on it
  waits to be decided and its passenger has not left: what the server
  asks before it takes a review (R8.8). It says nothing new to the
  driver, who sees the same on the ride's page.
- "1 of 3 taken at the busiest, Mjódd to Selfoss" (3.12) comes from the
  seats taken on each stretch, which the driver's ride already has; naming
  the busiest stretch is a function in `packages/domain`.
- A request's "11 h left to answer" comes from `requestsCloseAt` on Find
  and My rides, and from the request's own deadline on the driver's ride.
- Two new addresses, `/settings/language` and `/settings/notifications`
  (3.14); `/drive/trips` and `/settings` lead to My rides and Profile.
- The plan checks each of these against the API before the first pull
  request; a field that turns out to be missing is added there, and named
  in the plan.
- Added for the route on a booked seat (3.8, 2026-11-28): a booking
  gains `route`, where each stop of its ride is (in order, the stops on
  the ride now) and my part as places in that list, `board` and `alight`.
  It is null where a stop of the part was taken off the ride since (spec
  6, 3.2), and on a booking that ended before its ride, which follows the
  ride no further, as its `changes` do not. The contract gives null when
  the field is missing, so an app newer than its server shows no map
  instead of failing. It says nothing new: the stops are meeting points,
  which everyone can see, and the ride's details list them to the
  passenger while the booking holds a seat. The ride I drive already has
  its stops. On a wide
  page the map is a band (`wideShape` in `packages/ui`), where a phone's
  column keeps the shapes of before (`columnShape`).
- Found while building the result ticket: a ride found carried its
  driver's name, photo and rating, but not the `colour` of the circle
  that stands in for a photo (spec 15, 4.2), which a booking and a
  conversation already carry. `TripSearchResult.driver` gains `colour`,
  so the same driver has the same circle in the results as on their ride.
  It says nothing new about anyone: the colour is worked out from the
  account, as everywhere else.

## 7. Privacy and safety

- Nothing new is collected or stored, and nobody sees what they cannot
  see today. `firstRequest` (section 6) gives a driver, in the list of
  their own rides, the first name of someone asking for a seat, which the
  ride itself already shows them. The number plate still shows only once
  the seat is confirmed; a phone number never shows.
- Report and Block stay two presses away at most: in a conversation's
  menu, on a person's profile, and as a row on a booking and a ride's
  details. The safety line in a conversation stays.
- Asking before cancelling, declining or blocking stays as it is.
- Pictures in this spec show fictional people, rides and addresses made by
  the test server.

## 8. Texts

New and changed texts, both languages; the Icelandic is for Martin or a
native speaker to check. Every other text keeps its key.

| Text | English | Icelandic |
| ---- | ------- | --------- |
| Greeting on Find | Hi {name} | Hæ {name} |
| A request needs me | {name} asks for {count, plural, one {# seat} other {# seats}} | {name} biður um {count} sæti |
| Its detail | {route}, {day}. {time} left to answer. | {route}, {day}. {time} eftir til að svara. |
| Its button | See the request | Sjá beiðnina |
| Several requests | {count} requests to answer | {count} beiðnir bíða svars |
| A seat to pay for | {name} said yes: pay to keep your seat | {name} samþykkti: greiddu til að halda sætinu |
| Its detail | {route}, {day}. Pay by {time}. | {route}, {day}. Greiddu fyrir kl. {time}. |
| A ride on its trip day, and the trip day's title | Leaves in {minutes} minutes; Leaves at {time} | Brottför eftir {minutes} mínútur; Brottför kl. {time} |
| Its button | See your ride | Skoða ferðina |
| More that needs me | and {count} more | og {count} í viðbót |
| Tags on my rides | You drive, Passenger | Þú ekur, Farþegi |
| A booking's road | Asked, Confirmed, Trip day, Done | Beiðni, Staðfest, Ferðadagur, Lokið |
| The posting road | Route, Time, Seats, Price, Check | Leið, Tími, Sæti, Verð, Yfirlit |
| Driver's title | Your ride to {place} | Ferðin þín: {from} → {to} |
| A route in a title | {from} to {to} | {from} → {to} |
| Details | Where you sit, The whole route | Hvar þú situr, Öll leiðin |
| Seats, one line | {taken} of {seats} taken at the busiest, {from} to {to} | {taken} af {seats} upptekin þar sem mest er, {from} → {to} |
| Its link | Each stretch | Hver leggur |
| Seats with a request | If you accept, {taken} of {seats} seats are taken from {from} to {to} | Ef þú samþykkir eru {taken} af {seats} sætum upptekin: {from} → {to} |
| Last step | This is how people will see your ride. | Svona sér fólk ferðina þína. |
| What is missing | One thing before your first ride | Eitt eftir fyrir fyrstu ferðina |
| Its detail | Photo and car are done. Your driving licence is left. | Mynd og bíll eru komin. Ökuskírteinið er eftir. |
| Publishing | Publish ride | Birta ferð |
| Laptop heading | Drive it again | Aka aftur |
| End of results | That's every ride found | Ekki fundust fleiri ferðir |
| Profile groups | Driving, Account, Safety and privacy, Help | Akstur, Aðgangur, Öryggi og persónuvernd, Aðstoð |
| Drafts on Offer | Show all drafts | Sýna öll drög |
| Several passengers to rate | Rate your passengers | Gefðu farþegunum einkunn |
| A draft with no time | No time yet | Enginn tími enn |
| A passenger's row | See profile | Skoða prófíl |

Three Icelandic texts are not as first written here, and the table shows
them as built. "Each stretch" is "Hver leggur", not "Hver áfangi": the app
calls a stretch "leggur" everywhere else. A ride leaves with "Brottför eftir … / Brottför kl. …":
"fer eftir" also reads as "depends on", and the results already say
"brottför kl.". The end of the results says "Ekki fundust fleiri ferðir":
"Þetta eru allar ferðirnar" would be followed by a line offering "allar
ferðir á næstunni", every ride and then more of them.

Texts added while building, as they are in the app:

| Text | English | Icelandic |
| ---- | ------- | --------- |
| A detail with nothing after the day | {route}, {day}. | {route}, {day}. |
| What needs me, as a ticket's yellow tag | Answer {name}'s request; {count} requests to answer; Pay to keep your seat; Pay by {time}; Pay by {time} tomorrow | {name} bíður svars; {count} beiðnir bíða svars; Greiddu til að halda sætinu; Greiddu fyrir kl. {time}; Greiddu fyrir kl. {time} á morgun |
| More that needs me, as the link's name | and {count} more: open My rides | og {count} í viðbót: opna Ferðirnar mínar |
| Heading over my next ride | Your next ride | Næsta ferðin þín |
| A seat's foot | Waiting for {name}'s answer; Seat confirmed | {name} á eftir að svara; Sæti staðfest |
| The whole ride, on a part of it | {driver} drives {from} → {to} | {driver} ekur {from} → {to} |
| How it works (a laptop, signed out) | How it works | Svona virkar þetta |
| Its first step | Find a ride: Choose where from, where to and the day. | Finna far: Veldu hvaðan, hvert og hvaða dag. |
| Its second step | Book a seat: At once, or the driver says yes first. | Bókaðu sæti: Strax, eða ökumaðurinn samþykkir fyrst. |
| Its third step | Meet and go: Get in at a meeting point, at the time the ride shows. | Hittist og leggið af stað: Þú sest inn á mótsstað, á þeim tíma sem ferðin sýnir. |
| Its line for drivers | Driving somewhere? Offer the empty seats in your car. | Ertu að keyra eitthvert? Bjóddu lausu sætin í bílnum þínum. |
| The sorting chip's name | Sort: {order} | Röðun: {order} |
| The Filters chip | Filters; Filters: {count} on | Síur; Síur: {count} virk (virkar) |
| The first rides only | These are the first {count} rides | Þetta eru fyrstu {count} ferðirnar |
| The end card's second line | Try another day, or see every ride leaving soon.; You can also see every ride leaving soon.; Choose a day to see others.; Filter by time of day to see others. | Prófaðu annan dag, eða skoðaðu allar ferðir á næstunni.; Þú getur líka skoðað allar ferðir á næstunni.; Veldu dag til að sjá fleiri.; Síaðu eftir tíma dags til að sjá fleiri. |
| The end card's link | All rides | Allar ferðir |
| The ticket of my part | Your part of the ride | Þinn hluti ferðarinnar |
| The seats on a phone | {count} free on your part | {count} laust (laus) á þínum hluta |
| The line of "Where you sit" | {free} of {offered} seats are free. Seats are not numbered: you agree in the car. | {free} af {offered} sætum eru laus. Sætin eru ekki númeruð: þið semjið um þau í bílnum. |
| The cancellation row | Free cancellation; Up to {time} before | Ókeypis afbókun; Allt að {time} áður |
| The row of a ride paid in person | Paying; Cash or bank transfer | Greiðsla; Reiðufé eða millifærsla |
| The row of the Safety links | Weather and roads | Veður og færð |
| Under the title of a seat to pay for | Your seat is held until {time}.; Your seat is held until {time} tomorrow. | Sætið er frátekið fyrir þig til kl. {time}.; Sætið er frátekið fyrir þig til kl. {time} á morgun. |
| Under the trip day's title | Today at {time} from {stop}.; At {time} from {stop}. | Í dag kl. {time}. Mótsstaður: {stop}.; Kl. {time}. Mótsstaður: {stop}. |
| Under the driver's title | {count} request needs your answer.; {count} requests need your answer. | {count} beiðni bíður svars.; {count} beiðnir bíða svars. |
| The driver's ticket, after the price | the whole way | alla leið |
| Beside "Passengers" | {count} confirmed | {count} staðfest; {count} staðfestar |
| The seats card | Seats; {taken} of {seats} taken; at the busiest, {from} to {to} | Sæti; {taken} af {seats} upptekið (upptekin); þar sem mest er, {from} → {to} |
| A request's message | “{message}” | „{message}“ |
| Before "I'm here" opens, for the driver | At {stop} you can say you're here from {time}. | {stop}: þú getur sagt að þú sért á staðnum frá kl. {time}. |
| Under the name in a conversation | Driver; Driver, {car}; Passenger | Bílstjóri; Bílstjóri · {car}; Farþegi |
| The menu of a conversation's top | More | Meira |
| The day and the time on a conversation's ride line | {day}, {time} | {day} kl. {time} |
| The button in the person's card on Profile, named "Edit profile" | Edit | Breyta |
| Where the page an email's link opens leads on, signed in, whether or not the email was added | Go to your profile | Fara í prófílinn þinn |
| The title of a person's profile | Profile | Prófíll |
| After sending feedback, the title and its line (one text until now) | Thank you. We got your feedback.; If we reply, you'll see it under My feedback in Profile. | Takk fyrir. Við fengum ábendinguna þína.; Ef við svörum sérðu svarið undir Ábendingarnar mínar í Prófílnum. |

Texts that named Settings name the place on Profile since 3.14 was built:
in the app, in three emails and in the console. Only the part that
changed is shown; the Icelandic says "í Prófílnum, undir …".

| Text | English | Icelandic |
| ---- | ------- | --------- |
| After sending feedback | … under My feedback in Profile. | … undir Ábendingarnar mínar í Prófílnum. |
| A device's sign-in that is not set up | … set it up again in Profile, under Sign-in methods. | … settu hana svo upp aftur í Prófílnum, undir Innskráningarleiðir. |
| An email link that no longer works | Ask for a new one in Profile, under Email. | Biddu um nýjan í Prófílnum, undir Netfang. |
| An email another account uses | Add a different one in Profile, under Email. | Bættu öðru við í Prófílnum, undir Netfang. |
| The email page opened without its link | … your email is in Profile. | … er netfangið þitt í Prófílnum. |
| In a conversation with someone I blocked | You can unblock them in Profile, under Blocked people. | Þú getur opnað aftur í Prófílnum, undir Lokað á. |
| After reporting | … in Profile, under My reports. | … í Prófílnum, undir Tilkynningarnar mínar. |
| The foot of a beta news email | Turn off beta news in Profile, under Notifications. | Þú getur slökkt á fréttum af beta-prófuninni í Prófílnum, undir Tilkynningar. |
| The email that confirms an address | … ask for a new one in Profile, under Email. | … geturðu beðið um nýjan í Prófílnum, undir Netfang. |
| The email about a changed way to sign in | … sign out on all devices in Profile, under Sign-in methods, … | … skrá þig út á öllum tækjum í Prófílnum, undir Innskráningarleiðir, … |
| The console, with no address to send to | Add one in PuffinRide, in Profile under Email. | Bættu því við í PuffinRide, í Prófílnum undir Netfang. |
| Who a name is, for a screen reader (3.20) | Driver | Bílstjóri |
| An address the app does not have (3.21) | We can't find this page | Við finnum ekki þessa síðu |
| Its line | The link may be old, or the address may have a mistake in it. | Hlekkurinn gæti verið gamall eða villa í slóðinni. |
| A draft with no route left (3.21) | No route yet | Engin leið enn |
| On a booking that ended (3.21) | Find another ride | Finna aðra ferð (it was "Leita aftur") |

Gone with Settings: its title and the row that opened it, "Your account",
"Add an email" and "Change your email" as rows, "Go to Settings", the
line on Profile that said what was in Settings, and the headings "Safety"
and "Feedback".

Texts that exist are reused where they say the same: "Rate the driver",
"Rate your passenger", "Pay", "Delete draft", "My reports", "Notices",
"My feedback", "Legal documents", "Message all passengers".

Icelandic place names change form after "til" ("til Víkur"), so an
Icelandic title names a route with the arrow it has today and never puts a
place after a preposition.

## 9. Testing

- **Unit:** the two domain functions of section 6; `firstRequest` and
  `toRate` in the API, each with its integration tests; every new key in
  both languages.
- **Screen tests** (`renderApp`), written first for each pull request: a
  ticket's parts for each kind of ride; the road's step and its label for
  screen readers; Find with each kind of thing that needs me, with a
  next ride and with neither; on each changed screen one main button and
  no filled button outside a `NeedsYouCard` (R31.1); destructive rows
  last (R31.3); a passenger's row unfolding to what it offers today; every
  draft on Offer; `/drive/trips` and `/settings` leading to My rides and
  Profile; each status tag's kind (3.3, item 3).
- **Web journeys** (Playwright): the existing journeys keep passing with
  the new names; one new journey reads the trip day's first screen on a
  phone and finds "I'm here" inside it.
- **Look:** each pull request adds its screens, phone and laptop, light
  and dark, English and Icelandic, to
  [images/one-ride-one-ticket/](images/one-ride-one-ticket/) for Martin to
  compare with the drawings.
- **Accessibility:** contrast of text on `warningSoft` and of the road's marks
  checked in both themes; the tear line and the road are decoration and
  hidden from screen readers; focus order follows the reading order.

## 10. Out of scope

- A new look, new drawings, a new logo.
- New features: seat picking, saved searches, a map in the results on a
  phone, push notifications.
- Sign-in and sign-up (spec 29), the console, emails, the marketing pages'
  texts, About and the footer (spec 30).
- The phone apps' builds: the same screens serve them, and they are checked
  when the apps are built.

## Decisions

Working choices, for Martin to change:

| # | Question | Working choice |
| - | -------- | -------------- |
| 1 | Which way? | B, "One ride, one ticket" (3.1). **Martin chose it on the thread's card, 2026-11-26** |
| 2 | Titles | At the left on screens where you do something; centred on Find on a phone, empty screens and About (3.17). Changes the choice of 2026-11-14 |
| 3 | Profile and Settings | One page of grouped rows (3.14) |
| 4 | My trips | Goes; My rides lists both (3.10) |
| 5 | Ride or trip? | "Ride" in every English text a member reads, except "Trip day" (3.4) |
| 6 | Steps of offering a ride | The road with the car instead of the five bars (3.11) |
| 7 | Find, signed in | What needs me, else my next ride, over the search; the next ride under the search when something needs me (3.5). Changes spec 16, 3.2, item 2, where the next ride always comes first |
| 8 | Order of building | Defects; the parts and the tags; Find and results (with All rides and a place); a ride and booking a seat (with "You're booked"); a booked seat and trip day (with cancelling, the reports and rating); the driver's ride and My rides (with Edit trip, cancelling a ride and sharing); offering (with the drafts and "Your ride is published"); Messages; Profile (with a person's profile and the pages under Settings); a last pass over laptop, dark and Icelandic. Each is a pull request to staging; production on Martin's go |
| 9 | Is a rating something that "needs you"? | No: a request to answer, a seat to pay for and a ride on its trip day are. A rating is asked on the booking, under Past and by email (3.3, 3.10). The proposal page listed it at first; Find does not load finished rides |
| 10 | Status tags | They follow rule 6: declined, expired, cancelled and withdrawn become quiet, "Did not show up" red, and paying stays amber (3.3, item 3) |
| 11 | A passenger on the driver's ride | The row unfolds in place to See profile, Cancel booking and Report, with Message as a button on the row. Those three take one press more than today; there is no new screen (3.12). As built the order is See profile, Report, Cancel booking: what cannot be undone is last (R31.3) |
| 12 | Language, notifications and the phone number | Language and Notifications get a page each; the phone number is a row that opens nothing (3.14) |
| 13 | The screens that are not drawn | They keep what they hold and take the rules with their flow (3.19) |
| 14 | Naming who asks for a seat, on Find and My rides | A ride in my list gains `firstRequest` in the API (section 6). For "Rate your passenger" under Past it also gains `toRate`, the passengers its driver can still rate (3.10) |
| 15 | Drafts | All of them are listed on Offer; the page of drafts goes with My trips (3.11, item 6) |
| 16 | Filled buttons | One main button a screen; the button of a `NeedsYouCard` is the only other filled one (R31.1) |
| 17 | Which main buttons are red | The ones that take something away: "Cancel booking", "Cancel the ride", "Withdraw request", "Block Bára", "Delete my account", and "Decline request" on the driver's ride. The ones that tell PuffinRide what happened stay moss, so that red does not warn anyone off a report: "Tell PuffinRide", "Mark as no-show", "Send answer", "Send review", "Send report" (3.19, R31.3) |
